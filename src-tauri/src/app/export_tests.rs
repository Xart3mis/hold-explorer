use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use calamine::{open_workbook, Data, Reader, Xlsx};
use chrono::Local;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::query::LineQuery;
use hx_export::chart::ChartChoice;
use hx_export::{
    write_file, ExportError, ExportRequest, ExportText, RowScope, Screen, FILE_TEXT_KEYS,
};

use super::error::CommandError;
use super::export::{
    copy, fonts, render, save, Clipboard, Content, CopyFormat, ExportSaved, SaveFormat,
    SendClipboard, SessionClipboard,
};
use super::snapshot_tests::{import, view_of, Fixture};
use super::{AppState, ViewRef};

/// Every label a file asks for, written as its own key.
fn text() -> ExportText {
    ExportText {
        labels: FILE_TEXT_KEYS
            .iter()
            .map(|key| (key.to_string(), key.to_string()))
            .collect::<BTreeMap<_, _>>(),
        months: Vec::new(),
    }
}

fn request(screen: Screen) -> ExportRequest {
    ExportRequest {
        screen,
        columns: Vec::new(),
        rows: RowScope::All,
        spec: FilterSpec::default(),
        text: text(),
        filters: Vec::new(),
    }
}

fn lines() -> ExportRequest {
    request(Screen::Lines {
        query: LineQuery::default(),
    })
}

/// The view the interface shows when it shows what the state holds.
fn shown(state: &AppState) -> ViewRef {
    view_of(&state.open_id(), state.selected_snapshot())
}

/// A state with one workspace holding the small synthetic file.
fn small(fx: &Fixture) -> AppState {
    let mut state = fx.state();
    import(
        &mut state,
        &fx.synth("a.xlsx", 1),
        "2026-09-29 00:00:00",
        true,
    );
    state
}

/// A state with one workspace and no snapshot.
fn empty(fx: &Fixture) -> AppState {
    let mut state = fx.state();
    state.create_workspace("Empty").unwrap();
    state
}

/// Every format a file is saved in, with the name of its file.
fn formats() -> Vec<(SaveFormat, &'static str)> {
    vec![
        (SaveFormat::Excel, "lines.xlsx"),
        (SaveFormat::Workbook, "workbook.xlsx"),
        (SaveFormat::Csv, "lines.csv"),
        (SaveFormat::Report, "report.pdf"),
        (
            SaveFormat::ChartPng {
                chart: ChartChoice::Bars {
                    dim: Dim::Discipline,
                },
            },
            "bars.png",
        ),
        (
            SaveFormat::ChartSvg {
                chart: ChartChoice::Curve { steps: 0 },
            },
            "curve.svg",
        ),
    ]
}

/// Gathers and saves the Lines of the view in `format` into `dir`, as the command does.
fn save_lines(
    state: &mut AppState,
    format: &SaveFormat,
    path: &Path,
) -> Result<ExportSaved, CommandError> {
    let request = lines();
    let content = state.export_content(&request, format, &shown(state))?;
    save(content, format, path, &request.text, fonts(), &write_file)
}

/// Checks that the file at `path` opens with the reader of its format, and that a table holds
/// `rows` rows.
fn opens(format: &SaveFormat, path: &Path, rows: usize) {
    let bytes = fs::read(path).unwrap();
    match format {
        SaveFormat::Excel => {
            let mut book: Xlsx<_> = open_workbook(path).unwrap();
            let names = book.sheet_names();
            assert_eq!(names.len(), 2, "{names:?}");
            let table = book.worksheet_range(&names[1]).unwrap();
            assert_eq!(table.height(), rows + 1, "the header and the rows");
        }
        SaveFormat::Workbook => {
            let book: Xlsx<_> = open_workbook(path).unwrap();
            assert!(book.sheet_names().len() > 5, "{:?}", book.sheet_names());
        }
        SaveFormat::Csv => {
            let mut reader = csv::Reader::from_reader(bytes.as_slice());
            assert!(!reader.headers().unwrap().is_empty());
            let records: Vec<_> = reader.records().map(Result::unwrap).collect();
            assert_eq!(records.len(), rows);
        }
        SaveFormat::Report => assert!(bytes.starts_with(b"%PDF-")),
        SaveFormat::ChartPng { .. } => assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n")),
        SaveFormat::ChartSvg { .. } => {
            let svg = String::from_utf8(bytes).unwrap();
            assert!(svg.contains("<svg"), "{svg}");
            hx_export::raster::png(&svg, fonts()).expect("the SVG parses");
        }
    }
}

