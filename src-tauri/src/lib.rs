//! Hold Explorer desktop shell: builds the Tauri application around the engine crates.

#![forbid(unsafe_code)]

pub mod app;
mod commands;

use std::sync::Mutex;

use tauri::Manager;

use app::AppState;

/// Builds and runs the application. Returns when the last window is closed.
pub fn run() {
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
            app.manage(Mutex::new(AppState::new(config_dir, data_dir)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_start,
            commands::settings_set_theme,
            commands::workspace_list,
            commands::workspace_create,
            commands::workspace_open,
            commands::workspace_rename,
            commands::import_open,
            commands::import_choose_sheet,
            commands::import_review,
            commands::import_check_target,
            commands::import_commit,
            commands::import_cancel,
        ])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        eprintln!("Hold Explorer could not start: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    #[test]
    fn capability_file_grants_exactly_the_four_permission_sets_to_main() {
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
        let expected: BTreeSet<&str> = [
            "core:default",
            "dialog:default",
            "opener:default",
            "window-state:default",
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
