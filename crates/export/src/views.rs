//! The sheets of every screen and of the full workbook.
//!
//! An export names a [`Screen`] as the interface shows it, the columns and the rows to write, and
//! the filter. [`screen_sheets`] makes the sheets of that screen, [`workbook_sheets`] those of the
//! full workbook, and [`scope_line_ids`] the line IDs of the rows in scope. Every number comes
//! from the same functions of `hx_core` the commands call, so a file says what the screen says.
//! Every label comes from the request's [`ExportText`]; a column id is that of the interface's
//! table column, as `ui/src/api/file-columns.json` lists them.

use std::collections::{HashMap, HashSet};

use hx_core::dataset::{Dataset, Row};
use hx_core::filter::{Dim, FilterSpec, Status};
use hx_core::mapping::Field;
use hx_core::query::{
    ages_known, group_by, holds, line_page, matrix_lines, matrix_top, stale_count, summary,
    FoldedMatrix, Group, HoldQuery, HoldSort, LineQuery, LineRow,
};
use hx_core::solve::{solve_view, SolvePlan, SolveRow};
use serde::Deserialize;

use crate::chart::fill;
use crate::sheet::{Cell, Column, ColumnKind, ColumnRole, Sheet, SheetKind};
use crate::text::ExportText;
use crate::ExportError;

/// The most row values a cross-tab of a file keeps; the others are folded into "All others".
pub const FILE_MATRIX_ROWS: usize = 1_000;
/// The most column values a cross-tab of a file keeps; the others are folded into "All others".
pub const FILE_MATRIX_COLS: usize = 200;
/// The blockers and the lines the Overview lists. The desktop's `TOP_ITEMS` is this one.
pub const TOP_ITEMS: usize = 10;
/// The age in days that makes an open hold stale. The desktop's `STALE_DAYS` is this one.
pub const STALE_DAYS: i64 = 90;

/// The column ids of Lines, in table order.
pub const LINE_COLUMNS: [&str; 10] = [
    "line",
    "holds",
    "disciplines",
    "holdTypes",
    "blockers",
    "oldest",
    "modelSize",
    "ldtSize",
    "stressCalc",
    "sizes",
];
/// The column ids of the hold rows, in table order, with the two a file writes and the table
/// does not show (`sourceId` and `releaseRemark`) last. `status`, `releasedOn`, and
/// `releaseRemark` are written only under the statuses that show released holds.
pub const HOLD_COLUMNS: [&str; 14] = [
    "line",
    "discipline",
    "holdType",
    "remark",
    "blocker",
    "blockerType",
    "name",
    "role",
    "created",
    "status",
    "releasedOn",
    "days",
    "sourceId",
    "releaseRemark",
];
/// The column ids of Breakdown's list, in table order. The share bar is no column of a file.
pub const BREAKDOWN_COLUMNS: [&str; 3] = ["label", "holds", "lines"];
/// The column ids of the steps of the solve order, in table order.
pub const BLOCKER_COLUMNS: [&str; 7] = [
    "blocker",
    "step",
    "kind",
    "discipline",
    "holds",
    "gain",
    "cumulative",
];

/// The dimensions of the export Breakdown offers, in the order of its group-by select. The line
/// ID is no group: Lines lists the lines.
const BREAKDOWN_DIMS: [Dim; 9] = [
    Dim::Discipline,
    Dim::HoldType,
    Dim::Role,
    Dim::Name,
    Dim::BlockerType,
    Dim::Blocker,
    Dim::Remark,
    Dim::ModelSize,
    Dim::StressCalc,
];

/// Which screen a file is made from, as the interface shows it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(tag = "kind")]
pub enum Screen {
    /// The Overview: its figures, its three groupings, and its top blockers and lines.
    Overview,
    /// Lines, in the order and with the options of `query`.
    Lines {
        /// The query of the table.
        query: LineQuery,
    },
    /// The hold rows, in the order `sort` gives, reversed when `reverse` is true.
    Holds {
        /// The sort of the table.
        sort: HoldSort,
        /// Whether the sort is reversed.
        reverse: bool,
    },
    /// Breakdown's list: the holds grouped by `dim`.
    Breakdown {
        /// The dimension grouped by.
        dim: Dim,
    },
    /// Breakdown's matrix: the holds crossed by two dimensions.
    Matrix {
        /// The dimension of the rows.
        rows: Dim,
        /// The dimension of the columns.
        cols: Dim,
    },
    /// The steps of the solve order.
    Blockers,
}

/// Which rows of the screen go into the file.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(tag = "kind")]
pub enum RowScope {
    /// Every row the filters keep, in the screen's order.
    All,
    /// The first `count` rows in the screen's order: the rows the table has loaded.
    First {
        /// How many rows.
        count: usize,
    },
    /// These rows, in this order: line IDs, hold positions as text, group keys, or step keys.
    Keys {
        /// The keys of the rows.
        keys: Vec<String>,
    },
}