#[test]
fn each_format_writes_a_file_that_its_reader_opens() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let lines_kept = state
        .lines(
            &FilterSpec::default(),
            &LineQuery::default(),
            0,
            &shown(&state),
        )
        .unwrap()
        .total;
    assert!(lines_kept > 0);
    let out = fx.dir.path().join("out");
    fs::create_dir_all(&out).unwrap();
    for (format, name) in formats() {
        let path = out.join(name);
        let saved = save_lines(&mut state, &format, &path).unwrap();
        assert_eq!(saved.path, path.to_string_lossy());
        match format {
            SaveFormat::Excel | SaveFormat::Csv => assert_eq!(saved.rows, lines_kept, "{name}"),
            SaveFormat::Workbook => assert!(saved.rows > lines_kept, "{name}"),
            _ => assert_eq!(saved.rows, 0, "{name}"),
        }
        opens(&format, &path, saved.rows);
    }
    // Nothing but the files was left in the folder.
    assert_eq!(fs::read_dir(&out).unwrap().count(), formats().len());
}

#[test]
fn a_workspace_without_a_snapshot_writes_the_empty_file_of_each_format() {
    let fx = Fixture::new();
    let mut state = empty(&fx);
    assert_eq!(state.selected_snapshot(), None);
    let out = fx.dir.path().join("out");
    fs::create_dir_all(&out).unwrap();
    for (format, name) in formats() {
        let path = out.join(name);
        let saved = save_lines(&mut state, &format, &path)
            .unwrap_or_else(|error| panic!("{name}: {error:?}"));
        if !matches!(format, SaveFormat::Workbook) {
            assert_eq!(saved.rows, 0, "{name}");
        }
        opens(&format, &path, saved.rows);
    }
}

#[test]
fn every_screen_is_saved_as_excel_and_its_rows_are_counted() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let out = fx.dir.path().join("out");
    fs::create_dir_all(&out).unwrap();
    let screens = [
        Screen::Overview,
        Screen::Holds {
            sort: hx_core::query::HoldSort::FileOrder,
            reverse: false,
        },
        Screen::Breakdown { dim: Dim::Role },
        Screen::Matrix {
            rows: Dim::Discipline,
            cols: Dim::HoldType,
        },
        Screen::Blockers,
    ];
    for (at, screen) in screens.into_iter().enumerate() {
        let request = request(screen.clone());
        let view = shown(&state);
        let content = state
            .export_content(&request, &SaveFormat::Excel, &view)
            .unwrap();
        let Content::Sheets { sheets, about } = &content else {
            panic!("{screen:?} gave no sheets");
        };
        let rows: usize = sheets.iter().map(|sheet| sheet.rows.len()).sum();
        assert!(rows > 0, "{screen:?}");
        assert_eq!(about.rows, rows, "{screen:?}");
        assert_eq!(about.workspace, "W");
        assert_eq!(about.file_name, "a.xlsx");
        assert_eq!(
            about.snapshot.map(|day| day.to_string()).as_deref(),
            Some("2026-09-29")
        );
        assert_eq!(about.made_at.offset(), Local::now().fixed_offset().offset());
        assert_eq!(about.app_version, env!("CARGO_PKG_VERSION"));
        let path = out.join(format!("{at}.xlsx"));
        let saved = save(
            content,
            &SaveFormat::Excel,
            &path,
            &request.text,
            fonts(),
            &write_file,
        )
        .unwrap();
        assert_eq!(saved.rows, rows, "{screen:?}");
        let book: Xlsx<_> = open_workbook(&path).unwrap();
        assert!(book.sheet_names().len() >= 2, "{screen:?}");
    }
}

#[test]
fn the_blockers_sheet_lists_the_steps_of_the_open_kept_holds() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let steps = state
        .solve_order(&FilterSpec::default(), &view)
        .unwrap()
        .rows
        .len();
    assert!(steps > 0);
    let content = state
        .export_content(&request(Screen::Blockers), &SaveFormat::Excel, &view)
        .unwrap();
    let Content::Sheets { sheets, .. } = content else {
        panic!("no sheets");
    };
    assert_eq!(sheets.len(), 1);
    assert_eq!(sheets[0].rows.len(), steps);
}

