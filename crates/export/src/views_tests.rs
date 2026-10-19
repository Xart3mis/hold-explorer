//! Tests of the sheets of every screen and of the full workbook.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use hx_core::dataset::{Dataset, Row};
use hx_core::filter::{Dim, FilterSpec, Status};
use hx_core::load::load_file;
use hx_core::mapping::Field;
use hx_core::query::{
    group_by, holds, line_page, matrix_lines, matrix_top, summary, HoldQuery, HoldSort, LineQuery,
    LineSort,
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

/// Every label the crate asks for, each written as its own key except the list separator, which
/// is the interface's `, `, and the months.
fn text() -> ExportText {
    ExportText {
        labels: FILE_TEXT_KEYS
            .iter()
            .map(|key| {
                let label = if *key == "file.listSeparator" {
                    ", "
                } else {
                    key
                };
                (key.to_string(), label.to_string())
            })
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

fn request(screen: Screen, columns: &[&str], rows: RowScope, spec: FilterSpec) -> ExportRequest {
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
    let sheets = cross_tabs(ds, &spec, &Dim::Discipline, &Dim::HoldType, 2, 1, &text()).unwrap();
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
    // The filter bar shows a status other than Open as a filter that is set.
    let set = ["Status: not Open".to_string()];
    let labels = |spec: FilterSpec| first_cells(&summary_sheet(ds, &spec, &set, &text()).unwrap());
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
    let released = summary_sheet(ds, &status(Status::Released), &set, &text()).unwrap();
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
    let unknown = summary_sheet(&dateless, &status(Status::Open), &[], &text()).unwrap();
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
        &[],
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
fn the_workbook_of_a_limited_file_leaves_out_the_dimensions_it_lacks_and_adds_its_own_columns() {
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
        &[],
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
    assert!(grouped.iter().all(|line| ds
        .rows
        .iter()
        .any(|r| spec.matches(r) && r.hold.role == groups[1].key && &r.hold.line_id == line)));
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
            kind: crate::sheet::SheetKind::Table,
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
    let lower: std::collections::HashSet<String> = got.iter().map(|n| n.to_lowercase()).collect();
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
                &[],
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

#[test]
fn the_single_hold_lines_are_named_as_the_screen_names_them_whether_a_filter_is_set() {
    let ds = full();
    let single = |spec: FilterSpec, filters: &[&str]| {
        let mut asked = request(Screen::Overview, &[], RowScope::All, spec);
        asked.filters = filters.iter().map(|f| f.to_string()).collect();
        let sheets = screen_sheets(ds, None, &[], &asked).unwrap();
        first_cells(&sheets[0])[2].clone()
    };
    assert_eq!(
        single(status(Status::Open), &[]),
        "file.summary.singleHoldLines"
    );
    assert_eq!(
        single(status(Status::Open), &["Discipline: Piping"]),
        "file.summary.linesWithOneHold"
    );
    // A filter the snapshot cannot apply is still set on the screen: the spec made applicable
    // is the default, and the label is that of a filtered screen.
    assert_eq!(
        single(status(Status::Open), &["Model size: 4"]),
        "file.summary.linesWithOneHold"
    );
    let workbook = |filters: &[String]| {
        let spec = status(Status::Open);
        let sheets = workbook_sheets(ds, None, &[], &[], &spec, filters, &text()).unwrap();
        first_cells(&sheets[0])[2].clone()
    };
    assert_eq!(workbook(&[]), "file.summary.singleHoldLines");
    assert_eq!(
        workbook(&["Status: All".to_string()]),
        "file.summary.linesWithOneHold"
    );
}

#[test]
fn lists_are_joined_with_the_separator_of_the_catalog() {
    let ds = full();
    let mut asked = request(
        lines_screen(LineSort::Disciplines),
        &["disciplines"],
        RowScope::First { count: 1 },
        status(Status::Open),
    );
    asked
        .text
        .labels
        .insert("file.listSeparator".into(), " | ".into());
    let sheet = one(ds, &asked);
    let line = &line_page(
        ds,
        &status(Status::Open),
        &LineQuery {
            sort: LineSort::Disciplines,
            ..Default::default()
        },
        0,
        Some(1),
    )
    .rows[0];
    assert!(line.disciplines.len() > 1);
    assert_eq!(sheet.rows[0][0], Cell::Text(line.disciplines.join(" | ")));
}

#[test]
fn an_empty_discipline_or_remark_is_an_empty_cell() {
    let mut blank = full().rows[0].hold.clone();
    blank.line_id = "BLANK-1".into();
    blank.discipline = String::new();
    blank.remark = String::new();
    blank.released = false;
    let ds = Dataset::build(vec![blank], RuleSet::builtin(), full().snapshot);
    let lines = one(
        &ds,
        &request(
            lines_screen(LineSort::HoldsDesc),
            &["disciplines"],
            RowScope::All,
            status(Status::Open),
        ),
    );
    assert_eq!(lines.rows, vec![vec![Cell::Empty]]);
    let holds = one(
        &ds,
        &request(
            holds_screen(HoldSort::FileOrder, false),
            &["discipline", "remark"],
            RowScope::All,
            status(Status::Open),
        ),
    );
    assert_eq!(holds.rows, vec![vec![Cell::Empty, Cell::Empty]]);
}

#[test]
fn the_overview_and_the_matrix_ignore_the_columns_and_rows_asked_for() {
    let ds = full();
    let spec = status(Status::Open);
    let absent = ds.absent_fields();
    for screen in [
        Screen::Overview,
        Screen::Matrix {
            rows: Dim::Discipline,
            cols: Dim::HoldType,
        },
    ] {
        let whole = screen_sheets(
            ds,
            None,
            &absent,
            &request(screen.clone(), &[], RowScope::All, spec.clone()),
        )
        .unwrap();
        for rows in [RowScope::First { count: 1 }, keys(&["Civil", "nothing"])] {
            let asked = screen_sheets(
                ds,
                None,
                &absent,
                &request(screen.clone(), &["holds"], rows, spec.clone()),
            )
            .unwrap();
            assert_eq!(asked, whole);
        }
    }
}

/// The lines of each group as `group_detail` lists them: the kept holds of the group, in the
/// default order of Lines, one `line_page` per group.
fn lines_per_group(ds: &Dataset, spec: &FilterSpec, dim: &Dim, keys: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for key in keys {
        let mut of_group = spec.without(dim);
        of_group.fields.push(hx_core::filter::FieldFilter {
            dim: dim.clone(),
            values: vec![key.clone()],
            negate: false,
        });
        for line in line_page(ds, &of_group, &LineQuery::default(), 0, None).rows {
            if !out.contains(&line.line_id) {
                out.push(line.line_id);
            }
        }
    }
    out
}

#[test]
fn a_groups_lines_in_one_pass_equal_those_of_a_line_page_per_group() {
    let ds = full();
    for spec in [status(Status::Open), status(Status::All)] {
        for dim in [Dim::Remark, Dim::Discipline, Dim::Name, Dim::Blocker] {
            let groups: Vec<String> = group_by(ds, &spec, &dim)
                .into_iter()
                .map(|g| g.key)
                .collect();
            let all = line_ids_of(
                ds,
                &request(
                    Screen::Breakdown { dim: dim.clone() },
                    &[],
                    RowScope::All,
                    spec.clone(),
                ),
            );
            assert_eq!(all, lines_per_group(ds, &spec, &dim, &groups), "{dim:?}");
            let picked: Vec<String> = [&groups[3], &groups[0], &groups[1]]
                .iter()
                .map(|k| k.to_string())
                .collect();
            let some = line_ids_of(
                ds,
                &request(
                    Screen::Breakdown { dim: dim.clone() },
                    &[],
                    RowScope::Keys {
                        keys: picked.clone(),
                    },
                    spec.clone(),
                ),
            );
            assert_eq!(some, lines_per_group(ds, &spec, &dim, &picked), "{dim:?}");
        }
    }
}

#[test]
fn holds_named_columns_the_status_does_not_write_are_left_out_without_an_error() {
    let ds = full();
    let asked = ["line", "status", "releasedOn", "releaseRemark", "days"];
    let open = one(
        ds,
        &request(
            holds_screen(HoldSort::FileOrder, false),
            &asked,
            RowScope::All,
            status(Status::Open),
        ),
    );
    assert_eq!(ids(&open), ["line", "days"]);
    let released = one(
        ds,
        &request(
            holds_screen(HoldSort::FileOrder, false),
            &asked,
            RowScope::All,
            status(Status::Released),
        ),
    );
    // Released holds have a release date and no status column; the file has no release remark.
    assert_eq!(ids(&released), ["line", "releasedOn", "days"]);
}

#[test]
fn lines_asked_only_for_columns_the_snapshot_lacks_write_every_present_column() {
    let ds = limited();
    let every = one(
        &ds,
        &request(
            lines_screen(LineSort::HoldsDesc),
            &[],
            RowScope::All,
            status(Status::Open),
        ),
    );
    let asked = one(
        &ds,
        &request(
            lines_screen(LineSort::HoldsDesc),
            &["modelSize"],
            RowScope::All,
            status(Status::Open),
        ),
    );
    assert!(!ids(&asked).is_empty());
    assert_eq!(ids(&asked), ids(&every));
    assert_eq!(asked.rows, every.rows);
}

#[test]
fn holds_asked_only_for_columns_the_status_does_not_write_write_every_present_column() {
    let ds = full();
    let open = |columns: &[&str]| {
        one(
            ds,
            &request(
                holds_screen(HoldSort::FileOrder, false),
                columns,
                RowScope::All,
                status(Status::Open),
            ),
        )
    };
    let asked = open(&["status", "releasedOn"]);
    let every = open(&[]);
    assert!(!ids(&asked).is_empty());
    assert_eq!(ids(&asked), ids(&every));
    assert_eq!(asked.rows.len(), every.rows.len());
}

#[test]
fn the_summary_names_the_age_of_a_stale_hold_from_the_threshold() {
    let mut words = text();
    words.labels.insert(
        "file.summary.stale".into(),
        "Holds open for {days} days or more".into(),
    );
    let sheet = summary_sheet(full(), &status(Status::Open), &[], &words).unwrap();
    let last = first_cells(&sheet).last().cloned();
    assert_eq!(
        last.as_deref(),
        Some(format!("Holds open for {STALE_DAYS} days or more").as_str())
    );
}
