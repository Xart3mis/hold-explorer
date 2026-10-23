use std::path::Path;

use tempfile::TempDir;

use super::diagnostics::{diagnostics, diagnostics_at, CRASH_LOG_LINES};
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
    // The local data folder is written shortened.
    assert!(text.contains("Logs folder: <local data>/logs\n"));
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
    // The name in an unreadable file's name, and in the message of a crash log under home.
    std::fs::write(
        fx.workspaces().join("SECRET-NAME.holdx-ws"),
        "not a database",
    )
    .unwrap();
    let home = TempDir::new().unwrap();
    let mut report = CrashReport::now(
        "0.1.0",
        None,
        format!("could not read {}/SECRET-NAME.xlsx", home.path().display()),
        None,
    );
    report.backtrace = "frame 1".into();
    write_log(&logs_dir(local.path()), &report).unwrap();
    let text = diagnostics_at(&state, local.path(), None, Some(home.path()));
    assert!(text.contains("Workspaces: 1\n"), "{text}");
    assert!(text.contains("Unreadable files: 1 ("), "{text}");
    // The only place the name can be is the crash log's message, as the redaction leaves it:
    // under `~`, with no folder of the user in front.
    assert_eq!(text.matches("SECRET-NAME").count(), 1, "{text}");
    assert!(text.contains("could not read ~/SECRET-NAME.xlsx"), "{text}");
    assert!(!text.contains(&home.path().display().to_string()), "{text}");
    assert!(!text.contains(&id), "{text}");
    assert!(!text.contains("2026-10-01"), "{text}");
    assert!(!text.contains("78B01"), "{text}");
}

#[test]
fn a_settings_problem_seen_at_start_is_told_after_the_start_reported_it() {
    let fx = Fixture::new();
    let local = TempDir::new().unwrap();
    std::fs::create_dir_all(fx.config()).unwrap();
    std::fs::write(fx.config().join("settings.json"), "{ not json").unwrap();
    let mut state = fx.state();
    // The start reports a set-aside file once, and forgets it.
    assert!(state.start().settings_problem.is_some());
    assert!(state.start().settings_problem.is_none());
    let text = diagnostics(&state, local.path(), None);
    assert!(
        text.contains("Settings problem: SettingsSetAside: "),
        "{text}"
    );
}

#[test]
fn the_text_shortens_the_home_and_local_data_folders_and_no_other() {
    let fx = Fixture::new();
    let home = TempDir::new().unwrap();
    let local = home.path().join("local");
    std::fs::create_dir_all(fx.config()).unwrap();
    std::fs::write(fx.config().join("settings.json"), "{ not json").unwrap();
    let mut report = CrashReport::now("0.1.0", None, "boom".into(), None);
    report.backtrace = format!(
        "read {}/x and {}/y and /elsewhere/z",
        home.path().display(),
        local.display()
    );
    write_log(&logs_dir(&local), &report).unwrap();
    let state = fx.state();
    let text = diagnostics_at(&state, &local, None, Some(home.path()));
    assert!(text.contains("Logs folder: <local data>/logs\n"), "{text}");
    assert!(
        text.contains("read ~/x and <local data>/y and /elsewhere/z"),
        "{text}"
    );
    assert!(!text.contains(&home.path().display().to_string()), "{text}");
    // A folder outside the two stays as it is.
    assert!(
        text.contains(&format!("Workspaces folder: {}", fx.workspaces().display())),
        "{text}"
    );
}
