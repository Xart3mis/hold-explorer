//! The state of the application and the operations on it, in plain functions that take plain
//! arguments, so tests need no window.

mod data;
mod demo;
mod diagnostics;
mod error;
mod export;
mod folder;
mod import;
mod search;
mod settings;
mod snapshots;
mod update;
mod views;
mod workspaces;
mod writes;

use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use hx_core::dataset::Dataset;
use hx_core::filter::FilterSpec;
use hx_core::mapping::Field;
use hx_core::solve::SolvePlan;
use hx_store::{list_workspaces, Workspace, WorkspaceList};

pub use data::{FilterOptions, GroupDetail, HoldsView};
pub use diagnostics::diagnostics;
pub use error::{CommandError, ErrorKind};
pub use export::{
    check_extension, fonts, save, Content, CopyFormat, ExportPhase, ExportSaved, SaveFormat,
    SessionClipboard,
};
pub use folder::{FolderCheck, FolderMoved};
pub use import::{
    ImportCommit, ImportDone, ImportDraft, ImportPhase, ImportReview, TargetCheck, TargetChoice,
};
pub use settings::{Density, Settings, Theme};
pub use snapshots::{OverviewView, ViewRef};
pub use update::{fetch_latest_tag, UpdateNotice, UpdateStep};
pub use workspaces::{AppStart, WorkspaceListView, WorkspaceOpen, WorkspaceView};
pub use writes::{CloseRequest, Writes, CLOSING_HELD, CLOSING_RESUMED};

use settings::{load_settings_checked, save_settings, settings_file, LoadedSettings};

