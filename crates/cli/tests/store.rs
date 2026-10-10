//! The workspace commands, driven through the binary.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use hx_synth::{evolve, generate, write_workbook, SynthConfig};
use serde_json::Value;

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_hx-cli"))
}

fn stderr(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).into_owned()
}

fn json(out: &Output) -> Value {
    assert!(out.status.success(), "{}", stderr(out));
    serde_json::from_slice(&out.stdout).unwrap()
}

fn create(dir: &Path, name: &str) -> (PathBuf, Value) {
    let info = json(
        &cli()
            .args(["ws", "create"])
            .arg(dir)
            .arg(name)
            .output()
            .unwrap(),
    );
    (PathBuf::from(info["path"].as_str().unwrap()), info)
}

fn import(ws: &Path, file: &Path, extra: &[&str]) -> Output {
    cli()
        .args(["ws", "import"])
        .arg(ws)
        .arg(file)
        .args(extra)
        .output()
        .unwrap()
}

fn synth_file(dir: &Path) -> PathBuf {
    let file = dir.join("holds.xlsx");
    let made = cli()
        .args([
            "synth", "--seed", "3", "--lines", "60", "--holds", "400", "--out",
        ])
        .arg(&file)
        .output()
        .unwrap();
    assert!(made.status.success(), "{}", stderr(&made));
    file
}

/// The file written by `synth_file`, seven days later.
fn evolved_file(dir: &Path) -> PathBuf {
    let cfg = SynthConfig::new(3, 60, 400);
    let (rows, next, _) = evolve(&generate(&cfg), &cfg, 5, 7);
    let file = dir.join("holds_later.xlsx");
    write_workbook(&rows, &next, &file).unwrap();
    file
}

/// A delimited text file with the required columns and no date anywhere.
fn undated_csv(dir: &Path) -> PathBuf {
    let file = dir.join("export.csv");
    std::fs::write(
        &file,
        "line_id,hold_remark,hold_type,date\nL-1,x,MISC.,2026-10-01 09:00:00\n",
    )
    .unwrap();
    file
}

#[test]
fn create_import_list_snapshots_and_summary() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, created) = create(dir.path(), "Unit 4");
    assert_eq!(created["name"], "Unit 4");
    assert_eq!(created["snapshot_count"], 0);

    let file = synth_file(dir.path());
    let snapshot = json(&import(&ws, &file, &[]));
    assert_eq!(snapshot["id"], 1);
    assert_eq!(snapshot["file_name"], "holds.xlsx");
    assert_eq!(snapshot["date_source"], "InfoSheet");
    assert_eq!(snapshot["warnings"], 0);
    assert_eq!(snapshot["skipped"], 0);

    let listed = json(&cli().args(["ws", "list"]).arg(dir.path()).output().unwrap());
    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(listed[0]["id"], created["id"]);
    assert_eq!(listed[0]["snapshot_count"], 1);

    let snapshots = json(&cli().args(["ws", "snapshots"]).arg(&ws).output().unwrap());
    assert_eq!(snapshots.as_array().unwrap().len(), 1);
    assert_eq!(snapshots[0]["content_hash"], snapshot["content_hash"]);

    let summary = json(&cli().args(["ws", "summary"]).arg(&ws).output().unwrap());
    assert_eq!(summary["snapshot"], "2026-09-29 13:16:00");
}

#[test]
fn ws_summary_equals_summary_key_for_key() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = create(dir.path(), "A");
    let file = synth_file(dir.path());
    json(&import(&ws, &file, &[]));

    let direct = json(&cli().arg("summary").arg(&file).output().unwrap());
    let stored = json(&cli().args(["ws", "summary"]).arg(&ws).output().unwrap());
    for key in [
        "snapshot",
        "project",
        "summary",
        "by_discipline",
        "by_hold_type",
        "top_lines",
        "solve",
        "limited",
        "skipped",
        "warnings",
    ] {
        assert_eq!(stored[key], direct[key], "key {key}");
    }
    assert_eq!(stored["snapshot_source"], direct["snapshot_source"]);
    assert!(stored.get("sheet").is_none());
}

