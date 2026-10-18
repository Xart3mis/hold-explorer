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
use hx_core::filter::{Dim, FieldFilter, FilterSpec, Status};
use hx_core::mapping::Field;
use hx_core::query::{
    ages_known, group_by, holds, line_page, matrix_lines, matrix_top, stale_count, summary,
    FoldedMatrix, Group, HoldQuery, HoldSort, LineQuery, LineRow,
};
use hx_core::solve::{solve_view, SolvePlan, SolveRow};
use serde::Deserialize;

use crate::sheet::{Cell, Column, ColumnKind, Sheet};
use crate::text::ExportText;
use crate::ExportError;

/// The most row values a cross-tab of a file keeps; the others are folded into "All others".
pub const FILE_MATRIX_ROWS: usize = 1_000;
/// The most column values a cross-tab of a file keeps; the others are folded into "All others".
pub const FILE_MATRIX_COLS: usize = 200;
/// The blockers and the lines the Overview lists. The same as the desktop's `TOP_ITEMS`.
pub const TOP_ITEMS: usize = 10;
/// The age in days that makes an open hold stale. The same as the desktop's `STALE_DAYS`.
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
    "step",
    "blocker",
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
    /// The active filters as the filter bar writes them, one per entry, for About and the report.
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
        Screen::Overview => overview_sheets(ds, absent, spec, text)?,
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
/// sheet that comes first is the workbook's own.
///
/// `Err(ExportError::Text)` when `text` lacks a label.
pub fn workbook_sheets(
    ds: &Dataset,
    plan: Option<&SolvePlan>,
    absent: &[Field],
    custom_dims: &[String],
    spec: &FilterSpec,
    text: &ExportText,
) -> Result<Vec<Sheet>, ExportError> {
    let mut sheets = vec![summary_sheet(ds, spec, text)?];
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
        Screen::Breakdown { dim } => group_items(ds, spec, dim, scope)
            .iter()
            .flat_map(|group| {
                let mut of_group = spec.without(dim);
                of_group.fields.push(FieldFilter {
                    dim: dim.clone(),
                    values: vec![group.key.clone()],
                    negate: false,
                });
                line_ids_of(ds, &of_group)
            })
            .collect(),
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
fn dim_name(dim: &Dim, text: &ExportText) -> Result<String, ExportError> {
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

/// One column a sheet may write: its id, its heading, its kind, the fields it needs, and how it
/// writes an item.
struct Def<T> {
    id: &'static str,
    header: String,
    kind: ColumnKind,
    needs: &'static [Field],
    cell: Box<dyn Fn(&T) -> Cell>,
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
        needs,
        cell: Box::new(cell),
    }
}

/// The columns of `defs` whose fields the snapshot has, in table order when `wanted` is empty,
/// and otherwise those `wanted` names, in its order. An id `wanted` names twice, or that names no
/// column of the screen, adds nothing.
fn choose<T>(defs: Vec<Def<T>>, absent: &[Field], wanted: &[String]) -> Vec<Def<T>> {
    let present = defs
        .into_iter()
        .filter(|def| !def.needs.iter().any(|field| absent.contains(field)));
    if wanted.is_empty() {
        return present.collect();
    }
    let mut slots: Vec<Option<Def<T>>> = present.map(Some).collect();
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

/// A text the export left blank (empty, or the dash an import writes for a blank) is no value.
fn given(value: &str) -> Cell {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "—" {
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
        ),
        def(
            "disciplines",
            h("disciplines")?,
            ColumnKind::Text,
            &[Field::Discipline],
            |l: &LineRow| Cell::Text(l.disciplines.join(", ")),
        ),
        def(
            "holdTypes",
            h("holdTypes")?,
            ColumnKind::Text,
            &[Field::HoldType],
            |l: &LineRow| {
                let kept: Vec<&str> = l
                    .hold_types
                    .iter()
                    .map(String::as_str)
                    .filter(|value| given(value) != Cell::Empty)
                    .collect();
                if kept.is_empty() {
                    Cell::Empty
                } else {
                    Cell::Text(kept.join(", "))
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
        ),
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
            |(_, r): &HoldItem| Cell::Text(r.hold.discipline.clone()),
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
            |(_, r): &HoldItem| Cell::Text(r.hold.remark.clone()),
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
    defs.push(def(
        "days",
        h(days)?,
        ColumnKind::Days,
        &[Field::Created],
        |(_, r): &HoldItem| r.days().map_or(Cell::Empty, Cell::Days),
    ));
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
        ),
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
            "step",
            h("step")?,
            ColumnKind::Count,
            &[],
            |s: &SolveRow| Cell::Count(s.step),
        ),
        def(
            "blocker",
            h("blocker")?,
            ColumnKind::Text,
            &[],
            |s: &SolveRow| Cell::Text(s.label.clone()),
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
        ),
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
    };
    let mut columns = vec![Column {
        id: "label".into(),
        header: words.corner.clone(),
        kind: ColumnKind::Text,
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
    text: &ExportText,
) -> Result<Vec<Sheet>, ExportError> {
    let mut sheets = vec![summary_sheet(ds, spec, text)?];
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
/// dates cannot give has no value: the sheet never writes a zero for it.
fn summary_sheet(ds: &Dataset, spec: &FilterSpec, text: &ExportText) -> Result<Sheet, ExportError> {
    let figures = summary(ds, spec);
    let (words, median) = match spec.status {
        Status::Open => ("open", figures.median_age_days),
        Status::Released => ("released", figures.median_duration_days),
        Status::All => ("all", figures.median_age_days),
    };
    // Once a filter is set, a line counts with one hold when the filter keeps one of its holds.
    let single = if *spec == FilterSpec::default() {
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
        columns: vec![
            Column {
                id: "figure".into(),
                header: label(text, "file.column.summary.figure")?,
                kind: ColumnKind::Text,
            },
            Column {
                id: "value".into(),
                header: label(text, "file.column.summary.value")?,
                kind: ColumnKind::Count,
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
            row("file.summary.stale", stale)?,
        ],
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::sync::OnceLock;

    use hx_core::dataset::{Dataset, Row};
    use hx_core::filter::{Dim, FilterSpec, Status};
    use hx_core::load::load_file;
    use hx_core::mapping::Field;
    use hx_core::query::{
        group_by, holds, line_page, matrix_lines, matrix_top, summary, HoldQuery, HoldSort,
        LineQuery, LineSort,
    };
    use hx_core::rules::RuleSet;
    use hx_core::solve::{solve_plan, solve_view, SolvePlan};
    use hx_synth::{generate, write_workbook, SynthConfig};

    use super::*;
    use crate::sheet::{Cell, Sheet};
    use crate::text::{ExportText, FILE_TEXT_KEYS};
    use crate::ExportError;

    /// A full synthetic snapshot of 600 holds on 80 lines, read as an import reads it.
    fn full() -> &'static Dataset {
        static FULL: OnceLock<Dataset> = OnceLock::new();
        FULL.get_or_init(|| {
            let cfg = SynthConfig::new(11, 80, 600);
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("holds.xlsx");
            write_workbook(&generate(&cfg), &cfg, &path).unwrap();
            let loaded = load_file(&path).unwrap();
            Dataset::build(
                loaded.parsed.holds,
                RuleSet::builtin(),
                loaded.snapshot.unwrap().at,
            )
        })
    }

    /// The same holds as a limited file gives them: no hold ID, no released column (so no
    /// release date or remark), and no sizes or stress calc.
    fn limited() -> Dataset {
        let holds = full()
            .rows
            .iter()
            .map(|row| {
                let mut hold = row.hold.clone();
                hold.source_id = None;
                hold.released = false;
                hold.release_date = None;
                hold.release_remark = String::new();
                hold.model_size = None;
                hold.ldt_size = None;
                hold.stress_calc = String::new();
                hold
            })
            .collect();
        Dataset::build(holds, RuleSet::builtin(), full().snapshot)
    }

    /// Every label the crate asks for, each written as its own key, and the months.
    fn text() -> ExportText {
        ExportText {
            labels: FILE_TEXT_KEYS
                .iter()
                .map(|key| (key.to_string(), key.to_string()))
                .collect(),
            months: [
                "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
            ]
            .iter()
            .map(|m| m.to_string())
            .collect(),
        }
    }

    fn status(status: Status) -> FilterSpec {
        FilterSpec {
            status,
            ..Default::default()
        }
    }

    fn request(
        screen: Screen,
        columns: &[&str],
        rows: RowScope,
        spec: FilterSpec,
    ) -> ExportRequest {
        ExportRequest {
            screen,
            columns: columns.iter().map(|c| c.to_string()).collect(),
            rows,
            spec,
            text: text(),
            filters: Vec::new(),
        }
    }

    fn keys(keys: &[&str]) -> RowScope {
        RowScope::Keys {
            keys: keys.iter().map(|k| k.to_string()).collect(),
        }
    }

    /// The plan of the open kept holds, as the desktop gives it.
    fn plan_of(ds: &Dataset, spec: &FilterSpec) -> Option<SolvePlan> {
        spec.open_only().map(|open| solve_plan(ds, &open, None))
    }

    fn one(ds: &Dataset, request: &ExportRequest) -> Sheet {
        let plan = plan_of(ds, &request.spec);
        let mut sheets = screen_sheets(ds, plan.as_ref(), &ds.absent_fields(), request).unwrap();
        assert_eq!(sheets.len(), 1);
        sheets.remove(0)
    }

    fn ids(sheet: &Sheet) -> Vec<&str> {
        sheet.columns.iter().map(|c| c.id.as_str()).collect()
    }

    fn headers(sheet: &Sheet) -> Vec<&str> {
        sheet.columns.iter().map(|c| c.header.as_str()).collect()
    }

    /// The text of the first cell of each row.
    fn first_cells(sheet: &Sheet) -> Vec<String> {
        sheet
            .rows
            .iter()
            .map(|row| match &row[0] {
                Cell::Text(text) => text.clone(),
                Cell::Count(count) => count.to_string(),
                other => panic!("not a key: {other:?}"),
            })
            .collect()
    }

    fn lines_screen(sort: LineSort) -> Screen {
        Screen::Lines {
            query: LineQuery {
                sort,
                ..Default::default()
            },
        }
    }

    // --- Lines ---

    #[test]
    fn lines_write_every_column_in_table_order_or_those_asked_for_in_their_order() {
        let ds = full();
        let all = one(
            ds,
            &request(
                lines_screen(LineSort::HoldsDesc),
                &[],
                RowScope::All,
                status(Status::Open),
            ),
        );
        assert_eq!(ids(&all), LINE_COLUMNS.to_vec());
        assert_eq!(headers(&all)[0], "file.column.lines.line");
        let some = one(
            ds,
            &request(
                lines_screen(LineSort::HoldsDesc),
                &["oldest", "line", "unknown", "holds"],
                RowScope::All,
                status(Status::Open),
            ),
        );
        assert_eq!(ids(&some), vec!["oldest", "line", "holds"]);
        assert_eq!(some.rows.len(), all.rows.len());
    }

    #[test]
    fn lines_have_the_values_of_the_line_page_in_the_sort_of_the_request() {
        let ds = full();
        let spec = status(Status::All);
        let query = LineQuery {
            sort: LineSort::OldestFirst,
            reverse: true,
            ..Default::default()
        };
        let sheet = one(
            ds,
            &request(Screen::Lines { query }, &[], RowScope::All, spec.clone()),
        );
        let page = line_page(ds, &spec, &query, 0, None).rows;
        assert_eq!(sheet.rows.len(), page.len());
        for (row, line) in sheet.rows.iter().zip(&page) {
            assert_eq!(row[0], Cell::Text(line.line_id.clone()));
            assert_eq!(row[1], Cell::Count(line.holds));
            assert_eq!(row[2], Cell::Text(line.disciplines.join(", ")));
            assert_eq!(row[4], Cell::Count(line.blockers));
            assert_eq!(row[5], line.oldest_age_days.map_or(Cell::Empty, Cell::Days));
            assert_eq!(row[6], line.model_size.map_or(Cell::Empty, Cell::Size));
            assert_eq!(row[7], line.ldt_size.map_or(Cell::Empty, Cell::Size));
            assert_eq!(row[9], Cell::Flag(line.size_mismatch));
        }
    }

    #[test]
    fn lines_scopes_cut_after_the_sort_and_keep_the_order_of_the_keys() {
        let ds = full();
        let spec = status(Status::Open);
        let screen = lines_screen(LineSort::LineId);
        let all = first_cells(&one(
            ds,
            &request(screen.clone(), &["line"], RowScope::All, spec.clone()),
        ));
        let first = first_cells(&one(
            ds,
            &request(
                screen.clone(),
                &["line"],
                RowScope::First { count: 5 },
                spec.clone(),
            ),
        ));
        assert_eq!(first, all[..5].to_vec());
        // A key the filters no longer keep is left out; each key once, in the order given.
        let picked = one(
            ds,
            &request(
                screen,
                &["line"],
                keys(&[&all[7], "NO-SUCH-LINE", &all[2], &all[7]]),
                spec,
            ),
        );
        assert_eq!(first_cells(&picked), vec![all[7].clone(), all[2].clone()]);
    }

    #[test]
    fn lines_leave_out_a_column_whose_field_the_snapshot_lacks() {
        let ds = limited();
        let sheet = one(
            &ds,
            &request(
                lines_screen(LineSort::HoldsDesc),
                &[],
                RowScope::All,
                status(Status::Open),
            ),
        );
        assert_eq!(
            ids(&sheet),
            vec![
                "line",
                "holds",
                "disciplines",
                "holdTypes",
                "blockers",
                "oldest"
            ]
        );
        // Asked for by name, an absent column is left out all the same.
        let asked = one(
            &ds,
            &request(
                lines_screen(LineSort::HoldsDesc),
                &["modelSize", "line"],
                RowScope::All,
                status(Status::Open),
            ),
        );
        assert_eq!(ids(&asked), vec!["line"]);
    }

    // --- Holds ---

    fn holds_screen(sort: HoldSort, reverse: bool) -> Screen {
        Screen::Holds { sort, reverse }
    }

    #[test]
    fn holds_columns_follow_the_status_as_the_table_names_them() {
        let ds = full();
        let open = one(
            ds,
            &request(
                holds_screen(HoldSort::FileOrder, false),
                &[],
                RowScope::All,
                status(Status::Open),
            ),
        );
        let released = one(
            ds,
            &request(
                holds_screen(HoldSort::FileOrder, false),
                &[],
                RowScope::All,
                status(Status::Released),
            ),
        );
        let all = one(
            ds,
            &request(
                holds_screen(HoldSort::FileOrder, false),
                &[],
                RowScope::All,
                status(Status::All),
            ),
        );
        let base = [
            "line",
            "discipline",
            "holdType",
            "remark",
            "blocker",
            "blockerType",
            "name",
            "role",
            "created",
        ];
        let with = |more: &[&'static str]| [base.as_slice(), more].concat();
        // The synthetic file has no release remark, so that column is left out.
        assert!(ds.absent_fields().contains(&Field::ReleaseRemark));
        assert_eq!(ids(&open), with(&["days", "sourceId"]));
        assert_eq!(ids(&released), with(&["releasedOn", "days", "sourceId"]));
        assert_eq!(
            ids(&all),
            with(&["status", "releasedOn", "days", "sourceId"])
        );
        let days_header = |sheet: &Sheet| {
            sheet
                .columns
                .iter()
                .find(|c| c.id == "days")
                .unwrap()
                .header
                .clone()
        };
        assert_eq!(days_header(&open), "file.column.holds.age");
        assert_eq!(days_header(&released), "file.column.holds.duration");
        assert_eq!(days_header(&all), "file.column.holds.days");
        assert_eq!(
            HOLD_COLUMNS.to_vec(),
            [
                with(&["status", "releasedOn", "days", "sourceId"]),
                vec!["releaseRemark"]
            ]
            .concat()
        );
    }

    #[test]
    fn holds_have_the_values_of_the_hold_page_in_the_sort_of_the_request() {
        let ds = full();
        let spec = status(Status::All);
        let sheet = one(
            ds,
            &request(
                holds_screen(HoldSort::Discipline, true),
                &[],
                RowScope::All,
                spec.clone(),
            ),
        );
        let page = holds(
            ds,
            &spec,
            &HoldQuery {
                sort: HoldSort::Discipline,
                reverse: true,
                ..Default::default()
            },
        );
        assert_eq!(sheet.rows.len(), page.total);
        let at = |id: &str| sheet.columns.iter().position(|c| c.id == id).unwrap();
        for (cells, row) in sheet.rows.iter().zip(&page.rows) {
            assert_eq!(cells[at("line")], Cell::Text(row.hold.line_id.clone()));
            assert_eq!(
                cells[at("discipline")],
                Cell::Text(row.hold.discipline.clone())
            );
            assert_eq!(cells[at("remark")], Cell::Text(row.hold.remark.clone()));
            assert_eq!(
                cells[at("blockerType")],
                Cell::Text(row.blocker.kind.clone())
            );
            assert_eq!(
                cells[at("created")],
                row.hold
                    .created
                    .map_or(Cell::Empty, |t| Cell::Date(t.date()))
            );
            assert_eq!(
                cells[at("releasedOn")],
                row.hold
                    .release_date
                    .map_or(Cell::Empty, |t| Cell::Date(t.date()))
            );
            assert_eq!(
                cells[at("days")],
                row.days().map_or(Cell::Empty, Cell::Days)
            );
            assert_eq!(
                cells[at("sourceId")],
                Cell::Text(row.hold.source_id.unwrap().to_string())
            );
            let word = if row.hold.released {
                "file.status.released"
            } else {
                "file.status.open"
            };
            assert_eq!(cells[at("status")], Cell::Text(word.into()));
        }
    }

    #[test]
    fn holds_scopes_are_positions_cut_after_the_sort() {
        let ds = full();
        let spec = status(Status::Open);
        let query = HoldQuery {
            sort: HoldSort::OldestFirst,
            ..Default::default()
        };
        let page = holds(ds, &spec, &query);
        let first = one(
            ds,
            &request(
                holds_screen(HoldSort::OldestFirst, false),
                &["line", "days"],
                RowScope::First { count: 3 },
                spec.clone(),
            ),
        );
        assert_eq!(first.rows.len(), 3);
        for (cells, row) in first.rows.iter().zip(&page.rows) {
            assert_eq!(cells[1], row.days().map_or(Cell::Empty, Cell::Days));
        }
        // Keys are positions in the dataset; a released hold is not kept by the open filter.
        let released = ds.rows.iter().position(|row| row.hold.released).unwrap();
        let (a, b) = (page.positions[4], page.positions[1]);
        let picked = one(
            ds,
            &request(
                holds_screen(HoldSort::OldestFirst, false),
                &["sourceId"],
                keys(&[
                    &a.to_string(),
                    &released.to_string(),
                    "not a number",
                    &b.to_string(),
                ]),
                spec,
            ),
        );
        let source =
            |position: usize| Cell::Text(ds.rows[position].hold.source_id.unwrap().to_string());
        assert_eq!(picked.rows, vec![vec![source(a)], vec![source(b)]]);
    }

    #[test]
    fn holds_leave_out_a_column_whose_field_the_snapshot_lacks() {
        let ds = limited();
        let sheet = one(
            &ds,
            &request(
                holds_screen(HoldSort::FileOrder, false),
                &[],
                RowScope::All,
                status(Status::All),
            ),
        );
        assert!(!ids(&sheet).contains(&"sourceId"));
        assert!(!ids(&sheet).contains(&"status"));
        assert!(!ids(&sheet).contains(&"releasedOn"));
        assert!(!ids(&sheet).contains(&"releaseRemark"));
        assert!(ids(&sheet).contains(&"days"));
    }

    #[test]
    fn a_release_remark_is_written_where_the_snapshot_has_one() {
        let mut holds_of: Vec<_> = full().rows.iter().map(|row| row.hold.clone()).collect();
        let released = holds_of.iter().position(|hold| hold.released).unwrap();
        holds_of[released].release_remark = "Closed by vendor".into();
        let ds = Dataset::build(holds_of, RuleSet::builtin(), full().snapshot);
        let sheet = one(
            &ds,
            &request(
                holds_screen(HoldSort::FileOrder, false),
                &["releaseRemark"],
                keys(&[&released.to_string()]),
                status(Status::Released),
            ),
        );
        assert_eq!(
            sheet.rows,
            vec![vec![Cell::Text("Closed by vendor".into())]]
        );
    }

    // --- Breakdown ---

    #[test]
    fn breakdown_has_the_groups_of_group_by() {
        let ds = full();
        let spec = status(Status::Open);
        let sheet = one(
            ds,
            &request(
                Screen::Breakdown { dim: Dim::Role },
                &[],
                RowScope::All,
                spec.clone(),
            ),
        );
        assert_eq!(ids(&sheet), BREAKDOWN_COLUMNS.to_vec());
        assert_eq!(
            headers(&sheet),
            vec![
                "file.dim.role",
                "file.column.breakdown.holds",
                "file.column.breakdown.lines"
            ]
        );
        assert_eq!(sheet.name, "file.dim.role");
        let groups = group_by(ds, &spec, &Dim::Role);
        let want: Vec<Vec<Cell>> = groups
            .iter()
            .map(|g| {
                vec![
                    Cell::Text(g.label.clone()),
                    Cell::Count(g.holds),
                    Cell::Count(g.lines),
                ]
            })
            .collect();
        assert_eq!(sheet.rows, want);
        // Group keys, in the order given; the share bar is no column of a file.
        let picked = one(
            ds,
            &request(
                Screen::Breakdown { dim: Dim::Role },
                &["lines", "label"],
                keys(&[&groups[2].key, "gone", &groups[0].key]),
                spec,
            ),
        );
        assert_eq!(
            picked.rows,
            vec![
                vec![
                    Cell::Count(groups[2].lines),
                    Cell::Text(groups[2].label.clone())
                ],
                vec![
                    Cell::Count(groups[0].lines),
                    Cell::Text(groups[0].label.clone())
                ],
            ]
        );
    }

    #[test]
    fn breakdown_of_a_custom_column_is_named_after_its_header() {
        let mut holds_of: Vec<_> = full().rows.iter().map(|row| row.hold.clone()).collect();
        for (at, hold) in holds_of.iter_mut().enumerate() {
            if at % 3 > 0 {
                hold.extra
                    .insert("Area/Zone".into(), format!("Z{}", at % 2));
            }
        }
        let ds = Dataset::build(holds_of, RuleSet::builtin(), full().snapshot);
        let dim = Dim::Custom("Area/Zone".into());
        let sheet = one(
            &ds,
            &request(
                Screen::Breakdown { dim: dim.clone() },
                &[],
                RowScope::First { count: 10 },
                status(Status::All),
            ),
        );
        assert_eq!(sheet.name, "AreaZone");
        assert_eq!(sheet.columns[0].header, "Area/Zone");
        let groups = group_by(&ds, &status(Status::All), &dim);
        assert_eq!(groups.len(), 3);
        assert_eq!(sheet.rows.len(), 3);
        // The blank group has the empty key.
        let blank = one(
            &ds,
            &request(
                Screen::Breakdown { dim },
                &["holds"],
                keys(&[""]),
                status(Status::All),
            ),
        );
        let want = groups.iter().find(|g| g.key.is_empty()).unwrap().holds;
        assert_eq!(blank.rows, vec![vec![Cell::Count(want)]]);
    }

    // --- Matrix ---

    #[test]
    fn a_matrix_writes_holds_and_lines_with_their_totals() {
        let ds = full();
        let spec = status(Status::Open);
        let sheets = screen_sheets(
            ds,
            None,
            &ds.absent_fields(),
            &request(
                Screen::Matrix {
                    rows: Dim::Discipline,
                    cols: Dim::BlockerType,
                },
                &[],
                RowScope::All,
                spec.clone(),
            ),
        )
        .unwrap();
        assert_eq!(sheets.len(), 2);
        assert_eq!(sheets[0].name, "file.sheet.matrixHolds");
        assert_eq!(sheets[1].name, "file.sheet.matrixLines");
        let held = matrix_top(
            ds,
            &spec,
            &Dim::Discipline,
            &Dim::BlockerType,
            FILE_MATRIX_ROWS,
            FILE_MATRIX_COLS,
        );
        let lined = matrix_lines(
            ds,
            &spec,
            &Dim::Discipline,
            &Dim::BlockerType,
            FILE_MATRIX_ROWS,
            FILE_MATRIX_COLS,
        );
        let totals = summary(ds, &spec);
        for (sheet, matrix, total, measure) in [
            (
                &sheets[0],
                &held,
                totals.holds,
                (|g: &hx_core::query::Group| g.holds) as fn(&hx_core::query::Group) -> usize,
            ),
            (
                &sheets[1],
                &lined,
                totals.lines,
                |g: &hx_core::query::Group| g.lines,
            ),
        ] {
            assert_eq!(sheet.columns[0].header, "file.dim.discipline");
            let col_headers: Vec<&str> = sheet.columns[1..sheet.columns.len() - 1]
                .iter()
                .map(|c| c.header.as_str())
                .collect();
            let col_labels: Vec<&str> = matrix.cols.iter().map(|g| g.label.as_str()).collect();
            assert_eq!(col_headers, col_labels);
            assert_eq!(sheet.columns.last().unwrap().header, "file.matrix.total");
            assert_eq!(sheet.rows.len(), matrix.rows.len() + 1);
            for (r, group) in matrix.rows.iter().enumerate() {
                let mut want = vec![Cell::Text(group.label.clone())];
                want.extend(matrix.cells[r].iter().map(|n| Cell::Count(*n)));
                want.push(Cell::Count(measure(group)));
                assert_eq!(sheet.rows[r], want);
            }
            let mut last = vec![Cell::Text("file.matrix.total".into())];
            last.extend(matrix.cols.iter().map(|g| Cell::Count(measure(g))));
            last.push(Cell::Count(total));
            assert_eq!(sheet.rows.last().unwrap(), &last);
        }
    }

    #[test]
    fn a_folded_matrix_names_all_others_from_the_catalog() {
        let ds = full();
        let spec = status(Status::Open);
        let sheets =
            cross_tabs(ds, &spec, &Dim::Discipline, &Dim::HoldType, 2, 1, &text()).unwrap();
        let held = matrix_top(ds, &spec, &Dim::Discipline, &Dim::HoldType, 2, 1);
        let lined = matrix_lines(ds, &spec, &Dim::Discipline, &Dim::HoldType, 2, 1);
        assert!(held.other_row.is_some() && held.other_col.is_some());
        for (sheet, matrix) in [(&sheets[0], &held), (&sheets[1], &lined)] {
            assert_eq!(ids(sheet), vec!["label", "col0", "other", "total"]);
            assert_eq!(sheet.columns[2].header, "file.matrix.other");
            assert_eq!(
                first_cells(sheet),
                vec![
                    matrix.rows[0].label.clone(),
                    matrix.rows[1].label.clone(),
                    "file.matrix.other".into(),
                    "file.matrix.total".into(),
                ]
            );
            assert_eq!(
                sheet.rows[2][1..3],
                [
                    Cell::Count(matrix.cells[2][0]),
                    Cell::Count(matrix.cells[2][1])
                ]
            );
        }
        let other = held.other_row.as_ref().unwrap();
        assert_eq!(sheets[0].rows[2][3], Cell::Count(other.holds));
        assert_eq!(
            sheets[1].rows[2][3],
            Cell::Count(lined.other_row.as_ref().unwrap().lines)
        );
        assert_eq!(
            sheets[1].rows[3][2],
            Cell::Count(lined.other_col.as_ref().unwrap().lines)
        );
    }

    // --- Blockers ---

    #[test]
    fn blockers_have_the_steps_of_the_solve_order() {
        let ds = full();
        let spec = status(Status::All);
        let sheet = one(
            ds,
            &request(Screen::Blockers, &[], RowScope::All, spec.clone()),
        );
        assert_eq!(ids(&sheet), BLOCKER_COLUMNS.to_vec());
        let view = solve_view(&plan_of(ds, &spec).unwrap());
        let want: Vec<Vec<Cell>> = view
            .rows
            .iter()
            .map(|r| {
                vec![
                    Cell::Count(r.step),
                    Cell::Text(r.label.clone()),
                    Cell::Text(r.kind.clone()),
                    Cell::Text(r.discipline.clone()),
                    Cell::Count(r.holds),
                    Cell::Count(r.gain),
                    Cell::Count(r.cumulative),
                ]
            })
            .collect();
        assert_eq!(sheet.rows, want);
        let picked = one(
            ds,
            &request(
                Screen::Blockers,
                &["step", "gain"],
                keys(&[&view.rows[3].key, "x|y", &view.rows[0].key]),
                spec.clone(),
            ),
        );
        assert_eq!(
            picked.rows,
            vec![
                vec![Cell::Count(4), Cell::Count(view.rows[3].gain)],
                vec![Cell::Count(1), Cell::Count(view.rows[0].gain)],
            ]
        );
        let first = one(
            ds,
            &request(
                Screen::Blockers,
                &["step"],
                RowScope::First { count: 2 },
                spec,
            ),
        );
        assert_eq!(first.rows, vec![vec![Cell::Count(1)], vec![Cell::Count(2)]]);
        // Released holds only: nothing to rank.
        let none = one(
            ds,
            &request(
                Screen::Blockers,
                &[],
                RowScope::All,
                status(Status::Released),
            ),
        );
        assert!(none.rows.is_empty());
    }

    // --- Overview ---

    #[test]
    fn the_overview_writes_its_figures_its_groups_and_its_top_tens() {
        let ds = full();
        let spec = status(Status::Open);
        let sheets = screen_sheets(
            ds,
            None,
            &ds.absent_fields(),
            &request(Screen::Overview, &[], RowScope::All, spec.clone()),
        )
        .unwrap();
        let names: Vec<&str> = sheets.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "file.sheet.summary",
                "file.sheet.disciplines",
                "file.sheet.holdTypes",
                "file.sheet.roles",
                "file.sheet.topBlockers",
                "file.sheet.topLines",
            ]
        );
        let figures = summary(ds, &spec);
        assert_eq!(
            sheets[0].rows,
            vec![
                vec![
                    Cell::Text("file.summary.open.holds".into()),
                    Cell::Count(figures.holds)
                ],
                vec![
                    Cell::Text("file.summary.open.lines".into()),
                    Cell::Count(figures.lines)
                ],
                vec![
                    Cell::Text("file.summary.singleHoldLines".into()),
                    Cell::Count(figures.single_hold_lines)
                ],
                vec![
                    Cell::Text("file.summary.open.median".into()),
                    figures.median_age_days.map_or(Cell::Empty, Cell::Days)
                ],
                vec![
                    Cell::Text("file.summary.stale".into()),
                    Cell::Count(hx_core::query::stale_count(ds, &spec, 90))
                ],
            ]
        );
        let groups = |dim: Dim| -> Vec<String> {
            group_by(ds, &spec, &dim)
                .into_iter()
                .map(|g| g.label)
                .collect()
        };
        assert_eq!(first_cells(&sheets[1]), groups(Dim::Discipline));
        assert_eq!(first_cells(&sheets[2]), groups(Dim::HoldType));
        assert_eq!(first_cells(&sheets[3]), groups(Dim::Role));
        assert_eq!(
            first_cells(&sheets[4]),
            groups(Dim::Blocker)[..TOP_ITEMS].to_vec()
        );
        let top: Vec<String> = line_page(ds, &spec, &LineQuery::default(), 0, Some(TOP_ITEMS))
            .rows
            .into_iter()
            .map(|l| l.line_id)
            .collect();
        assert_eq!(first_cells(&sheets[5]), top);
        assert_eq!(ids(&sheets[5]), LINE_COLUMNS.to_vec());
    }

    #[test]
    fn the_summary_names_its_figures_after_the_status_and_the_filters() {
        let ds = full();
        let labels = |spec: FilterSpec| first_cells(&summary_sheet(ds, &spec, &text()).unwrap());
        assert_eq!(
            labels(status(Status::Released)),
            vec![
                "file.summary.released.holds",
                "file.summary.released.lines",
                "file.summary.linesWithOneHold",
                "file.summary.released.median",
                "file.summary.stale"
            ]
        );
        assert_eq!(
            labels(status(Status::All))[..4].to_vec(),
            vec![
                "file.summary.all.holds",
                "file.summary.all.lines",
                "file.summary.linesWithOneHold",
                "file.summary.all.median"
            ]
        );
        let released = summary_sheet(ds, &status(Status::Released), &text()).unwrap();
        assert_eq!(
            released.rows[3][1],
            summary(ds, &status(Status::Released))
                .median_duration_days
                .map_or(Cell::Empty, Cell::Days)
        );
        // Without creation dates the median and the stale holds are not known: no zero is written.
        let mut dateless = ds.clone();
        for row in &mut dateless.rows {
            row.age_days = None;
        }
        let unknown = summary_sheet(&dateless, &status(Status::Open), &text()).unwrap();
        assert_eq!(unknown.rows[3][1], Cell::Empty);
        assert_eq!(unknown.rows[4][1], Cell::Empty);
    }

    // --- Workbook ---

    fn names(sheets: &[Sheet]) -> Vec<&str> {
        sheets.iter().map(|s| s.name.as_str()).collect()
    }

    #[test]
    fn the_workbook_of_a_full_snapshot_has_every_sheet_in_order() {
        let ds = full();
        let spec = status(Status::Open);
        let plan = plan_of(ds, &spec);
        let sheets = workbook_sheets(
            ds,
            plan.as_ref(),
            &ds.absent_fields(),
            &ds.custom_dims(),
            &spec,
            &text(),
        )
        .unwrap();
        assert_eq!(
            names(&sheets),
            vec![
                "file.sheet.summary",
                "file.dim.discipline",
                "file.dim.holdType",
                "file.dim.role",
                "file.dim.name",
                "file.dim.blockerType",
                "file.dim.blocker",
                "file.dim.remark",
                "file.dim.modelSize",
                "file.dim.stressCalc",
                "file.sheet.matrixHolds",
                "file.sheet.matrixLines",
                "file.sheet.lines",
                "file.sheet.holds",
                "file.sheet.solveOrder",
            ]
        );
        // Lines in the default order, holds in file order, every kept one.
        let lines: Vec<String> = line_page(ds, &spec, &LineQuery::default(), 0, None)
            .rows
            .into_iter()
            .map(|l| l.line_id)
            .collect();
        assert_eq!(first_cells(&sheets[12]), lines);
        let file_order: Vec<String> = ds
            .rows
            .iter()
            .filter(|r: &&Row| spec.matches(r))
            .map(|r| r.hold.line_id.clone())
            .collect();
        assert_eq!(first_cells(&sheets[13]), file_order);
        assert_eq!(
            sheets[14].rows.len(),
            solve_view(plan.as_ref().unwrap()).rows.len()
        );
    }

    #[test]
    fn the_workbook_of_a_limited_file_leaves_out_the_dimensions_it_lacks_and_adds_its_own_columns()
    {
        let mut holds_of: Vec<_> = limited().rows.iter().map(|row| row.hold.clone()).collect();
        holds_of[0].extra.insert("Area".into(), "North".into());
        let ds = Dataset::build(holds_of, RuleSet::builtin(), full().snapshot);
        let spec = status(Status::Open);
        let plan = plan_of(&ds, &spec);
        let sheets = workbook_sheets(
            &ds,
            plan.as_ref(),
            &ds.absent_fields(),
            &ds.custom_dims(),
            &spec,
            &text(),
        )
        .unwrap();
        assert_eq!(
            names(&sheets),
            vec![
                "file.sheet.summary",
                "file.dim.discipline",
                "file.dim.holdType",
                "file.dim.role",
                "file.dim.name",
                "file.dim.blockerType",
                "file.dim.blocker",
                "file.dim.remark",
                "Area",
                "file.sheet.matrixHolds",
                "file.sheet.matrixLines",
                "file.sheet.lines",
                "file.sheet.holds",
                "file.sheet.solveOrder",
            ]
        );
        assert!(!ids(&sheets[12]).contains(&"sourceId"));
        assert!(!ids(&sheets[11]).contains(&"modelSize"));
    }

    // --- Line IDs ---

    fn line_ids_of(ds: &Dataset, request: &ExportRequest) -> Vec<String> {
        let plan = plan_of(ds, &request.spec);
        scope_line_ids(ds, plan.as_ref(), request)
    }

    #[test]
    fn scope_line_ids_name_the_lines_of_the_rows_in_scope_each_once() {
        let ds = full();
        let spec = status(Status::Open);
        // Lines: the line's own.
        let lines = line_ids_of(
            ds,
            &request(
                lines_screen(LineSort::LineId),
                &[],
                RowScope::First { count: 4 },
                spec.clone(),
            ),
        );
        let page: Vec<String> = line_page(
            ds,
            &spec,
            &LineQuery {
                sort: LineSort::LineId,
                ..Default::default()
            },
            0,
            Some(4),
        )
        .rows
        .into_iter()
        .map(|l| l.line_id)
        .collect();
        assert_eq!(lines, page);
        // Holds: each hold's line, each once.
        let page = holds(ds, &spec, &HoldQuery::default());
        let (a, b, c) = (page.positions[0], page.positions[1], page.positions[2]);
        let mut same = page
            .positions
            .iter()
            .copied()
            .filter(|p| ds.rows[*p].hold.line_id == ds.rows[a].hold.line_id && *p != a);
        let twin = same.next().unwrap();
        let held = line_ids_of(
            ds,
            &request(
                holds_screen(HoldSort::FileOrder, false),
                &[],
                keys(&[
                    &a.to_string(),
                    &twin.to_string(),
                    &c.to_string(),
                    &b.to_string(),
                ]),
                spec.clone(),
            ),
        );
        let mut want = vec![ds.rows[a].hold.line_id.clone()];
        for p in [c, b] {
            if !want.contains(&ds.rows[p].hold.line_id) {
                want.push(ds.rows[p].hold.line_id.clone());
            }
        }
        assert_eq!(held, want);
        // Breakdown: a group's lines.
        let groups = group_by(ds, &spec, &Dim::Role);
        let grouped = line_ids_of(
            ds,
            &request(
                Screen::Breakdown { dim: Dim::Role },
                &[],
                keys(&[&groups[1].key]),
                spec.clone(),
            ),
        );
        assert_eq!(grouped.len(), groups[1].lines);
        assert!(grouped
            .iter()
            .all(|line| ds.rows.iter().any(|r| spec.matches(r)
                && r.hold.role == groups[1].key
                && &r.hold.line_id == line)));
        // Blockers: the lines the step's blocker holds among the open kept holds.
        let plan = plan_of(ds, &spec).unwrap();
        let step = &plan.steps[2];
        let node = plan.nodes.iter().find(|n| n.key == step.key).unwrap();
        let blocked = line_ids_of(
            ds,
            &request(
                Screen::Blockers,
                &[],
                keys(&[&step.key]),
                status(Status::All),
            ),
        );
        assert_eq!(blocked, node.lines);
        // Overview and Matrix: every kept line, in the default order.
        let every: Vec<String> = line_page(ds, &spec, &LineQuery::default(), 0, None)
            .rows
            .into_iter()
            .map(|l| l.line_id)
            .collect();
        assert_eq!(
            line_ids_of(
                ds,
                &request(Screen::Overview, &[], RowScope::All, spec.clone())
            ),
            every
        );
        assert_eq!(
            line_ids_of(
                ds,
                &request(
                    Screen::Matrix {
                        rows: Dim::Discipline,
                        cols: Dim::HoldType
                    },
                    &[],
                    RowScope::All,
                    spec
                )
            ),
            every
        );
    }

    // --- Names, keys, and the fixture ---

    fn named(names: &[&str]) -> Vec<String> {
        let mut sheets: Vec<Sheet> = names
            .iter()
            .map(|name| Sheet {
                name: name.to_string(),
                columns: Vec::new(),
                rows: Vec::new(),
            })
            .collect();
        name_sheets(&mut sheets);
        sheets.into_iter().map(|s| s.name).collect()
    }

    #[test]
    fn sheet_names_are_cut_cleaned_and_made_unique() {
        let long = "Holds by discipline and hold type, all of them";
        let got = named(&[
            "Lines",
            "lines",
            "Lines",
            long,
            long,
            "a[b]c:d*e?f/g\\h",
            "'quoted'",
            "[]",
            "History",
        ]);
        assert_eq!(got[0], "Lines");
        assert_eq!(got[1], "lines (2)");
        assert_eq!(got[2], "Lines (3)");
        assert_eq!(got[3], "Holds by discipline and hold ty");
        assert_eq!(got[4], "Holds by discipline and hol (2)");
        assert_eq!(got[5], "abcdefgh");
        assert_eq!(got[6], "quoted");
        assert_eq!(got[7], "8");
        assert_eq!(got[8], "History (2)");
        for name in &got {
            assert!(name.chars().count() <= 31, "{name}");
            assert!(
                !name.contains(['[', ']', ':', '*', '?', '/', '\\']),
                "{name}"
            );
        }
        let lower: std::collections::HashSet<String> =
            got.iter().map(|n| n.to_lowercase()).collect();
        assert_eq!(lower.len(), got.len());
    }

    #[test]
    fn every_label_the_sheets_ask_for_is_a_key_of_the_list() {
        // `text()` holds exactly the keys of the list: every screen under every status, and the
        // workbook of a full and of a limited snapshot, find all they ask for.
        let ds = full();
        let lim = limited();
        for spec in [
            status(Status::Open),
            status(Status::Released),
            status(Status::All),
        ] {
            for data in [ds, &lim] {
                let plan = plan_of(data, &spec);
                let absent = data.absent_fields();
                for screen in [
                    Screen::Overview,
                    lines_screen(LineSort::HoldsDesc),
                    holds_screen(HoldSort::FileOrder, false),
                    Screen::Breakdown { dim: Dim::LineId },
                    Screen::Breakdown { dim: Dim::Name },
                    Screen::Breakdown {
                        dim: Dim::BlockerType,
                    },
                    Screen::Breakdown { dim: Dim::Remark },
                    Screen::Matrix {
                        rows: Dim::ModelSize,
                        cols: Dim::StressCalc,
                    },
                    Screen::Blockers,
                ] {
                    screen_sheets(
                        data,
                        plan.as_ref(),
                        &absent,
                        &request(screen, &[], RowScope::All, spec.clone()),
                    )
                    .unwrap();
                }
                workbook_sheets(
                    data,
                    plan.as_ref(),
                    &absent,
                    &data.custom_dims(),
                    &spec,
                    &text(),
                )
                .unwrap();
                cross_tabs(data, &spec, &Dim::Discipline, &Dim::HoldType, 1, 1, &text()).unwrap();
            }
        }
        // A missing label is named.
        let mut lacking = request(Screen::Blockers, &[], RowScope::All, status(Status::Open));
        lacking.text.labels.remove("file.column.blockers.gain");
        assert_eq!(
            screen_sheets(ds, None, &[], &lacking),
            Err(ExportError::Text {
                key: "file.column.blockers.gain".into()
            })
        );
    }

    #[test]
    fn the_column_ids_are_those_of_the_interface_fixture() {
        let json = include_str!("../../../ui/src/api/file-columns.json");
        let fixture: BTreeMap<String, Vec<String>> = serde_json::from_str(json).unwrap();
        let ours: BTreeMap<String, Vec<String>> = [
            ("lines", LINE_COLUMNS.as_slice()),
            ("holds", HOLD_COLUMNS.as_slice()),
            ("breakdown", BREAKDOWN_COLUMNS.as_slice()),
            ("blockers", BLOCKER_COLUMNS.as_slice()),
        ]
        .into_iter()
        .map(|(screen, ids)| {
            (
                screen.to_string(),
                ids.iter().map(|id| id.to_string()).collect(),
            )
        })
        .collect();
        assert_eq!(ours, fixture);
        // And they are the ids of the columns the sheets write, in that order.
        let ds = full();
        let sheet = |screen: Screen, spec: FilterSpec| {
            ids(&one(ds, &request(screen, &[], RowScope::All, spec)))
                .into_iter()
                .map(String::from)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            sheet(lines_screen(LineSort::HoldsDesc), status(Status::Open)),
            fixture["lines"]
        );
        assert_eq!(
            sheet(Screen::Breakdown { dim: Dim::Role }, status(Status::Open)),
            fixture["breakdown"]
        );
        assert_eq!(
            sheet(Screen::Blockers, status(Status::Open)),
            fixture["blockers"]
        );
        let mut with_remark: Vec<_> = ds.rows.iter().map(|row| row.hold.clone()).collect();
        with_remark[0].release_remark = "Done".into();
        let remarked = Dataset::build(with_remark, RuleSet::builtin(), ds.snapshot);
        let all_holds = ids(&one(
            &remarked,
            &request(
                holds_screen(HoldSort::FileOrder, false),
                &[],
                RowScope::All,
                status(Status::All),
            ),
        ))
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
        assert_eq!(all_holds, fixture["holds"]);
    }

    #[test]
    fn a_request_reads_from_the_json_the_interface_sends() {
        let json = r#"{
            "screen": {"kind": "Lines", "query": {"sort": "OldestFirst", "reverse": true}},
            "columns": ["line", "holds"],
            "rows": {"kind": "First", "count": 200},
            "spec": {"status": "All"},
            "text": {"labels": {}, "months": []},
            "filters": ["Discipline: Piping"]
        }"#;
        let parsed: ExportRequest = serde_json::from_str(json).unwrap();
        assert_eq!(
            parsed.screen,
            Screen::Lines {
                query: LineQuery {
                    sort: LineSort::OldestFirst,
                    reverse: true,
                    ..Default::default()
                }
            }
        );
        assert_eq!(parsed.rows, RowScope::First { count: 200 });
        assert_eq!(parsed.spec.status, Status::All);
        let screens = [
            (r#"{"kind": "Overview"}"#, Screen::Overview),
            (
                r#"{"kind": "Holds", "sort": "Name", "reverse": false}"#,
                Screen::Holds {
                    sort: HoldSort::Name,
                    reverse: false,
                },
            ),
            (
                r#"{"kind": "Breakdown", "dim": {"Custom": "Area"}}"#,
                Screen::Breakdown {
                    dim: Dim::Custom("Area".into()),
                },
            ),
            (
                r#"{"kind": "Matrix", "rows": "Discipline", "cols": "HoldType"}"#,
                Screen::Matrix {
                    rows: Dim::Discipline,
                    cols: Dim::HoldType,
                },
            ),
            (r#"{"kind": "Blockers"}"#, Screen::Blockers),
        ];
        for (json, want) in screens {
            assert_eq!(serde_json::from_str::<Screen>(json).unwrap(), want);
        }
        assert_eq!(
            serde_json::from_str::<RowScope>(r#"{"kind": "All"}"#).unwrap(),
            RowScope::All
        );
        assert_eq!(
            serde_json::from_str::<RowScope>(r#"{"kind": "Keys", "keys": ["3", "7"]}"#).unwrap(),
            keys(&["3", "7"])
        );
    }
}
