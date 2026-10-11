//! The state of the application and the operations on it, in plain functions that take plain
//! arguments, so tests need no window.

mod error;
mod settings;
mod workspaces;

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use hx_store::{list_workspaces, Workspace};

pub use error::CommandError;
pub use settings::{load_settings, save_settings, Settings, Theme};
pub use workspaces::{AppStart, UnreadableView, WorkspaceListView, WorkspaceOpen, WorkspaceView};

/// What the application holds between commands.
pub struct AppState {
    config_dir: PathBuf,
    data_dir: PathBuf,
    settings: Settings,
    open: Option<Workspace>,
    selected: Option<i64>,
}

impl AppState {
    /// Reads the settings from `config_dir` at once. Workspaces are kept in `workspaces/` under
    /// `data_dir` unless the settings name another folder.
    pub fn new(config_dir: PathBuf, data_dir: PathBuf) -> AppState {
        let settings = load_settings(&config_dir);
        AppState {
            config_dir,
            data_dir,
            settings,
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

    fn folder(&self) -> PathBuf {
        match &self.settings.workspace_dir {
            Some(dir) => PathBuf::from(dir),
            None => self.data_dir.join("workspaces"),
        }
    }

    /// Everything the interface needs at start; reopens the last workspace when it can. A last
    /// workspace that is gone or unreadable leaves `open` empty and raises no error.
    pub fn start(&mut self) -> AppStart {
        let folder = self.folder();
        // A folder that cannot be read lists nothing; creating a workspace reports the cause.
        let list = self.list_workspaces().unwrap_or_else(|_| {
            workspaces::list_view(
                hx_store::WorkspaceList {
                    workspaces: Vec::new(),
                    unreadable: Vec::new(),
                },
                &folder,
            )
        });
        let last = self.settings.last_workspace.clone();
        let open = last
            .and_then(|id| self.load(&id).ok())
            .map(|(workspace, open)| {
                self.install(workspace, &open);
                open
            });
        AppStart {
            version: env!("CARGO_PKG_VERSION").to_string(),
            settings: self.settings.clone(),
            list,
            open,
        }
    }

    /// Sets and saves the theme.
    pub fn set_theme(&mut self, theme: Theme) -> Result<Settings, CommandError> {
        let next = Settings {
            theme,
            ..self.settings.clone()
        };
        save_settings(&self.config_dir, &next)?;
        self.settings = next;
        Ok(self.settings.clone())
    }

    /// The workspaces in the folder in use, and the files that could not be read.
    pub fn list_workspaces(&self) -> Result<WorkspaceListView, CommandError> {
        let folder = self.folder();
        let list = list_workspaces(&folder)?;
        Ok(workspaces::list_view(list, &folder))
    }

    /// Creates a workspace in the folder in use (made when missing) and opens it.
    pub fn create_workspace(&mut self, name: &str) -> Result<WorkspaceOpen, CommandError> {
        let workspace = Workspace::create(&self.folder(), name)?;
        let open = describe(&workspace)?;
        self.record_and_install(workspace, open)
    }

    /// Opens the workspace with this id, closing the one that was open. The selected snapshot is
    /// the newest.
    pub fn open_workspace(&mut self, id: &str) -> Result<WorkspaceOpen, CommandError> {
        let (workspace, open) = self.load(id)?;
        self.record_and_install(workspace, open)
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

    /// Saves the id as the last workspace, then makes the workspace the open one. When saving
    /// fails the state is left as it was.
    fn record_and_install(
        &mut self,
        workspace: Workspace,
        open: WorkspaceOpen,
    ) -> Result<WorkspaceOpen, CommandError> {
        let next = Settings {
            last_workspace: Some(open.workspace.id.clone()),
            ..self.settings.clone()
        };
        save_settings(&self.config_dir, &next)?;
        self.settings = next;
        self.install(workspace, &open);
        Ok(open)
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
    })
}

#[cfg(test)]
mod tests;
