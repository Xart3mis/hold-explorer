//! The commands the interface calls. Each locks the state, calls one method of
//! [`AppState`](crate::app::AppState), and maps the error; the work is in `app`.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::app::{
    AppStart, AppState, CommandError, Settings, Theme, WorkspaceListView, WorkspaceOpen,
    WorkspaceView,
};

/// Runs `work` on a thread of the blocking pool with the state locked, so file access never
/// holds up the window.
async fn blocking<T, F>(app: AppHandle, work: F) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce(&mut AppState) -> Result<T, CommandError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.try_state::<Mutex<AppState>>().ok_or_else(|| {
            CommandError::internal(
                "The application state is not available. Restart Hold Explorer; if it keeps happening, report it.",
            )
        })?;
        let mut guard = state.lock().map_err(|_| poisoned())?;
        work(&mut guard)
    })
    .await
    .map_err(|error| {
        CommandError::internal(format!(
            "A background task failed: {error}. Restart Hold Explorer; if it keeps happening, report it."
        ))
    })?
}

fn poisoned() -> CommandError {
    CommandError::internal(
        "An earlier operation failed part-way, so the application state cannot be trusted. Restart Hold Explorer.",
    )
}

/// Settings, the workspace list, and the workspace that was open last.
#[tauri::command]
pub async fn app_start(app: AppHandle) -> Result<AppStart, CommandError> {
    blocking(app, |state| Ok(state.start())).await
}

/// Sets and saves the theme.
#[tauri::command]
pub fn settings_set_theme(
    state: State<'_, Mutex<AppState>>,
    theme: Theme,
) -> Result<Settings, CommandError> {
    state.lock().map_err(|_| poisoned())?.set_theme(theme)
}

/// The workspaces in the workspace folder.
#[tauri::command]
pub async fn workspace_list(app: AppHandle) -> Result<WorkspaceListView, CommandError> {
    blocking(app, |state| state.list_workspaces()).await
}

/// Creates a workspace and opens it.
#[tauri::command]
pub async fn workspace_create(app: AppHandle, name: String) -> Result<WorkspaceOpen, CommandError> {
    blocking(app, move |state| state.create_workspace(&name)).await
}

/// Opens the workspace with this id.
#[tauri::command]
pub async fn workspace_open(app: AppHandle, id: String) -> Result<WorkspaceOpen, CommandError> {
    blocking(app, move |state| state.open_workspace(&id)).await
}

/// Renames the open workspace.
#[tauri::command]
pub async fn workspace_rename(app: AppHandle, name: String) -> Result<WorkspaceView, CommandError> {
    blocking(app, move |state| state.rename_workspace(&name)).await
}
