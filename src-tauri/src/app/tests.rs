use std::path::{Path, PathBuf};

use hx_core::error::ImportError;
use hx_core::load::load_file;
use hx_core::mapping::Field;
use hx_store::{ImportOptions, StoreError, Workspace};
use hx_synth::{generate, write_workbook, SynthConfig};
use tempfile::TempDir;

use super::error::CommandError;
use super::settings::{load_settings, save_settings, Settings, Theme};
use super::AppState;

struct Fixture {
    dir: TempDir,
}

impl Fixture {
    fn new() -> Fixture {
        Fixture {
            dir: TempDir::new().unwrap(),
        }
    }

    fn config(&self) -> PathBuf {
        self.dir.path().join("config")
    }

    fn data(&self) -> PathBuf {
        self.dir.path().join("data")
    }

    fn workspaces(&self) -> PathBuf {
        self.data().join("workspaces")
    }

    fn state(&self) -> AppState {
        AppState::new(self.config(), self.data())
    }
}

/// Imports two synthetic files into the workspace file `<folder>/<id>.holdx-ws`.
fn import_two(folder: &Path, id: &str) -> Vec<i64> {
    let scratch = TempDir::new().unwrap();
    let mut workspace = Workspace::open(&folder.join(format!("{id}.holdx-ws"))).unwrap();
    for seed in [1, 2] {
        let cfg = SynthConfig::new(seed, 10, 40);
        let path = scratch.path().join(format!("s{seed}.xlsx"));
        write_workbook(&generate(&cfg), &cfg, &path).unwrap();
        let loaded = load_file(&path).unwrap();
        let taken = loaded.snapshot.expect("the synthetic file carries a date");
        workspace
            .import(&loaded, taken, &ImportOptions::default())
            .unwrap();
    }
    workspace
        .snapshots()
        .unwrap()
        .into_iter()
        .map(|s| s.id)
        .collect()
}

fn set_version_99(folder: &Path, id: &str) {
    rusqlite::Connection::open(folder.join(format!("{id}.holdx-ws")))
        .unwrap()
        .execute_batch("PRAGMA user_version = 99")
        .unwrap();
}

#[test]
fn defaults_when_no_settings_file_exists() {
    let fx = Fixture::new();
    assert_eq!(load_settings(&fx.config()), Settings::default());
    assert_eq!(Settings::default().theme, Theme::Dark);
    assert_eq!(fx.state().start().settings, Settings::default());
}

#[test]
fn a_theme_is_saved_and_read_back() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let settings = state.set_theme(Theme::Light).unwrap();
    assert_eq!(settings.theme, Theme::Light);
    assert_eq!(load_settings(&fx.config()).theme, Theme::Light);
    assert_eq!(fx.state().start().settings.theme, Theme::Light);
}

#[test]
fn settings_are_written_through_a_temporary_file_that_is_gone_afterwards() {
    let fx = Fixture::new();
    let settings = Settings {
        theme: Theme::System,
        workspace_dir: Some("/somewhere".into()),
        last_workspace: Some("abc".into()),
    };
    save_settings(&fx.config(), &settings).unwrap();
    assert_eq!(load_settings(&fx.config()), settings);
    let names: Vec<String> = std::fs::read_dir(fx.config())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, ["settings.json"]);
}

#[test]
fn a_settings_file_that_cannot_be_parsed_is_set_aside_and_defaults_are_used() {
    let fx = Fixture::new();
    std::fs::create_dir_all(fx.config()).unwrap();
    std::fs::write(fx.config().join("settings.json"), "{ not json").unwrap();
    assert_eq!(load_settings(&fx.config()), Settings::default());
    assert!(!fx.config().join("settings.json").exists());
    assert_eq!(
        std::fs::read_to_string(fx.config().join("settings.json.unreadable")).unwrap(),
        "{ not json"
    );

    // A second bad file replaces the first set-aside copy.
    std::fs::write(fx.config().join("settings.json"), "[1").unwrap();
    assert_eq!(load_settings(&fx.config()), Settings::default());
    assert_eq!(
        std::fs::read_to_string(fx.config().join("settings.json.unreadable")).unwrap(),
        "[1"
    );
}

