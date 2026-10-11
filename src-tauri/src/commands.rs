//! The commands the interface calls. Each locks the state, calls one method of
//! [`AppState`](crate::app::AppState), and maps the error; the work is in `app`.
//!
//! Rule: every command that takes the state lock does so inside the blocking pool (see
//! `blocking`). A synchronous command runs on the main thread, and waiting there for a lock that
//! a workspace operation holds across file work would freeze the window.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::NaiveDateTime;
use hx_core::filter::FilterSpec;
use hx_core::mapping::Field;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

use crate::app::{
    AppStart, AppState, CommandError, ImportCommit, ImportDone, ImportDraft, ImportPhase,
    ImportReview, OverviewView, Settings, TargetCheck, TargetChoice, Theme, WorkspaceListView,
    WorkspaceOpen, WorkspaceView,
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
pub async fn settings_set_theme(app: AppHandle, theme: Theme) -> Result<Settings, CommandError> {
    blocking(app, move |state| state.set_theme(theme)).await
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

/// Opens a file as the import draft.
#[tauri::command]
pub async fn import_open(app: AppHandle, path: PathBuf) -> Result<ImportDraft, CommandError> {
    blocking(app, move |state| state.import_open(&path)).await
}

/// Reads the draft's file again with this sheet as the data sheet.
#[tauri::command]
pub async fn import_choose_sheet(
    app: AppHandle,
    sheet: String,
) -> Result<ImportDraft, CommandError> {
    blocking(app, move |state| state.import_choose_sheet(&sheet)).await
}

/// Parses the draft with the mapping given, or the proposed one.
#[tauri::command]
pub async fn import_review(
    app: AppHandle,
    fields: Option<BTreeMap<Field, usize>>,
) -> Result<ImportReview, CommandError> {
    blocking(app, move |state| state.import_review(fields)).await
}

/// What importing the draft into this target would meet.
#[tauri::command]
pub async fn import_check_target(
    app: AppHandle,
    target: TargetChoice,
    taken_at: NaiveDateTime,
) -> Result<TargetCheck, CommandError> {
    blocking(app, move |state| {
        state.import_check_target(&target, taken_at)
    })
    .await
}

/// Stores the draft as a snapshot, telling the channel how far it has come.
#[tauri::command]
pub async fn import_commit(
    app: AppHandle,
    request: ImportCommit,
    on_progress: Channel<ImportPhase>,
) -> Result<ImportDone, CommandError> {
    blocking(app, move |state| {
        // A phase that cannot be sent only costs the interface a progress step.
        state.import_commit(request, &|phase| {
            let _ = on_progress.send(phase);
        })
    })
    .await
}

/// Drops the draft.
#[tauri::command]
pub async fn import_cancel(app: AppHandle) -> Result<(), CommandError> {
    blocking(app, |state| {
        state.import_cancel();
        Ok(())
    })
    .await
}

/// Selects a snapshot of the open workspace.
#[tauri::command]
pub async fn snapshot_select(app: AppHandle, id: i64) -> Result<WorkspaceOpen, CommandError> {
    blocking(app, move |state| state.select_snapshot(id)).await
}

/// The Overview of the selected snapshot for this filter.
#[tauri::command]
pub async fn overview(
    app: AppHandle,
    spec: FilterSpec,
) -> Result<Option<OverviewView>, CommandError> {
    blocking(app, move |state| state.overview(&spec)).await
}

/// Makes the demo workspace and opens it.
#[tauri::command]
pub async fn demo_create(app: AppHandle) -> Result<WorkspaceOpen, CommandError> {
    blocking(app, |state| state.create_demo()).await
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    const COMMAND_MAP: &str = include_str!("../../ui/src/api/commands.ts");
    const LIB: &str = include_str!("lib.rs");

    /// The keys of `interface CommandMap { ... }`: lines indented by two spaces.
    fn typescript_commands() -> BTreeSet<String> {
        let start = COMMAND_MAP
            .find("interface CommandMap {")
            .expect("commands.ts declares interface CommandMap");
        let body = &COMMAND_MAP[start..];
        let end = body.find("\n}").expect("the interface ends");
        body[..end]
            .lines()
            .skip(1)
            .filter(|line| line.starts_with("  ") && !line.starts_with("   "))
            .filter_map(|line| line.trim().split(':').next())
            .map(str::to_string)
            .collect()
    }

    /// The names inside `generate_handler![ ... ]`, without their module path.
    fn registered_commands() -> BTreeSet<String> {
        let start = LIB
            .find("generate_handler![")
            .expect("lib.rs registers the commands with generate_handler!");
        let body = &LIB[start + "generate_handler![".len()..];
        let end = body.find(']').expect("the list ends");
        body[..end]
            .split(',')
            .map(|name| {
                name.trim()
                    .rsplit("::")
                    .next()
                    .unwrap_or_default()
                    .to_string()
            })
            .filter(|name| !name.is_empty())
            .collect()
    }

    #[test]
    fn the_command_names_match_on_both_sides() {
        let typescript = typescript_commands();
        let registered = registered_commands();
        assert!(
            !typescript.is_empty(),
            "no command names found in commands.ts"
        );
        assert!(!registered.is_empty(), "no command names found in lib.rs");
        let missing_in_rust: Vec<_> = typescript.difference(&registered).collect();
        let missing_in_typescript: Vec<_> = registered.difference(&typescript).collect();
        assert!(
            missing_in_rust.is_empty() && missing_in_typescript.is_empty(),
            "in commands.ts but not registered in lib.rs: {missing_in_rust:?}; \
             registered in lib.rs but missing from commands.ts: {missing_in_typescript:?}"
        );
    }
}