#[test]
fn importing_the_same_file_again_fails() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = create(dir.path(), "A");
    let file = synth_file(dir.path());
    json(&import(&ws, &file, &[]));
    let again = import(&ws, &file, &[]);
    assert!(!again.status.success());
    assert!(stderr(&again).contains("already"), "{}", stderr(&again));
}

#[test]
fn an_evolved_file_adds_a_second_snapshot() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = create(dir.path(), "A");
    let first = json(&import(&ws, &synth_file(dir.path()), &[]));
    let second = json(&import(&ws, &evolved_file(dir.path()), &[]));
    assert_ne!(first["id"], second["id"]);

    let snapshots = json(&cli().args(["ws", "snapshots"]).arg(&ws).output().unwrap());
    assert_eq!(snapshots.as_array().unwrap().len(), 2);
    assert_eq!(snapshots[0]["id"], first["id"]);

    let newest = json(&cli().args(["ws", "summary"]).arg(&ws).output().unwrap());
    assert_eq!(newest["snapshot"], "2026-10-06 13:16:00");
    let id = first["id"].to_string();
    let oldest = json(
        &cli()
            .args(["ws", "summary"])
            .arg(&ws)
            .args(["--snapshot", &id])
            .output()
            .unwrap(),
    );
    assert_eq!(oldest["snapshot"], "2026-09-29 13:16:00");
}

#[test]
fn a_date_the_user_passes_is_stored() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = create(dir.path(), "A");
    let file = undated_csv(dir.path());
    let snapshot = json(&import(&ws, &file, &["--date", "2026-01-02"]));
    assert_eq!(snapshot["taken_at"], "2026-01-02T00:00:00");
    assert_eq!(snapshot["date_source"], "User");
}

#[test]
fn a_time_of_day_is_accepted_and_a_bad_date_names_both_forms() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = create(dir.path(), "A");
    let file = undated_csv(dir.path());
    let bad = import(&ws, &file, &["--date", "02/01/2026"]);
    assert!(!bad.status.success());
    let message = stderr(&bad);
    assert!(
        message.contains("YYYY-MM-DD") && message.contains("YYYY-MM-DDTHH:MM:SS"),
        "{message}"
    );
    let snapshot = json(&import(&ws, &file, &["--date", "2026-01-02T03:04:05"]));
    assert_eq!(snapshot["taken_at"], "2026-01-02T03:04:05");
}

#[test]
fn a_file_without_a_known_date_needs_the_date_option() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = create(dir.path(), "A");
    let out = import(&ws, &undated_csv(dir.path()), &[]);
    assert!(!out.status.success());
    assert!(stderr(&out).contains("--date"), "{}", stderr(&out));
}

#[test]
fn the_project_number_shows_in_the_list_after_import() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = create(dir.path(), "A");
    json(&import(&ws, &synth_file(dir.path()), &[]));
    let listed = json(&cli().args(["ws", "list"]).arg(dir.path()).output().unwrap());
    assert_eq!(
        listed[0]["project_numbers"],
        serde_json::json!(["0000-TEST"])
    );
}

#[test]
fn a_second_workspace_has_no_saved_mapping() {
    let dir = tempfile::tempdir().unwrap();
    let (first, _) = create(dir.path(), "First");
    json(&import(&first, &synth_file(dir.path()), &[]));
    let (second, _) = create(dir.path(), "Second");
    let odd = dir.path().join("odd.csv");
    std::fs::write(&odd, "Kind,Line,Why\nMISC.,L-1,x\n").unwrap();

    let out = import(&second, &odd, &["--date", "2026-01-02"]);
    assert!(!out.status.success());
    assert!(
        stderr(&out).contains("Missing required columns"),
        "{}",
        stderr(&out)
    );
}

#[test]
fn a_summary_of_an_empty_workspace_says_to_import_first() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = create(dir.path(), "A");
    let out = cli().args(["ws", "summary"]).arg(&ws).output().unwrap();
    assert!(!out.status.success());
    assert!(
        stderr(&out).contains("Import a file first"),
        "{}",
        stderr(&out)
    );
}