/// The request of every export.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ExportRequest {
    /// The screen the file is made from.
    pub screen: Screen,
    /// Column ids to write, in table order; empty writes every column the snapshot has.
    pub columns: Vec<String>,
    /// The rows to write.
    pub rows: RowScope,
    /// The filter of the screen, already made applicable to the snapshot.
    pub spec: FilterSpec,
    /// Every word the file contains.
    pub text: ExportText,
    /// The active filters as the filter bar writes them, one per entry, for About and the report:
    /// every filter the bar shows as set, the status among them when it is not Open, whether or
    /// not the snapshot can apply it. Empty when no filter is set, as the screen tells it; the
    /// Summary names the lines with one hold after that, as the Overview does.
    pub filters: Vec<String>,
}

/// The sheets of `screen` under `spec` (already made applicable by the caller), with the
/// columns and rows asked for. `plan` is the solve plan of the open kept holds, for Blockers.
///
/// Lines, Holds, Breakdown, and Blockers write one sheet of the columns and rows asked for. The
/// Overview writes its figures, its three groupings, and its top ten blockers and lines; the
/// matrix its two cross-tabs, of holds and of lines. Those two write every column and row: they
/// have no column choice and no rows to pick. A column whose field the snapshot lacks (`absent`)
/// is left out, as the table leaves it out.
///
/// `Err(ExportError::Text)` when the request's text lacks a label.
pub fn screen_sheets(
    ds: &Dataset,
    plan: Option<&SolvePlan>,
    absent: &[Field],
    request: &ExportRequest,
) -> Result<Vec<Sheet>, ExportError> {
    let (spec, text, scope) = (&request.spec, &request.text, &request.rows);
    let wanted = request.columns.as_slice();
    let mut sheets = match &request.screen {
        Screen::Overview => overview_sheets(ds, absent, spec, &request.filters, text)?,
        Screen::Lines { query } => vec![table(
            label(text, "file.sheet.lines")?,
            choose(line_defs(text)?, absent, wanted),
            &line_items(ds, spec, query, scope),
        )],
        Screen::Holds { sort, reverse } => vec![table(
            label(text, "file.sheet.holds")?,
            choose(hold_defs(text, spec.status)?, absent, wanted),
            &hold_items(ds, spec, *sort, *reverse, scope),
        )],
        Screen::Breakdown { dim } => vec![table(
            dim_name(dim, text)?,
            choose(group_defs(dim, text)?, absent, wanted),
            &group_items(ds, spec, dim, scope),
        )],
        Screen::Matrix { rows, cols } => cross_tabs(
            ds,
            spec,
            rows,
            cols,
            FILE_MATRIX_ROWS,
            FILE_MATRIX_COLS,
            text,
        )?,
        Screen::Blockers => vec![table(
            label(text, "file.sheet.solveOrder")?,
            choose(step_defs(text)?, absent, wanted),
            &step_items(plan, scope),
        )],
    };
    name_sheets(&mut sheets);
    Ok(sheets)
}

/// Every sheet of the full workbook (decision 2), in order, under `spec`: the Summary, a
/// breakdown sheet per dimension the snapshot has (every group-by dimension but the line ID, then
/// the extra columns of its file, `custom_dims`), the two cross-tabs of discipline by hold type,
/// Lines in the default order, the holds in file order, and the solve order of `plan`. The About
/// sheet that comes first is the workbook's own. `filters` are the filters the filter bar shows
/// as set, as [`ExportRequest::filters`] lists them.
///
/// `Err(ExportError::Text)` when `text` lacks a label.
pub fn workbook_sheets(
    ds: &Dataset,
    plan: Option<&SolvePlan>,
    absent: &[Field],
    custom_dims: &[String],
    spec: &FilterSpec,
    filters: &[String],
    text: &ExportText,
) -> Result<Vec<Sheet>, ExportError> {
    let mut sheets = vec![summary_sheet(ds, spec, filters, text)?];
    let dims = BREAKDOWN_DIMS
        .iter()
        .filter(|dim| !dim.needs().iter().any(|field| absent.contains(field)))
        .cloned()
        .chain(custom_dims.iter().map(|name| Dim::Custom(name.clone())));
    for dim in dims {
        sheets.push(table(
            dim_name(&dim, text)?,
            group_defs(&dim, text)?,
            &group_by(ds, spec, &dim),
        ));
    }
    sheets.extend(cross_tabs(
        ds,
        spec,
        &Dim::Discipline,
        &Dim::HoldType,
        FILE_MATRIX_ROWS,
        FILE_MATRIX_COLS,
        text,
    )?);
    let lines = line_page(ds, spec, &LineQuery::default(), 0, None).rows;
    sheets.push(table(
        label(text, "file.sheet.lines")?,
        choose(line_defs(text)?, absent, &[]),
        &lines,
    ));
    let rows = hold_items(ds, spec, HoldSort::FileOrder, false, &RowScope::All);
    sheets.push(table(
        label(text, "file.sheet.holds")?,
        choose(hold_defs(text, spec.status)?, absent, &[]),
        &rows,
    ));
    sheets.push(table(
        label(text, "file.sheet.solveOrder")?,
        step_defs(text)?,
        &step_items(plan, &RowScope::All),
    ));
    name_sheets(&mut sheets);
    Ok(sheets)
}

