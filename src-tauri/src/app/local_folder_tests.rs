//! Where the workspaces are kept by default: the local data folder, with the old folder carried
//! over for a user who already has workspaces there.

use std::fs;
use std::path::PathBuf;

use super::settings::load_settings;
use super::test_support::Fixture;
use super::AppState;
use crate::crash;

/// Makes a workspace in the old default folder, `data/workspaces`, as an earlier version did.
fn workspace_in_old_folder(fx: &Fixture) {
    let mut earlier = AppState::new(fx.dir.path().join("earlier"), fx.data(), fx.data());
    earlier.create_workspace("Old").unwrap();
    assert_eq!(fs::read_dir(fx.old_workspaces()).unwrap().count(), 1);
}

/// Makes a workspace in the local default folder.
fn workspace_in_local_folder(fx: &Fixture) {
    let mut state = fx.state();
    state.create_workspace("New").unwrap();
}

#[test]
fn with_no_settings_and_no_files_the_default_is_the_local_folder() {
    let fx = Fixture::new();
    let state = fx.state();
    assert_eq!(state.folder(), fx.workspaces());
    assert_ne!(fx.workspaces(), fx.old_workspaces());
    assert_eq!(state.settings().workspace_dir, None);
    assert!(!fx.config().join("settings.json").exists());
}

#[test]
fn when_only_the_old_folder_has_workspaces_it_is_used_and_saved() {
    let fx = Fixture::new();
    workspace_in_old_folder(&fx);
    let state = fx.state();
    assert_eq!(state.folder(), fx.old_workspaces());
    let expected = Some(fx.old_workspaces().to_string_lossy().into_owned());
    assert_eq!(state.settings().workspace_dir, expected);
    assert_eq!(load_settings(&fx.config()).workspace_dir, expected);
    // Nothing moved, nothing made.
    assert!(!fx.workspaces().exists());
    assert_eq!(fs::read_dir(fx.old_workspaces()).unwrap().count(), 1);
}

#[test]
fn an_unreadable_file_in_the_old_folder_counts_as_a_workspace_file() {
    let fx = Fixture::new();
    fs::create_dir_all(fx.old_workspaces()).unwrap();
    fs::write(
        fx.old_workspaces().join("broken.holdx-ws"),
        "not a database",
    )
    .unwrap();
    assert_eq!(fx.state().folder(), fx.old_workspaces());
}

#[test]
fn the_carry_over_is_made_once_and_the_start_after_it_finds_the_same_folder() {
    let fx = Fixture::new();
    workspace_in_old_folder(&fx);
    drop(fx.state());
    let file = fx.config().join("settings.json");
    let before = fs::read_to_string(&file).unwrap();
    let modified = fs::metadata(&file).unwrap().modified().unwrap();
    let again = fx.state();
    assert_eq!(again.folder(), fx.old_workspaces());
    assert_eq!(fs::read_to_string(&file).unwrap(), before);
    assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), modified);
}

#[test]
fn when_both_folders_have_workspaces_the_local_folder_is_used() {
    let fx = Fixture::new();
    workspace_in_local_folder(&fx);
    workspace_in_old_folder(&fx);
    let state = fx.state();
    assert_eq!(state.folder(), fx.workspaces());
    assert_eq!(state.settings().workspace_dir, None);
}

#[test]
fn when_the_settings_name_a_folder_that_folder_is_used_and_nothing_changes() {
    let fx = Fixture::new();
    workspace_in_old_folder(&fx);
    let chosen = fx.dir.path().join("chosen");
    fs::create_dir_all(fx.config()).unwrap();
    let text = format!(
        r#"{{"workspace_dir":{}}}"#,
        serde_json::to_string(&chosen.to_string_lossy()).unwrap()
    );
    fs::write(fx.config().join("settings.json"), &text).unwrap();
    let state = fx.state();
    assert_eq!(state.folder(), chosen);
    assert_eq!(
        fs::read_to_string(fx.config().join("settings.json")).unwrap(),
        text
    );
}

#[cfg(unix)]
#[test]
fn when_the_settings_are_blocked_the_old_folder_is_used_and_nothing_is_written() {
    use std::os::unix::fs::PermissionsExt;
    let fx = Fixture::new();
    workspace_in_old_folder(&fx);
    fs::create_dir_all(fx.config()).unwrap();
    let path = fx.config().join("settings.json");
    fs::write(&path, r#"{"theme":"Light"}"#).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
    if fs::read(&path).is_ok() {
        // Running as a user whom permissions do not stop (root); nothing to test.
        return;
    }
    let state = fx.state();
    assert!(state.settings_blocked.is_some());
    assert_eq!(state.folder(), fx.old_workspaces());
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"theme":"Light"}"#);
    let names: Vec<_> = fs::read_dir(fx.config())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(names.len(), 1);
}

#[test]
fn the_logs_folder_of_the_start_is_built_from_the_local_data_folder_of_the_state() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let local: PathBuf = state.local_data_dir().to_path_buf();
    assert_eq!(local, fx.local());
    let start = state.start();
    assert_eq!(
        start.logs_folder,
        crash::logs_dir(&local).to_string_lossy().into_owned()
    );
}

#[test]
fn a_carry_over_does_not_come_back_after_the_default_folder_is_chosen() {
    let fx = Fixture::new();
    workspace_in_old_folder(&fx);
    let mut state = fx.state();
    assert_eq!(state.folder(), fx.old_workspaces());
    state.set_workspace_folder(None, false).unwrap();
    assert_eq!(state.folder(), fx.workspaces());
    let restarted = fx.state();
    assert_eq!(restarted.folder(), fx.workspaces());
    assert_eq!(restarted.settings().workspace_dir, None);
    assert!(restarted.settings().workspace_folder_chosen);
}

#[test]
fn a_folder_the_user_chose_is_remembered_as_chosen() {
    let fx = Fixture::new();
    assert!(!fx.state().settings().workspace_folder_chosen);
    let mut state = fx.state();
    state
        .set_workspace_folder(Some(&fx.dir.path().join("mine").to_string_lossy()), false)
        .unwrap();
    assert!(load_settings(&fx.config()).workspace_folder_chosen);
}

#[test]
fn when_the_old_folder_is_the_default_nothing_is_carried_over() {
    let fx = Fixture::new();
    workspace_in_old_folder(&fx);
    let state = AppState::new(fx.config(), fx.data(), fx.data());
    assert_eq!(state.settings().workspace_dir, None);
    assert!(!state.settings().workspace_folder_chosen);
    assert!(!fx.config().join("settings.json").exists());
}
