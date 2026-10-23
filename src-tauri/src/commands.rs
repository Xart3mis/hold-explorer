//! The commands the interface calls. Each locks the state, calls one method of
//! [`AppState`](crate::app::AppState), and maps the error; the work is in `app`.
//!
//! Rule: every command that takes the state lock does so inside the blocking pool (see
//! `blocking`). A synchronous command runs on the main thread, and waiting there for a lock that
//! a workspace operation holds across file work would freeze the window.
//!
//! The commands are generic over the runtime, so the tests invoke them on Tauri's mock runtime
//! with the arguments the interface sends.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::NaiveDateTime;
use hx_core::detail::{BlockerDetail, HoldRef, LineDetail};
use hx_core::filter::{Dim, FilterSpec};
use hx_core::mapping::Field;
use hx_core::query::{FilterLabel, FoldedMatrix, Group, HoldQuery, LinePage, LineQuery, ValuePage};
use hx_core::search::SearchResults;
use hx_core::solve::SolveView;
use hx_export::{write_file, ExportError, ExportRequest, ExportText};
use hx_store::SavedView;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::VERSION;

use crate::app::{
    check_extension, diagnostics, fetch_latest_tag, fonts, save, AppStart, AppState, CommandError,
    Content, CopyFormat, Density, ErrorKind, ExportPhase, ExportSaved, FilterOptions, FolderCheck,
    FolderMoved, GroupDetail, HoldsView, ImportCommit, ImportDone, ImportDraft, ImportPhase,
    ImportReview, OverviewView, SaveFormat, SessionClipboard, Settings, TargetCheck, TargetChoice,
    Theme, UpdateNotice, UpdateStep, ViewRef, WorkspaceListView, WorkspaceOpen, WorkspaceView,
    Writes,
};

/// Runs `work` on a thread of the blocking pool with the state locked, so file access never
/// holds up the window.
async fn blocking<R, T, F>(app: AppHandle<R>, work: F) -> Result<T, CommandError>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&mut AppState) -> Result<T, CommandError> + Send + 'static,
{
    locked(app, false, work).await
}

/// [`blocking`]. When `starts_over`, `work` rebuilds the state itself, so a workspace that
/// cannot be reopened after a panic is not its answer: `work` finds out about it on its own.
async fn locked<R, T, F>(app: AppHandle<R>, starts_over: bool, work: F) -> Result<T, CommandError>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&mut AppState) -> Result<T, CommandError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.try_state::<Mutex<AppState>>().ok_or_else(|| {
            CommandError::internal(
                "The application state is not available. Restart Hold Explorer; if it keeps happening, report it.",
            )
        })?;
        let mut guard = match state.lock() {
            Ok(guard) => guard,
            // A command panicked while it held the state: its work was cut short, so the state
            // is put right from the workspace file before this command runs.
            Err(poisoned) => {
                let mut guard = poisoned.into_inner();
                state.clear_poison();
                let recovered = guard.recover();
                if !starts_over {
                    recovered?;
                }
                guard
            }
        };
        work(&mut guard)
    })
    .await
    .map_err(task_failed)?
}

/// Runs `work` on a thread of the blocking pool without the state lock: the writing of a file
/// or of the clipboard, so that every other command answers meanwhile.
async fn unlocked<T, F>(work: F) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, CommandError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(task_failed)?
}

/// What a command answers when its work panicked or was cancelled. The next command that takes
/// the state puts it right (see `blocking`), so no restart is needed.
fn task_failed(_: tauri::Error) -> CommandError {
    CommandError::internal(
        "An operation failed part-way, so what it was doing may not have been saved. Check, then try again; if it happens again, report it.",
    )
}

/// Settings, the workspace list, and the workspace that was open last.
#[tauri::command]
pub async fn app_start<R: Runtime>(app: AppHandle<R>) -> Result<AppStart, CommandError> {
    // The start rebuilds the state, and lists a last workspace it cannot read.
    locked(app, true, |state| Ok(state.start())).await
}

/// Sets and saves the theme.
#[tauri::command]
pub async fn settings_set_theme<R: Runtime>(
    app: AppHandle<R>,
    theme: Theme,
) -> Result<Settings, CommandError> {
    blocking(app, move |state| state.set_theme(theme)).await
}

/// Sets and saves the density.
#[tauri::command]
pub async fn settings_set_density<R: Runtime>(
    app: AppHandle<R>,
    density: Density,
) -> Result<Settings, CommandError> {
    blocking(app, move |state| state.set_density(density)).await
}

/// Sets and saves the name notes are signed with.
#[tauri::command]
pub async fn settings_set_author_name<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<Settings, CommandError> {
    blocking(app, move |state| state.set_author_name(&name)).await
}

/// Sets and saves whether a newer release is looked for at start.
#[tauri::command]
pub async fn settings_set_update_check<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> Result<Settings, CommandError> {
    blocking(app, move |state| state.set_update_check(enabled)).await
}

/// Checks a folder to keep the workspaces in, and names the workspace files a move would take.
#[tauri::command]
pub async fn check_workspace_folder<R: Runtime>(
    app: AppHandle<R>,
    path: Option<String>,
) -> Result<FolderCheck, CommandError> {
    blocking(app, move |state| {
        state.check_workspace_folder(path.as_deref())
    })
    .await
}

/// Keeps the workspaces in another folder (`None`: the default one), moving the workspace files
/// there when asked to.
#[tauri::command]
pub async fn set_workspace_folder<R: Runtime>(
    app: AppHandle<R>,
    path: Option<String>,
    move_files: bool,
) -> Result<FolderMoved, CommandError> {
    // The change closes the workspace and reopens it, so it rebuilds the state itself.
    locked(app, true, move |state| {
        state.set_workspace_folder(path.as_deref(), move_files)
    })
    .await
}

/// The workspaces in the workspace folder.
#[tauri::command]
pub async fn workspace_list<R: Runtime>(
    app: AppHandle<R>,
) -> Result<WorkspaceListView, CommandError> {
    blocking(app, |state| state.list_workspaces()).await
}

/// Creates a workspace and opens it.
#[tauri::command]
pub async fn workspace_create<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<WorkspaceOpen, CommandError> {
    blocking(app, move |state| state.create_workspace(&name)).await
}

/// Opens the workspace with this id.
#[tauri::command]
pub async fn workspace_open<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<WorkspaceOpen, CommandError> {
    blocking(app, move |state| state.open_workspace(&id)).await
}

/// Renames the open workspace.
#[tauri::command]
pub async fn workspace_rename<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<WorkspaceView, CommandError> {
    blocking(app, move |state| state.rename_workspace(&name)).await
}

/// Saves the screen in view under a name, last in the list of saved views.
#[tauri::command]
pub async fn save_view<R: Runtime>(
    app: AppHandle<R>,
    workspace: String,
    name: String,
    address: String,
    filters: FilterSpec,
) -> Result<Vec<SavedView>, CommandError> {
    blocking(app, move |state| {
        state.save_view(&workspace, &name, &address, filters)
    })
    .await
}

/// Renames a saved view.
#[tauri::command]
pub async fn rename_view<R: Runtime>(
    app: AppHandle<R>,
    workspace: String,
    id: i64,
    name: String,
) -> Result<Vec<SavedView>, CommandError> {
    blocking(app, move |state| state.rename_view(&workspace, id, &name)).await
}

/// Deletes a saved view.
#[tauri::command]
pub async fn delete_view<R: Runtime>(
    app: AppHandle<R>,
    workspace: String,
    id: i64,
) -> Result<Vec<SavedView>, CommandError> {
    blocking(app, move |state| state.delete_view(&workspace, id)).await
}

