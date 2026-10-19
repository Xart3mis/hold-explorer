//! The views of workspaces the interface receives.

use std::path::Path;

use chrono::NaiveDateTime;
use hx_store::{SnapshotInfo, UnreadableWorkspace, WorkspaceInfo, WorkspaceList};
use serde::Serialize;
use ts_rs::TS;

use super::error::{CommandError, ErrorKind};
use super::settings::Settings;

/// A workspace as the interface shows it.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct WorkspaceView {
    /// The workspace id.
    pub id: String,
    /// The name the user gave the workspace.
    pub name: String,
    /// The project numbers the workspace covers, sorted.
    pub project_numbers: Vec<String>,
    /// When the workspace was created, in UTC.
    pub created_at: NaiveDateTime,
    /// How many snapshots the workspace holds.
    pub snapshot_count: usize,
    /// Date of the newest snapshot.
    pub latest_taken_at: Option<NaiveDateTime>,
}

/// A workspace file that could not be opened.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct UnreadableView {
    /// The file's name.
    pub file_name: String,
    /// The file's full path, as text.
    pub path: String,
    /// The kind of the store error.
    pub kind: ErrorKind,
    /// The store error's text.
    pub message: String,
}

/// The workspaces of the folder in use.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct WorkspaceListView {
    /// Readable workspaces, sorted by name without regard to case, then by id.
    pub workspaces: Vec<WorkspaceView>,
    /// Workspace files that could not be opened.
    pub unreadable: Vec<UnreadableView>,
    /// The folder in use, as text.
    pub folder: String,
}

/// A workspace that was just opened or created.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct WorkspaceOpen {
    /// The workspace.
    pub workspace: WorkspaceView,
    /// Its snapshots, oldest first.
    pub snapshots: Vec<SnapshotInfo>,
    /// The selected snapshot: the newest, or `None` when there is none.
    pub selected: Option<i64>,
    /// Set when the workspace is open but the app could not remember it for the next start.
    pub warning: Option<CommandError>,
}

/// Everything the interface needs at start.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct AppStart {
    /// The version of the application.
    pub version: String,
    /// The user's settings.
    pub settings: Settings,
    /// The workspaces in the folder in use.
    pub list: WorkspaceListView,
    /// Why the workspace folder could not be listed; the list is then empty.
    pub list_error: Option<CommandError>,
    /// The workspace that was reopened, when there was one to reopen.
    pub open: Option<WorkspaceOpen>,
}

impl From<WorkspaceInfo> for WorkspaceView {
    fn from(info: WorkspaceInfo) -> WorkspaceView {
        WorkspaceView {
            id: info.id,
            name: info.name,
            project_numbers: info.project_numbers,
            created_at: info.created_at,
            snapshot_count: info.snapshot_count,
            latest_taken_at: info.latest_taken_at,
        }
    }
}

impl From<UnreadableWorkspace> for UnreadableView {
    fn from(unreadable: UnreadableWorkspace) -> UnreadableView {
        let error = CommandError::from(unreadable.error);
        UnreadableView {
            file_name: unreadable
                .path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: unreadable.path.to_string_lossy().into_owned(),
            kind: error.kind,
            message: error.message,
        }
    }
}

/// The list view of a store listing; names sort without regard to case, then by id.
pub(super) fn list_view(list: WorkspaceList, folder: &Path) -> WorkspaceListView {
    let mut workspaces: Vec<WorkspaceView> = list.workspaces.into_iter().map(Into::into).collect();
    workspaces.sort_by_cached_key(|w| (w.name.to_lowercase(), w.id.clone()));
    WorkspaceListView {
        workspaces,
        unreadable: list.unreadable.into_iter().map(Into::into).collect(),
        folder: folder.to_string_lossy().into_owned(),
    }
}