/// The line IDs of the rows in scope: a line's own; a hold's line; a group's lines; the lines a
/// step's blocker holds among the open kept holds. Each once, in order. The Overview and the
/// matrix have no rows to pick: theirs are the lines the filter keeps, in the default order.
pub fn scope_line_ids(
    ds: &Dataset,
    plan: Option<&SolvePlan>,
    request: &ExportRequest,
) -> Vec<String> {
    let (spec, scope) = (&request.spec, &request.rows);
    let ids: Vec<String> = match &request.screen {
        Screen::Overview | Screen::Matrix { .. } => line_ids_of(ds, spec),
        Screen::Lines { query } => line_items(ds, spec, query, scope)
            .into_iter()
            .map(|line| line.line_id)
            .collect(),
        Screen::Holds { sort, reverse } => hold_items(ds, spec, *sort, *reverse, scope)
            .into_iter()
            .map(|(_, row)| row.hold.line_id)
            .collect(),
        Screen::Breakdown { dim } => group_lines(ds, spec, dim, &group_items(ds, spec, dim, scope)),
        Screen::Blockers => {
            let lines: HashMap<&str, &[String]> = plan
                .map(|plan| {
                    plan.nodes
                        .iter()
                        .map(|node| (node.key.as_str(), node.lines.as_slice()))
                        .collect()
                })
                .unwrap_or_default();
            step_items(plan, scope)
                .iter()
                .flat_map(|step| lines.get(step.key.as_str()).copied().unwrap_or_default())
                .cloned()
                .collect()
        }
    };
    let mut seen = HashSet::new();
    ids.into_iter()
        .filter(|id| seen.insert(id.clone()))
        .collect()
}

/// The lines `spec` keeps, in the default order of Lines.
fn line_ids_of(ds: &Dataset, spec: &FilterSpec) -> Vec<String> {
    line_page(ds, spec, &LineQuery::default(), 0, None)
        .rows
        .into_iter()
        .map(|line| line.line_id)
        .collect()
}

/// The lines of each of `groups`, in its order, each group's lines in the default order of Lines
/// over the group's holds (most holds first, then line ID), as the detail of a group lists them.
/// One pass over the kept holds counts the holds of each line in each group asked for.
fn group_lines(ds: &Dataset, spec: &FilterSpec, dim: &Dim, groups: &[Group]) -> Vec<String> {
    let mut counts: HashMap<&str, HashMap<&str, usize>> = groups
        .iter()
        .map(|group| (group.key.as_str(), HashMap::new()))
        .collect();
    for row in ds.rows.iter().filter(|row| spec.matches(row)) {
        if let Some(lines) = counts.get_mut(dim.value(row).as_str()) {
            *lines.entry(row.hold.line_id.as_str()).or_default() += 1;
        }
    }
    let mut out = Vec::new();
    for group in groups {
        let Some(lines) = counts.remove(group.key.as_str()) else {
            continue;
        };
        let mut lines: Vec<(&str, usize)> = lines.into_iter().collect();
        lines.sort_by(|(a, n), (b, m)| m.cmp(n).then_with(|| a.cmp(b)));
        out.extend(lines.into_iter().map(|(line, _)| line.to_string()));
    }
    out
}

/// The longest name a sheet of Excel may have, in characters.
const SHEET_NAME_CHARS: usize = 31;
/// The characters Excel refuses in the name of a sheet.
const SHEET_NAME_FORBIDDEN: [char; 7] = ['[', ']', ':', '*', '?', '/', '\\'];

/// Gives every sheet a name Excel takes: without `[ ] : * ? / \` or control characters, without
/// an apostrophe or a space at either end, at most 31 characters, and unique without regard to
/// case (and never `History`, which Excel keeps for itself). A name taken already gets ` (2)`,
/// ` (3)`, and so on, cut to leave room for it; a name left empty is the sheet's place, from 1.
pub fn name_sheets(sheets: &mut [Sheet]) {
    let mut taken: HashSet<String> = HashSet::from(["history".to_string()]);
    for (at, sheet) in sheets.iter_mut().enumerate() {
        let kept: String = sheet
            .name
            .chars()
            .filter(|c| !SHEET_NAME_FORBIDDEN.contains(c) && !c.is_control())
            .collect();
        let mut base = cut(&kept, SHEET_NAME_CHARS);
        if base.is_empty() {
            base = (at + 1).to_string();
        }
        let mut name = base.clone();
        let mut number = 2;
        while taken.contains(&name.to_lowercase()) {
            let suffix = format!(" ({number})");
            let room = SHEET_NAME_CHARS - suffix.chars().count();
            name = format!("{}{suffix}", cut(&base, room));
            number += 1;
        }
        taken.insert(name.to_lowercase());
        sheet.name = name;
    }
}

