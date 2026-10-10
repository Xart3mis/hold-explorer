//! Proves the Rust engine gives the numbers of the original HTML tool.
//! Needs `node` on the PATH.

use std::process::Command;

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::model::Hold;
use hx_core::query::{group_by, lines, summary, LineQuery, LineSort};
use hx_core::rules::RuleSet;
use hx_core::snapshot_date::parse_report_date;
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

fn counts(ds: &Dataset, dim: &Dim) -> Value {
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
        RuleSet::builtin(),
        loaded.snapshot.unwrap().at,
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
        counts(&ds, &Dim::Discipline),
        "seed {seed}: by discipline"
    );
    assert_eq!(
        legacy["by"]["t"],
        counts(&ds, &Dim::HoldType),
        "seed {seed}: by hold type"
    );
    assert_eq!(
        legacy["by"]["r"],
        counts(&ds, &Dim::Role),
        "seed {seed}: by role"
    );
    assert_eq!(
        legacy["by"]["z"],
        counts(&ds, &Dim::BlockerType),
        "seed {seed}: by blocker type"
    );

    let easiest: Vec<String> = lines(
        &ds,
        &open,
        &LineQuery {
            sort: LineSort::Easiest,
            ..Default::default()
        },
    )
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

const CORPUS_FIXED: &[&str] = &[
    "P&ID",
    "P & IDs",
    "P\u{85}&ID",
    "PID",
    "sleeper",
    "misc items",
    "FIV study",
    "AIV study",
    "LDT update",
    "line size",
    "hold size",
    "data sheet",
    "datasheet",
    "isometric",
    "plot plan",
    "tag no",
    "piping material class",
    "PMC update",
    "platform",
    "support",
    "GA drawing",
    "GA's",
    "vendor",
    "structure",
    "steel",
    "577-PR-400",
    "PR-400",
    "538-PV-3064A",
    "538-PR- 100",
    "538-STRU-006",
    "AB-123456",
    "538-PR-100-200",
    "538-PVAB-12",
    "UNIT-577 hold for 538-V-104",
    "UNIT-577-PR-400",
    "UNIT-577",
    "T123-R456",
    "Tie-in T123-R456 vendor data",
    "pending 538-PR-100 vendor data",
    "Hold pending IA layout for Unit 577",
    "on client decision",
    "only later",
    "Pending",
    "",
    "   \n\t ",
    "P&ID update_x000D_\nrev 2",
    "a_X000d_b",
    "a_x000D_b",
    "é538-PR-100 pending",
    "wait T123-R456é",
    "LDTé",
    "ÉLDT list",
    "caf\u{e9} support",
    "pending\u{a0}538-PR-100",
    "hold\u{a0}pending",
    "\u{627}\u{644}\u{639}\u{631}\u{628}\u{64a}\u{629}",
    "\u{627}\u{644}\u{639}\u{631}\u{628}\u{64a}\u{629} 538-PR-100",
    "Hold Hold pending x",
    "ON HOLD",
    "on538-PR-100",
    "PIDS and GA",
    "GAS line",
    "T123-R4567",
    "T1234-R456",
    "538-PR-100A",
    "538-PR-100AB",
    "5-PR-100",
    "5381-PR-100",
    "PR -100",
    "pr-1",
    "STRUCTURE 538-STR-006",
    "x\u{1f600}y 538-PR-100",
    "\u{1f600}LDT",
    "ß support",
    "İ vendor",
    "hold  size\r\ndata",
    "P\u{feff}&ID",
    "\u{feff}hold pending x",
    "a\u{85}b",
    "\u{627}\u{646}\u{62a}\u{638}\u{627}\u{631}538-PR-100",
];

