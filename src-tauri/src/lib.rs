//! Hold Explorer desktop shell: builds the Tauri application around the engine crates.

#![forbid(unsafe_code)]

mod app;
mod commands;
pub mod crash;
pub mod native;

use std::sync::Mutex;

use tauri::window::Color;
use tauri::{Manager, RunEvent};

use app::{AppState, SessionClipboard, Theme};

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
/// command channel invoke.
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
    ]
}

/// The identifier of the app in `tauri.conf.json`: Tauri names the app's folders after it.
const IDENTIFIER: &str = "io.github.xart3mis.holdexplorer";

/// The version of the app: the configuration has none of its own, so Tauri reports this one.
const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Builds and runs the application. Returns when the last window is closed.
///
/// The crash log hook comes first, so a panic while the app is built or set up leaves a log. A
/// start that fails writes a log, says so in a native message, and ends the process with code 1.
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
    let result = tauri::Builder::default()
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
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let data_dir = app.path().app_data_dir()?;
            let state = AppState::new(config_dir, data_dir);
            // The window exists but has drawn nothing yet: drawing starts with the event loop.
            if let Some(window) = app.get_webview_window("main") {
                // A failure leaves the dark frame, which the page replaces once it has loaded.
                let _ =
                    window.set_background_color(Some(window_background(state.settings().theme)));
            }
            app.manage(Mutex::new(state));
            // Under a lock of its own: the clipboard is set while the state is free.
            app.manage(SessionClipboard::default());
            Ok(())
        })
        .invoke_handler(handler())
        .build(tauri::generate_context!());
    let app = match result {
        Ok(app) => app,
        Err(error) => {
            let report = crash::CrashReport::now(
                VERSION,
                tauri::webview_version().ok(),
                format!("Hold Explorer could not start: {error}"),
                None,
            );
            let log = crash::write_log(&crash::logs_dir(&local_data), &report).ok();
            native::error_message(
                native::STARTUP_FAILURE_TITLE,
                &native::startup_failure_text(&error.to_string(), log.as_deref()),
            );
            std::process::exit(1);
        }
    };
    app.run(|app, event| {
        // The event loop ends the process without dropping what the app manages, and the system's
        // clipboard hands what the app copied to the clipboard manager only when it is dropped:
        // it is let go here, so a copy made just before quitting survives the app on X11.
        if let RunEvent::Exit = event {
            if let Some(clipboard) = app.try_state::<SessionClipboard>() {
                clipboard.release();
            }
        }
    });
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
