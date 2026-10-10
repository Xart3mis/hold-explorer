//! Proves the Rust engine gives the numbers of the original HTML tool.
//! Needs `node` on the PATH.

use std::process::Command;

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::query::{group_by, lines, summary, LineSort};
use hx_core::rules::RuleSet;
use hx_core::solve::solve_plan;
use hx_synth::{generate, write_workbook, SynthConfig, SynthRow};
use serde_json::{json, Map, Value};

const REFERENCE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../tools/parity/reference.mjs"
);

/// The rows as the HTML tool's `fromObjs` would hand them to its views.
fn legacy_input(rows: &[SynthRow]) -> Value {
    Value::Array(
        rows.iter()
            .filter(|r| !r.released)
            .map(|r| {
                json!({
                    "l": r.line_id.trim(),
                    "n": r.name,
                    "r": r.role,
                    "m": r.remark,
                    "t": r.hold_type,
                    "d": r.discipline.clone().unwrap_or_else(|| "Unspecified".to_string()),
                })
            })
            .collect(),
    )
}

fn counts(ds: &Dataset, dim: Dim) -> Value {
    let mut map = Map::new();
    for group in group_by(ds, &FilterSpec::default(), dim) {
        map.insert(group.key, json!([group.holds, group.lines]));
    }
    Value::Object(map)
}

fn check(seed: u64, line_count: usize, hold_count: usize) {
    let cfg = SynthConfig::new(seed, line_count, hold_count);
    let rows = generate(&cfg);
    let dir = tempfile::tempdir().unwrap();

    let workbook = dir.path().join("holds.xlsx");
    write_workbook(&rows, &cfg, &workbook).unwrap();
    let input = dir.path().join("legacy.json");
    std::fs::write(&input, serde_json::to_vec(&legacy_input(&rows)).unwrap()).unwrap();

    let output = Command::new("node")
        .arg(REFERENCE)
        .arg(&input)
        .output()
        .expect("the parity test needs Node.js on the PATH");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let legacy: Value = serde_json::from_slice(&output.stdout).unwrap();

    let loaded = load_file(&workbook).unwrap();
    let ds = Dataset::build(
        loaded.parsed.holds,
        &RuleSet::builtin(),
        loaded.snapshot.unwrap(),
    );
    let open = FilterSpec::default();

    let s = summary(&ds, &open);
    assert_eq!(legacy["holds"], json!(s.holds), "seed {seed}: holds");
    assert_eq!(legacy["lines"], json!(s.lines), "seed {seed}: lines");
    assert_eq!(
        legacy["single"],
        json!(s.single_hold_lines),
        "seed {seed}: single-hold lines"
    );

    assert_eq!(
        legacy["by"]["d"],
        counts(&ds, Dim::Discipline),
        "seed {seed}: by discipline"
    );
    assert_eq!(
        legacy["by"]["t"],
        counts(&ds, Dim::HoldType),
        "seed {seed}: by hold type"
    );
    assert_eq!(
        legacy["by"]["r"],
        counts(&ds, Dim::Role),
        "seed {seed}: by role"
    );
    assert_eq!(
        legacy["by"]["z"],
        counts(&ds, Dim::BlockerType),
        "seed {seed}: by blocker type"
    );

    let easiest: Vec<String> = lines(&ds, &open, LineSort::Easiest)
        .into_iter()
        .map(|l| l.line_id)
        .collect();
    assert_eq!(
        legacy["easy"],
        json!(easiest),
        "seed {seed}: easiest-to-release order"
    );

    let plan: Vec<Value> = solve_plan(&ds, &open, Some(20))
        .steps
        .iter()
        .map(|step| json!({ "k": step.key, "gain": step.gain, "cum": step.cumulative }))
        .collect();
    assert_eq!(legacy["plan"], json!(plan), "seed {seed}: solve order");
}

#[test]
fn matches_the_html_tool_on_a_small_file() {
    check(1, 60, 300);
}

#[test]
fn matches_the_html_tool_on_a_dense_file() {
    // Few lines and many holds: many lines share blockers, so the solve order has real ties.
    check(2, 120, 2500);
}

#[test]
fn matches_the_html_tool_at_real_scale() {
    check(3, 3600, 9300);
}