#[test]
fn the_report_and_a_chart_are_gathered_whole_with_the_head_of_the_view() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let mut asked = lines();
    asked.filters = vec!["Discipline: Piping".into()];
    let Content::Report { head, plan, .. } = state
        .export_content(&asked, &SaveFormat::Report, &view)
        .unwrap()
    else {
        panic!("no report");
    };
    assert_eq!(head.workspace, "W");
    assert_eq!(
        head.snapshot.map(|day| day.to_string()).as_deref(),
        Some("2026-09-29")
    );
    assert_eq!(head.made_at.offset(), Local::now().fixed_offset().offset());
    assert_eq!(head.filters, ["Discipline: Piping"]);
    assert_eq!(head.app_version, env!("CARGO_PKG_VERSION"));
    assert!(plan.is_some(), "the default filter keeps open holds");

    // A filter that keeps released holds only has no plan.
    let mut released = lines();
    released.spec.status = hx_core::filter::Status::Released;
    let Content::Report { plan, .. } = state
        .export_content(&released, &SaveFormat::Report, &view)
        .unwrap()
    else {
        panic!("no report");
    };
    assert!(plan.is_none());

    let chart = SaveFormat::ChartSvg {
        chart: ChartChoice::TopBlockers,
    };
    let content = state.export_content(&asked, &chart, &view).unwrap();
    assert!(matches!(content, Content::Chart { .. }));
    let svg = String::from_utf8(render(content, &chart, &asked.text, fonts()).unwrap()).unwrap();
    assert!(
        svg.contains("Discipline: Piping"),
        "the chart names its filters"
    );
}

#[test]
fn export_and_copy_refuse_without_a_workspace_and_for_a_view_not_shown() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let none = view_of("0123456789abcdef", None);
    let kind = |result: Result<Content, CommandError>| result.err().map(|error| error.kind);
    assert_eq!(
        kind(state.export_content(&lines(), &SaveFormat::Excel, &none)),
        Some("NoWorkspace".into())
    );
    assert_eq!(
        kind(state.copy_content(&lines(), &CopyFormat::Table, &none)),
        Some("NoWorkspace".into())
    );

    let mut state = small(&fx);
    let (workspace, snapshot) = (state.open_id(), state.selected_snapshot().unwrap());
    for stale in [
        view_of("0123456789abcdef", Some(snapshot)),
        view_of(&workspace, Some(snapshot + 100)),
        view_of(&workspace, None),
    ] {
        for (format, _) in formats() {
            assert_eq!(
                kind(state.export_content(&lines(), &format, &stale)),
                Some("ViewChanged".into()),
                "{format:?} {stale:?}"
            );
        }
        for format in [
            CopyFormat::Table,
            CopyFormat::LineIds,
            CopyFormat::Chart {
                chart: ChartChoice::TopBlockers,
            },
        ] {
            assert_eq!(
                kind(state.copy_content(&lines(), &format, &stale)),
                Some("ViewChanged".into()),
                "{format:?} {stale:?}"
            );
        }
    }
}

#[test]
fn a_file_another_program_holds_or_that_is_read_only_fails_with_file_in_use() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let path = fx.dir.path().join("held.csv");
    fs::write(&path, b"earlier").unwrap();
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&path, permissions).unwrap();

    let error = save_lines(&mut state, &SaveFormat::Csv, &path).unwrap_err();
    assert_eq!(error.kind, "FileInUse");
    assert_eq!(
        error.message,
        ExportError::FileInUse {
            file: "held.csv".into()
        }
        .to_string()
    );
    assert_eq!(fs::read(&path).unwrap(), b"earlier");
}

#[test]
fn a_missing_folder_fails_with_folder() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let path = fx.dir.path().join("no such folder").join("lines.csv");
    let error = save_lines(&mut state, &SaveFormat::Csv, &path).unwrap_err();
    assert_eq!(error.kind, "Folder");
}

#[test]
fn every_export_error_keeps_its_variant_name_and_text() {
    let errors = [
        (ExportError::FileInUse { file: "a".into() }, "FileInUse"),
        (
            ExportError::Folder {
                folder: "f".into(),
                reason: "r".into(),
            },
            "Folder",
        ),
        (
            ExportError::Write {
                file: "a".into(),
                reason: "r".into(),
            },
            "Write",
        ),
        (
            ExportError::TooManyRows {
                sheet: "s".into(),
                rows: 2_000_000,
            },
            "TooManyRows",
        ),
        (ExportError::Workbook { reason: "r".into() }, "Workbook"),
        (ExportError::Image { reason: "r".into() }, "Image"),
        (ExportError::Report { reason: "r".into() }, "Report"),
        (ExportError::Text { key: "k".into() }, "Text"),
    ];
    for (error, kind) in errors {
        let text = error.to_string();
        let mapped = CommandError::from(error);
        assert_eq!(mapped.kind, kind);
        assert_eq!(mapped.message, text);
    }
}