#[test]
fn a_settings_file_with_missing_fields_fills_them_with_defaults() {
    let fx = Fixture::new();
    std::fs::create_dir_all(fx.config()).unwrap();
    std::fs::write(fx.config().join("settings.json"), r#"{"theme":"Light"}"#).unwrap();
    let settings = load_settings(&fx.config());
    assert_eq!(settings.theme, Theme::Light);
    assert_eq!(settings.workspace_dir, None);
}

#[test]
fn create_then_list_shows_the_workspace_and_the_folder_in_use() {
    let fx = Fixture::new();
    let mut state = fx.state();
    assert!(!fx.workspaces().exists(), "the folder is made on first use");
    assert!(state.list_workspaces().unwrap().workspaces.is_empty());

    let opened = state.create_workspace("  Plant A ").unwrap();
    assert_eq!(opened.workspace.name, "Plant A");
    assert_eq!(opened.workspace.snapshot_count, 0);
    assert!(opened.snapshots.is_empty());
    assert_eq!(opened.selected, None);

    let list = state.list_workspaces().unwrap();
    assert_eq!(list.workspaces, [opened.workspace]);
    assert!(list.unreadable.is_empty());
    assert_eq!(list.folder, fx.workspaces().to_string_lossy());
}

#[test]
fn a_configured_workspace_folder_is_used_as_given() {
    let fx = Fixture::new();
    let elsewhere = fx.dir.path().join("elsewhere");
    save_settings(
        &fx.config(),
        &Settings {
            workspace_dir: Some(elsewhere.to_string_lossy().into_owned()),
            ..Settings::default()
        },
    )
    .unwrap();
    let mut state = fx.state();
    state.create_workspace("X").unwrap();
    assert_eq!(std::fs::read_dir(&elsewhere).unwrap().count(), 1);
    assert!(!fx.workspaces().exists());
    assert_eq!(
        state.list_workspaces().unwrap().folder,
        elsewhere.to_string_lossy()
    );
}

#[test]
fn workspaces_list_in_name_order_whatever_the_case() {
    let fx = Fixture::new();
    let mut state = fx.state();
    for name in ["bravo", "Charlie", "alpha", "Bravo"] {
        state.create_workspace(name).unwrap();
    }
    let list = state.list_workspaces().unwrap();
    let names: Vec<&str> = list.workspaces.iter().map(|w| w.name.as_str()).collect();
    assert_eq!(names.len(), 4);
    assert_eq!(names[0], "alpha");
    assert_eq!(names[3], "Charlie");
    assert!(names[1..3].iter().all(|n| n.eq_ignore_ascii_case("bravo")));
    // Equal names keep the order of their ids.
    assert!(list.workspaces[1].id < list.workspaces[2].id);
}

#[test]
fn opening_by_id_returns_the_snapshots_with_the_newest_selected() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let created = state.create_workspace("A").unwrap();
    let other = state.create_workspace("B").unwrap();
    let ids = import_two(&fx.workspaces(), &created.workspace.id);
    assert_eq!(ids.len(), 2);

    let opened = state.open_workspace(&created.workspace.id).unwrap();
    assert_eq!(opened.workspace.id, created.workspace.id);
    assert_eq!(opened.workspace.snapshot_count, 2);
    let listed: Vec<i64> = opened.snapshots.iter().map(|s| s.id).collect();
    assert_eq!(listed, ids);
    assert_eq!(opened.selected, ids.last().copied());
    assert_eq!(state.selected_snapshot(), ids.last().copied());
    assert_eq!(
        state.settings().last_workspace.as_deref(),
        Some(created.workspace.id.as_str())
    );

    // Opening another workspace clears the selection.
    let second = state.open_workspace(&other.workspace.id).unwrap();
    assert_eq!(second.selected, None);
    assert_eq!(state.selected_snapshot(), None);
}

#[test]
fn start_reopens_the_last_workspace() {
    let fx = Fixture::new();
    let id = {
        let mut state = fx.state();
        state.create_workspace("First").unwrap();
        state.create_workspace("Second").unwrap().workspace.id
    };
    let started = fx.state().start();
    assert_eq!(started.version, env!("CARGO_PKG_VERSION"));
    assert_eq!(started.list.workspaces.len(), 2);
    assert_eq!(started.open.map(|o| o.workspace.id), Some(id.clone()));
    assert_eq!(started.settings.last_workspace, Some(id));
}