/// Puts a deleted saved view back, with its id, at an index of the list.
#[tauri::command]
pub async fn restore_view<R: Runtime>(
    app: AppHandle<R>,
    workspace: String,
    view: SavedView,
    index: usize,
) -> Result<Vec<SavedView>, CommandError> {
    blocking(app, move |state| {
        state.restore_view(&workspace, view, index)
    })
    .await
}

/// Moves a saved view to an index of the list. The index counts in the list as it is after the
/// view is taken out of it; an index past the end puts the view last.
#[tauri::command]
pub async fn move_view<R: Runtime>(
    app: AppHandle<R>,
    workspace: String,
    id: i64,
    index: usize,
) -> Result<Vec<SavedView>, CommandError> {
    blocking(app, move |state| state.move_view(&workspace, id, index)).await
}

/// Opens a file as the import draft.
#[tauri::command]
pub async fn import_open<R: Runtime>(
    app: AppHandle<R>,
    path: PathBuf,
) -> Result<ImportDraft, CommandError> {
    blocking(app, move |state| state.import_open(&path)).await
}

/// Reads the draft's file again with this sheet as the data sheet.
#[tauri::command]
pub async fn import_choose_sheet<R: Runtime>(
    app: AppHandle<R>,
    sheet: String,
) -> Result<ImportDraft, CommandError> {
    blocking(app, move |state| state.import_choose_sheet(&sheet)).await
}

/// Parses the draft with the mapping given, or the proposed one.
#[tauri::command]
pub async fn import_review<R: Runtime>(
    app: AppHandle<R>,
    fields: Option<BTreeMap<Field, usize>>,
) -> Result<ImportReview, CommandError> {
    blocking(app, move |state| state.import_review(fields)).await
}

/// What importing the draft into this target would meet.
#[tauri::command]
pub async fn import_check_target<R: Runtime>(
    app: AppHandle<R>,
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
pub async fn import_commit<R: Runtime>(
    app: AppHandle<R>,
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

/// Drops the draft of the file with this content hash, or of any file with `None`.
#[tauri::command]
pub async fn import_cancel<R: Runtime>(
    app: AppHandle<R>,
    content_hash: Option<String>,
) -> Result<(), CommandError> {
    blocking(app, move |state| {
        state.import_cancel(content_hash.as_deref());
        Ok(())
    })
    .await
}

/// Selects a snapshot of the open workspace.
#[tauri::command]
pub async fn snapshot_select<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> Result<WorkspaceOpen, CommandError> {
    blocking(app, move |state| state.select_snapshot(id)).await
}

/// The Overview of the selected snapshot for this filter, when `view` is the view in the state.
#[tauri::command]
pub async fn overview<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    view: ViewRef,
) -> Result<Option<OverviewView>, CommandError> {
    blocking(app, move |state| state.overview(&spec, &view)).await
}

/// The options of the filter bar for this filter, when `view` is the view in the state.
#[tauri::command]
pub async fn filter_options<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    view: ViewRef,
) -> Result<FilterOptions, CommandError> {
    blocking(app, move |state| state.filter_options(&spec, &view)).await
}

/// The label of every value of `spec`'s field entries, as the picker labels it, when `view` is
/// the view in the state.
#[tauri::command]
pub async fn filter_labels<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    view: ViewRef,
) -> Result<Vec<FilterLabel>, CommandError> {
    blocking(app, move |state| state.filter_labels(&spec, &view)).await
}

/// The values of one dimension a picker offers, when `view` is the view in the state.
#[tauri::command]
pub async fn filter_values<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    dim: Dim,
    search: String,
    view: ViewRef,
) -> Result<ValuePage, CommandError> {
    blocking(app, move |state| {
        state.filter_values(&spec, &dim, &search, &view)
    })
    .await
}

/// What `query` finds in the snapshot in view, when `view` is the view in the state.
#[tauri::command]
pub async fn search<R: Runtime>(
    app: AppHandle<R>,
    view: ViewRef,
    query: String,
) -> Result<SearchResults, CommandError> {
    blocking(app, move |state| state.search(&query, &view)).await
}

/// A page of Lines, when `view` is the view in the state.
#[tauri::command]
pub async fn lines<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    query: LineQuery,
    offset: usize,
    view: ViewRef,
) -> Result<LinePage, CommandError> {
    blocking(app, move |state| state.lines(&spec, &query, offset, &view)).await
}

/// A page of Holds, when `view` is the view in the state.
#[tauri::command]
pub async fn holds<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    query: HoldQuery,
    view: ViewRef,
) -> Result<HoldsView, CommandError> {
    blocking(app, move |state| state.holds(&spec, &query, &view)).await
}

/// The detail of one Line, when `view` is the view in the state.
#[tauri::command]
pub async fn line_detail<R: Runtime>(
    app: AppHandle<R>,
    line_id: String,
    view: ViewRef,
) -> Result<Option<LineDetail>, CommandError> {
    blocking(app, move |state| state.line_detail(&line_id, &view)).await
}

/// The detail of one Hold, when `view` is the view in the state.
#[tauri::command]
pub async fn hold_detail<R: Runtime>(
    app: AppHandle<R>,
    position: usize,
    view: ViewRef,
) -> Result<Option<HoldRef>, CommandError> {
    blocking(app, move |state| state.hold_detail(position, &view)).await
}

/// The kept holds grouped by one dimension, when `view` is the view in the state.
#[tauri::command]
pub async fn breakdown<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    dim: Dim,
    view: ViewRef,
) -> Result<Vec<Group>, CommandError> {
    blocking(app, move |state| state.breakdown(&spec, &dim, &view)).await
}

/// The kept holds crossed by two dimensions, when `view` is the view in the state.
#[tauri::command]
pub async fn matrix<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    row_dim: Dim,
    col_dim: Dim,
    view: ViewRef,
) -> Result<FoldedMatrix, CommandError> {
    blocking(app, move |state| {
        state.matrix(&spec, &row_dim, &col_dim, &view)
    })
    .await
}

/// The solve order of the open holds among the kept ones, when `view` is the view in the state.
#[tauri::command]
pub async fn solve_order<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    view: ViewRef,
) -> Result<SolveView, CommandError> {
    blocking(app, move |state| state.solve_order(&spec, &view)).await
}

/// The detail of one blocker, when `view` is the view in the state.
#[tauri::command]
pub async fn blocker_detail<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    key: String,
    view: ViewRef,
) -> Result<Option<BlockerDetail>, CommandError> {
    blocking(app, move |state| state.blocker_detail(&spec, &key, &view)).await
}

/// One group of a dimension with its first Lines, when `view` is the view in the state.
#[tauri::command]
pub async fn group_detail<R: Runtime>(
    app: AppHandle<R>,
    spec: FilterSpec,
    dim: Dim,
    key: String,
    view: ViewRef,
) -> Result<Option<GroupDetail>, CommandError> {
    blocking(app, move |state| {
        state.group_detail(&spec, &dim, &key, &view)
    })
    .await
}

/// The open workspace with the snapshot that is selected; nothing changes.
#[tauri::command]
pub async fn workspace_current<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<WorkspaceOpen>, CommandError> {
    blocking(app, |state| state.current()).await
}

/// Makes the demo workspace and opens it.
#[tauri::command]
pub async fn demo_create<R: Runtime>(app: AppHandle<R>) -> Result<WorkspaceOpen, CommandError> {
    blocking(app, |state| state.create_demo()).await
}

