//! The user's settings: one JSON file in the app's configuration directory.

use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::CommandError;

const FILE_NAME: &str = "settings.json";
const TEMP_NAME: &str = "settings.json.tmp";
const SET_ASIDE_NAME: &str = "settings.json.unreadable";

/// The colour theme.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Theme {
    /// Dark colours.
    #[default]
    Dark,
    /// Light colours.
    Light,
    /// Follow the operating system.
    System,
}

/// What the user has chosen. A missing field takes its default.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct Settings {
    /// The colour theme.
    pub theme: Theme,
    /// Where workspaces are kept; `None` means the default folder.
    pub workspace_dir: Option<String>,
    /// The id of the workspace that was open last.
    pub last_workspace: Option<String>,
}

/// Reads the settings. A missing file gives the defaults. A file that cannot be read or parsed
/// is kept as `settings.json.unreadable` (replacing an older one) before the defaults are
/// returned, so nothing is lost silently. When it cannot be set aside either, the defaults are
/// used in memory and the file is left as it is: saving then fails rather than overwrite it.
pub fn load_settings(config_dir: &Path) -> Settings {
    let path = config_dir.join(FILE_NAME);
    let parsed = match std::fs::read(&path) {
        Ok(text) => serde_json::from_slice(&text).ok(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Settings::default();
        }
        Err(_) => None,
    };
    parsed.unwrap_or_else(|| {
        // A failure here is reported when the next save is refused.
        let _ = std::fs::rename(&path, config_dir.join(SET_ASIDE_NAME));
        Settings::default()
    })
}

/// Writes the settings to a temporary file beside the target, flushes it to disk, and renames it
/// over the target.
pub fn save_settings(config_dir: &Path, settings: &Settings) -> Result<(), CommandError> {
    let path = config_dir.join(FILE_NAME);
    let failed = |error: &dyn std::fmt::Display| {
        CommandError::new(
            "Settings",
            format!(
                "Could not save the settings to {}: {error}. Check that the folder exists, that you have permission to use it, and that there is free disk space, then try again.",
                path.display()
            ),
        )
    };
    let text = serde_json::to_string_pretty(settings).map_err(|e| failed(&e))?;
    std::fs::create_dir_all(config_dir).map_err(|e| failed(&e))?;
    let temp = config_dir.join(TEMP_NAME);
    let written = std::fs::File::create(&temp).and_then(|mut file| {
        file.write_all(text.as_bytes())?;
        file.sync_all()
    });
    written.map_err(|e| failed(&e))?;
    std::fs::rename(&temp, &path).map_err(|e| {
        // The temporary file is ours, so removing it loses nothing.
        let _ = std::fs::remove_file(&temp);
        failed(&e)
    })
}