/// `text` without spaces or apostrophes at its ends, cut to at most `chars` characters.
fn cut(text: &str, chars: usize) -> String {
    let ends = |c: char| c == '\'' || c.is_whitespace();
    let short: String = text.trim_matches(ends).chars().take(chars).collect();
    short.trim_matches(ends).to_string()
}

/// The label of `key`, owned.
fn label(text: &ExportText, key: &str) -> Result<String, ExportError> {
    text.get(key).map(str::to_string)
}

/// The name of a dimension as the interface writes it: a custom dimension is its header.
pub(crate) fn dim_name(dim: &Dim, text: &ExportText) -> Result<String, ExportError> {
    let key = match dim {
        Dim::Custom(header) => return Ok(header.clone()),
        Dim::Discipline => "file.dim.discipline",
        Dim::HoldType => "file.dim.holdType",
        Dim::Role => "file.dim.role",
        Dim::Name => "file.dim.name",
        Dim::BlockerType => "file.dim.blockerType",
        Dim::Blocker => "file.dim.blocker",
        Dim::Remark => "file.dim.remark",
        Dim::LineId => "file.dim.lineId",
        Dim::ModelSize => "file.dim.modelSize",
        Dim::StressCalc => "file.dim.stressCalc",
    };
    label(text, key)
}

/// One column a sheet may write: its id, its heading, its kind and role, the fields it needs,
/// and how it writes an item.
struct Def<T> {
    id: &'static str,
    header: String,
    kind: ColumnKind,
    role: ColumnRole,
    needs: &'static [Field],
    cell: Box<dyn Fn(&T) -> Cell>,
}

impl<T> Def<T> {
    /// The column with `role`.
    fn with_role(mut self, role: ColumnRole) -> Self {
        self.role = role;
        self
    }
}

fn def<T>(
    id: &'static str,
    header: String,
    kind: ColumnKind,
    needs: &'static [Field],
    cell: impl Fn(&T) -> Cell + 'static,
) -> Def<T> {
    Def {
        id,
        header,
        kind,
        role: ColumnRole::Plain,
        needs,
        cell: Box::new(cell),
    }
}

/// The columns of `defs` whose fields the snapshot has, in table order when `wanted` is empty,
/// and otherwise those `wanted` names, in its order. An id `wanted` names twice, or that names no
/// column of the screen, adds nothing. When `wanted` names none of the columns the snapshot has
/// (a remembered choice of columns this snapshot or status does not write), every present column
/// is written, as when none was chosen: a file is never left without columns.
fn choose<T>(defs: Vec<Def<T>>, absent: &[Field], wanted: &[String]) -> Vec<Def<T>> {
    let present: Vec<Def<T>> = defs
        .into_iter()
        .filter(|def| !def.needs.iter().any(|field| absent.contains(field)))
        .collect();
    if !wanted
        .iter()
        .any(|id| present.iter().any(|def| def.id == id))
    {
        return present;
    }
    let mut slots: Vec<Option<Def<T>>> = present.into_iter().map(Some).collect();
    wanted
        .iter()
        .filter_map(|id| {
            slots
                .iter_mut()
                .find(|slot| slot.as_ref().is_some_and(|def| def.id == id))
                .and_then(Option::take)
        })
        .collect()
}

/// A sheet of `items`, one row each, with the columns of `defs`.
fn table<T>(name: String, defs: Vec<Def<T>>, items: &[T]) -> Sheet {
    Sheet {
        name,
        kind: SheetKind::Table,
        rows: items
            .iter()
            .map(|item| defs.iter().map(|def| (def.cell)(item)).collect())
            .collect(),
        columns: defs
            .into_iter()
            .map(|def| Column {
                id: def.id.to_string(),
                header: def.header,
                kind: def.kind,
                role: def.role,
            })
            .collect(),
    }
}

/// `items` cut to `scope`: all of them, the first `count`, or those of the keys, in the order of
/// the keys, each once; a key no item has is left out.
fn scoped<T>(mut items: Vec<T>, scope: &RowScope, key: impl Fn(&T) -> String) -> Vec<T> {
    match scope {
        RowScope::All => items,
        RowScope::First { count } => {
            items.truncate(*count);
            items
        }
        RowScope::Keys { keys } => {
            let mut by_key: HashMap<String, T> =
                items.into_iter().map(|item| (key(&item), item)).collect();
            keys.iter().filter_map(|key| by_key.remove(key)).collect()
        }
    }
}

