//! Tests of the Excel workbooks: reopened with `calamine`, and read as the package XML.

use std::collections::BTreeMap;
use std::io::{Cursor, Read};
use std::sync::OnceLock;

use calamine::{open_workbook_from_rs, Data, DataType, Reader, Xlsx};
use chrono::{NaiveDate, NaiveDateTime};
use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec, Status};
use hx_core::load::load_file;
use hx_core::query::{HoldSort, LineQuery};
use hx_core::rules::RuleSet;
use hx_core::solve::solve_plan;
use hx_synth::{generate, write_workbook, SynthConfig};

use super::*;
use crate::sheet::{Cell, Column, ColumnKind, ColumnRole, Sheet, SheetKind};
use crate::text::{ExportText, FILE_TEXT_KEYS, KEY_NO, KEY_YES};
use crate::views::{screen_sheets, workbook_sheets, ExportRequest, RowScope, Screen};
use crate::ExportError;

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
];

/// Every label the crate asks for, each written as its own key, except the words a reader
/// meets in these tests.
fn text() -> ExportText {
    let mut labels: BTreeMap<String, String> = FILE_TEXT_KEYS
        .iter()
        .map(|key| (key.to_string(), key.to_string()))
        .collect();
    for (key, label) in [
        ("file.listSeparator", ", "),
        (KEY_YES, "Yes"),
        (KEY_NO, "No"),
        ("file.title", "Hold Explorer export"),
        ("file.sheet.about", "About"),
        ("file.column.about.item", "Item"),
        ("file.column.about.value", "Value"),
        ("file.about.workspace", "Workspace"),
        ("file.about.snapshot", "Snapshot"),
        ("file.about.file", "File"),
        ("file.about.filters", "Filters"),
        ("file.about.noFilters", "No filters"),
        ("file.about.rows", "Rows"),
        ("file.about.appVersion", "App version"),
        ("file.about.madeAt", "Made at"),
        ("file.matrix.total", "Total"),
        ("file.matrix.other", "All others"),
    ] {
        labels.insert(key.to_string(), label.to_string());
    }
    ExportText {
        labels,
        months: MONTHS.iter().map(|m| m.to_string()).collect(),
    }
}

