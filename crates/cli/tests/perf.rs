//! Performance budget from the spec. Ignored by default because a debug build
//! is far slower than what ships. Run with:
//!     cargo test --release -p hx-cli --test perf -- --ignored

use std::time::{Duration, Instant};

use hx_core::dataset::Dataset;
use hx_core::filter::Status;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::query::{group_by, holds, lines, summary, HoldQuery, LineQuery};
use hx_core::rules::RuleSet;
use hx_core::solve::solve_plan;
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
    let plan = solve_plan(&ds, &FilterSpec::default(), None);
    let solve = started.elapsed();
    assert!(!plan.steps.is_empty());
    assert!(
        solve < Duration::from_secs(2),
        "full solve order took {solve:?}"
    );

    eprintln!(
        "perf: import {import:?}, filtered views {views:?}, hold page {paging:?}, full solve order {solve:?}"
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

    let mut workspace = Workspace::create(dir.path(), "perf").unwrap();
    let started = Instant::now();
    let info = workspace
        .import(&loaded, taken, &ImportOptions::default())
        .unwrap();
    let stored = started.elapsed();
    assert_eq!(info.row_count, 10_000);
    assert!(
        stored < Duration::from_secs(1),
        "import into a workspace took {stored:?}"
    );

    let started = Instant::now();
    let ds = workspace.dataset(info.id, RuleSet::builtin()).unwrap();
    let read = started.elapsed();
    assert_eq!(ds.rows.len(), 10_000);
    assert!(
        read < Duration::from_millis(300),
        "reading the dataset took {read:?}"
    );

    eprintln!("perf: workspace import {stored:?}, dataset read {read:?}");
}