/// Whether the export left a text blank: empty, or the dash an import writes for a blank.
pub(crate) fn is_blank(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.is_empty() || trimmed == "—"
}

/// A text the export left blank is no value.
fn given(value: &str) -> Cell {
    if is_blank(value) {
        Cell::Empty
    } else {
        Cell::Text(value.to_string())
    }
}

/// A text, or no value when it is empty.
fn text_or_empty(value: &str) -> Cell {
    if value.is_empty() {
        Cell::Empty
    } else {
        Cell::Text(value.to_string())
    }
}

/// The calendar day of a moment, or no value.
fn day(at: Option<chrono::NaiveDateTime>) -> Cell {
    at.map_or(Cell::Empty, |at| Cell::Date(at.date()))
}

// --- Lines ---

fn line_defs(text: &ExportText) -> Result<Vec<Def<LineRow>>, ExportError> {
    let separator = label(text, "file.listSeparator")?;
    let joined = separator.clone();
    let h = |id: &str| label(text, &format!("file.column.lines.{id}"));
    Ok(vec![
        def(
            "line",
            h("line")?,
            ColumnKind::Identifier,
            &[],
            |l: &LineRow| Cell::Text(l.line_id.clone()),
        ),
        def(
            "holds",
            h("holds")?,
            ColumnKind::Count,
            &[],
            |l: &LineRow| Cell::Count(l.holds),
        )
        .with_role(ColumnRole::HoldCount),
        def(
            "disciplines",
            h("disciplines")?,
            ColumnKind::Text,
            &[Field::Discipline],
            move |l: &LineRow| text_or_empty(&l.disciplines.join(&separator)),
        ),
        def(
            "holdTypes",
            h("holdTypes")?,
            ColumnKind::Text,
            &[Field::HoldType],
            move |l: &LineRow| {
                let kept: Vec<&str> = l
                    .hold_types
                    .iter()
                    .map(String::as_str)
                    .filter(|value| given(value) != Cell::Empty)
                    .collect();
                if kept.is_empty() {
                    Cell::Empty
                } else {
                    Cell::Text(kept.join(&joined))
                }
            },
        ),
        def(
            "blockers",
            h("blockers")?,
            ColumnKind::Count,
            &[Field::Remark],
            |l: &LineRow| Cell::Count(l.blockers),
        ),
        def(
            "oldest",
            h("oldest")?,
            ColumnKind::Days,
            &[Field::Created],
            |l: &LineRow| l.oldest_age_days.map_or(Cell::Empty, Cell::Days),
        )
        .with_role(ColumnRole::Age),
        def(
            "modelSize",
            h("modelSize")?,
            ColumnKind::Size,
            &[Field::ModelSize],
            |l: &LineRow| l.model_size.map_or(Cell::Empty, Cell::Size),
        ),
        def(
            "ldtSize",
            h("ldtSize")?,
            ColumnKind::Size,
            &[Field::LdtSize],
            |l: &LineRow| l.ldt_size.map_or(Cell::Empty, Cell::Size),
        ),
        def(
            "stressCalc",
            h("stressCalc")?,
            ColumnKind::Text,
            &[Field::StressCalc],
            |l: &LineRow| text_or_empty(&l.stress_calc),
        ),
        def(
            "sizes",
            h("sizes")?,
            ColumnKind::Flag,
            &[Field::ModelSize, Field::LdtSize],
            |l: &LineRow| Cell::Flag(l.size_mismatch),
        ),
    ])
}

/// The lines of the screen in the order of `query`, cut to `scope`.
fn line_items(
    ds: &Dataset,
    spec: &FilterSpec,
    query: &LineQuery,
    scope: &RowScope,
) -> Vec<LineRow> {
    let limit = match scope {
        RowScope::First { count } => Some(*count),
        RowScope::All | RowScope::Keys { .. } => None,
    };
    let rows = line_page(ds, spec, query, 0, limit).rows;
    scoped(rows, scope, |line| line.line_id.clone())
}

// --- Holds ---

/// A hold row: its position in `Dataset::rows`, and the row.
type HoldItem = (usize, Row);

