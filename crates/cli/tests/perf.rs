//! Performance budget from the spec. Ignored by default because a debug build
//! is far slower than what ships. Run with:
//!     cargo test --release -p hx-cli --test perf -- --ignored

use std::time::{Duration, Instant};

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::query::{group_by, lines, summary, LineSort};
use hx_core::rules::RuleSet;
use hx_core::solve::solve_plan;
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
        &RuleSet::builtin(),
        loaded.snapshot.unwrap(),
    );
    let import = started.elapsed();
    assert!(import < Duration::from_secs(2), "import took {import:?}");

    let spec = FilterSpec {
        text: "pr".to_string(),
        ..Default::default()
    };
    let started = Instant::now();
    let s = summary(&ds, &spec);
    let groups = group_by(&ds, &spec, Dim::Discipline);
    let rows = lines(&ds, &spec, LineSort::HoldsDesc);
    let views = started.elapsed();
    assert!(s.holds > 0 && !groups.is_empty() && !rows.is_empty());
    assert!(
        views < Duration::from_millis(100),
        "filtered views took {views:?}"
    );

    let started = Instant::now();
    let plan = solve_plan(&ds, &FilterSpec::default(), None);
    let solve = started.elapsed();
    assert!(!plan.steps.is_empty());
    assert!(
        solve < Duration::from_secs(2),
        "full solve order took {solve:?}"
    );

    eprintln!("perf: import {import:?}, filtered views {views:?}, full solve order {solve:?}");
}
