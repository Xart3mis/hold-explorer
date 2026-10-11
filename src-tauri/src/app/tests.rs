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

fn store_errors() -> Vec<StoreError> {
    let at = chrono::NaiveDate::from_ymd_opt(2026, 3, 1)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .unwrap();
    vec![
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
    ]
}

fn import_errors() -> Vec<ImportError> {
    vec![
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
    ]
}

#[test]
fn every_store_error_keeps_its_variant_name_and_text() {
    let expected = [
        "NotAWorkspace",
        "NewerSchema",
        "AlreadyImported",
        "SnapshotNotFound",
        "SnapshotDateOutOfRange",
        "Io",
        "Database",
        "Corrupt",
    ];
    let errors = store_errors();
    assert_eq!(errors.len(), expected.len());
    for (error, kind) in errors.into_iter().zip(expected) {
        let message = error.to_string();
        let converted = CommandError::from(error);
        assert_eq!(converted.kind, kind);
        assert_eq!(converted.message, message);
    }
}

#[test]
fn every_import_error_keeps_its_variant_name_and_text() {
    let expected = [
        "NotFound",
        "Unreadable",
        "EmptyFile",
        "NoDataSheet",
        "SheetNotFound",
        "MissingColumns",
        "Empty",
        "NoHolds",
    ];
    let errors = import_errors();
    assert_eq!(errors.len(), expected.len());
    for (error, kind) in errors.into_iter().zip(expected) {
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
