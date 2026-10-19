//! The user's settings: one JSON file in the app's configuration directory.

use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::{CommandError, ErrorKind};

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

/// The settings, and the reason saving must be refused when the settings file could not be read
/// or moved aside.
pub struct LoadedSettings {
    /// The settings in use: the file's, or the defaults.
    pub settings: Settings,
    /// Set when the file could be neither read nor set aside; it was left untouched and every
    /// save must fail with this error rather than overwrite it.
    pub blocked: Option<CommandError>,
}

/// The settings alone, as [`load_settings_checked`] reads them, for tests that save nothing.
#[cfg(test)]
pub(super) fn load_settings(config_dir: &Path) -> Settings {
    load_settings_checked(config_dir).settings
}

/// Reads the settings. Returns the defaults when the file is missing. A file that cannot be read
/// or parsed is moved to `settings.json.unreadable` (replacing an older one) and the defaults
/// are returned. When it cannot be moved either, the defaults are returned, the file stays
/// where it is, and `blocked` says why saving must be refused.
pub fn load_settings_checked(config_dir: &Path) -> LoadedSettings {
    let path = config_dir.join(FILE_NAME);
    let parsed = match std::fs::read(&path) {
        Ok(text) => serde_json::from_slice(&text).ok(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return LoadedSettings {
                settings: Settings::default(),
                blocked: None,
            };
        }
        Err(_) => None,
    };
    if let Some(settings) = parsed {
        return LoadedSettings {
            settings,
            blocked: None,
        };
    }
    let blocked = std::fs::rename(&path, config_dir.join(SET_ASIDE_NAME))
        .err()
        .map(|error| {
            CommandError::new(
                ErrorKind::Settings,
                format!(
                    "The settings file {} could not be read or moved aside ({error}), so it was left untouched and your settings cannot be saved. Move or delete the file by hand, then restart Hold Explorer.",
                    path.display()
                ),
            )
        });
    LoadedSettings {
        settings: Settings::default(),
        blocked,
    }
}

/// Writes the settings to a temporary file beside the target, flushes it to disk, and renames it
/// over the target. Only [`AppState`](super::AppState) calls it, after its check that the file
/// in place was not left untouched because it could be neither read nor moved aside.
pub(super) fn save_settings(config_dir: &Path, settings: &Settings) -> Result<(), CommandError> {
    let path = config_dir.join(FILE_NAME);
    let failed = |error: &dyn std::fmt::Display| {
        CommandError::new(
            ErrorKind::Settings,
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
