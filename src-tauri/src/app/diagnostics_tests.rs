use std::path::Path;

use tempfile::TempDir;

use super::diagnostics::{diagnostics, CRASH_LOG_LINES};
use super::test_support::{import, Fixture};
use crate::crash::{logs_dir, write_log, CrashReport};

fn text(fx: &Fixture, local_data: &Path) -> String {
    diagnostics(&fx.state(), local_data, Some("142.0.3595.53"))
}

fn crash_log(local_data: &Path, lines: usize) -> std::path::PathBuf {
    let mut report = CrashReport::now("0.1.0", None, "boom".into(), None);
    report.backtrace = (1..=lines)
        .map(|n| format!("frame {n}"))
        .collect::<Vec<_>>()
        .join("\n");
    write_log(&logs_dir(local_data), &report).unwrap()
}

#[test]
fn the_text_has_every_line_of_the_decision() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    let text = text(&fx, local.path());
    let lines: Vec<&str> = text.lines().collect();
    let names: Vec<&str> = lines
        .iter()
        .filter_map(|line| line.split_once(": ").map(|(name, _)| name))
        .collect();
    assert_eq!(
        names[..9],
        [
            "Version",
            "OS",
            "Architecture",
            "WebView",
            "Workspaces folder",
            "Settings file",
            "Logs folder",
            "Workspaces",
            "Unreadable files",
        ]
    );
    assert!(text.contains(&format!("Version: {}", env!("CARGO_PKG_VERSION"))));
    assert!(text.contains(&format!("OS: {}", std::env::consts::OS)));
    assert!(text.contains(&format!("Architecture: {}", std::env::consts::ARCH)));
    assert!(text.contains("WebView: 142.0.3595.53"));
    assert!(text.contains(&format!("Workspaces folder: {}", fx.workspaces().display())));
    assert!(text.contains(&format!(
        "Settings file: {}",
        fx.config().join("settings.json").display()
    )));
    assert!(text.contains(&format!(
        "Logs folder: {}",
        logs_dir(local.path()).display()
    )));
    assert!(text.contains("Workspaces: 0\n"));
    assert!(text.contains("Unreadable files: 0\n"));
    assert!(text.contains("Settings problem: none\n"));
}

#[test]
fn a_missing_webview_is_said_so() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    let text = diagnostics(&fx.state(), local.path(), None);
    assert!(text.contains("WebView: not found\n"));
}

#[test]
fn unreadable_files_are_counted_with_their_kinds_and_not_named() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    std::fs::create_dir_all(fx.workspaces()).unwrap();
    std::fs::write(
        fx.workspaces().join("deadbeefdeadbeef.holdx-ws"),
        "not a database",
    )
    .unwrap();
    let text = text(&fx, local.path());
    let line = text
        .lines()
        .find(|line| line.starts_with("Unreadable files: "))
        .unwrap();
    assert!(line.starts_with("Unreadable files: 1 ("), "{line}");
    assert!(line.ends_with(')'), "{line}");
    assert!(!text.contains("deadbeef"), "{text}");
}

#[test]
fn a_settings_problem_is_told() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    std::fs::create_dir_all(fx.config()).unwrap();
    std::fs::write(fx.config().join("settings.json"), "{ not json").unwrap();
    let text = text(&fx, local.path());
    assert!(
        text.contains("Settings problem: SettingsSetAside: "),
        "{text}"
    );
}

#[test]
fn without_a_crash_log_the_text_says_so() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    let text = text(&fx, local.path());
    assert!(text.ends_with("Crash log: No crash log\n"), "{text}");
}

#[test]
fn the_newest_crash_log_is_held_to_its_first_sixty_lines() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    let path = crash_log(local.path(), 200);
    let whole = std::fs::read_to_string(&path).unwrap();
    let text = text(&fx, local.path());
    let (_, log) = text.split_once("Crash log:\n").unwrap();
    let expected: Vec<&str> = whole.lines().take(CRASH_LOG_LINES).collect();
    assert_eq!(CRASH_LOG_LINES, 60);
    assert_eq!(log.lines().collect::<Vec<_>>(), expected);
    assert!(!text.contains("frame 200"));
}

#[test]
fn a_short_crash_log_is_held_whole() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    let path = crash_log(local.path(), 3);
    let whole = std::fs::read_to_string(&path).unwrap();
    let text = text(&fx, local.path());
    assert!(text.ends_with(&whole), "{text}");
}

#[test]
fn the_text_names_no_workspace_and_no_snapshot() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    let mut state = fx.state();
    state.create_workspace("SECRET-NAME").unwrap();
    let file = fx.synth("holds.xlsx", 1);
    import(&mut state, &file, "2026-10-01 08:00:00", false);
    let id = state.open_id();
    let text = diagnostics(&state, local.path(), None);
    assert!(text.contains("Workspaces: 1\n"), "{text}");
    assert!(!text.contains("SECRET-NAME"), "{text}");
    assert!(!text.contains(&id), "{text}");
    assert!(!text.contains("2026-10-01"), "{text}");
    assert!(!text.contains("78B01"), "{text}");
}