fn day(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

fn about() -> About {
    About {
        workspace: "Unit 3 piping".into(),
        snapshot: day(2026, 9, 30),
        file_name: "holds-2026-09-30.xlsx".into(),
        filters: vec!["Discipline: Piping".into(), "Status: All".into()],
        app_version: "0.1.0".into(),
        made_at: day(2026, 10, 19).and_hms_opt(14, 5, 9).unwrap(),
        rows: 642,
    }
}

fn column(id: &str, header: &str, kind: ColumnKind, role: ColumnRole) -> Column {
    Column {
        id: id.into(),
        header: header.into(),
        kind,
        role,
    }
}

/// A sheet of every kind of cell: an identifier, a remark over 60 characters, counts, an age,
/// a size with more than two decimals, a date, a flag, and empty cells.
fn mixed() -> Sheet {
    let remark = "Waiting on the vendor's nozzle loads, then the stress check of the whole loop";
    Sheet {
        name: "Mixed".into(),
        kind: SheetKind::Table,
        columns: vec![
            column("line", "Line ID", ColumnKind::Identifier, ColumnRole::Plain),
            column("name", "Name", ColumnKind::Text, ColumnRole::Plain),
            column("remark", "Remark", ColumnKind::LongText, ColumnRole::Plain),
            column("holds", "Holds", ColumnKind::Count, ColumnRole::HoldCount),
            column("age", "Age", ColumnKind::Days, ColumnRole::Age),
            column("size", "Size", ColumnKind::Size, ColumnRole::Plain),
            column("created", "Created", ColumnKind::Date, ColumnRole::Plain),
            column("sizes", "Sizes differ", ColumnKind::Flag, ColumnRole::Plain),
            column("note", "Note", ColumnKind::LongText, ColumnRole::Plain),
        ],
        rows: vec![
            vec![
                Cell::Text("L-1".into()),
                Cell::Text("Jürgen Ødegård".into()),
                Cell::Text(remark.into()),
                Cell::Count(1042),
                Cell::Days(-3),
                Cell::Size(0.75),
                Cell::Date(day(2026, 9, 30)),
                Cell::Flag(true),
                Cell::Text("short".into()),
            ],
            vec![
                Cell::Text("=SUM(A1)".into()),
                Cell::Empty,
                Cell::Text("two\nlines".into()),
                Cell::Count(0),
                Cell::Days(71),
                Cell::Size(2.0 / 3.0),
                Cell::Empty,
                Cell::Flag(false),
                Cell::Empty,
            ],
        ],
    }
}

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

/// Every sheet of the full workbook of the synthetic snapshot, under `status`.
fn every_sheet(status: Status) -> Vec<Sheet> {
    let ds = full();
    let spec = FilterSpec {
        status,
        ..Default::default()
    };
    let plan = spec.open_only().map(|open| solve_plan(ds, &open, None));
    workbook_sheets(
        ds,
        plan.as_ref(),
        &ds.absent_fields(),
        &[],
        &spec,
        &[],
        &text(),
    )
    .unwrap()
}

fn screen(screen: Screen, status: Status) -> Vec<Sheet> {
    let ds = full();
    let spec = FilterSpec {
        status,
        ..Default::default()
    };
    let plan = spec.open_only().map(|open| solve_plan(ds, &open, None));
    let request = ExportRequest {
        screen,
        columns: Vec::new(),
        rows: RowScope::All,
        spec,
        text: text(),
        filters: Vec::new(),
    };
    screen_sheets(ds, plan.as_ref(), &ds.absent_fields(), &request).unwrap()
}

type Book = Xlsx<Cursor<Vec<u8>>>;

fn reopen(bytes: &[u8]) -> Book {
    open_workbook_from_rs(Cursor::new(bytes.to_vec())).unwrap()
}

/// The cells of a sheet of `book`, row by row, each row as wide as the widest.
fn cells(book: &mut Book, name: &str) -> Vec<Vec<Data>> {
    let range = book.worksheet_range(name).unwrap();
    range.rows().map(<[Data]>::to_vec).collect()
}

/// What `calamine` reads back for a cell written from `cell`.
fn expected(cell: &Cell) -> Data {
    match cell {
        Cell::Text(text) => Data::String(text.clone()),
        Cell::Count(count) => Data::Float(*count as f64),
        Cell::Days(days) => Data::Float(*days as f64),
        Cell::Size(size) => Data::Float((size * 100.0).round() / 100.0),
        Cell::Date(_) => panic!("a date is compared as a date"),
        Cell::Flag(true) => Data::String("Yes".into()),
        Cell::Flag(false) => Data::String("No".into()),
        Cell::Empty => Data::Empty,
    }
}

/// Asserts that the sheet `name` of `book` holds `sheet`: the headings, then every cell.
fn assert_holds(book: &mut Book, name: &str, sheet: &Sheet) {
    let got = cells(book, name);
    let headers: Vec<Data> = unique_headers(&sheet.columns)
        .into_iter()
        .map(Data::String)
        .collect();
    assert_eq!(got[0], headers, "headings of {name}");
    // A table without rows keeps one empty row, which `calamine` does not read.
    assert_eq!(got.len(), sheet.rows.len() + 1, "rows of {name}");
    for (at, (row, want)) in got[1..].iter().zip(&sheet.rows).enumerate() {
        for (col, (cell, want)) in row.iter().zip(want).enumerate() {
            match want {
                Cell::Date(date) => {
                    assert!(
                        matches!(cell, Data::DateTime(_)),
                        "{name} row {at} column {col}: {cell:?} is a date"
                    );
                    assert_eq!(cell.as_datetime().map(|at| at.date()), Some(*date));
                }
                other => assert_eq!(*cell, expected(other), "{name} row {at} column {col}"),
            }
        }
    }
}

/// The text of the file `path` of the package.
fn part(bytes: &[u8], path: &str) -> String {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut file = zip
        .by_name(path)
        .unwrap_or_else(|_| panic!("{path} is in the package"));
    let mut out = String::new();
    file.read_to_string(&mut out).unwrap();
    out
}

fn parts(bytes: &[u8]) -> Vec<String> {
    let zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    zip.file_names().map(str::to_string).collect()
}

/// The `<conditionalFormatting>` blocks of a sheet's XML, each with its range.
fn conditional_formats(xml: &str) -> Vec<(String, String)> {
    xml.split("<conditionalFormatting sqref=\"")
        .skip(1)
        .map(|block| {
            let (range, rest) = block.split_once('"').unwrap();
            let body = rest.split("</conditionalFormatting>").next().unwrap();
            (range.to_string(), body.to_string())
        })
        .collect()
}

/// The width of column `col` (from 1) of a sheet's XML.
fn width(xml: &str, col: usize) -> f64 {
    let tag = format!("<col min=\"{col}\" max=\"{col}\" width=\"");
    let rest = xml
        .split(&tag)
        .nth(1)
        .unwrap_or_else(|| panic!("column {col} has a width"));
    rest.split('"').next().unwrap().parse().unwrap()
}

// --- Cells ---

#[test]
fn every_sheet_of_the_full_workbook_reopens_with_the_cells_given() {
    for status in [Status::Open, Status::Released, Status::All] {
        let sheets = every_sheet(status);
        let bytes = workbook(&sheets, &about(), &text()).unwrap();
        let mut book = reopen(&bytes);
        let names = book.sheet_names();
        assert_eq!(names.len(), sheets.len() + 1);
        assert_eq!(names[0], "About");
        for (name, sheet) in names[1..].iter().zip(&sheets) {
            assert_eq!(*name, sheet.name);
            assert_holds(&mut book, name, sheet);
        }
    }
}

#[test]
fn the_sheets_of_each_screen_reopen_with_the_cells_given() {
    let screens = [
        Screen::Overview,
        Screen::Lines {
            query: LineQuery::default(),
        },
        Screen::Holds {
            sort: HoldSort::FileOrder,
            reverse: false,
        },
        Screen::Breakdown { dim: Dim::Remark },
        Screen::Matrix {
            rows: Dim::Discipline,
            cols: Dim::Role,
        },
        Screen::Blockers,
    ];
    for kind in screens {
        let sheets = screen(kind, Status::Open);
        let bytes = workbook(&sheets, &about(), &text()).unwrap();
        let mut book = reopen(&bytes);
        let names = book.sheet_names();
        assert_eq!(names.len(), sheets.len() + 1);
        for (name, sheet) in names[1..].iter().zip(&sheets) {
            assert_holds(&mut book, name, sheet);
        }
    }
}

#[test]
fn every_kind_of_cell_reopens_as_written() {
    let sheet = mixed();
    let bytes = workbook(std::slice::from_ref(&sheet), &about(), &text()).unwrap();
    let mut book = reopen(&bytes);
    assert_holds(&mut book, "Mixed", &sheet);
    let got = cells(&mut book, "Mixed");
    // A text that starts as a formula stays text, and a size keeps two decimals.
    assert_eq!(got[2][0], Data::String("=SUM(A1)".into()));
    assert_eq!(got[2][5], Data::Float(0.67));
    assert!(!part(&bytes, "xl/worksheets/sheet2.xml").contains("<f>"));
}

#[test]
fn counts_and_days_are_whole_numbers_and_sizes_have_up_to_two_decimals() {
    let bytes = workbook(&[mixed()], &about(), &text()).unwrap();
    let styles = part(&bytes, "xl/styles.xml");
    assert!(styles.contains("formatCode=\"0\""), "{styles}");
    let sheet = part(&bytes, "xl/worksheets/sheet2.xml");
    assert!(sheet.contains("<v>1042</v>"));
    assert!(sheet.contains("<v>-3</v>"));
    assert!(sheet.contains("<v>0.67</v>"));
}

#[test]
fn dates_are_numbers_with_the_date_format() {
    let bytes = workbook(&[mixed()], &about(), &text()).unwrap();
    let styles = part(&bytes, "xl/styles.xml");
    assert!(styles.contains("formatCode=\"d mmm yyyy\""), "{styles}");
    let sheet = part(&bytes, "xl/worksheets/sheet2.xml");
    // 30 Sep 2026 is day 46295 of Excel's calendar, written as a number, not as text.
    let cell = sheet
        .split("<c r=\"G2\"")
        .nth(1)
        .unwrap()
        .split("</c>")
        .next()
        .unwrap();
    assert!(cell.contains("<v>46295</v>"), "{cell}");
    assert!(!cell.contains("t=\"s\""), "{cell}");
}

#[test]
fn a_date_excel_cannot_hold_is_written_as_the_interface_writes_it() {
    let sheet = Sheet {
        name: "Old".into(),
        kind: SheetKind::Table,
        columns: vec![column("d", "Created", ColumnKind::Date, ColumnRole::Plain)],
        rows: vec![vec![Cell::Date(day(1850, 3, 9))]],
    };
    let bytes = workbook(&[sheet], &about(), &text()).unwrap();
    let got = cells(&mut reopen(&bytes), "Old");
    assert_eq!(got[1][0], Data::String("9 Mar 1850".into()));
}

#[test]
fn a_text_longer_than_a_cell_holds_is_cut_to_what_excel_takes() {
    let long = "x".repeat(40_000);
    let sheet = Sheet {
        name: "Long".into(),
        kind: SheetKind::Table,
        columns: vec![column(
            "r",
            "Remark",
            ColumnKind::LongText,
            ColumnRole::Plain,
        )],
        rows: vec![vec![Cell::Text(long)]],
    };
    let bytes = workbook(&[sheet], &about(), &text()).unwrap();
    let got = cells(&mut reopen(&bytes), "Long");
    assert_eq!(got[1][0], Data::String("x".repeat(32_767)));
}

// --- Tables, panes, widths ---

#[test]
fn each_sheet_is_a_table_with_banded_rows_filter_buttons_and_a_frozen_header() {
    let sheets = every_sheet(Status::Open);
    let bytes = workbook(&sheets, &about(), &text()).unwrap();
    let files = parts(&bytes);
    let tables: Vec<&String> = files
        .iter()
        .filter(|f| f.starts_with("xl/tables/table"))
        .collect();
    assert_eq!(tables.len(), sheets.len() + 1, "{files:?}");
    let mut names = std::collections::HashSet::new();
    for at in 1..=sheets.len() + 1 {
        let table = part(&bytes, &format!("xl/tables/table{at}.xml"));
        assert!(table.contains("<autoFilter "), "{table}");
        assert!(table.contains("showRowStripes=\"1\""), "{table}");
        let name = table.split(" name=\"").nth(1).unwrap().split('"').next();
        assert!(names.insert(name.unwrap().to_lowercase()), "{table}");
        let sheet = part(&bytes, &format!("xl/worksheets/sheet{at}.xml"));
        assert!(sheet.contains("<pane ySplit=\"1\""), "sheet {at}");
        assert!(sheet.contains("state=\"frozen\""), "sheet {at}");
    }
    assert!(files.contains(&"xl/tables/table1.xml".to_string()));
    let lines = part(&bytes, "xl/tables/table1.xml");
    assert!(lines.contains("name=\"About\""), "{lines}");
}

#[test]
fn a_table_is_named_from_its_sheet_with_a_name_excel_takes() {
    let named = |name: &str| Sheet {
        name: name.into(),
        kind: SheetKind::Table,
        columns: vec![column("a", "A", ColumnKind::Text, ColumnRole::Plain)],
        rows: vec![vec![Cell::Text("x".into())]],
    };
    let sheets: Vec<Sheet> = [
        "Holds by discipline",
        "A1",
        "R1C1",
        "1st blockers",
        "True",
        "Holds-by discipline",
        "Ölleitung",
    ]
    .iter()
    .map(|name| named(name))
    .collect();
    let bytes = workbook(&sheets, &about(), &text()).unwrap();
    let names: Vec<String> = (2..=sheets.len() + 1)
        .map(|at| {
            let table = part(&bytes, &format!("xl/tables/table{at}.xml"));
            let name = table.split(" name=\"").nth(1).unwrap().split('"').next();
            name.unwrap().to_string()
        })
        .collect();
    assert_eq!(
        names,
        [
            "Holds_by_discipline",
            "_A1",
            "_R1C1",
            "_1st_blockers",
            "_True",
            "Holds_by_discipline_2",
            "Ölleitung",
        ]
    );
}

#[test]
fn a_sheet_without_rows_is_a_table_with_one_empty_row() {
    let sheet = Sheet {
        name: "Steps".into(),
        kind: SheetKind::Table,
        columns: vec![column(
            "s",
            "Step",
            ColumnKind::Count,
            ColumnRole::HoldCount,
        )],
        rows: Vec::new(),
    };
    let bytes = workbook(std::slice::from_ref(&sheet), &about(), &text()).unwrap();
    let table = part(&bytes, "xl/tables/table2.xml");
    assert!(table.contains("ref=\"A1:A2\""), "{table}");
    assert_holds(&mut reopen(&bytes), "Steps", &sheet);
}

#[test]
fn a_sheet_without_columns_is_written_empty() {
    let sheet = Sheet {
        name: "Nothing".into(),
        kind: SheetKind::Table,
        columns: Vec::new(),
        rows: vec![Vec::new()],
    };
    let bytes = workbook(&[sheet], &about(), &text()).unwrap();
    let mut book = reopen(&bytes);
    assert_eq!(book.sheet_names(), ["About", "Nothing"]);
    assert!(cells(&mut book, "Nothing").is_empty());
}

#[test]
fn equal_headings_are_made_unique() {
    let count = |id: &str, header: &str| column(id, header, ColumnKind::Count, ColumnRole::Plain);
    let sheet = Sheet {
        name: "Cross".into(),
        kind: SheetKind::CrossTab,
        columns: vec![
            column("label", "Discipline", ColumnKind::Text, ColumnRole::Plain),
            count("col0", "Total"),
            count("col1", "all others"),
            count("col2", ""),
            count("other", "All others"),
            count("total", "Total"),
        ],
        rows: vec![vec![
            Cell::Text("Total".into()),
            Cell::Count(1),
            Cell::Count(2),
            Cell::Count(3),
            Cell::Count(4),
            Cell::Count(10),
        ]],
    };
    assert_eq!(
        unique_headers(&sheet.columns),
        [
            "Discipline",
            "Total",
            "all others",
            "4",
            "All others (2)",
            "Total (2)"
        ]
    );
    let bytes = workbook(std::slice::from_ref(&sheet), &about(), &text()).unwrap();
    assert_holds(&mut reopen(&bytes), "Cross", &sheet);
}

#[test]
fn widths_follow_the_header_and_the_longest_value_up_to_sixty_and_remarks_wrap() {
    let bytes = workbook(&[mixed()], &about(), &text()).unwrap();
    let sheet = part(&bytes, "xl/worksheets/sheet2.xml");
    // The remark is longer than 60 characters: its column is 60 wide and wraps.
    let remark = width(&sheet, 3);
    assert!((60.0..61.0).contains(&remark), "remark width {remark}");
    // The name is 14 characters, its heading 4: a column of about 14 to 17.
    let name = width(&sheet, 2);
    assert!((14.0..18.0).contains(&name), "name width {name}");
    // A short remark column is as wide as its heading and value, not 60.
    let note = width(&sheet, 9);
    assert!(note < 12.0, "note width {note}");
    let styles = part(&bytes, "xl/styles.xml");
    assert!(styles.contains("wrapText=\"1\""), "{styles}");
    let wrapped = xf_of(&sheet, "C2");
    assert!(xf_wraps(&styles, wrapped), "the remark cell wraps");
    assert!(
        !xf_wraps(&styles, xf_of(&sheet, "B2")),
        "a name does not wrap"
    );
}

/// The style index of the cell `at` of a sheet's XML.
fn xf_of(sheet: &str, at: &str) -> usize {
    let tag = format!("<c r=\"{at}\"");
    let cell = sheet.split(&tag).nth(1).unwrap().split('>').next().unwrap();
    cell.split(" s=\"")
        .nth(1)
        .map_or(0, |rest| rest.split('"').next().unwrap().parse().unwrap())
}

/// Whether the cell style `index` of `styles.xml` wraps its text.
fn xf_wraps(styles: &str, index: usize) -> bool {
    let xfs = styles
        .split("<cellXfs")
        .nth(1)
        .unwrap()
        .split("</cellXfs>")
        .next()
        .unwrap();
    let xf = xfs.split("<xf ").nth(index + 1).unwrap();
    let xf = xf.split("</xf>").next().unwrap();
    xf.split("<xf").next().unwrap().contains("wrapText=\"1\"")
}

// --- Colors ---

#[test]
fn age_columns_take_the_age_band_scale_and_hold_counts_a_neutral_data_bar() {
    let bytes = workbook(&[mixed()], &about(), &text()).unwrap();
    let sheet = part(&bytes, "xl/worksheets/sheet2.xml");
    let formats = conditional_formats(&sheet);
    assert_eq!(formats.len(), 2, "{formats:?}");
    let (range, body) = &formats[0];
    assert_eq!(range, "D2:D3");
    assert!(body.contains("<dataBar"), "{body}");
    assert!(body.contains("FF6C7B7B"), "{body}");
    let (range, body) = &formats[1];
    assert_eq!(range, "E2:E3");
    assert!(body.contains("<colorScale>"), "{body}");
    for color in ["FF4281BF", "FF0E5794", "FF073257"] {
        assert!(body.contains(color), "{color} in {body}");
    }
}

#[test]
fn the_screens_color_ages_of_open_holds_lines_oldest_age_and_hold_counts() {
    let lines = &screen(
        Screen::Lines {
            query: LineQuery::default(),
        },
        Status::Open,
    )[0];
    let at = |sheet: &Sheet, id: &str| sheet.columns.iter().position(|c| c.id == id).unwrap();
    let letter = |col: usize| char::from(b'A' + col as u8);
    let bytes = workbook(std::slice::from_ref(lines), &about(), &text()).unwrap();
    let formats = conditional_formats(&part(&bytes, "xl/worksheets/sheet2.xml"));
    let n = lines.rows.len() + 1;
    let holds = letter(at(lines, "holds"));
    let oldest = letter(at(lines, "oldest"));
    assert!(formats
        .iter()
        .any(|(r, b)| *r == format!("{holds}2:{holds}{n}") && b.contains("<dataBar")));
    assert!(formats
        .iter()
        .any(|(r, b)| *r == format!("{oldest}2:{oldest}{n}") && b.contains("<colorScale>")));
    assert_eq!(formats.len(), 2);

    for (status, colored) in [
        (Status::Open, true),
        (Status::Released, false),
        (Status::All, false),
    ] {
        let holds = &screen(
            Screen::Holds {
                sort: HoldSort::FileOrder,
                reverse: false,
            },
            status,
        )[0];
        let bytes = workbook(std::slice::from_ref(holds), &about(), &text()).unwrap();
        let formats = conditional_formats(&part(&bytes, "xl/worksheets/sheet2.xml"));
        let days = letter(at(holds, "days"));
        assert_eq!(
            formats
                .iter()
                .any(|(r, b)| r.starts_with(&format!("{days}2:")) && b.contains("<colorScale>")),
            colored,
            "{status:?}"
        );
    }

    let groups = &screen(
        Screen::Breakdown {
            dim: Dim::Discipline,
        },
        Status::Open,
    )[0];
    let bytes = workbook(std::slice::from_ref(groups), &about(), &text()).unwrap();
    let formats = conditional_formats(&part(&bytes, "xl/worksheets/sheet2.xml"));
    assert_eq!(formats.len(), 1);
    assert!(formats[0].0.starts_with("B2:") && formats[0].1.contains("<dataBar"));

    let steps = &screen(Screen::Blockers, Status::Open)[0];
    let bytes = workbook(std::slice::from_ref(steps), &about(), &text()).unwrap();
    let formats = conditional_formats(&part(&bytes, "xl/worksheets/sheet2.xml"));
    let holds = letter(at(steps, "holds"));
    assert_eq!(formats.len(), 1);
    assert!(formats[0].0.starts_with(&format!("{holds}2:")));
}

#[test]
fn cross_tabs_take_the_blue_ramp_over_the_cells_between_the_totals() {
    let sheets = screen(
        Screen::Matrix {
            rows: Dim::Discipline,
            cols: Dim::HoldType,
        },
        Status::Open,
    );
    assert_eq!(sheets.len(), 2);
    let bytes = workbook(&sheets, &about(), &text()).unwrap();
    for (at, sheet) in sheets.iter().enumerate() {
        assert_eq!(sheet.kind, SheetKind::CrossTab);
        let xml = part(&bytes, &format!("xl/worksheets/sheet{}.xml", at + 2));
        let formats = conditional_formats(&xml);
        assert_eq!(formats.len(), 1, "{formats:?}");
        let (range, body) = &formats[0];
        // From the first value column to the one before the total, and from the first row to
        // the one before the total row.
        let last_col = char::from(b'A' + (sheet.columns.len() - 2) as u8);
        assert_eq!(*range, format!("B2:{last_col}{}", sheet.rows.len()));
        assert!(body.contains("<colorScale>"), "{body}");
        for color in ["FFD9EAFC", "FF508FCD", "FF094171"] {
            assert!(body.contains(color), "{color} in {body}");
        }
    }
}

#[test]
fn the_palette_has_every_color_a_workbook_uses() {
    for token in [
        "--color-chart-ord-1",
        "--color-chart-ord-3",
        "--color-chart-ord-5",
        "--color-chart-seq-1",
        "--color-chart-seq-4",
        "--color-chart-seq-7",
        "--color-chart-neutral",
    ] {
        assert!(palette().contains_key(token), "{token}");
    }
    assert_eq!(color("--color-chart-ord-1"), 0x4281BF);
}

// --- About and properties ---

#[test]
fn about_comes_first_and_states_where_the_file_comes_from() {
    let bytes = workbook(&[mixed()], &about(), &text()).unwrap();
    let mut book = reopen(&bytes);
    assert_eq!(book.sheet_names(), ["About", "Mixed"]);
    let got = cells(&mut book, "About");
    let s = |text: &str| Data::String(text.into());
    assert_eq!(got[0], [s("Item"), s("Value")]);
    assert_eq!(got[1], [s("Workspace"), s("Unit 3 piping")]);
    assert_eq!(got[2][0], s("Snapshot"));
    assert_eq!(
        got[2][1].as_datetime().map(|at| at.date()),
        Some(day(2026, 9, 30))
    );
    assert_eq!(got[3], [s("File"), s("holds-2026-09-30.xlsx")]);
    assert_eq!(got[4], [s("Filters"), s("Discipline: Piping")]);
    assert_eq!(got[5], [Data::Empty, s("Status: All")]);
    assert_eq!(got[6], [s("Rows"), Data::Float(642.0)]);
    assert_eq!(got[7], [s("App version"), s("0.1.0")]);
    assert_eq!(got[8][0], s("Made at"));
    assert!(matches!(got[8][1], Data::DateTime(_)), "{:?}", got[8][1]);
    // The moment, to the second (a serial day number rounds to a millisecond or so).
    let made: NaiveDateTime = got[8][1].as_datetime().unwrap();
    let off = (made - about().made_at).num_milliseconds().abs();
    assert!(off < 5, "{made} is {}", about().made_at);
    assert_eq!(got.len(), 9);
    let styles = part(&bytes, "xl/styles.xml");
    assert!(
        styles.contains("formatCode=\"d mmm yyyy hh:mm\""),
        "{styles}"
    );
}

#[test]
fn about_without_filters_says_so() {
    let mut about = about();
    about.filters.clear();
    let bytes = workbook(&[mixed()], &about, &text()).unwrap();
    let got = cells(&mut reopen(&bytes), "About");
    let s = |text: &str| Data::String(text.into());
    assert_eq!(got[4], [s("Filters"), s("No filters")]);
    assert_eq!(got[5][0], s("Rows"));
}

#[test]
fn a_sheet_named_as_about_is_renamed_so_about_stays_first_and_unique() {
    let mut sheet = mixed();
    sheet.name = "about".into();
    let bytes = workbook(&[sheet], &about(), &text()).unwrap();
    assert_eq!(reopen(&bytes).sheet_names(), ["About", "about (2)"]);
}

#[test]
fn the_document_has_the_catalog_title_and_no_author_or_company() {
    let bytes = workbook(&[mixed()], &about(), &text()).unwrap();
    let core = part(&bytes, "docProps/core.xml");
    assert!(
        core.contains("<dc:title>Hold Explorer export</dc:title>"),
        "{core}"
    );
    assert!(core.contains("<dc:creator></dc:creator>"), "{core}");
    assert!(
        core.contains("<cp:lastModifiedBy></cp:lastModifiedBy>"),
        "{core}"
    );
    let app = part(&bytes, "docProps/app.xml");
    assert!(app.contains("<Company></Company>"), "{app}");
}

#[test]
fn a_catalog_without_a_label_the_workbook_needs_is_refused_naming_the_key() {
    for key in [
        "file.title",
        "file.sheet.about",
        "file.about.madeAt",
        "file.about.noFilters",
        KEY_YES,
    ] {
        let mut lacking = text();
        lacking.labels.remove(key);
        let mut about = about();
        if key == "file.about.noFilters" {
            about.filters.clear();
        }
        assert_eq!(
            workbook(&[mixed()], &about, &lacking),
            Err(ExportError::Text { key: key.into() }),
            "{key}"
        );
    }
}

#[test]
fn every_label_the_workbook_asks_for_is_one_the_crate_lists() {
    let listed = ExportText {
        labels: FILE_TEXT_KEYS
            .iter()
            .map(|key| (key.to_string(), key.to_string()))
            .collect(),
        months: Vec::new(),
    };
    let mut bare = about();
    bare.filters.clear();
    for about in [about(), bare] {
        assert!(workbook(&[mixed()], &about, &listed).is_ok());
    }
}
