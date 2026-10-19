//! The state of the application and the operations on it, in plain functions that take plain
//! arguments, so tests need no window.

mod data;
mod demo;
mod error;
mod export;
mod import;
mod settings;
mod snapshots;
mod workspaces;

use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use hx_core::dataset::Dataset;
use hx_core::filter::FilterSpec;
use hx_core::mapping::Field;
use hx_core::solve::SolvePlan;
use hx_store::{list_workspaces, Workspace, WorkspaceList};

pub use data::{FilterOptions, GroupDetail, HoldsView};
pub use error::CommandError;
pub use export::{
    check_extension, fonts, save, Content, CopyFormat, ExportPhase, ExportSaved, SaveFormat,
    SessionClipboard,
};
pub use import::{
    ImportCommit, ImportDone, ImportDraft, ImportPhase, ImportReview, TargetCheck, TargetChoice,
};
pub use settings::{Settings, Theme};
pub use snapshots::{OverviewView, ViewRef};
pub use workspaces::{AppStart, WorkspaceListView, WorkspaceOpen, WorkspaceView};

use settings::{load_settings_checked, save_settings, LoadedSettings};

/// Most rows a data command returns in one answer.
pub const PAGE_ROWS: usize = 200;
/// Most values `filter_values` returns.
pub const PICKER_VALUES: usize = 200;
/// Most rows and most columns of a matrix before the rest is folded into "Other".
pub const MATRIX_SIDE: usize = 30;
/// Most Lines `group_detail` lists for one group.
pub const GROUP_LINES: usize = 200;
/// Most entries of the Overview's top blockers and top lines: the export's, so a file lists what
/// the Overview lists.
pub const TOP_ITEMS: usize = hx_export::TOP_ITEMS;
/// Age in days from which an open hold counts as stale: the export's, so a file counts what the
/// Overview counts.
pub const STALE_DAYS: i64 = hx_export::STALE_DAYS;

/// The dataset that was built last, with the workspace and the snapshot it belongs to, the solve
/// plan of its open holds once one was asked for, the plan of the last filter a solve order or a
/// blocker detail asked for, and its columns once they were asked for. Read it through
/// [`AppState::dataset`], [`AppState::plan`], [`AppState::filtered_plan`], and
/// [`AppState::columns`] only, which ask for the snapshot.
struct Cache {
    workspace_id: String,
    snapshot_id: i64,
    dataset: Dataset,
    plan: Option<SolvePlan>,
    /// The plan of the last filter asked for, with that filter.
    filtered: Option<(FilterSpec, SolvePlan)>,
    columns: Option<Columns>,
    /// The count of the state, to add to where a plan is built.
    #[cfg(test)]
    plan_builds: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    /// The count of the state, to add to where the columns are found.
    #[cfg(test)]
    column_builds: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    /// The count of the state, to add to where a filtered plan is built.
    #[cfg(test)]
    filtered_plan_builds: std::sync::Arc<std::sync::atomic::AtomicUsize>,
}

/// What the columns of a snapshot are, which every data command reads to apply its filter.
struct Columns {
    /// [`Dataset::custom_dims`].
    custom_dims: Vec<String>,
    /// [`Dataset::absent_fields`].
    absent: Vec<Field>,
}

/// What the application holds between commands.
pub struct AppState {
    config_dir: PathBuf,
    data_dir: PathBuf,
    settings: Settings,
    /// Why saving the settings is refused, when the settings file could not be read or moved aside.
    settings_blocked: Option<CommandError>,
    open: Option<Workspace>,
    /// The id of the workspace in `open`, kept beside it so a check of the view reads no file.
    open_id: Option<String>,
    selected: Option<i64>,
    /// The file being imported, when there is one.
    draft: Option<import::Draft>,
    cache: Option<Cache>,
    /// The files an export wrote since the application started, which `export_open` may open.
    written: HashSet<PathBuf>,
    /// How many datasets were built since the application started.
    #[cfg(test)]
    dataset_builds: usize,
    /// How many solve plans were built since the application started.
    #[cfg(test)]
    plan_builds: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    /// How many times the columns of a snapshot were found since the application started.
    #[cfg(test)]
    column_builds: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    /// How many plans of a filter were built since the application started.
    #[cfg(test)]
    filtered_plan_builds: std::sync::Arc<std::sync::atomic::AtomicUsize>,
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
            open_id: None,
            selected: None,
            draft: None,
            cache: None,
            written: HashSet::new(),
            #[cfg(test)]
            dataset_builds: 0,
            #[cfg(test)]
            plan_builds: Default::default(),
            #[cfg(test)]
            column_builds: Default::default(),
            #[cfg(test)]
            filtered_plan_builds: Default::default(),
        }
    }

    /// The settings in use.
    pub fn settings(&self) -> &Settings {
        &self.settings
    }

    /// The id of the open workspace; panics when none is open.
    #[cfg(test)]
    fn open_id(&self) -> String {
        self.open.as_ref().unwrap().info().unwrap().id
    }

    /// The id of the selected snapshot of the open workspace.
    #[cfg(test)]
    fn selected_snapshot(&self) -> Option<i64> {
        self.selected
    }

    /// The open workspace as the state holds it, with the snapshot that is selected; `None`
    /// without one. It changes nothing: the selection, the cache, and a file open for import
    /// stay.
    pub fn current(&self) -> Result<Option<WorkspaceOpen>, CommandError> {
        let Some(workspace) = &self.open else {
            return Ok(None);
        };
        let mut open = describe(workspace)?;
        open.selected = self.selected;
        Ok(Some(open))
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
    ///
    /// The interface calls this each time its page loads, and a page that loads again holds
    /// nothing of before. So the state starts over too: the open workspace, its selection, its
    /// dataset, and a file open for import are dropped before the last workspace is reopened,
    /// and what the result says is open is exactly what the state holds.
    pub fn start(&mut self) -> AppStart {
        self.open = None;
        self.open_id = None;
        self.selected = None;
        self.cache = None;
        self.draft = None;
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

    /// Opens the workspace of this id from a listing of the folder in use. A file the user
    /// copied inside the folder keeps its id; of several files with one id, the file named by
    /// the id is opened, which is the one the app created.
    fn load_from(
        &self,
        list: WorkspaceList,
        id: &str,
    ) -> Result<(Workspace, WorkspaceOpen), CommandError> {
        let named = |path: &Path| path.file_stem() == Some(OsStr::new(id));
        let (own, copies): (Vec<_>, Vec<_>) = list
            .workspaces
            .into_iter()
            .filter(|w| w.id == id)
            .partition(|w| named(&w.path));
        let path = match own.into_iter().chain(copies).next() {
            Some(info) => info.path,
            None => {
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

    /// Closes the open workspace and keeps this one, with the snapshot `open` names selected.
    /// A file open for import is dropped.
    fn install(&mut self, workspace: Workspace, open: &WorkspaceOpen) {
        self.draft = None;
        self.cache = None;
        self.open = Some(workspace);
        self.open_id = Some(open.workspace.id.clone());
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
mod data_tests;
#[cfg(test)]
mod export_tests;
#[cfg(test)]
mod import_tests;
#[cfg(test)]
mod snapshot_tests;
#[cfg(test)]
mod tests;
