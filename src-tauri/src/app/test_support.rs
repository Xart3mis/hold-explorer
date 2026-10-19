//! The set-up the tests of the desktop crate share: temporary configuration and data folders,
//! input files, and a state with a synthetic workspace open.

use std::path::{Path, PathBuf};

use chrono::NaiveDateTime;
use hx_core::filter::FilterSpec;
use hx_synth::{generate, write_workbook, SynthConfig};
use tempfile::TempDir;

use super::import::{ImportCommit, ImportPhase, TargetChoice};
use super::snapshots::ViewRef;
use super::AppState;

/// One temporary folder that holds the configuration folder `config/`, the data folder `data/`
/// (with the workspace folder `data/workspaces/`), and input files in `input/`.
pub(super) struct Fixture {
    pub(super) dir: TempDir,
}

impl Fixture {
    pub(super) fn new() -> Fixture {
        Fixture {
            dir: TempDir::new().unwrap(),
        }
    }

    pub(super) fn config(&self) -> PathBuf {
        self.dir.path().join("config")
    }

    pub(super) fn data(&self) -> PathBuf {
        self.dir.path().join("data")
    }

    pub(super) fn workspaces(&self) -> PathBuf {
        self.data().join("workspaces")
    }

    /// A state on the configuration and data folders, as the app starts.
    pub(super) fn state(&self) -> AppState {
        AppState::new(self.config(), self.data())
    }

    /// The path of the input file `name`; the input folder is made when missing.
    pub(super) fn input(&self, name: &str) -> PathBuf {
        let dir = self.dir.path().join("input");
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    /// The input file `name` with this text.
    pub(super) fn text(&self, name: &str, content: &str) -> PathBuf {
        let path = self.input(name);
        std::fs::write(&path, content).unwrap();
        path
    }

    /// A synthetic workbook of 10 lines and 60 holds.
    pub(super) fn synth(&self, name: &str, seed: u64) -> PathBuf {
        let cfg = SynthConfig::new(seed, 10, 60);
        let path = self.input(name);
        write_workbook(&generate(&cfg), &cfg, &path).unwrap();
        path
    }

    /// A synthetic workbook of 10 lines and 40 holds with this project number.
    pub(super) fn synth_project(&self, name: &str, seed: u64, project_no: &str) -> PathBuf {
        let mut cfg = SynthConfig::new(seed, 10, 40);
        cfg.project_no = project_no.to_string();
        let path = self.input(name);
        write_workbook(&generate(&cfg), &cfg, &path).unwrap();
        path
    }

    /// How many files the workspace folder holds; 0 when it does not exist.
    pub(super) fn workspace_files(&self) -> usize {
        std::fs::read_dir(self.workspaces())
            .map(|entries| entries.count())
            .unwrap_or(0)
    }
}

pub(super) fn at(text: &str) -> NaiveDateTime {
    NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S").unwrap()
}

pub(super) fn no_progress(_: ImportPhase) {}

/// Imports the file as a snapshot dated `taken_at` into a new workspace, or into the open one.
pub(super) fn import(
    state: &mut AppState,
    path: &Path,
    taken_at: &str,
    new_workspace: bool,
) -> i64 {
    let target = if new_workspace {
        TargetChoice::New { name: "W".into() }
    } else {
        TargetChoice::Existing {
            id: state.open_id(),
        }
    };
    state.import_open(path).unwrap();
    state
        .import_commit(
            ImportCommit {
                target,
                taken_at: at(taken_at),
                date_edited: false,
                replace: None,
            },
            &no_progress,
        )
        .unwrap()
        .snapshot
        .id
}

pub(super) fn open_holds() -> FilterSpec {
    FilterSpec::default()
}

pub(super) fn view_of(workspace_id: &str, snapshot_id: Option<i64>) -> ViewRef {
    ViewRef {
        workspace_id: workspace_id.to_string(),
        snapshot_id,
    }
}

/// The view the interface shows when it shows what the state holds.
pub(super) fn shown(state: &AppState) -> ViewRef {
    view_of(&state.open_id(), state.selected_snapshot())
}

/// A state with one workspace holding the small synthetic file.
pub(super) fn small(fx: &Fixture) -> AppState {
    let mut state = fx.state();
    import(
        &mut state,
        &fx.synth("a.xlsx", 1),
        "2026-09-29 00:00:00",
        true,
    );
    state
}