fn hold_defs(text: &ExportText, status: Status) -> Result<Vec<Def<HoldItem>>, ExportError> {
    let h = |id: &str| label(text, &format!("file.column.holds.{id}"));
    let mut defs = vec![
        def(
            "line",
            h("line")?,
            ColumnKind::Identifier,
            &[],
            |(_, r): &HoldItem| Cell::Text(r.hold.line_id.clone()),
        ),
        def(
            "discipline",
            h("discipline")?,
            ColumnKind::Text,
            &[Field::Discipline],
            |(_, r): &HoldItem| text_or_empty(&r.hold.discipline),
        ),
        def(
            "holdType",
            h("holdType")?,
            ColumnKind::Text,
            &[Field::HoldType],
            |(_, r): &HoldItem| given(&r.hold.hold_type),
        ),
        def(
            "remark",
            h("remark")?,
            ColumnKind::LongText,
            &[Field::Remark],
            |(_, r): &HoldItem| text_or_empty(&r.hold.remark),
        ),
        def(
            "blocker",
            h("blocker")?,
            ColumnKind::Text,
            &[Field::Remark],
            |(_, r): &HoldItem| given(&r.blocker.item),
        ),
        def(
            "blockerType",
            h("blockerType")?,
            ColumnKind::Text,
            &[Field::Remark],
            |(_, r): &HoldItem| Cell::Text(r.blocker.kind.clone()),
        ),
        def(
            "name",
            h("name")?,
            ColumnKind::Text,
            &[Field::Name],
            |(_, r): &HoldItem| given(&r.hold.name),
        ),
        def(
            "role",
            h("role")?,
            ColumnKind::Text,
            &[Field::Role],
            |(_, r): &HoldItem| given(&r.hold.role),
        ),
        def(
            "created",
            h("created")?,
            ColumnKind::Date,
            &[Field::Created],
            |(_, r): &HoldItem| day(r.hold.created),
        ),
    ];
    if status == Status::All {
        let open = label(text, "file.status.open")?;
        let released = label(text, "file.status.released")?;
        defs.push(def(
            "status",
            h("status")?,
            ColumnKind::Text,
            &[Field::Released],
            move |(_, r): &HoldItem| {
                let word = if r.hold.released { &released } else { &open };
                Cell::Text(word.clone())
            },
        ));
    }
    if status != Status::Open {
        defs.push(def(
            "releasedOn",
            h("releasedOn")?,
            ColumnKind::Date,
            &[Field::ReleaseDate],
            |(_, r): &HoldItem| day(r.hold.release_date),
        ));
    }
    // The age of an open hold, the duration of a released one, named as the table names them.
    let days = match status {
        Status::Open => "age",
        Status::Released => "duration",
        Status::All => "days",
    };
    // Only the days of open holds are ages, colored as the age bands are.
    let role = if status == Status::Open {
        ColumnRole::Age
    } else {
        ColumnRole::Plain
    };
    defs.push(
        def(
            "days",
            h(days)?,
            ColumnKind::Days,
            &[Field::Created],
            |(_, r): &HoldItem| r.days().map_or(Cell::Empty, Cell::Days),
        )
        .with_role(role),
    );
    defs.push(def(
        "sourceId",
        h("sourceId")?,
        ColumnKind::Identifier,
        &[Field::SourceId],
        |(_, r): &HoldItem| {
            r.hold
                .source_id
                .map_or(Cell::Empty, |id| Cell::Text(id.to_string()))
        },
    ));
    if status != Status::Open {
        defs.push(def(
            "releaseRemark",
            h("releaseRemark")?,
            ColumnKind::LongText,
            &[Field::ReleaseRemark],
            |(_, r): &HoldItem| text_or_empty(&r.hold.release_remark),
        ));
    }
    Ok(defs)
}

/// The hold rows of the screen in the order of `sort`, cut to `scope`. A key is a position in
/// `Dataset::rows`, as text.
fn hold_items(
    ds: &Dataset,
    spec: &FilterSpec,
    sort: HoldSort,
    reverse: bool,
    scope: &RowScope,
) -> Vec<HoldItem> {
    let limit = match scope {
        RowScope::First { count } => Some(*count),
        RowScope::All | RowScope::Keys { .. } => None,
    };
    let query = HoldQuery {
        sort,
        reverse,
        offset: 0,
        limit,
    };
    let page = holds(ds, spec, &query);
    let rows: Vec<HoldItem> = page.positions.into_iter().zip(page.rows).collect();
    scoped(rows, scope, |(position, _)| position.to_string())
}

// --- Groups ---

fn group_defs(dim: &Dim, text: &ExportText) -> Result<Vec<Def<Group>>, ExportError> {
    let kind = if *dim == Dim::LineId {
        ColumnKind::Identifier
    } else {
        ColumnKind::Text
    };
    Ok(vec![
        def("label", dim_name(dim, text)?, kind, &[], |g: &Group| {
            Cell::Text(g.label.clone())
        }),
        def(
            "holds",
            label(text, "file.column.breakdown.holds")?,
            ColumnKind::Count,
            &[],
            |g: &Group| Cell::Count(g.holds),
        )
        .with_role(ColumnRole::HoldCount),
        def(
            "lines",
            label(text, "file.column.breakdown.lines")?,
            ColumnKind::Count,
            &[],
            |g: &Group| Cell::Count(g.lines),
        ),
    ])
}

