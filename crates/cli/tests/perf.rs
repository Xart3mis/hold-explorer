//! Performance budget from the spec. Ignored by default because a debug build
//! is far slower than what ships. Run with:
//!     cargo test --release -p hx-cli --test perf -- --ignored

use std::time::{Duration, Instant};

use hx_core::dataset::Dataset;
use hx_core::filter::Status;
use hx_core::filter::{default_age_bands, Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::query::{
    facet_counts, group_by, holds, line_page, lines, matrix_top, summary, value_page, HoldQuery,
    HoldSort, LineQuery,
};
use hx_core::rules::RuleSet;
use hx_core::search::search;
use hx_core::solve::{solve_plan, solve_view};
use hx_export::fonts::Fonts;
use hx_export::{
    scope_line_ids, screen_sheets, status_report, workbook, workbook_sheets, About, ExportRequest,
    ExportText, ReportHead, RowScope, Screen, FILE_TEXT_KEYS,
};
use hx_store::{ImportOptions, Workspace};
use hx_synth::{generate, write_workbook, SynthConfig};

#[test]
#[ignore = "run in a release build"]
fn ten_thousand_rows_load_in_under_two_seconds_and_filter_in_under_100_ms() {
    let cfg = SynthConfig::new(4, 3600, 10_000);
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("holds.xlsx");
    write_workbook(&generate(&cfg), &cfg, &path).unwrap();

    let started = Instant::now();
    let loaded = load_file(&path).unwrap();
    let ds = Dataset::build(
        loaded.parsed.holds,
        RuleSet::builtin(),
        loaded.snapshot.unwrap().at,
    );
    let import = started.elapsed();
    assert!(import < Duration::from_secs(2), "import took {import:?}");

    let spec = FilterSpec {
        text: "pr".to_string(),
        ..Default::default()
    };
    let started = Instant::now();
    let s = summary(&ds, &spec);
    let groups = group_by(&ds, &spec, &Dim::Discipline);
    let rows = lines(&ds, &spec, &LineQuery::default());
    let views = started.elapsed();
    assert!(s.holds > 0 && !groups.is_empty() && !rows.is_empty());
    assert!(
        views < Duration::from_millis(100),
        "filtered views took {views:?}"
    );

    let all = FilterSpec {
        status: Status::All,
        ..Default::default()
    };
    let started = Instant::now();
    let page = holds(
        &ds,
        &all,
        &HoldQuery {
            offset: 1000,
            limit: Some(200),
            ..Default::default()
        },
    );
    let json = serde_json::to_string(&page).unwrap();
    let paging = started.elapsed();
    assert_eq!(page.rows.len(), 200);
    assert!(!json.is_empty());
    assert!(
        paging < Duration::from_millis(100),
        "a page of 200 holds took {paging:?}"
    );

    let started = Instant::now();
    let counts = facet_counts(&ds, &spec, &default_age_bands());
    let values = value_page(&ds, &spec, &Dim::Blocker, "", 50);
    let first_lines = line_page(&ds, &spec, &LineQuery::default(), 0, Some(200));
    let pickers = started.elapsed();
    assert!(counts.open > 0 && values.total > 0 && !first_lines.rows.is_empty());
    assert!(
        pickers < Duration::from_millis(100),
        "filter counts, blocker values, and a page of lines took {pickers:?}"
    );

    let started = Instant::now();
    let plan = solve_plan(&ds, &FilterSpec::default(), None);
    let solve = started.elapsed();
    assert!(!plan.steps.is_empty());
    assert!(
        solve < Duration::from_secs(2),
        "full solve order took {solve:?}"
    );

    let started = Instant::now();
    let folded = matrix_top(
        &ds,
        &FilterSpec::default(),
        &Dim::Discipline,
        &Dim::HoldType,
        30,
        30,
    );
    let view = solve_view(&solve_plan(&ds, &FilterSpec::default(), None));
    let breakdown = started.elapsed();
    assert!(folded.max_cell > 0 && !view.rows.is_empty());
    assert!(
        breakdown < Duration::from_millis(100),
        "a folded matrix and the solve rows took {breakdown:?}"
    );

    eprintln!(
        "perf: import {import:?}, filtered views {views:?}, filter counts and pages {pickers:?}, hold page {paging:?}, full solve order {solve:?}, folded matrix and solve rows {breakdown:?}"
    );
}

#[test]
#[ignore = "run in a release build"]
fn ten_thousand_rows_import_into_a_workspace_in_under_a_second_and_read_back_in_300_ms() {
    let cfg = SynthConfig::new(4, 3600, 10_000);
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("holds.xlsx");
    write_workbook(&generate(&cfg), &cfg, &path).unwrap();
    let loaded = load_file(&path).unwrap();
    let taken = loaded.snapshot.unwrap();

    // The import is timed three times, each into a new workspace file, and the best run is
    // held to the limit. On the Windows runners the first write of a new file sometimes
    // waits two seconds or more for something outside the app (the same code takes under
    // 200 ms in the other runs), so one run would measure the runner rather than the import.
    // Every run is printed, so a slow import shows in the log even when the best run passes.
    let mut runs = Vec::new();
    let mut last = None;
    for attempt in 0..3 {
        let folder = dir.path().join(format!("run-{attempt}"));
        std::fs::create_dir(&folder).unwrap();
        let mut workspace = Workspace::create(&folder, "perf").unwrap();
        let started = Instant::now();
        let info = workspace
            .import(&loaded, taken, &ImportOptions::default())
            .unwrap();
        runs.push(started.elapsed());
        assert_eq!(info.row_count, 10_000);
        last = Some((workspace, info));
    }
    let stored = runs.iter().copied().min().unwrap();
    assert!(
        stored < Duration::from_secs(1),
        "import into a workspace took {runs:?}, the best of them {stored:?}"
    );
    let (workspace, info) = last.unwrap();

    let started = Instant::now();
    let ds = workspace.dataset(info.id, RuleSet::builtin()).unwrap();
    let read = started.elapsed();
    assert_eq!(ds.rows.len(), 10_000);
    assert!(
        read < Duration::from_millis(300),
        "reading the dataset took {read:?}"
    );

    eprintln!("perf: workspace import {stored:?} (runs {runs:?}), dataset read {read:?}");
}

#[test]
#[ignore = "run in a release build"]
fn the_lines_of_every_remark_group_of_ten_thousand_rows_take_under_100_ms() {
    let cfg = SynthConfig::new(4, 3600, 10_000);
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("holds.xlsx");
    write_workbook(&generate(&cfg), &cfg, &path).unwrap();
    let loaded = load_file(&path).unwrap();
    let ds = Dataset::build(
        loaded.parsed.holds,
        RuleSet::builtin(),
        loaded.snapshot.unwrap().at,
    );
    let request = ExportRequest {
        screen: Screen::Breakdown { dim: Dim::Remark },
        columns: Vec::new(),
        rows: RowScope::All,
        spec: FilterSpec {
            status: Status::All,
            ..Default::default()
        },
        text: ExportText::default(),
        filters: Vec::new(),
    };
    let groups = group_by(&ds, &request.spec, &Dim::Remark).len();

    let started = Instant::now();
    let ids = scope_line_ids(&ds, None, &request);
    let took = started.elapsed();
    assert!(!ids.is_empty());
    assert!(
        took < Duration::from_millis(100),
        "the lines of {groups} remark groups took {took:?}"
    );
    eprintln!("perf: the lines of {groups} remark groups {took:?}");
}

/// Every label a file asks for, each written as its own key.
fn file_text() -> ExportText {
    ExportText {
        labels: FILE_TEXT_KEYS
            .iter()
            .map(|key| (key.to_string(), key.to_string()))
            .collect(),
        months: Vec::new(),
    }
}

#[test]
#[ignore = "run in a release build"]
fn the_export_files_of_ten_thousand_holds_meet_their_budgets() {
    // Excel of one view under 2 s, the full workbook under 4 s, the PDF status report under 2 s.
    let cfg = SynthConfig::new(4, 3600, 10_000);
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("holds.xlsx");
    write_workbook(&generate(&cfg), &cfg, &path).unwrap();
    let loaded = load_file(&path).unwrap();
    let ds = Dataset::build(
        loaded.parsed.holds,
        RuleSet::builtin(),
        loaded.snapshot.unwrap().at,
    );
    let spec = FilterSpec {
        status: Status::All,
        ..Default::default()
    };
    let text = file_text();
    let about = About {
        workspace: "Perf".into(),
        snapshot: Some(ds.snapshot.date()),
        file_name: "holds.xlsx".into(),
        filters: vec!["Status: All".into()],
        app_version: "0.1.0".into(),
        made_at: ds.snapshot.and_utc().fixed_offset(),
        rows: ds.rows.len(),
    };
    let request = ExportRequest {
        screen: Screen::Holds {
            sort: HoldSort::FileOrder,
            reverse: false,
        },
        columns: Vec::new(),
        rows: RowScope::All,
        spec: spec.clone(),
        text: text.clone(),
        filters: about.filters.clone(),
    };

    let started = Instant::now();
    let sheets = screen_sheets(&ds, None, &ds.absent_fields(), &request).unwrap();
    let bytes = workbook(&sheets, &about, &text).unwrap();
    let view = started.elapsed();
    let view_kb = bytes.len() / 1024;
    assert_eq!(sheets[0].rows.len(), 10_000);
    assert!(!bytes.is_empty());
    assert!(
        view < Duration::from_secs(2),
        "the Excel file of 10,000 holds took {view:?}"
    );

    let started = Instant::now();
    let plan = spec.open_only().map(|open| solve_plan(&ds, &open, None));
    let sheets = workbook_sheets(
        &ds,
        plan.as_ref(),
        &ds.absent_fields(),
        &[],
        &spec,
        &about.filters,
        &text,
    )
    .unwrap();
    let bytes = workbook(&sheets, &about, &text).unwrap();
    let full = started.elapsed();
    assert!(!bytes.is_empty());
    assert!(
        full < Duration::from_secs(4),
        "the full workbook of 10,000 holds took {full:?}"
    );
    eprintln!(
        "perf: Excel of 10,000 holds {view:?} ({view_kb} KB), full workbook {full:?} ({} KB, {} sheets)",
        bytes.len() / 1024,
        sheets.len()
    );

    let report_spec = FilterSpec::default();
    let head = ReportHead {
        workspace: "Perf".into(),
        snapshot: Some(ds.snapshot.date()),
        filters: Vec::new(),
        app_version: "0.1.0".into(),
        made_at: ds.snapshot.and_utc().fixed_offset(),
    };
    let fonts = Fonts::embedded();

    // The solve plan the report needs is timed with it.
    let started = Instant::now();
    let plan = report_spec
        .open_only()
        .map(|open| solve_plan(&ds, &open, None));
    let pdf = status_report(&ds, plan.as_ref(), &report_spec, &head, &text, &fonts).unwrap();
    let report = started.elapsed();
    assert!(pdf.starts_with(b"%PDF-"));
    assert!(
        report < Duration::from_secs(2),
        "the status report of 10,000 holds took {report:?}"
    );
    eprintln!(
        "perf: status report of 10,000 holds {report:?} ({} KB)",
        pdf.len() / 1024
    );
}

/// The dataset of a synthetic workbook of `holds` holds on `lines` lines.
fn synthetic(lines: usize, holds: usize) -> Dataset {
    let cfg = SynthConfig::new(4, lines, holds);
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("holds.xlsx");
    write_workbook(&generate(&cfg), &cfg, &path).unwrap();
    let loaded = load_file(&path).unwrap();
    Dataset::build(
        loaded.parsed.holds,
        RuleSet::builtin(),
        loaded.snapshot.unwrap().at,
    )
}

/// The best of three runs of a search, and how many groups it found.
fn best_of_three(ds: &Dataset, query: &str) -> (Duration, usize) {
    let mut runs = Vec::new();
    let mut groups = 0;
    for _ in 0..3 {
        let started = Instant::now();
        let found = search(ds, query, 8);
        runs.push(started.elapsed());
        groups = found.groups.len();
    }
    (runs.into_iter().min().unwrap(), groups)
}

#[test]
#[ignore = "run in a release build"]
fn a_search_of_thirty_thousand_holds_takes_under_100_ms() {
    // A short substring found in several groups, a longer one, a typo that only the edit
    // distance finds (so every value of the snapshot is compared word by word), and a line-ID
    // pattern; and the worst case, a typo whose first long word is close to a word of many
    // values and whose second is close to none, so each of those values is compared word by word
    // twice over. At 30,000 holds each is held to 100 ms, the best of three runs; at 10,000 it is
    // recorded.
    let queries = [
        "pr",
        "pending",
        "pendnig civl",
        "*-5*-00*",
        "pendnig qwxyzk",
    ];
    for (lines, holds) in [(3600, 10_000), (10_800, 30_000)] {
        let ds = synthetic(lines, holds);
        assert_eq!(ds.rows.len(), holds);
        let mut times = Vec::new();
        for query in queries {
            let (best, groups) = best_of_three(&ds, query);
            assert!(
                groups > 0 || query == "pendnig qwxyzk",
                "\"{query}\" found nothing in {holds} holds"
            );
            if holds == 30_000 {
                assert!(
                    best < Duration::from_millis(100),
                    "searching {holds} holds for \"{query}\" took {best:?}"
                );
            }
            times.push(format!("\"{query}\" {best:?} ({groups} groups)"));
        }
        eprintln!("perf: search of {holds} holds: {}", times.join(", "));
    }
}
