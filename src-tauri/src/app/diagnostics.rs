//! The diagnostics text that About copies: what a bug report needs, and nothing that names a
//! workspace, a snapshot, or a hold.

use std::path::Path;

use super::settings::settings_file;
use super::{list_folder, AppState};
use crate::crash;

/// How many lines of the newest crash log the text holds.
pub(super) const CRASH_LOG_LINES: usize = 60;

/// The folder of the crash logs, as text: under the same local data folder the crash hook writes
/// to.
pub(super) fn logs_folder() -> String {
    crash::logs_dir(&crash::local_data_folder(crate::IDENTIFIER))
        .to_string_lossy()
        .into_owned()
}

/// The diagnostics text, plain lines `Name: value`, then the newest crash log of `local_data`
/// (or the words "No crash log"). `webview` is the version of the WebView, when one was found.
/// It names no workspace and no snapshot: only how many workspaces there are, and the kinds of
/// the files that could not be read.
pub fn diagnostics(state: &AppState, local_data: &Path, webview: Option<&str>) -> String {
    let folder = state.folder();
    let (list, list_error) = list_folder(&folder);
    let workspaces = match &list_error {
        Some(error) => format!("unknown ({:?})", error.kind),
        None => list.workspaces.len().to_string(),
    };
    let kinds: Vec<String> = list
        .unreadable
        .into_iter()
        .map(|unreadable| {
            format!(
                "{:?}",
                super::error::CommandError::from(unreadable.error).kind
            )
        })
        .collect();
    let unreadable = if kinds.is_empty() {
        "0".to_string()
    } else {
        format!("{} ({})", kinds.len(), kinds.join(", "))
    };
    let problem = state
        .settings_set_aside
        .as_ref()
        .or(state.settings_blocked.as_ref())
        .map_or_else(
            || "none".to_string(),
            |error| format!("{:?}: {}", error.kind, error.message),
        );
    let mut text = format!(
        "Version: {}\n\
         OS: {}\n\
         Architecture: {}\n\
         WebView: {}\n\
         Workspaces folder: {}\n\
         Settings file: {}\n\
         Logs folder: {}\n\
         Workspaces: {workspaces}\n\
         Unreadable files: {unreadable}\n\
         Settings problem: {problem}\n",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        webview.unwrap_or("not found"),
        folder.display(),
        settings_file(&state.config_dir),
        crash::logs_dir(local_data).display(),
    );
    match crash::newest_log(local_data) {
        None => text.push_str("Crash log: No crash log\n"),
        Some(path) => match std::fs::read(&path) {
            Ok(bytes) => {
                text.push_str("Crash log:\n");
                for line in String::from_utf8_lossy(&bytes)
                    .lines()
                    .take(CRASH_LOG_LINES)
                {
                    text.push_str(line);
                    text.push('\n');
                }
            }
            Err(error) => text.push_str(&format!("Crash log: could not be read ({error})\n")),
        },
    }
    text
}