#[test]
fn a_request_without_its_labels_fails_with_text() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let mut asked = lines();
    asked.text = ExportText::default();
    let view = shown(&state);
    let error = state
        .export_content(&asked, &SaveFormat::Excel, &view)
        .err()
        .unwrap();
    assert_eq!(error.kind, "Text");
}

#[test]
fn only_a_path_written_in_this_session_is_opened() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let path = fx.dir.path().join("lines.csv");
    assert!(!state.has_written(&path));
    let error = state.openable(&path).unwrap_err();
    assert_eq!(error.kind, "NotWritten");
    assert_eq!(
        error.message,
        "Hold Explorer opens only files it saved in this session. Open the file from its folder."
    );

    save_lines(&mut state, &SaveFormat::Csv, &path).unwrap();
    // Saving is not enough: the command records the path once the file is written.
    assert!(!state.has_written(&path));
    state.wrote(path.clone());
    assert!(state.has_written(&path));
    assert_eq!(state.openable(&path), Ok(()));
    // Another path is still refused, and the record outlives a new start of the page.
    assert_eq!(
        state
            .openable(&fx.dir.path().join("other.csv"))
            .unwrap_err()
            .kind,
        "NotWritten"
    );
    state.start();
    assert!(state.has_written(&path));
}

/// A clipboard that keeps what it is given.
#[derive(Default)]
struct FakeClipboard {
    text: Option<String>,
    image: Option<(u32, u32, usize)>,
    refuse: bool,
}

impl Clipboard for FakeClipboard {
    fn text(&mut self, text: &str) -> Result<(), CommandError> {
        if self.refuse {
            return Err(CommandError::new("Clipboard", "refused"));
        }
        self.text = Some(text.to_string());
        Ok(())
    }

    fn image(&mut self, width: u32, height: u32, rgba: &[u8]) -> Result<(), CommandError> {
        if self.refuse {
            return Err(CommandError::new("Clipboard", "refused"));
        }
        self.image = Some((width, height, rgba.len()));
        Ok(())
    }
}

fn copied(state: &mut AppState, request: &ExportRequest, format: CopyFormat) -> FakeClipboard {
    let view = shown(state);
    let content = state.copy_content(request, &format, &view).unwrap();
    let mut clipboard = FakeClipboard::default();
    copy(content, &mut clipboard, &request.text, fonts()).unwrap();
    clipboard
}

#[test]
fn a_copy_puts_the_table_the_line_ids_or_the_chart_on_the_clipboard() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let page = state
        .lines(&FilterSpec::default(), &LineQuery::default(), 0, &view)
        .unwrap();
    let mut first_two = lines();
    first_two.rows = RowScope::First { count: 2 };

    let table = copied(&mut state, &first_two, CopyFormat::Table);
    let text = table.text.unwrap();
    let rows: Vec<&str> = text.lines().collect();
    assert_eq!(rows.len(), 3, "the header and two rows: {text}");
    assert!(rows[0].contains('\t'));
    assert!(rows[1].starts_with(&page.rows[0].line_id), "{text}");
    assert!(table.image.is_none());

    let ids = copied(&mut state, &lines(), CopyFormat::LineIds)
        .text
        .unwrap();
    let ids: Vec<&str> = ids.lines().collect();
    let expected: Vec<&str> = page.rows.iter().map(|row| row.line_id.as_str()).collect();
    assert_eq!(ids, expected);
    assert_eq!(ids.iter().collect::<HashSet<_>>().len(), ids.len());

    let chart = copied(
        &mut state,
        &lines(),
        CopyFormat::Chart {
            chart: ChartChoice::Bars { dim: Dim::Role },
        },
    );
    let (width, height, bytes) = chart.image.unwrap();
    assert!(width > 0 && height > 0);
    assert_eq!(bytes, width as usize * height as usize * 4);
    assert!(chart.text.is_none());
}