#[test]
fn classifies_a_remark_corpus_like_the_html_tool() {
    let mut remarks: Vec<String> = CORPUS_FIXED.iter().map(|r| r.to_string()).collect();
    remarks.push("x".repeat(80));
    remarks.push(format!("{}{}", "\u{1f600}".repeat(30), "x".repeat(40)));
    remarks.push(format!("{}{}", "\u{1f600}".repeat(40), "x".repeat(40)));

    let input: Vec<Value> = remarks
        .iter()
        .enumerate()
        .map(|(i, remark)| {
            json!({
                "l": format!("L{i}"),
                "n": "Engineer 01",
                "r": "Designer",
                "m": remark,
                "t": "MISC.",
                "d": "Civil",
            })
        })
        .collect();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("corpus.json");
    std::fs::write(&path, serde_json::to_vec(&input).unwrap()).unwrap();

    let output = Command::new("node")
        .arg(REFERENCE)
        .arg(&path)
        .output()
        .expect("the parity test needs Node.js on the PATH");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let legacy: Value = serde_json::from_slice(&output.stdout).unwrap();

    let rules = RuleSet::builtin();
    for (i, remark) in remarks.iter().enumerate() {
        let blocker = rules.classify(remark);
        assert_eq!(
            legacy["rules"][i],
            json!([blocker.kind, blocker.item]),
            "remark {remark:?}"
        );
    }
}

/// Blocker 100 is on four lines needing 2, 2, 3 and 7 blockers in total; blocker 101 is on four
/// lines needing 7, 3, 2 and 2. Each also has a line of its own. Their partial sums differ by one
/// rounding step, so the original and a plain comparison of the sums choose different first steps.
fn rounding_tie_remarks() -> Vec<(String, String)> {
    let mut rows = Vec::new();
    let mut next = 102;
    let mut add_line = |line: String, blocker: u32, total: u32| {
        rows.push((line.clone(), format!("Pending 538-PR-{blocker}")));
        for _ in 1..total {
            rows.push((line.clone(), format!("Pending 538-PR-{next}")));
            next += 1;
        }
    };
    for (i, total) in [2, 2, 3, 7].into_iter().enumerate() {
        add_line(format!("A{i}"), 100, total);
    }
    add_line("A-SOLO".into(), 100, 1);
    for (i, total) in [7, 3, 2, 2].into_iter().enumerate() {
        add_line(format!("B{i}"), 101, total);
    }
    add_line("B-SOLO".into(), 101, 1);
    rows
}

#[test]
fn solve_tie_break_matches_the_html_tool_when_partial_sums_differ_by_rounding() {
    let rows = rounding_tie_remarks();
    let input: Vec<Value> = rows
        .iter()
        .map(|(line, remark)| {
            json!({
                "l": line,
                "n": "Engineer 01",
                "r": "Designer",
                "m": remark,
                "t": "MISC.",
                "d": "Civil",
            })
        })
        .collect();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("tie.json");
    std::fs::write(&path, serde_json::to_vec(&input).unwrap()).unwrap();

    let output = Command::new("node")
        .arg(REFERENCE)
        .arg(&path)
        .output()
        .expect("the parity test needs Node.js on the PATH");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let legacy: Value = serde_json::from_slice(&output.stdout).unwrap();

    let holds: Vec<Hold> = rows
        .iter()
        .map(|(line, remark)| Hold {
            line_id: line.clone(),
            name: "Engineer 01".to_string(),
            role: "Designer".to_string(),
            remark: remark.clone(),
            hold_type: "MISC.".to_string(),
            discipline: "Civil".to_string(),
            ..Default::default()
        })
        .collect();
    let snapshot = parse_report_date("2026-10-01 00:00:00").unwrap();
    let ds = Dataset::build(holds, RuleSet::builtin(), snapshot);

    let plan: Vec<Value> = solve_plan(&ds, &FilterSpec::default(), Some(20))
        .steps
        .iter()
        .map(|step| json!({ "k": step.key, "gain": step.gain, "cum": step.cumulative }))
        .collect();
    assert_eq!(legacy["plan"], json!(plan));
    assert_eq!(legacy["plan"][0]["k"], json!("Civil|538-PR-100"));
}