#[test]
fn start_with_a_deleted_last_workspace_opens_none_and_lists_the_others() {
    let fx = Fixture::new();
    let (kept, gone) = {
        let mut state = fx.state();
        let kept = state.create_workspace("Kept").unwrap().workspace.id;
        let gone = state.create_workspace("Gone").unwrap().workspace.id;
        (kept, gone)
    };
    std::fs::remove_file(fx.workspaces().join(format!("{gone}.holdx-ws"))).unwrap();
    let started = fx.state().start();
    assert!(started.open.is_none());
    let ids: Vec<&str> = started
        .list
        .workspaces
        .iter()
        .map(|w| w.id.as_str())
        .collect();
    assert_eq!(ids, [kept.as_str()]);
}

#[test]
fn start_with_no_last_workspace_opens_none() {
    let fx = Fixture::new();
    assert!(fx.state().start().open.is_none());
}

#[test]
fn an_unreadable_workspace_is_listed_with_its_kind_and_message() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let good = state.create_workspace("Good").unwrap().workspace.id;
    let bad = state.create_workspace("Bad").unwrap().workspace.id;
    set_version_99(&fx.workspaces(), &bad);

    let list = state.list_workspaces().unwrap();
    assert_eq!(list.workspaces.len(), 1);
    assert_eq!(list.workspaces[0].id, good);
    assert_eq!(list.unreadable.len(), 1);
    let entry = &list.unreadable[0];
    assert_eq!(entry.file_name, format!("{bad}.holdx-ws"));
    assert_eq!(entry.kind, "NewerSchema");
    assert!(entry.message.contains("newer version"), "{}", entry.message);
    assert!(entry.path.ends_with(&entry.file_name));

    // Opening it by id gives that workspace's own error.
    let error = state.open_workspace(&bad).unwrap_err();
    assert_eq!(error.kind, "NewerSchema");
    assert_eq!(error.message, entry.message);
}

#[test]
fn an_unknown_id_is_workspace_not_found() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state.create_workspace("A").unwrap();
    let error = state.open_workspace("0123456789abcdef").unwrap_err();
    assert_eq!(error.kind, "WorkspaceNotFound");
    assert!(!error.message.is_empty());
    assert!(state.open_workspace("../escape").is_err());
}

#[test]
fn a_failed_open_keeps_the_workspace_that_was_open() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let id = state.create_workspace("A").unwrap().workspace.id;
    assert!(state.open_workspace("0123456789abcdef").is_err());
    assert_eq!(state.rename_workspace("B").unwrap().id, id);
}

#[test]
fn rename_persists_and_a_blank_name_becomes_the_default() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let id = state.create_workspace("Before").unwrap().workspace.id;

    let renamed = state.rename_workspace("  After ").unwrap();
    assert_eq!(renamed.id, id);
    assert_eq!(renamed.name, "After");
    assert_eq!(state.list_workspaces().unwrap().workspaces[0].name, "After");
    assert_eq!(fx.state().start().list.workspaces[0].name, "After");

    let blank = state.rename_workspace("   ").unwrap();
    assert_eq!(blank.name, "Untitled workspace");
}

#[test]
fn rename_without_an_open_workspace_is_no_workspace() {
    let fx = Fixture::new();
    let error = fx.state().rename_workspace("X").unwrap_err();
    assert_eq!(error.kind, "NoWorkspace");
}

/// One example of every `StoreError` variant with the kind it must report. The `match` has no
/// wildcard arm, so a new variant does not compile until it is named here.
fn store_errors() -> Vec<(StoreError, &'static str)> {
    let at = chrono::NaiveDate::from_ymd_opt(2026, 3, 1)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .unwrap();
    let examples = vec![
        StoreError::NotAWorkspace { path: "a".into() },
        StoreError::NewerSchema {
            path: "a".into(),
            found: 99,
            supported: 1,
        },
        StoreError::AlreadyImported {
            snapshot_id: 1,
            taken_at: at,
            file_name: "a.xlsx".into(),
        },
        StoreError::SnapshotNotFound { snapshot_id: 1 },
        StoreError::SnapshotDateOutOfRange { at },
        StoreError::Io {
            path: "a".into(),
            detail: "denied".into(),
        },
        StoreError::Database {
            detail: "locked".into(),
        },
        StoreError::Corrupt {
            detail: "bad".into(),
        },
    ];
    examples
        .into_iter()
        .map(|error| {
            let kind = match &error {
                StoreError::NotAWorkspace { .. } => "NotAWorkspace",
                StoreError::NewerSchema { .. } => "NewerSchema",
                StoreError::AlreadyImported { .. } => "AlreadyImported",
                StoreError::SnapshotNotFound { .. } => "SnapshotNotFound",
                StoreError::SnapshotDateOutOfRange { .. } => "SnapshotDateOutOfRange",
                StoreError::Io { .. } => "Io",
                StoreError::Database { .. } => "Database",
                StoreError::Corrupt { .. } => "Corrupt",
            };
            (error, kind)
        })
        .collect()
}

