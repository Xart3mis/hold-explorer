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
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::NaiveDateTime;
use hx_core::detail::{BlockerDetail, HoldRef, LineDetail};
use hx_core::filter::{Dim, FilterSpec};
use hx_core::mapping::Field;
use hx_core::query::{FoldedMatrix, Group, HoldQuery, LinePage, LineQuery, ValuePage};
use hx_core::solve::SolveView;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};

use crate::app::{
    AppStart, AppState, CommandError, FilterOptions, GroupDetail, HoldsView, ImportCommit,
    ImportDone, ImportDraft, ImportPhase, ImportReview, OverviewView, Settings, TargetCheck,
    TargetChoice, Theme, ViewRef, WorkspaceListView, WorkspaceOpen, WorkspaceView,
};

/// Runs `work` on a thread of the blocking pool with the state locked, so file access never
/// holds up the window.
async fn blocking<R, T, F>(app: AppHandle<R>, work: F) -> Result<T, CommandError>
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
pub async fn app_start<R: Runtime>(app: AppHandle<R>) -> Result<AppStart, CommandError> {
    blocking(app, |state| Ok(state.start())).await
}

/// Sets and saves the theme.
#[tauri::command]
pub async fn settings_set_theme<R: Runtime>(
    app: AppHandle<R>,
    theme: Theme,
) -> Result<Settings, CommandError> {
    blocking(app, move |state| state.set_theme(theme)).await
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

/// The solve order of the kept holds, when `view` is the view in the state.
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

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};
    use std::sync::Mutex;

    use serde_json::Value;
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::webview::InvokeRequest;
    use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};
    use tempfile::TempDir;

    use crate::app::AppState;

    const COMMAND_MAP: &str = include_str!("../../ui/src/api/commands.ts");
    const LIB: &str = include_str!("lib.rs");
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
            let state = AppState::new(dir.path().join("config"), dir.path().join("data"));
            let app = mock_builder()
                .manage(Mutex::new(state))
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
    fn every_command_reads_the_arguments_the_interface_sends() {
        let harness = Harness::new();
        // In the order of their names. Nothing is open at first; the demo then opens a workspace
        // with four snapshots, and `workspace_create` an empty one.
        let outcomes: Vec<(String, String)> = command_args()
            .iter()
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
                ("demo_create", "Ok"),
                // The view of the fixture is not the demo workspace.
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
                ("overview", "ViewChanged"),
                ("settings_set_theme", "Ok"),
                // The demo workspace has a snapshot 2.
                ("snapshot_select", "Ok"),
                ("solve_order", "ViewChanged"),
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
        for (command, args) in command_args() {
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

    #[test]
    fn after_a_panic_under_the_lock_every_command_answers_internal_and_none_panics() {
        let harness = Harness::new();
        let poisoned = {
            let state = harness.app.state::<Mutex<AppState>>();
            let mutex: &Mutex<AppState> = state.inner();
            std::thread::scope(|scope| {
                scope
                    .spawn(|| {
                        let _guard = mutex.lock().unwrap();
                        panic!("a command panics while it holds the state");
                    })
                    .join()
            })
        };
        assert!(poisoned.is_err(), "the thread panicked under the lock");

        for (command, args) in command_args() {
            let error = harness
                .invoke(&command, &args)
                .expect_err("no command answers from a state that cannot be trusted");
            assert_eq!(error["kind"], "Internal", "{command}: {error}");
            // The words only the handling of a poisoned lock uses: the answer for a state that
            // is missing, and the one for a task that died, say to restart as well.
            let message = error["message"].as_str().unwrap_or_default();
            assert!(
                message.starts_with("An earlier operation failed part-way"),
                "{command}: {message}"
            );
            assert!(
                message.contains("Restart Hold Explorer"),
                "{command}: {message}"
            );
        }
    }

    /// The keys of `interface CommandMap { ... }`: the lines that start with two spaces, a name
    /// of lowercase letters and underscores, and a colon.
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
                !name.is_empty() && name.chars().all(|c| c.is_ascii_lowercase() || c == '_')
            })
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
