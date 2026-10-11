//! The state of the application and the operations on it, in plain functions that take plain
//! arguments, so tests need no window.

mod error;
mod settings;
mod workspaces;

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use hx_store::{list_workspaces, Workspace, WorkspaceList};

pub use error::CommandError;
pub use settings::{
    load_settings, load_settings_checked, save_settings, LoadedSettings, Settings, Theme,
};
pub use workspaces::{AppStart, UnreadableView, WorkspaceListView, WorkspaceOpen, WorkspaceView};

/// What the application holds between commands.
pub struct AppState {
    config_dir: PathBuf,
    data_dir: PathBuf,
    settings: Settings,
    /// Why saving the settings is refused, when the settings file could not be read or moved aside.
    settings_blocked: Option<CommandError>,
    open: Option<Workspace>,
    selected: Option<i64>,
}

impl AppState {
    /// Reads the settings from `config_dir` at once. Workspaces are kept in `workspaces/` under
    /// `data_dir` unless the settings name another folder.
    pub fn new(config_dir: PathBuf, data_dir: PathBuf) -> AppState {
        let LoadedSettings { settings, blocked } = load_settings_checked(&config_dir);
        AppState {
            config_dir,
            data_dir,
            settings,
            settings_blocked: blocked,
            open: None,
            selected: None,
        }
    }

    /// The settings in use.
    pub fn settings(&self) -> &Settings {
        &self.settings
    }

    /// The id of the selected snapshot of the open workspace.
    pub fn selected_snapshot(&self) -> Option<i64> {
        self.selected
    }

    /// Saves the settings, unless the settings file was left untouched because it could not be
    /// read or moved aside.
    fn save(&self, settings: &Settings) -> Result<(), CommandError> {
        match &self.settings_blocked {
            Some(blocked) => Err(blocked.clone()),
            None => save_settings(&self.config_dir, settings),
        }
    }

    fn folder(&self) -> PathBuf {
        match &self.settings.workspace_dir {
            Some(dir) => PathBuf::from(dir),
            None => self.data_dir.join("workspaces"),
        }
    }

    /// Everything the interface needs at start; reopens the last workspace when it can. A last
    /// workspace that is gone or unreadable leaves `open` empty and raises no error. A folder
    /// that cannot be listed gives an empty list and `list_error`; one that does not exist yet
    /// is not an error.
    pub fn start(&mut self) -> AppStart {
        let folder = self.folder();
        let (raw, list_error) = match list_workspaces(&folder) {
            Ok(raw) => (raw, None),
            Err(error) => (
                WorkspaceList {
                    workspaces: Vec::new(),
                    unreadable: Vec::new(),
                },
                Some(CommandError::from(error)),
            ),
        };
        let last = self.settings.last_workspace.clone();
        let open = last
            .and_then(|id| self.load_from(raw.clone(), &id).ok())
            .map(|(workspace, open)| {
                self.install(workspace, &open);
                open
            });
        AppStart {
            version: env!("CARGO_PKG_VERSION").to_string(),
            settings: self.settings.clone(),
            list: workspaces::list_view(raw, &folder),
            list_error,
            open,
        }
    }

    /// Sets and saves the theme.
    pub fn set_theme(&mut self, theme: Theme) -> Result<Settings, CommandError> {
        let next = Settings {
            theme,
            ..self.settings.clone()
        };
        self.save(&next)?;
        self.settings = next;
        Ok(self.settings.clone())
    }

    /// The workspaces in the folder in use, and the files that could not be read.
    pub fn list_workspaces(&self) -> Result<WorkspaceListView, CommandError> {
        let folder = self.folder();
        let list = list_workspaces(&folder)?;
        Ok(workspaces::list_view(list, &folder))
    }

    /// Creates a workspace in the folder in use (made when missing) and opens it. When the
    /// settings cannot be saved the workspace is still open and the result carries a warning.
    pub fn create_workspace(&mut self, name: &str) -> Result<WorkspaceOpen, CommandError> {
        let workspace = Workspace::create(&self.folder(), name)?;
        let open = describe(&workspace)?;
        Ok(self.install_and_remember(workspace, open))
    }

    /// Opens the workspace with this id, closing the one that was open. The selected snapshot is
    /// the newest. When the settings cannot be saved the workspace is still open and the result
    /// carries a warning.
    pub fn open_workspace(&mut self, id: &str) -> Result<WorkspaceOpen, CommandError> {
        let (workspace, open) = self.load(id)?;
        Ok(self.install_and_remember(workspace, open))
    }

    /// Renames the open workspace; a blank name becomes the store's default name.
    pub fn rename_workspace(&mut self, name: &str) -> Result<WorkspaceView, CommandError> {
        let workspace = self.open.as_mut().ok_or_else(CommandError::no_workspace)?;
        workspace.rename(name)?;
        Ok(workspace.info()?.into())
    }

    /// Opens the workspace file of this id from the folder in use, without changing the state.
    fn load(&self, id: &str) -> Result<(Workspace, WorkspaceOpen), CommandError> {
        let list = list_workspaces(&self.folder())?;
        self.load_from(list, id)
    }

    /// Opens the workspace of this id from a listing of the folder in use.
    fn load_from(
        &self,
        list: WorkspaceList,
        id: &str,
    ) -> Result<(Workspace, WorkspaceOpen), CommandError> {
        let path = match list.workspaces.into_iter().find(|w| w.id == id) {
            Some(info) => info.path,
            None => {
                let named = |path: &Path| path.file_stem() == Some(OsStr::new(id));
                return Err(match list.unreadable.into_iter().find(|u| named(&u.path)) {
                    Some(unreadable) => unreadable.error.into(),
                    None => CommandError::new(
                        "WorkspaceNotFound",
                        "That workspace is not in the workspace folder. It may have been moved or deleted; choose a workspace from the list, or create a new one.",
                    ),
                });
            }
        };
        let workspace = Workspace::open(&path)?;
        let open = describe(&workspace)?;
        Ok((workspace, open))
    }

    /// Makes the workspace the open one, then saves its id as the last workspace. A failed save
    /// never fails the open: it is returned as the warning.
    fn install_and_remember(
        &mut self,
        workspace: Workspace,
        mut open: WorkspaceOpen,
    ) -> WorkspaceOpen {
        self.install(workspace, &open);
        // Kept in memory even when it cannot be saved, so the next successful save writes it.
        self.settings.last_workspace = Some(open.workspace.id.clone());
        open.warning = self.save(&self.settings)
            .err()
            .map(|error| {
                CommandError::new(
                    "Settings",
                    format!(
                        "The workspace is open, but Hold Explorer could not remember it for the next start. {}",
                        error.message
                    ),
                )
            });
        open
    }

    /// Closes the open workspace and keeps this one, with its newest snapshot selected.
    fn install(&mut self, workspace: Workspace, open: &WorkspaceOpen) {
        self.open = Some(workspace);
        self.selected = open.selected;
    }
}

/// What the interface receives about a workspace that was just opened.
fn describe(workspace: &Workspace) -> Result<WorkspaceOpen, CommandError> {
    let snapshots = workspace.snapshots()?;
    let selected = snapshots.last().map(|snapshot| snapshot.id);
    Ok(WorkspaceOpen {
        workspace: workspace.info()?.into(),
        snapshots,
        selected,
        warning: None,
    })
}

#[cfg(test)]
mod tests;