/// One example of every `ImportError` variant with the kind it must report; see `store_errors`.
fn import_errors() -> Vec<(ImportError, &'static str)> {
    let examples = vec![
        ImportError::NotFound { path: "a".into() },
        ImportError::Unreadable {
            path: "a".into(),
            detail: "bad".into(),
        },
        ImportError::EmptyFile { path: "a".into() },
        ImportError::NoDataSheet {
            sheets: vec!["x".into()],
        },
        ImportError::SheetNotFound {
            sheet: "s".into(),
            sheets: vec![],
        },
        ImportError::MissingColumns {
            missing: vec![Field::LineId],
        },
        ImportError::Empty,
        ImportError::NoHolds {
            skipped_rows: 2,
            example: "row 3".into(),
        },
    ];
    examples
        .into_iter()
        .map(|error| {
            let kind = match &error {
                ImportError::NotFound { .. } => "NotFound",
                ImportError::Unreadable { .. } => "Unreadable",
                ImportError::EmptyFile { .. } => "EmptyFile",
                ImportError::NoDataSheet { .. } => "NoDataSheet",
                ImportError::SheetNotFound { .. } => "SheetNotFound",
                ImportError::MissingColumns { .. } => "MissingColumns",
                ImportError::Empty => "Empty",
                ImportError::NoHolds { .. } => "NoHolds",
            };
            (error, kind)
        })
        .collect()
}

#[test]
fn every_store_error_keeps_its_variant_name_and_text() {
    for (error, kind) in store_errors() {
        let message = error.to_string();
        let converted = CommandError::from(error);
        assert_eq!(converted.kind, kind);
        assert_eq!(converted.message, message);
    }
}

#[test]
fn every_import_error_keeps_its_variant_name_and_text() {
    for (error, kind) in import_errors() {
        let message = error.to_string();
        let converted = CommandError::from(error);
        assert_eq!(converted.kind, kind);
        assert_eq!(converted.message, message);
    }
}

#[test]
fn a_command_error_serializes_as_kind_and_message() {
    let error = CommandError::from(ImportError::Empty);
    assert_eq!(
        serde_json::to_value(&error).unwrap(),
        serde_json::json!({"kind": "Empty", "message": ImportError::Empty.to_string()})
    );
}

/// A state whose configuration directory is a file, so no setting can be saved.
fn unsavable(fx: &Fixture) -> AppState {
    std::fs::create_dir_all(fx.dir.path()).unwrap();
    std::fs::write(fx.config(), "not a folder").unwrap();
    fx.state()
}

fn workspace_files(folder: &Path) -> usize {
    std::fs::read_dir(folder).unwrap().count()
}

#[test]
fn a_create_succeeds_and_warns_when_the_settings_cannot_be_saved() {
    let fx = Fixture::new();
    let mut state = unsavable(&fx);
    let opened = state.create_workspace("A").unwrap();
    let warning = opened.warning.expect("the failed save is reported");
    assert_eq!(warning.kind, "Settings");
    assert!(warning.message.contains("is open"), "{}", warning.message);
    assert!(
        warning.message.contains("next start"),
        "{}",
        warning.message
    );
    assert_eq!(workspace_files(&fx.workspaces()), 1);
    assert_eq!(state.rename_workspace("B").unwrap().id, opened.workspace.id);
    assert_eq!(state.list_workspaces().unwrap().workspaces.len(), 1);
}