#[test]
fn a_clipboard_that_refuses_fails_the_copy_with_its_error() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let request = lines();
    let content = state
        .copy_content(&request, &CopyFormat::LineIds, &view)
        .unwrap();
    let mut clipboard = FakeClipboard {
        refuse: true,
        ..FakeClipboard::default()
    };
    let error = copy(content, &mut clipboard, &request.text, fonts()).unwrap_err();
    assert_eq!(error.kind, "Clipboard");
}

#[test]
fn a_workspace_without_a_snapshot_copies_an_empty_table() {
    let fx = Fixture::new();
    let mut state = empty(&fx);
    let table = copied(&mut state, &lines(), CopyFormat::Table)
        .text
        .unwrap();
    assert_eq!(table.lines().count(), 1, "the header only: {table}");
    let ids = copied(&mut state, &lines(), CopyFormat::LineIds)
        .text
        .unwrap();
    assert_eq!(ids, "");
}

#[test]
fn the_formats_read_what_the_interface_sends() {
    let save: Vec<SaveFormat> = serde_json::from_str(
        r#"[{"kind":"Excel"},{"kind":"Workbook"},{"kind":"Csv"},{"kind":"Report"},
            {"kind":"ChartPng","chart":{"kind":"TopBlockers"}},
            {"kind":"ChartSvg","chart":{"kind":"Curve","steps":10}}]"#,
    )
    .unwrap();
    assert_eq!(save.len(), 6);
    let copy: Vec<CopyFormat> = serde_json::from_str(
        r#"[{"kind":"Table"},{"kind":"LineIds"},{"kind":"Chart","chart":{"kind":"Bars","dim":"Role"}}]"#,
    )
    .unwrap();
    assert_eq!(copy.len(), 3);
    assert_eq!(
        serde_json::to_value(ExportSaved {
            path: "a.csv".into(),
            rows: 3
        })
        .unwrap(),
        serde_json::json!({ "path": "a.csv", "rows": 3 })
    );
    assert_eq!(
        serde_json::to_value(super::export::ExportPhase::Writing).unwrap(),
        "Writing"
    );
}

#[test]
fn a_workspace_without_a_snapshot_says_it_has_none_rather_than_a_date() {
    let fx = Fixture::new();
    let mut state = empty(&fx);
    let view = shown(&state);
    let Content::Sheets { about, .. } = state
        .export_content(&lines(), &SaveFormat::Excel, &view)
        .unwrap()
    else {
        panic!("no sheets");
    };
    assert_eq!(about.snapshot, None);
    assert_eq!(about.file_name, "");
    assert_eq!(about.workspace, "Empty");
    let Content::Report { head, .. } = state
        .export_content(&lines(), &SaveFormat::Report, &view)
        .unwrap()
    else {
        panic!("no report");
    };
    assert_eq!(head.snapshot, None);

    let path = fx.dir.path().join("empty.xlsx");
    let request = lines();
    let content = state
        .export_content(&request, &SaveFormat::Excel, &view)
        .unwrap();
    save(
        content,
        &SaveFormat::Excel,
        &path,
        &request.text,
        fonts(),
        &write_file,
    )
    .unwrap();
    let mut book: Xlsx<_> = open_workbook(&path).unwrap();
    let first = book.sheet_names()[0].clone();
    let about = book.worksheet_range(&first).unwrap();
    // The labels are their own keys in these tests.
    let snapshot: Vec<&Data> = about
        .rows()
        .find(|row| row[0] == Data::String("file.about.snapshot".into()))
        .unwrap()
        .iter()
        .collect();
    assert_eq!(*snapshot[1], Data::String("file.about.noSnapshot".into()));
}

#[test]
fn a_name_that_does_not_end_in_the_extension_of_its_format_is_refused() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let out = fx.dir.path().join("out");
    fs::create_dir_all(&out).unwrap();
    for (format, name) in formats() {
        let (stem, extension) = name.rsplit_once('.').unwrap();
        // Another format's extension, none, and a program's are refused, and nothing is written.
        for wrong in [
            format!("{stem}.txt"),
            format!("{stem}.desktop"),
            stem.to_string(),
            format!("{name}.sh"),
            format!("{stem}.{}", if extension == "csv" { "xlsx" } else { "csv" }),
        ] {
            let path = out.join(&wrong);
            let error = save_lines(&mut state, &format, &path).unwrap_err();
            assert_eq!(error.kind, "Extension", "{wrong}");
            assert!(
                error.message.contains(&format!("ends in .{extension}")),
                "{}",
                error.message
            );
            assert!(!path.exists(), "{wrong}");
        }
        // The extension is compared without regard to case.
        let upper = out.join(format!("{stem}.{}", extension.to_uppercase()));
        save_lines(&mut state, &format, &upper).unwrap();
        assert!(upper.is_file());
    }
}

