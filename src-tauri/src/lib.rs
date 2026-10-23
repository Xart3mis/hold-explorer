//! Hold Explorer desktop shell: builds the Tauri application around the engine crates.

#![forbid(unsafe_code)]

mod app;
mod commands;
pub mod crash;
#[cfg(feature = "e2e")]
mod e2e;
pub mod native;
mod smoke;

use std::path::Path;
use std::sync::{Arc, Mutex};

use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime, WindowEvent};

use app::{AppState, CloseRequest, SessionClipboard, Theme, Writes, CLOSING_HELD, CLOSING_RESUMED};

/// The first frame of the window in the dark theme: the design token `--color-surface-app` of
/// the dark theme in `DESIGN.md`, as `node tools/design/check-tokens.mjs --hex dark
/// --color-surface-app` prints it. `tauri.conf.json` creates the window with this color.
const SURFACE_APP_DARK: Color = Color(0x0b, 0x10, 0x11, 0xff);

/// The first frame of the window in the light theme: the same token of the light theme, as
/// `node tools/design/check-tokens.mjs --hex light --color-surface-app` prints it.
const SURFACE_APP_LIGHT: Color = Color(0xf8, 0xfb, 0xfb, 0xff);

/// The background of the window until its page has loaded: the app surface of the saved theme.
/// The page holds no style of its own for this, because a `<style>` element would get a nonce
/// from Tauri, and a style policy with a nonce refuses the styles a library adds at run time.
/// The theme that follows the system gets the dark frame the window is created with: only the
/// page knows which theme the system asks for.
fn window_background(theme: Theme) -> Color {
    match theme {
        Theme::Light => SURFACE_APP_LIGHT,
        Theme::Dark | Theme::System => SURFACE_APP_DARK,
    }
}

/// Every command of the interface, in one list: what `run` registers is what the tests of the
/// command channel invoke. The substitutes of the dialogs are registered in the `e2e` build only.
fn handler<R: tauri::Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::app_start,
        commands::settings_set_theme,
        commands::settings_set_density,
        commands::settings_set_author_name,
        commands::check_workspace_folder,
        commands::set_workspace_folder,
        commands::workspace_list,
        commands::workspace_create,
        commands::workspace_open,
        commands::workspace_rename,
        commands::save_view,
        commands::rename_view,
        commands::delete_view,
        commands::restore_view,
        commands::move_view,
        commands::import_open,
        commands::import_choose_sheet,
        commands::import_review,
        commands::import_check_target,
        commands::import_commit,
        commands::import_cancel,
        commands::snapshot_select,
        commands::overview,
        commands::filter_options,
        commands::filter_labels,
        commands::filter_values,
        commands::search,
        commands::lines,
        commands::holds,
        commands::line_detail,
        commands::hold_detail,
        commands::breakdown,
        commands::matrix,
        commands::solve_order,
        commands::blocker_detail,
        commands::group_detail,
        commands::workspace_current,
        commands::demo_create,
        commands::export_save,
        commands::export_copy,
        commands::export_open,
        commands::diagnostics_copy,
        commands::settings_set_update_check,
        commands::update_check,
        commands::update_skip,
        commands::open_release_page,
        smoke::smoke_ready,
        #[cfg(feature = "e2e")]
        e2e::e2e_open_path,
        #[cfg(feature = "e2e")]
        e2e::e2e_save_path,
    ]
}

/// The identifier of the app in `tauri.conf.json`: Tauri names the app's folders after it.
const IDENTIFIER: &str = "io.github.xart3mis.holdexplorer";

/// The version of the app: the configuration has none of its own, so Tauri reports this one.
pub(crate) const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Why the app could not start.
#[derive(Debug)]
struct StartFailure {
    /// What failed: the error returned, or the message of the panic.
    error: String,
    /// Whether it panicked; the panic hook has then written a log.
    panicked: bool,
}