#[test]
fn an_open_succeeds_and_warns_when_the_settings_cannot_be_saved() {
    let fx = Fixture::new();
    let id = {
        let mut state = fx.state();
        state.create_workspace("A").unwrap().workspace.id
    };
    std::fs::remove_dir_all(fx.config()).unwrap();
    let mut state = unsavable(&fx);
    let opened = state.open_workspace(&id).unwrap();
    assert_eq!(opened.warning.map(|w| w.kind), Some("Settings".to_string()));
    assert_eq!(state.rename_workspace("B").unwrap().id, id);
}

#[test]
fn a_save_that_works_gives_no_warning() {
    let fx = Fixture::new();
    let mut state = fx.state();
    assert!(state.create_workspace("A").unwrap().warning.is_none());
    let id = state.list_workspaces().unwrap().workspaces[0].id.clone();
    assert!(state.open_workspace(&id).unwrap().warning.is_none());
    assert!(fx.state().start().open.unwrap().warning.is_none());
}

#[test]
fn set_theme_fails_with_settings_and_keeps_the_theme_when_it_cannot_be_saved() {
    let fx = Fixture::new();
    let mut state = unsavable(&fx);
    let error = state.set_theme(Theme::Light).unwrap_err();
    assert_eq!(error.kind, "Settings");
    assert_eq!(state.settings().theme, Theme::Dark);
}

#[test]
fn start_reports_a_workspace_folder_that_cannot_be_listed() {
    let fx = Fixture::new();
    let file = fx.dir.path().join("a-file");
    std::fs::write(&file, "x").unwrap();
    save_settings(
        &fx.config(),
        &Settings {
            workspace_dir: Some(file.to_string_lossy().into_owned()),
            ..Settings::default()
        },
    )
    .unwrap();
    let started = fx.state().start();
    assert!(started.list.workspaces.is_empty());
    assert_eq!(started.list.folder, file.to_string_lossy());
    assert_eq!(started.list_error.map(|e| e.kind), Some("Io".to_string()));
}

#[test]
fn a_folder_that_does_not_exist_yet_is_not_an_error() {
    let fx = Fixture::new();
    let started = fx.state().start();
    assert!(started.list_error.is_none());
    assert!(started.list.workspaces.is_empty());
}

#[test]
fn start_with_an_unreadable_last_workspace_opens_none_and_lists_the_others() {
    let fx = Fixture::new();
    let (good, bad) = {
        let mut state = fx.state();
        let good = state.create_workspace("Good").unwrap().workspace.id;
        let bad = state.create_workspace("Bad").unwrap().workspace.id;
        (good, bad)
    };
    set_version_99(&fx.workspaces(), &bad);
    let started = fx.state().start();
    assert!(started.open.is_none());
    let ids: Vec<&str> = started
        .list
        .workspaces
        .iter()
        .map(|w| w.id.as_str())
        .collect();
    assert_eq!(ids, [good.as_str()]);
    assert_eq!(started.list.unreadable.len(), 1);
    assert_eq!(started.list.unreadable[0].kind, "NewerSchema");
    assert!(started.list_error.is_none());
}

#[test]
fn a_settings_path_that_is_a_directory_is_set_aside() {
    let fx = Fixture::new();
    std::fs::create_dir_all(fx.config().join("settings.json")).unwrap();
    assert_eq!(load_settings(&fx.config()), Settings::default());
    assert!(fx.config().join("settings.json.unreadable").is_dir());
    save_settings(&fx.config(), &Settings::default()).unwrap();
    assert!(fx.config().join("settings.json").is_file());
}

#[test]
fn a_settings_path_that_cannot_be_set_aside_is_never_overwritten() {
    let fx = Fixture::new();
    let path = fx.config().join("settings.json");
    // Neither the path nor the set-aside name can be replaced: both are folders with content.
    for name in ["settings.json", "settings.json.unreadable"] {
        let dir = fx.config().join(name);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("keep"), "x").unwrap();
    }
    assert_eq!(load_settings(&fx.config()), Settings::default());
    let error = save_settings(&fx.config(), &Settings::default()).unwrap_err();
    assert_eq!(error.kind, "Settings");
    assert!(error.message.contains("settings.json"), "{}", error.message);
    assert!(path.join("keep").is_file());
    let mut state = fx.state();
    assert_eq!(state.set_theme(Theme::Light).unwrap_err().kind, "Settings");
    assert!(path.join("keep").is_file());
}