/// Most rows a data command returns in one answer.
pub const PAGE_ROWS: usize = 200;
/// Most values `filter_values` returns.
pub const PICKER_VALUES: usize = 200;
/// Most rows and most columns of a matrix before the rest is folded into "Other".
pub const MATRIX_SIDE: usize = 30;
/// Most hits `search` lists in each group.
pub const SEARCH_HITS: usize = 8;
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
    /// The local data folder: the default workspaces folder and the crash logs live under it.
    local_data_dir: PathBuf,
    settings: Settings,
    /// Why saving the settings is refused, when the settings file could not be read or moved aside.
    settings_blocked: Option<CommandError>,
    /// That the settings file was set aside at start, until the first start reports it.
    settings_set_aside: Option<CommandError>,
    /// The problem the settings file had when the state was made, kept for Copy diagnostics: the
    /// start reports `settings_set_aside` once and forgets it.
    settings_problem_at_start: Option<CommandError>,
    open: Option<Workspace>,
    /// The id of the workspace in `open`, kept beside it so a check of the view reads no file.
    open_id: Option<String>,
    selected: Option<i64>,
    /// The file being imported, when there is one.
    draft: Option<import::Draft>,
    cache: Option<Cache>,
    /// The files an export wrote since the application started, which `export_open` may open.
    written: HashSet<PathBuf>,
    /// The versions an update check offered since the application started, whose release page
    /// `open_release_page` may open.
    offered: HashSet<String>,
    /// Whether the update check is off for this session whatever the settings say: a smoke run
    /// and the `e2e` build ask nothing of the network.
    update_check_off: bool,
    /// The address the update check asks: [`update::RELEASES_URL`]. In the tests it is no address, so
    /// no test reaches the network, until a test names a server of its own.
    update_url: String,
    /// The writes in progress. Shared: the close of the window reads it without the state lock,
    /// and an export writes its file with the lock free.
    writes: Arc<Writes>,
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
    /// `local_data_dir` unless the settings name another folder.
    ///
    /// A user of an earlier version has them in `workspaces/` under `data_dir`, which is the
    /// local data folder on Linux and macOS but not on Windows. When the settings name no folder,
    /// the default folder holds no workspace file, and the old one holds at least one, the old
    /// folder becomes the chosen folder and is saved in the settings; nothing is moved. When the
    /// settings cannot be saved, the old folder is used for this session only.
    ///
    /// When the settings file was set aside, the defaults are saved with the update check off.
    pub fn new(config_dir: PathBuf, data_dir: PathBuf, local_data_dir: PathBuf) -> AppState {
        let LoadedSettings {
            mut settings,
            blocked,
            set_aside,
        } = load_settings_checked(&config_dir);
        if set_aside.is_some() {
            // Whether the user wanted the update check is unknown, so it is saved off; the
            // Settings switch then shows it off. A failed save still asks nothing at this start.
            settings.update_check = false;
            let _ = save_settings(&config_dir, &settings);
        }
        if settings.workspace_dir.is_none() && !settings.workspace_folder_chosen {
            let default = local_data_dir.join("workspaces");
            let old = data_dir.join("workspaces");
            if old != default && !holds_workspace_files(&default) && holds_workspace_files(&old) {
                settings.workspace_dir = Some(old.to_string_lossy().into_owned());
                settings.workspace_folder_chosen = true;
                if blocked.is_none() {
                    // A failed save repeats the carry-over at the next start, which is harmless.
                    let _ = save_settings(&config_dir, &settings);
                }
            }
        }
        AppState {
            config_dir,
            local_data_dir,
            settings,
            settings_problem_at_start: set_aside.clone().or_else(|| blocked.clone()),
            settings_blocked: blocked,
            settings_set_aside: set_aside,
            open: None,
            open_id: None,
            selected: None,
            draft: None,
            cache: None,
            written: HashSet::new(),
            offered: HashSet::new(),
            update_check_off: false,
            update_url: if cfg!(test) {
                String::new()
            } else {
                update::RELEASES_URL.to_string()
            },
            writes: Arc::default(),
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
            None => self.default_folder(),
        }
    }

    /// The folder the workspaces are kept in when the settings name none.
    fn default_folder(&self) -> PathBuf {
        self.local_data_dir.join("workspaces")
    }

    /// The count of the writes in progress, which each write holds a guard of while it writes.
    pub fn writes(&self) -> Arc<Writes> {
        Arc::clone(&self.writes)
    }

    /// The local data folder, where the crash logs are written.
    pub fn local_data_dir(&self) -> &Path {
        &self.local_data_dir
    }

    /// Everything the interface needs at start; reopens the last workspace when it can. A last
    /// workspace that is gone or unreadable leaves `open` empty and raises no error. A folder
    /// that cannot be listed gives an empty list and `list_error`; one that does not exist yet
    /// is not an error. A problem with the settings file is reported: that it was set aside, at
    /// the first start only, or that saving is refused, at every start.
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
        let (raw, list_error) = list_folder(&folder);
        let last = self.settings.last_workspace.clone();
        let open = last
            .and_then(|id| self.load_from(raw.clone(), &id).ok())
            .map(|(workspace, open)| {
                self.install(workspace, &open);
                open
            });
        AppStart {
            version: env!("CARGO_PKG_VERSION").to_string(),
            settings_file: settings_file(&self.config_dir),
            logs_folder: diagnostics::logs_folder(&self.local_data_dir),
            settings: self.settings.clone(),
            list: workspaces::list_view(raw, &folder),
            list_error,
            open,
            settings_problem: self
                .settings_set_aside
                .take()
                .or_else(|| self.settings_blocked.clone()),
            e2e: cfg!(feature = "e2e"),
        }
    }

    /// Puts the state right after a command panicked while it held it: drops the file open for
    /// import and every cache, and reopens the open workspace from its file, where a write that
    /// was cut short rolled back with its transaction. A workspace an import had taken out of the
    /// state when it panicked is found again by its id. The selection stays when the reopened
    /// workspace still has that snapshot; otherwise the newest is selected. The files written
    /// this session stay openable. When the workspace cannot be reopened, none is open and the
    /// error says why.
    pub fn recover(&mut self) -> Result<(), CommandError> {
        self.draft = None;
        self.cache = None;
        let path = self.open.take().map(|open| open.path().to_path_buf());
        let reopened = match (path, self.open_id.clone()) {
            (Some(path), _) => Workspace::open(&path)
                .map_err(CommandError::from)
                .and_then(|workspace| describe(&workspace).map(|open| (workspace, open))),
            (None, Some(id)) => self.load(&id),
            (None, None) => {
                self.selected = None;
                return Ok(());
            }
        };
        match reopened {
            Ok((workspace, mut open)) => {
                let kept = self
                    .selected
                    .filter(|id| open.snapshots.iter().any(|snapshot| snapshot.id == *id));
                open.selected = kept.or(open.selected);
                self.install(workspace, &open);
                Ok(())
            }
            Err(error) => {
                self.open_id = None;
                self.selected = None;
                Err(CommandError::new(
                    error.kind,
                    format!(
                        "After an operation failed part-way, the workspace could not be reopened: {}",
                        error.message
                    ),
                ))
            }
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

    /// Sets and saves the density.
    pub fn set_density(&mut self, density: Density) -> Result<Settings, CommandError> {
        let next = Settings {
            density,
            ..self.settings.clone()
        };
        self.save(&next)?;
        self.settings = next;
        Ok(self.settings.clone())
    }

    /// Sets and saves whether a newer release is looked for at start.
    pub fn set_update_check(&mut self, enabled: bool) -> Result<Settings, CommandError> {
        let next = Settings {
            update_check: enabled,
            ..self.settings.clone()
        };
        self.save(&next)?;
        self.settings = next;
        Ok(self.settings.clone())
    }

    /// Sets and saves the name notes are signed with. The name is trimmed; more than 80
    /// characters after that is refused and nothing changes.
    pub fn set_author_name(&mut self, name: &str) -> Result<Settings, CommandError> {
        let name = name.trim();
        if name.chars().count() > settings::AUTHOR_NAME_LIMIT {
            return Err(CommandError::new(
                ErrorKind::Settings,
                format!(
                    "The name is longer than {} characters, so it was not saved. Shorten it, then save it again.",
                    settings::AUTHOR_NAME_LIMIT
                ),
            ));
        }
        let next = Settings {
            author_name: name.to_string(),
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
        let open = describe_with_warning(&workspace)?;
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

    /// Opens the workspace file of this id from the folder in use, without describing it.
    fn find(&self, id: &str) -> Result<Workspace, CommandError> {
        let list = list_workspaces(&self.folder())?;
        find_in(list, id)
    }

    /// Opens the workspace of this id from a listing of the folder in use. Of several files with
    /// one id, the listing has one as the workspace (the file named by the id, else the first in
    /// byte order) and the others as copies, so a copy is never opened. When no readable
    /// workspace has the id, a file named by it that could not be read gives its reason. The
    /// description carries the damage of the saved views, read once.
    fn load_from(
        &self,
        list: WorkspaceList,
        id: &str,
    ) -> Result<(Workspace, WorkspaceOpen), CommandError> {
        let workspace = find_in(list, id)?;
        // Opened here: the damage of its saved views is reported now.
        let open = describe_with_warning(&workspace)?;
        Ok((workspace, open))
    }

    /// Makes the workspace the open one, then saves its id as the last workspace. A failed save
    /// never fails the open: it is returned as the warning, with the damage of the saved views
    /// that `open` carries (`describe_with_warning`) after it.
    fn install_and_remember(
        &mut self,
        workspace: Workspace,
        mut open: WorkspaceOpen,
    ) -> WorkspaceOpen {
        let views = open.warning.take();
        self.install(workspace, &open);
        // Kept in memory even when it cannot be saved, so the next successful save writes it.
        self.settings.last_workspace = Some(open.workspace.id.clone());
        let not_remembered = self.save(&self.settings).err().map(|error| {
            CommandError::new(
                ErrorKind::Settings,
                format!(
                    "The workspace is open, but Hold Explorer could not remember it for the next start. {}",
                    error.message
                ),
            )
        });
        // Both are kept when both are set: the settings' kind, then what the views say.
        open.warning = match (not_remembered, views) {
            (Some(settings), Some(views)) => Some(CommandError::new(
                settings.kind,
                format!("{} {}", settings.message, views.message),
            )),
            (settings, views) => settings.or(views),
        };
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

/// Whether the folder holds a file the store lists, readable or not. A folder that cannot be
/// listed holds none.
fn holds_workspace_files(folder: &Path) -> bool {
    list_workspaces(folder)
        .is_ok_and(|list| !list.workspaces.is_empty() || !list.unreadable.is_empty())
}

/// The listing of a workspace folder, as a start shows it: a folder that cannot be listed gives
/// an empty list and the error.
fn list_folder(folder: &Path) -> (WorkspaceList, Option<CommandError>) {
    match list_workspaces(folder) {
        Ok(raw) => (raw, None),
        Err(error) => (
            WorkspaceList {
                workspaces: Vec::new(),
                unreadable: Vec::new(),
            },
            Some(CommandError::from(error)),
        ),
    }
}

/// The workspace of this id in a listing of the folder in use, opened. Of several files with one
/// id, the listing has one as the workspace (the file named by the id, else the first in byte
/// order) and the others as copies, so a copy is never opened. When no readable workspace has the
/// id, a file named by it that could not be read gives its reason.
fn find_in(list: WorkspaceList, id: &str) -> Result<Workspace, CommandError> {
    let path = match list.workspaces.into_iter().find(|w| w.id == id) {
        Some(info) => info.path,
        None => {
            let named = |path: &Path| path.file_stem() == Some(OsStr::new(id));
            return Err(match list.unreadable.into_iter().find(|u| named(&u.path)) {
                Some(unreadable) => unreadable.error.into(),
                None => CommandError::new(
                    ErrorKind::WorkspaceNotFound,
                    "That workspace is not in the workspace folder. It may have been moved or deleted; choose a workspace from the list, or create a new one.",
                ),
            });
        }
    };
    Ok(Workspace::open(&path)?)
}

/// What the interface receives about a workspace, with the newest snapshot selected and no
/// warning. Damaged saved views read as none; the paths that open a workspace call
/// [`describe_with_warning`] instead, so the damage is reported once, when it is opened.
fn describe(workspace: &Workspace) -> Result<WorkspaceOpen, CommandError> {
    let mut open = describe_with_warning(workspace)?;
    open.warning = None;
    Ok(open)
}

/// [`describe`], with the warning that the saved views could not be read when they could not,
/// from the one reading of them: for a path that opens the workspace.
fn describe_with_warning(workspace: &Workspace) -> Result<WorkspaceOpen, CommandError> {
    let snapshots = workspace.snapshots()?;
    let selected = snapshots.last().map(|snapshot| snapshot.id);
    let (views, warning) = views::read_views(workspace)?;
    Ok(WorkspaceOpen {
        workspace: workspace.info()?.into(),
        snapshots,
        selected,
        views,
        warning,
    })
}

#[cfg(test)]
mod data_tests;
#[cfg(test)]
mod diagnostics_tests;
#[cfg(test)]
mod export_tests;
#[cfg(test)]
mod folder_tests;
#[cfg(test)]
mod import_tests;
#[cfg(test)]
mod local_folder_tests;
#[cfg(test)]
mod snapshot_tests;
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod update_tests;
#[cfg(test)]
mod views_tests;