/// Runs one step of the start: building the app, or its setup. An error and a panic alike are a
/// failure of the start.
fn attempt<T, E: std::fmt::Display>(
    step: impl FnOnce() -> Result<T, E>,
) -> Result<T, StartFailure> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(step)) {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(error)) => Err(StartFailure {
            error: error.to_string(),
            panicked: false,
        }),
        Err(payload) => {
            let message = payload
                .downcast_ref::<&str>()
                .map(|text| (*text).to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "a panic without a text message".to_string());
            Err(StartFailure {
                error: format!("an internal error stopped the start: {message}"),
                panicked: true,
            })
        }
    }
}

/// The crash report of a start that returned `error`, with the user's folders shortened as the
/// panic hook shortens them.
fn start_failure_report(error: &str, local_data: &Path) -> crash::CrashReport {
    let home = std::env::home_dir();
    let mut report = crash::CrashReport::now(
        VERSION,
        tauri::webview_version().ok(),
        format!("Hold Explorer could not start: {error}"),
        None,
    );
    report.message = crash::redact(&report.message, home.as_deref(), local_data);
    report.backtrace = crash::redact(&report.backtrace, home.as_deref(), local_data);
    report
}

/// Ends a start that failed: writes a crash log (the panic hook has written it already for a
/// panic), hides the main window of `app` if it was created, says so in a native message, and
/// ends the process with code 1.
fn fail_start(local_data: &Path, failure: &StartFailure, app: Option<&tauri::AppHandle>) -> ! {
    let log = if failure.panicked {
        crash::newest_log(local_data)
    } else {
        let report = start_failure_report(&failure.error, local_data);
        crash::write_log(&crash::logs_dir(local_data), &report).ok()
    };
    if let Some(window) = app.and_then(|app| app.get_webview_window("main")) {
        // A window left blank behind the message would look like the app had started.
        let _ = window.hide();
    }
    native::error_message(
        native::STARTUP_FAILURE_TITLE,
        &native::startup_failure_text(&failure.error, log.as_deref()),
    );
    std::process::exit(1);
}

/// Lets a close of the main window wait for the writes in progress (see [`on_event`]). The count
/// is managed beside the state, so the event loop reads it without waiting for the state lock,
/// which a write holds. When the last write ends after a close was held back, the window is
/// closed from the main thread; that close destroys it, so it is not held back again.
fn hold_close<R: Runtime>(app: &AppHandle<R>, writes: Arc<Writes>) {
    hold_close_with(app, writes, |app, close| app.run_on_main_thread(close));
}

/// How a close is handed to the main thread.
type Dispatch<R> = fn(&AppHandle<R>, Box<dyn FnOnce() + Send>) -> tauri::Result<()>;

/// [`hold_close`] with the function that hands the close to the main thread. When it cannot,
/// the window stays open and the interface hears [`CLOSING_RESUMED`], so the notice that the
/// window closes goes, and the user can close it again.
fn hold_close_with<R: Runtime>(app: &AppHandle<R>, writes: Arc<Writes>, dispatch: Dispatch<R>) {
    let handle = app.clone();
    writes.closes_with(move || {
        let main = handle.clone();
        let close = Box::new(move || {
            if let Some(window) = main.get_webview_window("main") {
                // A window that cannot be destroyed stays open, and the user closes it again.
                let _ = window.destroy();
            }
        });
        if dispatch(&handle, close).is_err() {
            // Nothing more can be done for the window than to let the user try again.
            let _ = handle.emit(CLOSING_RESUMED, ());
        }
    });
    app.manage(writes);
}

/// What the app does with an event of its loop. A request to close the main window while a
/// write is in progress is held back, and the interface hears [`CLOSING_HELD`] the first time.
/// When the app exits, the clipboard is let go.
fn on_event<R: Runtime>(app: &AppHandle<R>, event: &RunEvent) {
    match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == "main" => {
            let Some(writes) = app.try_state::<Arc<Writes>>() else {
                return;
            };
            match writes.close_requested() {
                CloseRequest::Close => {}
                CloseRequest::Held => {
                    api.prevent_close();
                    // Without the notice the window only seems slow to close.
                    let _ = app.emit(CLOSING_HELD, ());
                }
                CloseRequest::AlreadyHeld => api.prevent_close(),
            }
        }
        // The event loop ends the process without dropping what the app manages, and the system's
        // clipboard hands what the app copied to the clipboard manager only when it is dropped:
        // it is let go here, so a copy made just before quitting survives the app on X11.
        RunEvent::Exit => {
            if let Some(clipboard) = app.try_state::<SessionClipboard>() {
                clipboard.release();
            }
        }
        _ => {}
    }
}

