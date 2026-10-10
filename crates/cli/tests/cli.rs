use std::process::Command;

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_hx-cli"))
}

#[test]
fn synth_then_summary_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("holds.xlsx");

    let made = cli()
        .args([
            "synth", "--seed", "9", "--lines", "80", "--holds", "500", "--out",
        ])
        .arg(&file)
        .output()
        .unwrap();
    assert!(
        made.status.success(),
        "{}",
        String::from_utf8_lossy(&made.stderr)
    );

    let out = cli().arg("summary").arg(&file).output().unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );

    let json: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(json["snapshot"], "2026-09-29 13:16:00");
    assert_eq!(json["snapshot_source"], "InfoSheet");
    assert_eq!(json["project"], "0000-TEST");
    assert_eq!(json["sheet"], "data");
    assert_eq!(json["limited"], false);
    assert_eq!(json["skipped"], 0);

    let holds = json["summary"]["holds"].as_u64().unwrap();
    assert!(holds > 0 && holds < 500, "open holds only, got {holds}");
    assert!(json["summary"]["lines"].as_u64().unwrap() > 0);
    assert!(!json["by_discipline"].as_array().unwrap().is_empty());
    assert!(!json["by_hold_type"].as_array().unwrap().is_empty());
    assert!(json["top_lines"].as_array().unwrap().len() <= 10);
    assert!(!json["solve"].as_array().unwrap().is_empty());
}

#[test]
fn summary_of_missing_file_fails_with_a_message() {
    let out = cli()
        .args(["summary", "/no/such/file.xlsx"])
        .output()
        .unwrap();
    assert!(!out.status.success());
    let message = String::from_utf8_lossy(&out.stderr);
    assert!(message.contains("Could not read"), "{message}");
}