/// Saves an export of the view to `path`, telling the channel how far it has come: what the file
/// holds is gathered with the state locked, and the file is written with the state free.
#[tauri::command]
pub async fn export_save<R: Runtime>(
    app: AppHandle<R>,
    request: ExportRequest,
    format: SaveFormat,
    path: PathBuf,
    view: ViewRef,
    on_progress: Channel<ExportPhase>,
) -> Result<ExportSaved, CommandError> {
    save_with(app, request, format, path, view, on_progress, write_file).await
}

/// [`export_save`] with the function that writes the file.
async fn save_with<R, W>(
    app: AppHandle<R>,
    request: ExportRequest,
    format: SaveFormat,
    path: PathBuf,
    view: ViewRef,
    on_progress: Channel<ExportPhase>,
    write: W,
) -> Result<ExportSaved, CommandError>
where
    R: Runtime,
    W: Fn(&Path, &[u8]) -> Result<(), ExportError> + Send + 'static,
{
    // The whole save is counted, the file written with the state free included: a close of the
    // window waits until the file is whole and recorded.
    let writes = app.try_state::<Arc<Writes>>().map(|writes| Arc::clone(&writes)).ok_or_else(|| {
        CommandError::internal(
            "The count of the writes in progress is not available. Restart Hold Explorer; if it keeps happening, report it.",
        )
    })?;
    let _write = writes.begin();
    // A name of another kind is refused before anything is read.
    check_extension(&format, &path)?;
    // A phase that cannot be sent only costs the interface a progress step.
    let _ = on_progress.send(ExportPhase::Reading);
    let text = request.text.clone();
    let asked = format.clone();
    let content = blocking(app.clone(), move |state| {
        state.export_content(&request, &asked, &view)
    })
    .await?;
    let _ = on_progress.send(ExportPhase::Writing);
    let target = path.clone();
    let saved = unlocked(move || save(content, &format, &target, &text, fonts(), &write)).await?;
    // The file is saved whatever happens now. Should the path fail to be recorded (only a state
    // left untrustworthy by an earlier panic does that), the command still answers the saved
    // file: only "Open file" refuses it then, with `NotWritten`, and the user opens it from its
    // folder.
    let _recorded = blocking(app, move |state| {
        state.wrote(path);
        Ok(())
    })
    .await;
    Ok(saved)
}

/// Copies an export of the view to the system's clipboard: what it holds is gathered with the
/// state locked, and the clipboard is set with the state free.
#[tauri::command]
pub async fn export_copy<R: Runtime>(
    app: AppHandle<R>,
    request: ExportRequest,
    format: CopyFormat,
    view: ViewRef,
) -> Result<(), CommandError> {
    let session = app.clone();
    copy_with(app, request, format, view, move |content, text| {
        let clipboard = session.try_state::<SessionClipboard>().ok_or_else(|| {
            CommandError::internal(
                "The clipboard of the application is not available. Restart Hold Explorer; if it keeps happening, report it.",
            )
        })?;
        clipboard.copy(content, text, fonts())
    })
    .await
}

/// [`export_copy`] with the function that puts the content on the clipboard.
async fn copy_with<R, P>(
    app: AppHandle<R>,
    request: ExportRequest,
    format: CopyFormat,
    view: ViewRef,
    put: P,
) -> Result<(), CommandError>
where
    R: Runtime,
    P: FnOnce(Content, &ExportText) -> Result<(), CommandError> + Send + 'static,
{
    let text = request.text.clone();
    let content = blocking(app, move |state| {
        state.copy_content(&request, &format, &view)
    })
    .await?;
    unlocked(move || put(content, &text)).await
}

/// Builds the diagnostics text with the state locked, copies it to the system's clipboard with
/// the state free, and returns it.
#[tauri::command]
pub async fn diagnostics_copy<R: Runtime>(app: AppHandle<R>) -> Result<String, CommandError> {
    let session = app.clone();
    diagnostics_with(app, move |text| {
        let clipboard = session.try_state::<SessionClipboard>().ok_or_else(|| {
            CommandError::internal(
                "The clipboard of the application is not available. Restart Hold Explorer; if it keeps happening, report it.",
            )
        })?;
        clipboard.copy(
            Content::Text(text.to_string()),
            &ExportText::default(),
            fonts(),
        )
    })
    .await
}

/// [`diagnostics_copy`] with the function that puts the text on the clipboard.
async fn diagnostics_with<R, P>(app: AppHandle<R>, put: P) -> Result<String, CommandError>
where
    R: Runtime,
    P: FnOnce(&str) -> Result<(), CommandError> + Send + 'static,
{
    let webview = tauri::webview_version().ok();
    let text = blocking(app, move |state| {
        let local_data = state.local_data_dir().to_path_buf();
        Ok(diagnostics(state, &local_data, webview.as_deref()))
    })
    .await?;
    let copied = text.clone();
    unlocked(move || put(&copied)).await?;
    Ok(text)
}

/// Opens a file the app saved in this session with the system's program for it.
#[tauri::command]
pub async fn export_open<R: Runtime>(app: AppHandle<R>, path: PathBuf) -> Result<(), CommandError> {
    let asked = path.clone();
    blocking(app.clone(), move |state| state.openable(&asked)).await?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| cannot_open(&path, &error))
}