/// What the app sets up when the event loop starts: the main window, then the state, from the
/// app's folders. The configuration asks Tauri to create no window: Tauri would create it
/// before this runs, where a failure is not caught.
fn setup(app: &mut tauri::App) -> Result<(), tauri::Error> {
    let main = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or(tauri::Error::WindowNotFound)?;
    let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &main)?.build()?;
    let config_dir = app.path().app_config_dir()?;
    let data_dir = app.path().app_data_dir()?;
    let local_data_dir = app.path().app_local_data_dir()?;
    let mut state = AppState::new(config_dir, data_dir, local_data_dir);
    if smoke::update_check_off(|name| std::env::var_os(name)) {
        state.turn_off_update_check();
    }
    // The window exists but has drawn nothing yet: drawing starts with the event loop. A failure
    // leaves the dark frame, which the page replaces once it has loaded.
    let _ = window.set_background_color(Some(window_background(state.settings().theme)));
    hold_close(app.handle(), state.writes());
    app.manage(Mutex::new(state));
    // Under a lock of its own: the clipboard is set while the state is free.
    app.manage(SessionClipboard::default());
    smoke::arm_timeout(app.handle());
    Ok(())
}

/// Builds and runs the application. Returns when the last window is closed.
///
/// The crash log hook comes first, so a panic while the app is built or set up leaves a log. A
/// start that fails, by an error or a panic, in the build or in the setup, writes a log, says so
/// in a native message, and ends the process with code 1.
pub fn run() {
    let local_data = crash::local_data_folder(IDENTIFIER);
    crash::install(local_data.clone(), VERSION);
    // Without WebView2 the window cannot be created: say what to install, then stop.
    #[cfg(windows)]
    if tauri::webview_version().is_err() {
        native::error_message(
            native::WEBVIEW2_MISSING_TITLE,
            &native::webview2_missing_text(),
        );
        std::process::exit(1);
    }
    let setup_data = local_data.clone();
    let built = attempt(|| {
        tauri::Builder::default()
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    // A failure to raise the window leaves the first instance as it was.
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_opener::init())
            // Tauri runs the setup when the event loop starts, not in `build`, and turns its
            // error into a panic there: a failure is handled here instead, before Tauri sees it.
            .setup(move |app| match attempt(|| setup(app)) {
                Ok(()) => Ok(()),
                Err(failure) => fail_start(&setup_data, &failure, Some(app.handle())),
            })
            .invoke_handler(handler())
            .build(tauri::generate_context!())
    });
    let app = match built {
        Ok(app) => app,
        Err(failure) => fail_start(&local_data, &failure, None),
    };
    app.run(|app, event| on_event(app, &event));
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use tauri::window::Color;

    use super::{window_background, IDENTIFIER, SURFACE_APP_DARK, SURFACE_APP_LIGHT};
    use crate::app::Theme;

    /// The repository root: the folder above this crate.
    const ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/..");

    fn config() -> serde_json::Value {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json");
        let text = std::fs::read_to_string(path).expect("tauri.conf.json is readable");
        serde_json::from_str(&text).expect("tauri.conf.json is JSON")
    }

    /// The color of `--color-surface-app` in a theme, as the design tool prints it.
    fn surface_app_token(theme: &str) -> Color {
        let output = std::process::Command::new("node")
            .args([
                "tools/design/check-tokens.mjs",
                "--hex",
                theme,
                "--color-surface-app",
            ])
            .current_dir(ROOT)
            .output()
            .expect("node runs tools/design/check-tokens.mjs; install Node.js to run this test");
        assert!(
            output.status.success(),
            "check-tokens failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse()
            .expect("the tool prints one hex color")
    }

    #[test]
    fn the_window_is_never_smaller_than_the_design_allows() {
        // DESIGN.md: the layout is designed down to 1024 by 640.
        let window = &config()["app"]["windows"][0];
        assert_eq!(window["minWidth"], 1024);
        assert_eq!(window["minHeight"], 640);
        let design = std::fs::read_to_string(format!("{ROOT}/DESIGN.md"))
            .expect("DESIGN.md is readable")
            .replace("\r\n", "\n");
        assert!(design.contains("| `--layout-window-min-width` | `1024px` |"));
        assert!(design.contains("| `--layout-window-min-height` | `640px` |"));
    }

    #[test]
    fn a_panic_while_starting_is_a_start_failure() {
        let failure =
            super::attempt(|| -> Result<(), String> { panic!("the setup panics on purpose") })
                .expect_err("the start failed");
        assert!(failure.panicked);
        assert!(
            failure.error.contains("the setup panics on purpose"),
            "{}",
            failure.error
        );
        let text = crate::native::startup_failure_text(&failure.error, None);
        assert!(text.contains("the setup panics on purpose"), "{text}");
    }

    #[test]
    fn an_error_while_starting_is_a_start_failure() {
        let failure = super::attempt(|| -> Result<(), String> {
            Err("the setup fails on purpose".to_string())
        })
        .expect_err("the start failed");
        assert!(!failure.panicked);
        assert_eq!(failure.error, "the setup fails on purpose");
    }

    #[test]
    fn a_build_that_works_is_no_failure() {
        let built = super::attempt(|| {
            tauri::test::mock_builder().build(tauri::test::mock_context(tauri::test::noop_assets()))
        });
        assert!(built.is_ok());
    }

    #[test]
    fn tauri_creates_no_window_so_a_failure_to_create_it_is_a_start_failure() {
        // Tauri creates the windows of the configuration before the setup closure runs, outside
        // its guard: the setup creates the main window itself.
        let window = &config()["app"]["windows"][0];
        assert_eq!(window["label"], "main");
        assert_eq!(window["create"], false);
    }

    #[test]
    fn the_log_of_a_failed_start_names_no_folder_of_the_user() {
        let local_data = super::crash::local_data_folder(IDENTIFIER);
        let error = format!(
            "could not open {}",
            local_data.join("settings.json").display()
        );
        let report = super::start_failure_report(&error, &local_data);
        assert!(
            report.message.contains("<local data>"),
            "{}",
            report.message
        );
        assert!(
            !report
                .message
                .contains(local_data.to_string_lossy().as_ref()),
            "{}",
            report.message
        );
        assert!(report
            .message
            .starts_with("Hold Explorer could not start: "));
    }

    #[test]
    fn a_close_during_a_write_waits_for_it_and_the_window_then_closes_on_its_own() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::{mpsc, Arc};
        use tauri::Listener;

        let app = tauri::test::mock_app();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("the mock runtime makes a window");
        let writes = Arc::new(crate::app::Writes::default());
        super::hold_close(app.handle(), writes.clone());

        // A write runs on another thread, and ends once the interface has heard of the close.
        let heard = Arc::new(AtomicUsize::new(0));
        let (told, notice) = mpsc::channel();
        let counted = heard.clone();
        app.listen_any(crate::app::CLOSING_HELD, move |_| {
            counted.fetch_add(1, Ordering::SeqCst);
            let _ = told.send(());
        });
        let (started, write_started) = mpsc::channel();
        let writer = {
            let writes = writes.clone();
            std::thread::spawn(move || {
                let _write = writes.begin();
                started.send(()).unwrap();
                // A close that is not held back ends the loop at once and nothing is heard: the
                // write ends after a while all the same, and the assertions below fail.
                let _ = notice.recv_timeout(std::time::Duration::from_secs(10));
            })
        };
        write_started.recv().unwrap();

        let requests = Arc::new(AtomicUsize::new(0));
        let seen = requests.clone();
        // The loop returns once the last window is gone: the write ended and Rust closed it.
        app.run(move |app, event| {
            if let tauri::RunEvent::Ready = event {
                // Two requests: the first is held back, the second does nothing more.
                window.close().unwrap();
                window.close().unwrap();
            }
            if let tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::CloseRequested { .. },
                ..
            } = event
            {
                seen.fetch_add(1, Ordering::SeqCst);
            }
            super::on_event(app, &event);
        });
        writer.join().unwrap();

        assert_eq!(
            requests.load(Ordering::SeqCst),
            2,
            "the window was still open for the second request"
        );
        assert_eq!(heard.load(Ordering::SeqCst), 1, "the notice is sent once");
        assert!(!writes.busy());
    }

    #[test]
    fn a_close_that_cannot_be_handed_to_the_main_thread_takes_the_notice_back() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;
        use tauri::Listener;

        let app = tauri::test::mock_app();
        let writes = Arc::new(crate::app::Writes::default());
        super::hold_close_with(app.handle(), writes.clone(), |_, _| {
            Err(tauri::Error::WindowNotFound)
        });
        let resumed = Arc::new(AtomicUsize::new(0));
        let counted = resumed.clone();
        app.listen_any(crate::app::CLOSING_RESUMED, move |_| {
            counted.fetch_add(1, Ordering::SeqCst);
        });

        let write = writes.begin();
        assert_eq!(writes.close_requested(), crate::app::CloseRequest::Held);
        assert_eq!(resumed.load(Ordering::SeqCst), 0);
        drop(write);
        assert_eq!(
            resumed.load(Ordering::SeqCst),
            1,
            "the notice is taken back"
        );
        // The close is forgotten: the next request closes the window.
        assert_eq!(writes.close_requested(), crate::app::CloseRequest::Close);
    }

    #[test]
    fn only_the_main_window_waits_for_a_write() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;
        use tauri::{Listener, Manager};

        let app = tauri::test::mock_app();
        tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("the mock runtime makes a window");
        let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default())
            .build()
            .expect("the mock runtime makes a second window");
        let writes = Arc::new(crate::app::Writes::default());
        super::hold_close(app.handle(), writes.clone());
        let heard = Arc::new(AtomicUsize::new(0));
        let counted = heard.clone();
        app.listen_any(crate::app::CLOSING_HELD, move |_| {
            counted.fetch_add(1, Ordering::SeqCst);
        });
        let write = writes.begin();
        app.run(move |app, event| {
            if let tauri::RunEvent::Ready = event {
                other.close().unwrap();
            }
            let asked = matches!(
                event,
                tauri::RunEvent::WindowEvent {
                    event: tauri::WindowEvent::CloseRequested { .. },
                    ..
                }
            );
            super::on_event(app, &event);
            if asked {
                // Every window goes, so the loop ends whatever was decided.
                for window in app.webview_windows().into_values() {
                    window.destroy().unwrap();
                }
            }
        });
        drop(write);
        assert_eq!(
            heard.load(Ordering::SeqCst),
            0,
            "the other window was not held back"
        );
    }

    #[test]
    fn a_close_while_no_write_runs_closes_the_window_at_once() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;
        use tauri::Listener;

        let app = tauri::test::mock_app();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("the mock runtime makes a window");
        super::hold_close(app.handle(), Arc::new(crate::app::Writes::default()));
        let heard = Arc::new(AtomicUsize::new(0));
        let counted = heard.clone();
        app.listen_any(crate::app::CLOSING_HELD, move |_| {
            counted.fetch_add(1, Ordering::SeqCst);
        });
        app.run(move |app, event| {
            if let tauri::RunEvent::Ready = event {
                window.close().unwrap();
            }
            super::on_event(app, &event);
        });
        assert_eq!(heard.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn the_identifier_is_the_one_of_the_configuration() {
        assert_eq!(config()["identifier"], IDENTIFIER);
    }

    #[test]
    fn the_crash_log_folder_is_the_local_data_folder_tauri_resolves() {
        // The hook is installed before the app exists, so it finds the folder on its own; it must
        // find the one Tauri's `app_local_data_dir` gives for this identifier.
        use tauri::Manager;
        let app = tauri::test::mock_app();
        let base = app
            .path()
            .local_data_dir()
            .expect("the system has a local data folder");
        assert_eq!(
            crate::crash::local_data_folder(IDENTIFIER),
            base.join(IDENTIFIER)
        );
    }

    #[test]
    fn the_version_is_written_once_in_the_cargo_manifest() {
        // Without a version of its own, the configuration takes the one of the package, which
        // `AppStart.version` reports as well.
        assert_eq!(config().get("version"), None);
    }

    #[test]
    fn the_windows_manifest_asks_for_version_6_of_the_common_controls() {
        // The build script hands this file to the linker for every target on Windows; without
        // it neither the application nor a test executable starts there.
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/windows-app-manifest.xml");
        let manifest = std::fs::read_to_string(path).expect("the manifest is readable");
        assert!(manifest.contains(r#"name="Microsoft.Windows.Common-Controls""#));
        assert!(manifest.contains(r#"version="6.0.0.0""#));
        let script = include_str!("../build.rs");
        assert!(script.contains(r#""windows-app-manifest.xml""#));
    }

    #[test]
    fn the_window_colors_equal_the_app_surface_tokens_of_the_design() {
        assert_eq!(SURFACE_APP_DARK, surface_app_token("dark"));
        assert_eq!(SURFACE_APP_LIGHT, surface_app_token("light"));
    }

    #[test]
    fn the_window_is_created_with_the_dark_app_surface() {
        let color: Color = config()["app"]["windows"][0]["backgroundColor"]
            .as_str()
            .expect("the main window has a backgroundColor")
            .parse()
            .expect("backgroundColor is a hex color");
        assert_eq!(color, SURFACE_APP_DARK);
    }

    #[test]
    fn the_first_frame_is_light_only_when_the_saved_theme_is_light() {
        assert_eq!(window_background(Theme::Light), SURFACE_APP_LIGHT);
        // The theme that follows the system keeps the dark frame: only the page can resolve it.
        assert_eq!(window_background(Theme::Dark), SURFACE_APP_DARK);
        assert_eq!(window_background(Theme::System), SURFACE_APP_DARK);
    }

    #[test]
    fn the_page_holds_no_style_element_so_the_written_style_policy_stays_in_effect() {
        // Tauri gives every <style> of the page a nonce and adds it to style-src, and a policy
        // with a nonce ignores 'unsafe-inline': styles a library adds at run time would be refused.
        let page = std::fs::read_to_string(format!("{ROOT}/ui/index.html"))
            .expect("ui/index.html is readable");
        assert!(!page.to_lowercase().contains("<style"), "{page}");
        let policy = &config()["app"]["security"]["csp"]["style-src"];
        assert_eq!(policy, "'self' 'unsafe-inline'");
    }

    #[test]
    fn capability_file_grants_exactly_the_four_permissions_the_interface_uses_to_main() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json");
        let text = std::fs::read_to_string(path).expect("capability file is readable");
        let capability: serde_json::Value =
            serde_json::from_str(&text).expect("capability file is JSON");

        let windows: Vec<&str> = capability["windows"]
            .as_array()
            .expect("windows is a list")
            .iter()
            .filter_map(serde_json::Value::as_str)
            .collect();
        assert_eq!(windows, ["main"]);

        let permissions: BTreeSet<&str> = capability["permissions"]
            .as_array()
            .expect("permissions is a list")
            .iter()
            .filter_map(serde_json::Value::as_str)
            .collect();
        // Choosing a file to open, choosing where to save a file, and revealing a file in its
        // folder are all the page asks of a plugin. No permission opens an address or a file:
        // a saved file is opened from Rust, and only when the app wrote it. Window state is kept
        // from Rust.
        let expected: BTreeSet<&str> = [
            "core:default",
            "dialog:allow-open",
            "dialog:allow-save",
            "opener:allow-reveal-item-in-dir",
        ]
        .into();
        assert_eq!(permissions, expected);
        assert_eq!(capability["permissions"].as_array().map(Vec::len), Some(4));

        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");
        let files: Vec<String> = std::fs::read_dir(dir)
            .expect("capabilities directory is readable")
            .map(|entry| {
                entry
                    .expect("directory entry is readable")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(files, ["default.json"]);
    }
}
