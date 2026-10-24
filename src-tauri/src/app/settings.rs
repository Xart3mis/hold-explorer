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

/// How tightly rows and controls are packed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Density {
    /// The roomy default.
    #[default]
    Comfortable,
    /// Shorter rows and controls.
    Compact,
}

/// The longest author name, in characters, after trimming.
pub(super) const AUTHOR_NAME_LIMIT: usize = 80;

/// What the user has chosen. A missing field takes its default.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct Settings {
    /// The colour theme.
    pub theme: Theme,
    /// How tightly rows and controls are packed.
    pub density: Density,
    /// The name notes are signed with (from M4); trimmed, at most 80 characters; empty is none.
    /// A file that holds a longer or untrimmed name is read trimmed and cut to 80 characters.
    pub author_name: String,
    /// Where workspaces are kept; `None` means the default folder.
    pub workspace_dir: Option<String>,
    /// Whether a folder was chosen, the default folder included, or the old folder was carried
    /// over: from then on the old folder is never carried over again.
    pub workspace_folder_chosen: bool,
    /// The id of the workspace that was open last.
    pub last_workspace: Option<String>,
    /// Whether a newer release is looked for at start, at most once in 24 hours. On by default.
    pub update_check: bool,
    /// When a newer release was last looked for, successfully or not: RFC 3339, in UTC.
    pub update_checked_at: Option<String>,
    /// The version the user chose to skip: it is not offered again, a newer one is.
    pub skipped_version: Option<String>,
}

impl Default for Settings {
    fn default() -> Settings {
        Settings {
            theme: Theme::default(),
            density: Density::default(),
            author_name: String::new(),
            workspace_dir: None,
            workspace_folder_chosen: false,
            last_workspace: None,
            update_check: true,
            update_checked_at: None,
            skipped_version: None,
        }
    }
}

/// The settings, the reason saving must be refused when the settings file could not be read or
/// moved aside, and the report that it was set aside.
pub struct LoadedSettings {
    /// The settings in use: the file's, or the defaults.
    pub settings: Settings,
    /// Set when the file could not be read, or could not be set aside; it was left untouched and
    /// every save must fail with this error rather than overwrite it.
    pub blocked: Option<CommandError>,
    /// Set when the file could not be understood and was moved to `settings.json.unreadable`.
    pub set_aside: Option<CommandError>,
}

/// The path of the settings file in `config_dir`, as text.
pub(super) fn settings_file(config_dir: &Path) -> String {
    config_dir.join(FILE_NAME).to_string_lossy().into_owned()
}

/// The settings alone, as [`load_settings_checked`] reads them, for tests that save nothing.
#[cfg(test)]
pub(super) fn load_settings(config_dir: &Path) -> Settings {
    load_settings_checked(config_dir).settings
}

/// Reads the settings. Returns the defaults when the file is missing.
///
/// A file that is read but cannot be parsed, or a folder in its place, is moved to
/// `settings.json.unreadable` (replacing an older one), the defaults are returned, and
/// `set_aside` says so. When it cannot be moved, it stays where it is and `blocked` says why
/// saving must be refused. A file that cannot be read for another reason (permission, another
/// program holding it, an I/O error) is never moved, since the next read may well succeed: the
/// defaults are returned, the file stays, and `blocked` says why saving must be refused.
pub fn load_settings_checked(config_dir: &Path) -> LoadedSettings {
    let path = config_dir.join(FILE_NAME);
    let defaults = |blocked, set_aside| LoadedSettings {
        settings: Settings::default(),
        blocked,
        set_aside,
    };
    let parsed: Option<Settings> = match std::fs::read(&path) {
        Ok(text) => serde_json::from_slice(&text).ok(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return defaults(None, None);
        }
        // A folder is no settings file, whenever it is read.
        Err(_) if path.is_dir() => None,
        Err(error) => {
            return defaults(
                Some(CommandError::new(
                    ErrorKind::Settings,
                    format!(
                        "The settings file {} could not be read ({error}), so it was left where it is and the defaults are in use. Your settings cannot be saved until it can be read: check that you have permission to read it and that no other program holds it, then restart Hold Explorer.",
                        path.display()
                    ),
                )),
                None,
            );
        }
    };
    if let Some(mut settings) = parsed {
        settings.author_name = clean_author_name(&settings.author_name);
        return LoadedSettings {
            settings,
            blocked: None,
            set_aside: None,
        };
    }
    match std::fs::rename(&path, config_dir.join(SET_ASIDE_NAME)) {
        Ok(()) => defaults(
            None,
            Some(CommandError::new(
                ErrorKind::SettingsSetAside,
                format!(
                    "Your settings file could not be read, so it was set aside as {SET_ASIDE_NAME} and the defaults are in use. Choose your settings again in Settings; the old file is kept in {}.",
                    config_dir.display()
                ),
            )),
        ),
        Err(error) => defaults(
            Some(CommandError::new(
                ErrorKind::Settings,
                format!(
                    "The settings file {} could not be read or moved aside ({error}), so it was left untouched and your settings cannot be saved. Move or delete the file by hand, then restart Hold Explorer.",
                    path.display()
                ),
            )),
            None,
        ),
    }
}

/// An author name as a file may hold it, made one the settings accept: trimmed, and cut to
/// [`AUTHOR_NAME_LIMIT`] characters (trimmed again after the cut).
fn clean_author_name(name: &str) -> String {
    let cut: String = name.trim().chars().take(AUTHOR_NAME_LIMIT).collect();
    cut.trim_end().to_string()
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