/// The groups of `dim`, largest first, cut to `scope`. A key is a group key; the blank group's
/// is the empty string.
fn group_items(ds: &Dataset, spec: &FilterSpec, dim: &Dim, scope: &RowScope) -> Vec<Group> {
    scoped(group_by(ds, spec, dim), scope, |group| group.key.clone())
}

// --- Steps ---

fn step_defs(text: &ExportText) -> Result<Vec<Def<SolveRow>>, ExportError> {
    let h = |id: &str| label(text, &format!("file.column.blockers.{id}"));
    Ok(vec![
        def(
            "blocker",
            h("blocker")?,
            ColumnKind::Text,
            &[],
            |s: &SolveRow| Cell::Text(s.label.clone()),
        ),
        def(
            "step",
            h("step")?,
            ColumnKind::Count,
            &[],
            |s: &SolveRow| Cell::Count(s.step),
        ),
        def("kind", h("kind")?, ColumnKind::Text, &[], |s: &SolveRow| {
            Cell::Text(s.kind.clone())
        }),
        def(
            "discipline",
            h("discipline")?,
            ColumnKind::Text,
            &[],
            |s: &SolveRow| Cell::Text(s.discipline.clone()),
        ),
        def(
            "holds",
            h("holds")?,
            ColumnKind::Count,
            &[],
            |s: &SolveRow| Cell::Count(s.holds),
        )
        .with_role(ColumnRole::HoldCount),
        def(
            "gain",
            h("gain")?,
            ColumnKind::Count,
            &[],
            |s: &SolveRow| Cell::Count(s.gain),
        ),
        def(
            "cumulative",
            h("cumulative")?,
            ColumnKind::Count,
            &[],
            |s: &SolveRow| Cell::Count(s.cumulative),
        ),
    ])
}

/// The steps of the solve order of `plan` (none without a plan), cut to `scope`. A key is a
/// step's blocker key.
fn step_items(plan: Option<&SolvePlan>, scope: &RowScope) -> Vec<SolveRow> {
    let rows = plan.map(|plan| solve_view(plan).rows).unwrap_or_default();
    scoped(rows, scope, |step| step.key.clone())
}

// --- Cross-tabs ---

/// The two cross-tabs of `rows_dim` by `cols_dim`, of holds and of lines, folded at `max_rows`
/// and `max_cols` with the rest in "All others", each with a total column and a total row.
fn cross_tabs(
    ds: &Dataset,
    spec: &FilterSpec,
    rows_dim: &Dim,
    cols_dim: &Dim,
    max_rows: usize,
    max_cols: usize,
    text: &ExportText,
) -> Result<Vec<Sheet>, ExportError> {
    let words = CrossWords {
        corner: dim_name(rows_dim, text)?,
        other: label(text, "file.matrix.other")?,
        total: label(text, "file.matrix.total")?,
    };
    let totals = summary(ds, spec);
    let held = matrix_top(ds, spec, rows_dim, cols_dim, max_rows, max_cols);
    let lined = matrix_lines(ds, spec, rows_dim, cols_dim, max_rows, max_cols);
    Ok(vec![
        cross_tab(
            label(text, "file.sheet.matrixHolds")?,
            &held,
            |group| group.holds,
            totals.holds,
            &words,
        ),
        cross_tab(
            label(text, "file.sheet.matrixLines")?,
            &lined,
            |group| group.lines,
            totals.lines,
            &words,
        ),
    ])
}

/// The words of a cross-tab: the heading of its first column, and the names of its folded and
/// total rows and columns.
struct CrossWords {
    corner: String,
    other: String,
    total: String,
}

/// One cross-tab: a row per kept row value, then "All others" when values were folded, then the
/// total; a column per kept column value likewise. A row's or a column's total is its group's
/// count (`measure`); the corner is `total`.
fn cross_tab(
    name: String,
    matrix: &FoldedMatrix,
    measure: fn(&Group) -> usize,
    total: usize,
    words: &CrossWords,
) -> Sheet {
    let count = |id: String, header: &str| Column {
        id,
        header: header.to_string(),
        kind: ColumnKind::Count,
        role: ColumnRole::Plain,
    };
    let mut columns = vec![Column {
        id: "label".into(),
        header: words.corner.clone(),
        kind: ColumnKind::Text,
        role: ColumnRole::Plain,
    }];
    for (at, group) in matrix.cols.iter().enumerate() {
        columns.push(count(format!("col{at}"), &group.label));
    }
    if matrix.other_col.is_some() {
        columns.push(count("other".into(), &words.other));
    }
    columns.push(count("total".into(), &words.total));

    let row_heads = matrix
        .rows
        .iter()
        .map(|group| (group.label.clone(), measure(group)))
        .chain(
            matrix
                .other_row
                .iter()
                .map(|group| (words.other.clone(), measure(group))),
        );
    let mut rows: Vec<Vec<Cell>> = row_heads
        .zip(&matrix.cells)
        .map(|((head, sum), cells)| {
            std::iter::once(Cell::Text(head))
                .chain(cells.iter().map(|n| Cell::Count(*n)))
                .chain(std::iter::once(Cell::Count(sum)))
                .collect()
        })
        .collect();
    rows.push(
        std::iter::once(Cell::Text(words.total.clone()))
            .chain(
                matrix
                    .cols
                    .iter()
                    .chain(&matrix.other_col)
                    .map(|group| Cell::Count(measure(group))),
            )
            .chain(std::iter::once(Cell::Count(total)))
            .collect(),
    );
    Sheet {
        name,
        kind: SheetKind::CrossTab,
        columns,
        rows,
    }
}