/// What a file the system could not open means to the user.
fn cannot_open(path: &Path, error: &tauri_plugin_opener::Error) -> CommandError {
    let file = path.file_name().map_or_else(
        || path.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    CommandError::new(
        ErrorKind::Open,
        format!(
            "Hold Explorer could not open {file}: {error}. The system may have no program for this kind of file; open it from its folder."
        ),
    )
}

/// Looks for a newer release, when a check is due: the attempt is saved under the lock, the
/// request runs with the state free, and a newer version that was not skipped is the answer.
/// When none is due, the version this session offered is the answer again, so a window that is
/// loaded again keeps the notice.
/// The check is silent: whatever fails, the answer is `None`.
#[tauri::command]
pub async fn update_check<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<UpdateNotice>, CommandError> {
    let now = chrono::Utc::now();
    let step = blocking(
        app.clone(),
        move |state| Ok(state.update_step(now, VERSION)),
    )
    .await;
    let url = match step {
        Ok(UpdateStep::Ask(url)) => url,
        Ok(UpdateStep::Answer(notice)) => return Ok(notice),
        Err(_) => return Ok(None),
    };
    let Ok(Ok(tag)) = unlocked(move || Ok(fetch_latest_tag(&url, VERSION))).await else {
        return Ok(None);
    };
    let offered = blocking(app, move |state| Ok(state.update_offer(&tag, VERSION))).await;
    Ok(offered.unwrap_or(None))
}

/// Saves a version the user chose to skip: it is not offered again, a newer one is.
#[tauri::command]
pub async fn update_skip<R: Runtime>(
    app: AppHandle<R>,
    version: String,
) -> Result<Settings, CommandError> {
    blocking(app, move |state| state.skip_version(&version)).await
}

/// Opens the release page of the version this session's update check offered, in the system's
/// browser. Any other version is refused with `NotOffered`.
#[tauri::command]
pub async fn open_release_page<R: Runtime>(
    app: AppHandle<R>,
    version: String,
) -> Result<(), CommandError> {
    let url = blocking(app.clone(), move |state| state.release_page(&version)).await?;
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|error| {
            CommandError::new(
                ErrorKind::Open,
                format!(
                    "Hold Explorer could not open the release page {url}: {error}. Open it in your browser by hand."
                ),
            )
        })
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::Mutex;

    use serde_json::{json, Value};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::webview::InvokeRequest;
    use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};
    use tempfile::TempDir;

    use crate::app::{AppState, CommandError, ErrorKind, ExportPhase};

    const COMMAND_MAP: &str = include_str!("../../ui/src/api/commands.ts");
    const LIB: &str = include_str!("lib.rs");
    const COMMANDS: &str = include_str!("commands.rs");
    /// For every command, one arguments object exactly as the interface sends it. The interface
    /// tests call every function of its `api` with the same values and compare what leaves.
    const COMMAND_ARGS: &str = include_str!("../../ui/src/api/command-args.json");

    /// The arguments of the fixture, by command name.
    fn command_args() -> BTreeMap<String, Value> {
        serde_json::from_str(COMMAND_ARGS).expect("command-args.json is an object of objects")
    }

    /// The application on Tauri's mock runtime, with the commands `run` registers and a state
    /// that keeps its files under `dir`.
    struct Harness {
        _dir: TempDir,
        app: tauri::App<MockRuntime>,
        window: WebviewWindow<MockRuntime>,
    }

    impl Harness {
        fn new() -> Harness {
            let dir = TempDir::new().unwrap();
            let state = AppState::new(
                dir.path().join("config"),
                dir.path().join("data"),
                dir.path().join("local"),
            );
            let writes = state.writes();
            let app = mock_builder()
                .manage(writes)
                .manage(Mutex::new(state))
                .manage(crate::app::SessionClipboard::default())
                .invoke_handler(crate::handler())
                .build(mock_context(noop_assets()))
                .expect("the application builds on the mock runtime");
            let window = WebviewWindowBuilder::new(&app, "main", Default::default())
                .build()
                .expect("the mock runtime makes a window");
            Harness {
                _dir: dir,
                app,
                window,
            }
        }

        /// Invokes a command as the page does, with its arguments as JSON, and waits for the
        /// answer: what the command returned, or what it failed with.
        fn invoke(&self, command: &str, args: &Value) -> Result<Value, Value> {
            let origin = if cfg!(windows) {
                "http://tauri.localhost"
            } else {
                "tauri://localhost"
            };
            let request = InvokeRequest {
                cmd: command.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: origin
                    .parse()
                    .expect("the origin of the page is an address"),
                body: InvokeBody::Json(args.clone()),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            };
            get_ipc_response(&self.window, request).map(|body| {
                body.deserialize::<Value>()
                    .expect("the answer of a command is JSON")
            })
        }

        /// "Ok" for an answer, or the kind of the `CommandError` the command failed with. Fails
        /// the test when the failure is not a `CommandError`: Tauri answers arguments it cannot
        /// read, and a command it does not know, with a plain text.
        fn outcome(&self, command: &str, args: &Value) -> String {
            match self.invoke(command, args) {
                Ok(_) => "Ok".to_string(),
                Err(error) => match (error["kind"].as_str(), error["message"].as_str()) {
                    (Some(kind), Some(_)) => kind.to_string(),
                    _ => panic!(
                        "{command} did not fail with a kind and a message, but with: {error}"
                    ),
                },
            }
        }
    }

    #[test]
    fn the_fixture_of_arguments_names_exactly_the_registered_commands() {
        let fixture: BTreeSet<String> = command_args().into_keys().collect();
        assert_eq!(fixture, registered_commands());
    }

    #[test]
    fn diagnostics_copy_builds_unlocked_and_returns_what_it_copied() {
        let harness = Harness::new();
        let app = harness.app.handle().clone();
        let seen = std::sync::Arc::new(Mutex::new(None));
        let put = {
            let app = app.clone();
            let seen = seen.clone();
            move |text: &str| {
                // The clipboard is set with the state free.
                let state = app.state::<Mutex<AppState>>();
                assert!(
                    state.try_lock().is_ok(),
                    "the state was locked while copying"
                );
                *seen.lock().unwrap() = Some(text.to_string());
                Ok(())
            }
        };
        let returned = tauri::async_runtime::block_on(super::diagnostics_with(app, put)).unwrap();
        assert!(returned.starts_with("Version: "), "{returned}");
        assert_eq!(seen.lock().unwrap().as_deref(), Some(returned.as_str()));
    }

    #[test]
    fn diagnostics_copy_reports_a_clipboard_that_failed() {
        let harness = Harness::new();
        let put = |_: &str| {
            Err(CommandError::new(
                ErrorKind::Clipboard,
                "The clipboard refused the text.",
            ))
        };
        let error = tauri::async_runtime::block_on(super::diagnostics_with(
            harness.app.handle().clone(),
            put,
        ))
        .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Clipboard);
    }

    #[test]
    fn every_command_reads_the_arguments_the_interface_sends() {
        let harness = Harness::new();
        // In the order of their names. Nothing is open at first; the demo then opens a workspace
        // with four snapshots, and `workspace_create` an empty one.
        // `diagnostics_copy` takes no arguments and would set the clipboard of the machine that
        // runs the tests; `diagnostics_copy_builds_unlocked_and_returns_what_it_copied` runs it
        // with a clipboard of its own.
        // The substitutes of the dialogs exist in the `e2e` build only; their tests are below.
        let outcomes: Vec<(String, String)> = command_args()
            .iter()
            .filter(|(command, _)| command.as_str() != "diagnostics_copy")
            .filter(|(command, _)| !command.starts_with("e2e_"))
            .map(|(command, args)| (command.clone(), harness.outcome(command, args)))
            .collect();
        let outcomes: Vec<(&str, &str)> = outcomes
            .iter()
            .map(|(command, outcome)| (command.as_str(), outcome.as_str()))
            .collect();
        assert_eq!(
            outcomes,
            [
                ("app_start", "Ok"),
                // Nothing is open yet.
                ("blocker_detail", "NoWorkspace"),
                ("breakdown", "NoWorkspace"),
                // The folder of the fixture is not a full path.
                ("check_workspace_folder", "FolderNotAbsolute"),
                // Nothing is open yet.
                ("delete_view", "NoWorkspace"),
                ("demo_create", "Ok"),
                // The view of the fixture is not the demo workspace.
                ("export_copy", "ViewChanged"),
                // The app wrote no file yet.
                ("export_open", "NotWritten"),
                ("export_save", "ViewChanged"),
                ("filter_labels", "ViewChanged"),
                ("filter_options", "ViewChanged"),
                ("filter_values", "ViewChanged"),
                ("group_detail", "ViewChanged"),
                ("hold_detail", "ViewChanged"),
                ("holds", "ViewChanged"),
                ("import_cancel", "Ok"),
                // No file is open for import: the three steps that need one say so, which they
                // can only do once their arguments were read.
                ("import_check_target", "NoDraft"),
                ("import_choose_sheet", "NoDraft"),
                ("import_commit", "NoDraft"),
                // The file of the fixture does not exist.
                ("import_open", "NotFound"),
                ("import_review", "NoDraft"),
                ("line_detail", "ViewChanged"),
                ("lines", "ViewChanged"),
                ("matrix", "ViewChanged"),
                // The workspace of the fixture is not the open one.
                ("move_view", "ViewChanged"),
                // No update check offered a version yet.
                ("open_release_page", "NotOffered"),
                ("overview", "ViewChanged"),
                ("rename_view", "ViewChanged"),
                ("restore_view", "ViewChanged"),
                ("save_view", "ViewChanged"),
                ("search", "ViewChanged"),
                // The folder of the fixture is not a full path.
                ("set_workspace_folder", "FolderNotAbsolute"),
                ("settings_set_author_name", "Ok"),
                ("settings_set_density", "Ok"),
                ("settings_set_theme", "Ok"),
                ("settings_set_update_check", "Ok"),
                // Without `HX_SMOKE=1` it does nothing, and the tests go on running.
                ("smoke_ready", "Ok"),
                // The demo workspace has a snapshot 2.
                ("snapshot_select", "Ok"),
                ("solve_order", "ViewChanged"),
                // Turned off above, so nothing is asked.
                ("update_check", "Ok"),
                // No check offered the version.
                ("update_skip", "NotOffered"),
                ("workspace_create", "Ok"),
                ("workspace_current", "Ok"),
                ("workspace_list", "Ok"),
                // The workspace of the fixture is not in the folder.
                ("workspace_open", "WorkspaceNotFound"),
                ("workspace_rename", "Ok"),
            ]
        );

        // The arguments arrived as values, not only as shapes.
        let state = harness.app.state::<Mutex<AppState>>();
        let state = state.lock().unwrap();
        assert_eq!(state.settings().theme, crate::app::Theme::Light);
        assert!(!state.settings().update_check);
        assert_eq!(state.settings().skipped_version, None);
    }

    /// Points the update check of the harness at `url`.
    fn ask_updates_at(harness: &Harness, url: String) {
        let state = harness.app.state::<Mutex<AppState>>();
        state.lock().unwrap().set_update_url(url);
    }

    /// A listener on 127.0.0.1 that accepts nothing by itself, and the address of the check on it.
    fn silent_server() -> (TcpListener, String) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/releases/latest", listener.local_addr().unwrap());
        (listener, url)
    }

    /// Whether anything connected to the listener of `silent_server`.
    fn was_asked(listener: &TcpListener) -> bool {
        match listener.accept() {
            Ok(_) => true,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => false,
            Err(error) => panic!("the listener failed: {error}"),
        }
    }

    #[test]
    fn update_check_asks_with_the_state_free_and_answers_a_newer_version() {
        let harness = Harness::new();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        ask_updates_at(
            &harness,
            format!("http://{}/releases/latest", listener.local_addr().unwrap()),
        );
        let app = harness.app.handle().clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap() > 2 {
                line.clear();
            }
            // The request is made with the state free, and the attempt was saved before it.
            let state = app.state::<Mutex<AppState>>();
            let free = state
                .try_lock()
                .is_ok_and(|state| state.settings().update_checked_at.is_some());
            let body = r#"{"tag_name":"v99.0.0"}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
            free
        });
        let answer = harness.invoke("update_check", &json!({})).unwrap();
        assert_eq!(answer, json!({ "version": "99.0.0" }));
        assert!(server.join().unwrap(), "the state was locked while asking");
        // The version the check returned is the one whose page may be opened.
        let state = harness.app.state::<Mutex<AppState>>();
        let page = state.lock().unwrap().release_page("99.0.0").unwrap();
        assert_eq!(
            page,
            "https://github.com/Xart3mis/hold-explorer/releases/tag/v99.0.0"
        );
    }

    #[test]
    fn a_reload_hears_the_offer_of_this_session_again_without_asking() {
        let harness = Harness::new();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        ask_updates_at(
            &harness,
            format!("http://{}/releases/latest", listener.local_addr().unwrap()),
        );
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap() > 2 {
                line.clear();
            }
            let body = r#"{"tag_name":"v99.0.0"}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        });
        let offer = json!({ "version": "99.0.0" });
        assert_eq!(
            harness.invoke("update_check", &json!({})),
            Ok(offer.clone())
        );
        server.join().unwrap();
        let (listener, url) = silent_server();
        ask_updates_at(&harness, url);
        assert_eq!(harness.invoke("update_check", &json!({})), Ok(offer));
        assert!(!was_asked(&listener));
        harness
            .invoke("update_skip", &json!({ "version": "99.0.0" }))
            .unwrap();
        assert_eq!(harness.invoke("update_check", &json!({})), Ok(Value::Null));
        assert!(!was_asked(&listener));
    }

    #[test]
    fn update_check_reads_the_one_version_of_the_app() {
        let start = COMMANDS
            .find("pub async fn update_check")
            .expect("commands.rs has update_check");
        let body = &COMMANDS[start..];
        let body = &body[..body.find("\n}\n").expect("the function ends")];
        assert!(!body.contains("env!("), "{body}");
        assert!(body.contains("VERSION"), "{body}");
    }

    #[test]
    fn update_check_answers_none_when_it_fails() {
        let harness = Harness::new();
        // The address of the tests' state is no address at all.
        assert_eq!(harness.invoke("update_check", &json!({})), Ok(Value::Null));
        // A server that refuses.
        let harness = Harness::new();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        ask_updates_at(
            &harness,
            format!("http://{}/releases/latest", listener.local_addr().unwrap()),
        );
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap() > 2 {
                line.clear();
            }
            stream
                .write_all(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .unwrap();
        });
        assert_eq!(harness.invoke("update_check", &json!({})), Ok(Value::Null));
        server.join().unwrap();
    }

    #[test]
    fn update_check_answers_none_without_asking_when_not_due_or_off() {
        // Not due: the attempt before was a moment ago, and failed.
        let harness = Harness::new();
        assert_eq!(harness.invoke("update_check", &json!({})), Ok(Value::Null));
        let (listener, url) = silent_server();
        ask_updates_at(&harness, url);
        assert_eq!(harness.invoke("update_check", &json!({})), Ok(Value::Null));
        assert!(!was_asked(&listener));
        // Off.
        let harness = Harness::new();
        let (listener, url) = silent_server();
        ask_updates_at(&harness, url);
        let settings = harness
            .invoke("settings_set_update_check", &json!({ "enabled": false }))
            .unwrap();
        assert_eq!(settings["update_check"], json!(false));
        assert_eq!(harness.invoke("update_check", &json!({})), Ok(Value::Null));
        assert!(!was_asked(&listener));
    }

    #[test]
    fn open_release_page_refuses_a_version_no_check_offered() {
        let harness = Harness::new();
        assert_eq!(
            harness.outcome("open_release_page", &json!({ "version": "0.2.0" })),
            "NotOffered"
        );
    }

    #[test]
    fn the_view_commands_read_their_arguments_and_act_on_the_open_workspace() {
        let harness = Harness::new();
        let args = command_args();
        let open = harness.invoke("demo_create", &args["demo_create"]).unwrap();
        let workspace = open["workspace"]["id"].as_str().unwrap().to_string();
        assert_eq!(open["views"], serde_json::json!([]));

        // Ids 1 and 2 are issued first, so that the fixture's id 3 is one that was.
        for (n, name) in ["One", "Two"].into_iter().enumerate() {
            let mut filler = args["save_view"].clone();
            filler["workspace"] = workspace.clone().into();
            filler["name"] = name.into();
            let listed = harness.invoke("save_view", &filler).unwrap();
            assert_eq!(listed[n]["id"], n + 1);
        }
        let mut save = args["save_view"].clone();
        save["workspace"] = workspace.clone().into();
        let saved = harness.invoke("save_view", &save).unwrap();
        assert_eq!(saved[2]["id"], 3);
        assert_eq!(saved[2]["name"], "Old valve holds");
        assert_eq!(saved[2]["address"], "/lines?mode=holds&sort=age");
        assert_eq!(saved[2]["filters"]["text"], "valve");

        let rename = serde_json::json!({"workspace": workspace, "id": 3, "name": "Stale"});
        let renamed = harness.invoke("rename_view", &rename).unwrap();
        assert_eq!(renamed[2]["name"], "Stale");

        let delete = serde_json::json!({"workspace": workspace, "id": 3});
        assert_eq!(
            harness
                .invoke("delete_view", &delete)
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let mut restore = args["restore_view"].clone();
        restore["workspace"] = workspace.clone().into();
        let restored = harness.invoke("restore_view", &restore).unwrap();
        assert_eq!(restored[1]["id"], 3);
        let moved = harness
            .invoke(
                "move_view",
                &serde_json::json!({"workspace": workspace, "id": 3, "index": 0}),
            )
            .unwrap();
        assert_eq!(moved[0]["id"], 3);

        // A refusal arrives with its kind.
        let error = harness.invoke("save_view", &save).unwrap_err();
        assert_eq!(error["kind"], "ViewNameTaken");
    }

    #[test]
    fn import_cancel_reads_a_content_hash_of_null() {
        // The interface sends `contentHash: null` to drop whatever draft is open; the fixture
        // holds only the string form.
        let harness = Harness::new();
        assert_eq!(
            harness.outcome("import_cancel", &serde_json::json!({ "contentHash": null })),
            "Ok"
        );
    }

    #[test]
    fn every_key_the_interface_sends_is_an_argument_the_command_reads() {
        // Tauri reads a key that is absent as `None` when the argument is optional, and passes
        // over a key no argument has. So were `fields` of `import_review` named otherwise on one
        // side, the command would still answer, with the user's mapping dropped, and the test
        // above would not see it. Here every key of the fixture in turn carries a value that no
        // argument type accepts: only a command that reads the key can object to it, and Tauri
        // then names the key.
        let harness = Harness::new();
        let unreadable = serde_json::json!([[]]);
        let mut tried = 0;
        for (command, args) in command_args()
            .into_iter()
            .filter(|(command, _)| in_this_build(command))
        {
            let entry = args
                .as_object()
                .unwrap_or_else(|| panic!("the arguments of {command} are an object"));
            for key in entry.keys() {
                let mut spoiled = entry.clone();
                spoiled.insert(key.clone(), unreadable.clone());
                let answer = harness.invoke(&command, &Value::Object(spoiled));
                let expected = format!("invalid args `{key}` for command `{command}`");
                match &answer {
                    Err(Value::String(text)) if text.starts_with(&expected) => tried += 1,
                    _ => panic!(
                        "{command} does not read the key `{key}` the interface sends: with a \
                         value no argument accepts under it, the answer was {answer:?}"
                    ),
                }
            }
        }
        // A fixture without a key would prove nothing.
        assert!(tried > 0, "the fixture holds no argument");
    }

    /// Whether this build registers `command`: the substitutes of the dialogs are registered by
    /// the `e2e` build only.
    fn in_this_build(command: &str) -> bool {
        cfg!(feature = "e2e") || !command.starts_with("e2e_")
    }

    #[test]
    fn app_start_says_whether_this_is_the_e2e_build() {
        let harness = Harness::new();
        let start = harness.invoke("app_start", &json!({})).unwrap();
        assert_eq!(start["e2e"], json!(cfg!(feature = "e2e")));
    }

    #[cfg(not(feature = "e2e"))]
    #[test]
    fn a_default_build_registers_no_e2e_command() {
        let harness = Harness::new();
        let e2e: Vec<String> = command_args()
            .into_keys()
            .filter(|command| command.starts_with("e2e_"))
            .collect();
        assert_eq!(e2e, ["e2e_open_path", "e2e_save_path"]);
        for command in &e2e {
            // Tauri answers a command it does not know with a plain text that says so.
            match harness.invoke(command, &command_args()[command]) {
                Err(Value::String(text)) => assert!(text.contains("not found"), "{text}"),
                other => panic!("{command} answered in a default build: {other:?}"),
            }
        }
        // Each is registered under a `cfg` of the feature, and nothing else of the module is
        // named outside one.
        let lines = handler_lines();
        let mut gated = 0;
        for (index, line) in lines.iter().enumerate() {
            if line.contains("e2e::") {
                assert_eq!(lines[index - 1], r#"#[cfg(feature = "e2e")]"#, "{line}");
                gated += 1;
            }
        }
        assert_eq!(gated, 2);
        assert!(LIB.contains("#[cfg(feature = \"e2e\")]\nmod e2e;"));
    }

    #[cfg(feature = "e2e")]
    #[test]
    fn the_e2e_build_registers_the_substitutes_of_the_dialogs() {
        // The variables are not set here: the substitutes answer as a cancelled dialog does.
        let harness = Harness::new();
        for command in ["e2e_open_path", "e2e_save_path"] {
            let args = &command_args()[command];
            assert!(harness.invoke(command, args).is_ok(), "{command}");
        }
    }

    #[test]
    fn update_check_answers_none_without_asking_when_turned_off() {
        // The smoke run and the e2e build turn it off, so neither reaches GitHub.
        let harness = Harness::new();
        let (listener, url) = silent_server();
        ask_updates_at(&harness, url);
        {
            let state = harness.app.state::<Mutex<AppState>>();
            state.lock().unwrap().turn_off_update_check();
        }
        assert_eq!(harness.invoke("update_check", &json!({})), Ok(Value::Null));
        assert!(!was_asked(&listener));
        // Nothing was recorded either: the check was not tried.
        let state = harness.app.state::<Mutex<AppState>>();
        assert_eq!(state.lock().unwrap().settings().update_checked_at, None);
    }

    #[test]
    fn a_command_with_arguments_tauri_cannot_read_fails_with_a_plain_text() {
        // What the test above must never meet: this is how a wrong key or shape shows.
        let harness = Harness::new();
        let error = harness
            .invoke("workspace_create", &serde_json::json!({ "title": "A" }))
            .unwrap_err();
        assert!(error.is_string(), "{error}");
        let error = harness
            .invoke("no_such_command", &serde_json::json!({}))
            .unwrap_err();
        assert!(error.is_string(), "{error}");
    }

    /// Panics on another thread while it holds the state lock, which leaves the lock poisoned.
    fn poison(harness: &Harness) {
        let state = harness.app.state::<Mutex<AppState>>();
        let mutex: &Mutex<AppState> = state.inner();
        let panicked = std::thread::scope(|scope| {
            scope
                .spawn(|| {
                    let _guard = mutex.lock().unwrap();
                    panic!("a command panics while it holds the state");
                })
                .join()
        });
        assert!(panicked.is_err(), "the thread panicked under the lock");
        assert!(mutex.is_poisoned());
    }

    /// The arguments of the fixture's `name`, with `view` as the view.
    fn args_in_view(name: &str, view: &Value) -> Value {
        let mut args = command_args()[name].clone();
        args["view"] = view.clone();
        args
    }

    #[test]
    fn after_a_panic_under_the_lock_no_command_panics_or_asks_for_a_restart() {
        let harness = Harness::new();
        for (command, args) in command_args()
            .into_iter()
            .filter(|(command, _)| in_this_build(command))
        {
            poison(&harness);
            match harness.invoke(&command, &args) {
                Ok(_) => {}
                Err(error) => {
                    let message = error["message"]
                        .as_str()
                        .unwrap_or_else(|| panic!("{command} failed with {error}"));
                    assert!(error["kind"].is_string(), "{command}: {error}");
                    assert!(!message.contains("Restart"), "{command}: {message}");
                }
            }
            let state = harness.app.state::<Mutex<AppState>>();
            if STATELESS.contains(&command.as_str()) {
                // It never touched the lock, so the lock is as the panic left it; the next
                // command that takes the state puts it right.
                assert!(state.is_poisoned(), "{command} took the state lock");
            } else {
                assert!(!state.is_poisoned(), "{command} left the lock poisoned");
            }
        }
    }

    /// The commands that never take the state: the smoke run's signal, and the substitutes of
    /// the dialogs, which read the environment.
    const STATELESS: [&str; 3] = ["smoke_ready", "e2e_open_path", "e2e_save_path"];

    #[test]
    fn a_command_whose_work_panics_answers_internal_and_the_next_needs_no_restart() {
        let harness = Harness::new();
        demo_view(&harness);
        let error = tauri::async_runtime::block_on(super::blocking(
            harness.app.handle().clone(),
            |_| -> Result<(), crate::app::CommandError> {
                panic!("the work of a command panics");
            },
        ))
        .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Internal);
        assert_eq!(
            error.message,
            "An operation failed part-way, so what it was doing may not have been saved. Check, then try again; if it happens again, report it."
        );
        assert!(harness.app.state::<Mutex<AppState>>().is_poisoned());

        let start = harness
            .invoke("app_start", &serde_json::json!({}))
            .expect("the page starts again without a restart");
        let view = serde_json::json!({
            "workspace_id": start["open"]["workspace"]["id"],
            "snapshot_id": start["open"]["selected"],
        });
        assert!(view["workspace_id"].is_string(), "{start}");
        harness
            .invoke("overview", &args_in_view("overview", &view))
            .expect("the data of the reopened workspace is read");
    }

    #[test]
    fn after_a_panic_the_workspace_is_reopened_and_the_draft_dropped() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let config = hx_synth::SynthConfig::new(7, 10, 60);
        let file = harness._dir.path().join("holds.xlsx");
        hx_synth::write_workbook(&hx_synth::generate(&config), &config, &file).unwrap();
        harness
            .invoke("import_open", &serde_json::json!({ "path": file }))
            .expect("the file opens as the draft");
        poison(&harness);

        // The view the page holds is still the one in the state.
        harness
            .invoke("overview", &args_in_view("overview", &view))
            .expect("the data of the reopened workspace is read");
        let current = harness
            .invoke("workspace_current", &serde_json::json!({}))
            .unwrap();
        assert_eq!(current["workspace"]["id"], view["workspace_id"]);
        assert_eq!(current["selected"], view["snapshot_id"]);
        assert_eq!(
            harness.outcome("import_review", &serde_json::json!({ "fields": null })),
            "NoDraft"
        );
    }

    #[test]
    fn a_reopen_that_fails_after_a_panic_is_the_answer_and_leaves_no_workspace_open() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let list = harness
            .invoke("workspace_list", &serde_json::json!({}))
            .unwrap();
        let folder = std::path::PathBuf::from(list["folder"].as_str().unwrap());
        let id = view["workspace_id"].as_str().unwrap();
        let file = folder.join(format!("{id}.holdx-ws"));
        assert!(file.is_file());
        std::fs::write(&file, "not a workspace").unwrap();
        poison(&harness);

        let error = harness
            .invoke("overview", &args_in_view("overview", &view))
            .unwrap_err();
        assert_eq!(error["kind"], "NotAWorkspace", "{error}");
        let message = error["message"].as_str().unwrap_or_default();
        assert!(
            message.starts_with(
                "After an operation failed part-way, the workspace could not be reopened: "
            ),
            "{message}"
        );
        assert!(message.contains(&format!("{id}.holdx-ws")), "{message}");
        // The lock is whole again, and nothing is open.
        assert_eq!(
            harness
                .invoke("workspace_current", &serde_json::json!({}))
                .unwrap(),
            Value::Null
        );
        assert_eq!(
            harness.outcome("overview", &args_in_view("overview", &view)),
            "NoWorkspace"
        );
    }

    #[test]
    fn app_start_after_a_panic_starts_over_when_the_workspace_cannot_be_reopened() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let list = harness
            .invoke("workspace_list", &serde_json::json!({}))
            .unwrap();
        let folder = std::path::PathBuf::from(list["folder"].as_str().unwrap());
        let id = view["workspace_id"].as_str().unwrap();
        // A newer schema: a file the listing still names, as one it cannot read.
        rusqlite::Connection::open(folder.join(format!("{id}.holdx-ws")))
            .unwrap()
            .execute_batch("PRAGMA user_version = 99")
            .unwrap();
        poison(&harness);

        // The start rebuilds the state itself: the failed reopen is not its answer, and the
        // workspace that cannot be read is listed as such.
        let start = harness
            .invoke("app_start", &serde_json::json!({}))
            .expect("the page starts although the workspace cannot be reopened");
        assert_eq!(start["open"], Value::Null, "{start}");
        let unreadable = start["list"]["unreadable"].as_array().unwrap();
        assert_eq!(unreadable.len(), 1, "{start}");
        assert_eq!(unreadable[0]["kind"], "NewerSchema");
        assert!(!harness.app.state::<Mutex<AppState>>().is_poisoned());
    }

    /// Opens the demo workspace and returns the view the interface then shows, as JSON.
    fn demo_view(harness: &Harness) -> Value {
        let open = harness
            .invoke("demo_create", &serde_json::json!({}))
            .expect("the demo workspace opens");
        serde_json::json!({
            "workspace_id": open["workspace"]["id"],
            "snapshot_id": open["selected"],
        })
    }

    /// The request of the fixture's `export_save`, for the view `view`, as the command reads it.
    fn export_args(view: &Value) -> (hx_export::ExportRequest, crate::app::ViewRef) {
        let mut args = command_args()["export_save"].clone();
        args["view"] = view.clone();
        let mut request: hx_export::ExportRequest =
            serde_json::from_value(args["request"].clone()).unwrap();
        request.text = hx_export::ExportText {
            labels: hx_export::FILE_TEXT_KEYS
                .iter()
                .map(|key| (key.to_string(), key.to_string()))
                .collect(),
            months: Vec::new(),
        };
        (
            request,
            serde_json::from_value(args["view"].clone()).unwrap(),
        )
    }

    /// A channel that keeps the phases it is sent.
    fn phases() -> (
        tauri::ipc::Channel<ExportPhase>,
        std::sync::Arc<Mutex<Vec<String>>>,
    ) {
        let heard = std::sync::Arc::new(Mutex::new(Vec::new()));
        let kept = heard.clone();
        let channel = tauri::ipc::Channel::new(move |body| {
            if let tauri::ipc::InvokeResponseBody::Json(text) = body {
                kept.lock().unwrap().push(text);
            }
            Ok(())
        });
        (channel, heard)
    }

    #[test]
    fn a_save_reads_then_writes_and_records_the_path_it_wrote() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let (request, view) = export_args(&view);
        let path = harness._dir.path().join("lines.xlsx");
        let (channel, heard) = phases();
        let saved = tauri::async_runtime::block_on(super::save_with(
            harness.app.handle().clone(),
            request,
            crate::app::SaveFormat::Excel,
            path.clone(),
            view,
            channel,
            hx_export::write_file,
        ))
        .unwrap();
        assert_eq!(saved.path, path.to_string_lossy());
        assert!(saved.rows > 0);
        assert!(path.is_file());
        assert_eq!(*heard.lock().unwrap(), [r#""Reading""#, r#""Writing""#]);
        let state = harness.app.state::<Mutex<AppState>>();
        assert!(state.lock().unwrap().has_written(&path));
    }

    #[test]
    fn an_export_save_counts_as_a_write_while_the_file_is_written_unlocked() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let (request, view) = export_args(&view);
        let path = harness._dir.path().join("lines.csv");
        let writes = harness
            .app
            .state::<Mutex<AppState>>()
            .lock()
            .unwrap()
            .writes();
        assert!(!writes.busy());
        let seen = std::sync::Arc::new(Mutex::new(None));
        let write = {
            let (writes, seen) = (writes.clone(), seen.clone());
            move |path: &std::path::Path, bytes: &[u8]| {
                *seen.lock().unwrap() = Some(writes.busy());
                hx_export::write_file(path, bytes)
            }
        };
        let (channel, _) = phases();
        tauri::async_runtime::block_on(super::save_with(
            harness.app.handle().clone(),
            request,
            crate::app::SaveFormat::Csv,
            path.clone(),
            view,
            channel,
            write,
        ))
        .unwrap();
        assert_eq!(*seen.lock().unwrap(), Some(true));
        assert!(!writes.busy(), "the write ends with the save");
        assert!(path.is_file());
    }

    #[test]
    fn an_export_save_counts_as_a_write_while_it_gathers_the_content() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let (request, view) = export_args(&view);
        let path = harness._dir.path().join("lines.csv");
        let state = harness.app.state::<Mutex<AppState>>();
        let writes = state.lock().unwrap().writes();
        // The state is held, so the save waits in its gather, after it said it is reading.
        let held = state.lock().unwrap();
        let (reading, read) = std::sync::mpsc::channel();
        let channel = tauri::ipc::Channel::new(move |_| {
            let _ = reading.send(());
            Ok(())
        });
        let handle = harness.app.handle().clone();
        let target = path.clone();
        let saving = std::thread::spawn(move || {
            tauri::async_runtime::block_on(super::save_with(
                handle,
                request,
                crate::app::SaveFormat::Csv,
                target,
                view,
                channel,
                hx_export::write_file,
            ))
        });
        read.recv().unwrap();
        assert!(writes.busy(), "the gather runs while a write is counted");
        drop(held);
        saving.join().unwrap().unwrap();
        assert!(!writes.busy());
        assert!(path.is_file());
    }

    #[test]
    fn a_save_with_the_wrong_extension_is_refused_before_anything_is_read() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let (request, view) = export_args(&view);
        let path = harness._dir.path().join("lines.desktop");
        let (channel, heard) = phases();
        let error = tauri::async_runtime::block_on(super::save_with(
            harness.app.handle().clone(),
            request,
            crate::app::SaveFormat::Excel,
            path.clone(),
            view,
            channel,
            hx_export::write_file,
        ))
        .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Extension);
        assert!(heard.lock().unwrap().is_empty());
        assert!(!path.exists());
    }

    #[test]
    fn a_save_that_fails_records_no_path() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let (request, view) = export_args(&view);
        let path = harness._dir.path().join("missing").join("lines.xlsx");
        let (channel, _) = phases();
        let error = tauri::async_runtime::block_on(super::save_with(
            harness.app.handle().clone(),
            request,
            crate::app::SaveFormat::Excel,
            path.clone(),
            view,
            channel,
            hx_export::write_file,
        ))
        .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Folder);
        let state = harness.app.state::<Mutex<AppState>>();
        assert!(!state.lock().unwrap().has_written(&path));
    }

    #[test]
    fn the_state_is_free_while_a_slow_write_runs() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let (request, view) = export_args(&view);
        let path = harness._dir.path().join("lines.csv");
        let entered = std::sync::Arc::new(std::sync::Barrier::new(2));
        let release = std::sync::Arc::new(std::sync::Barrier::new(2));
        let (writer_entered, writer_release) = (entered.clone(), release.clone());
        let slow = move |path: &std::path::Path, bytes: &[u8]| {
            writer_entered.wait();
            writer_release.wait();
            hx_export::write_file(path, bytes)
        };
        let handle = harness.app.handle().clone();
        let target = path.clone();
        let saving = std::thread::spawn(move || {
            let (channel, _) = phases();
            tauri::async_runtime::block_on(super::save_with(
                handle,
                request,
                crate::app::SaveFormat::Csv,
                target,
                view,
                channel,
                slow,
            ))
        });

        entered.wait();
        // The file is being written: the state is not locked, and another command answers.
        {
            let state = harness.app.state::<Mutex<AppState>>();
            assert!(
                state.try_lock().is_ok(),
                "the lock is held during the write"
            );
        }
        let current = harness
            .invoke("workspace_current", &serde_json::json!({}))
            .expect("a command answers while the file is written");
        assert!(current["workspace"]["id"].is_string());
        assert!(!path.exists(), "the write has not happened yet");
        release.wait();

        let saved = saving.join().unwrap().unwrap();
        assert!(saved.rows > 0);
        assert!(path.is_file());
    }

    #[test]
    fn the_state_is_free_while_a_slow_copy_runs() {
        let harness = Harness::new();
        let view = demo_view(&harness);
        let (request, view) = export_args(&view);
        let entered = std::sync::Arc::new(std::sync::Barrier::new(2));
        let release = std::sync::Arc::new(std::sync::Barrier::new(2));
        let (copy_entered, copy_release) = (entered.clone(), release.clone());
        let copied = std::sync::Arc::new(Mutex::new(None));
        let kept = copied.clone();
        let slow = move |content: crate::app::Content, _: &hx_export::ExportText| {
            copy_entered.wait();
            copy_release.wait();
            if let crate::app::Content::Text(words) = content {
                *kept.lock().unwrap() = Some(words);
            }
            Ok(())
        };
        let handle = harness.app.handle().clone();
        let copying = std::thread::spawn(move || {
            tauri::async_runtime::block_on(super::copy_with(
                handle,
                request,
                crate::app::CopyFormat::Table,
                view,
                slow,
            ))
        });

        entered.wait();
        // The clipboard is being set: the state is not locked, and another command answers.
        {
            let state = harness.app.state::<Mutex<AppState>>();
            assert!(state.try_lock().is_ok(), "the lock is held during the copy");
        }
        let current = harness
            .invoke("workspace_current", &serde_json::json!({}))
            .expect("a command answers while the clipboard is set");
        assert!(current["workspace"]["id"].is_string());
        assert!(
            copied.lock().unwrap().is_none(),
            "the copy has not happened yet"
        );
        release.wait();

        copying.join().unwrap().unwrap();
        assert!(copied
            .lock()
            .unwrap()
            .as_deref()
            .is_some_and(|text| !text.is_empty()));
    }

    /// The keys of `interface CommandMap { ... }`: the lines that start with two spaces, a name
    /// of lowercase letters, digits, and underscores, and a colon.
    fn typescript_commands() -> BTreeSet<String> {
        let start = COMMAND_MAP
            .find("interface CommandMap {")
            .expect("commands.ts declares interface CommandMap");
        let body = &COMMAND_MAP[start..];
        let end = body.find("\n}").expect("the interface ends");
        body[..end]
            .lines()
            .skip(1)
            .filter_map(|line| line.strip_prefix("  "))
            .filter_map(|line| line.split_once(':').map(|(name, _)| name))
            .filter(|name| {
                !name.is_empty()
                    && name
                        .chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
            })
            .map(str::to_string)
            .collect()
    }

    /// The lines inside `generate_handler![ ... ]`, trimmed: a command, or the `cfg` of the one
    /// that follows.
    fn handler_lines() -> Vec<&'static str> {
        let start = LIB
            .find("generate_handler![")
            .expect("lib.rs registers the commands with generate_handler!");
        let body = &LIB[start + "generate_handler![".len()..];
        let end = body.find("\n    ]").expect("the list ends");
        body[..end]
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect()
    }

    /// The names inside `generate_handler![ ... ]`, without their module path, in every build.
    fn registered_commands() -> BTreeSet<String> {
        handler_lines()
            .into_iter()
            .filter(|line| !line.starts_with("#["))
            .map(|line| {
                line.trim_end_matches(',')
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