/// A clipboard of the session's tests: it counts how often one is made, and fails while told to.
struct Counted {
    fail: Arc<AtomicBool>,
    texts: Arc<AtomicUsize>,
}

impl Clipboard for Counted {
    fn text(&mut self, _: &str) -> Result<(), CommandError> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(CommandError::new("Clipboard", "refused"));
        }
        self.texts.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    fn image(&mut self, _: u32, _: u32, _: &[u8]) -> Result<(), CommandError> {
        self.text("")
    }
}

#[test]
fn the_session_keeps_one_clipboard_and_makes_it_again_after_a_failure() {
    let session = SessionClipboard::default();
    let made = Arc::new(AtomicUsize::new(0));
    let fail = Arc::new(AtomicBool::new(false));
    let texts = Arc::new(AtomicUsize::new(0));
    let refuse_to_make = Arc::new(AtomicBool::new(false));
    let make = || -> Result<Box<dyn SendClipboard>, CommandError> {
        if refuse_to_make.load(Ordering::SeqCst) {
            return Err(CommandError::new("Clipboard", "no clipboard"));
        }
        made.fetch_add(1, Ordering::SeqCst);
        Ok(Box::new(Counted {
            fail: fail.clone(),
            texts: texts.clone(),
        }))
    };
    let copy_once = || session.copy_with(Content::Text("L-1".into()), &text(), fonts(), &make);

    copy_once().unwrap();
    copy_once().unwrap();
    assert_eq!(
        made.load(Ordering::SeqCst),
        1,
        "one clipboard for both copies"
    );
    assert_eq!(texts.load(Ordering::SeqCst), 2);

    fail.store(true, Ordering::SeqCst);
    assert_eq!(copy_once().unwrap_err().kind, "Clipboard");
    fail.store(false, Ordering::SeqCst);
    copy_once().unwrap();
    assert_eq!(
        made.load(Ordering::SeqCst),
        2,
        "made again after the failure"
    );

    // A clipboard the system will not give fails the copy, and the next copy asks again.
    fail.store(true, Ordering::SeqCst);
    copy_once().unwrap_err();
    fail.store(false, Ordering::SeqCst);
    refuse_to_make.store(true, Ordering::SeqCst);
    assert_eq!(copy_once().unwrap_err().kind, "Clipboard");
    refuse_to_make.store(false, Ordering::SeqCst);
    copy_once().unwrap();
    assert_eq!(made.load(Ordering::SeqCst), 3);
    assert_eq!(texts.load(Ordering::SeqCst), 4);
}

/// A clipboard that says when it is dropped.
struct Dropped(Arc<AtomicBool>);

impl Clipboard for Dropped {
    fn text(&mut self, _: &str) -> Result<(), CommandError> {
        Ok(())
    }

    fn image(&mut self, _: u32, _: u32, _: &[u8]) -> Result<(), CommandError> {
        Ok(())
    }
}

impl Drop for Dropped {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

#[test]
fn release_drops_the_clipboard_held_and_the_next_copy_makes_one_again() {
    let session = SessionClipboard::default();
    // Releasing an empty session does nothing.
    session.release();
    assert!(!session.holds());

    let dropped = Arc::new(AtomicBool::new(false));
    let made = Arc::new(AtomicUsize::new(0));
    let make = || -> Result<Box<dyn SendClipboard>, CommandError> {
        made.fetch_add(1, Ordering::SeqCst);
        Ok(Box::new(Dropped(dropped.clone())))
    };
    let copy_once = || session.copy_with(Content::Text("L-1".into()), &text(), fonts(), &make);
    copy_once().unwrap();
    assert!(session.holds());
    assert!(!dropped.load(Ordering::SeqCst));

    session.release();
    assert!(!session.holds());
    assert!(dropped.load(Ordering::SeqCst), "the clipboard was dropped");

    copy_once().unwrap();
    assert!(session.holds());
    assert_eq!(made.load(Ordering::SeqCst), 2);
}