// --- Overview ---

/// The Overview's sheets: the Summary, the holds by discipline, by hold type, and by role, and
/// the top blockers and lines.
fn overview_sheets(
    ds: &Dataset,
    absent: &[Field],
    spec: &FilterSpec,
    filters: &[String],
    text: &ExportText,
) -> Result<Vec<Sheet>, ExportError> {
    let mut sheets = vec![summary_sheet(ds, spec, filters, text)?];
    for (key, dim) in [
        ("file.sheet.disciplines", Dim::Discipline),
        ("file.sheet.holdTypes", Dim::HoldType),
        ("file.sheet.roles", Dim::Role),
    ] {
        sheets.push(table(
            label(text, key)?,
            group_defs(&dim, text)?,
            &group_by(ds, spec, &dim),
        ));
    }
    let mut blockers = group_by(ds, spec, &Dim::Blocker);
    blockers.truncate(TOP_ITEMS);
    sheets.push(table(
        label(text, "file.sheet.topBlockers")?,
        group_defs(&Dim::Blocker, text)?,
        &blockers,
    ));
    let lines = line_page(ds, spec, &LineQuery::default(), 0, Some(TOP_ITEMS)).rows;
    sheets.push(table(
        label(text, "file.sheet.topLines")?,
        choose(line_defs(text)?, absent, &[]),
        &lines,
    ));
    Ok(sheets)
}

/// The Summary: each figure of the Overview as a label and a value, named as the Overview names
/// it under the status of `spec`, then the stale holds. A median, or the stale holds, that the
/// dates cannot give has no value: the sheet never writes a zero for it. `filters` are those the
/// filter bar shows as set: with none, the lines with one hold are named as the lines of a
/// single hold, as the Overview names them.
fn summary_sheet(
    ds: &Dataset,
    spec: &FilterSpec,
    filters: &[String],
    text: &ExportText,
) -> Result<Sheet, ExportError> {
    let figures = summary(ds, spec);
    let (words, median) = match spec.status {
        Status::Open => ("open", figures.median_age_days),
        Status::Released => ("released", figures.median_duration_days),
        Status::All => ("all", figures.median_age_days),
    };
    // Once a filter is set, a line counts with one hold when the filter keeps one of its holds.
    // Whether one is set is what the screen shows, not what the snapshot can apply.
    let single = if filters.is_empty() {
        "file.summary.singleHoldLines"
    } else {
        "file.summary.linesWithOneHold"
    };
    let stale = if ages_known(ds, spec) {
        Cell::Count(stale_count(ds, spec, STALE_DAYS))
    } else {
        Cell::Empty
    };
    let row = |key: &str, value: Cell| -> Result<Vec<Cell>, ExportError> {
        Ok(vec![Cell::Text(label(text, key)?), value])
    };
    Ok(Sheet {
        name: label(text, "file.sheet.summary")?,
        kind: SheetKind::Table,
        columns: vec![
            Column {
                id: "figure".into(),
                header: label(text, "file.column.summary.figure")?,
                kind: ColumnKind::Text,
                role: ColumnRole::Plain,
            },
            Column {
                id: "value".into(),
                header: label(text, "file.column.summary.value")?,
                kind: ColumnKind::Count,
                role: ColumnRole::Plain,
            },
        ],
        rows: vec![
            row(
                &format!("file.summary.{words}.holds"),
                Cell::Count(figures.holds),
            )?,
            row(
                &format!("file.summary.{words}.lines"),
                Cell::Count(figures.lines),
            )?,
            row(single, Cell::Count(figures.single_hold_lines))?,
            row(
                &format!("file.summary.{words}.median"),
                median.map_or(Cell::Empty, Cell::Days),
            )?,
            vec![
                Cell::Text(fill(
                    text.get("file.summary.stale")?,
                    &[("days", &STALE_DAYS.to_string())],
                )),
                stale,
            ],
        ],
    })
}

#[cfg(test)]
#[path = "views_tests.rs"]
mod tests;
