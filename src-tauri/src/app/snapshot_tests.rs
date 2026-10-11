use std::path::{Path, PathBuf};

use chrono::{Duration, NaiveDateTime};
use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FieldFilter, FilterSpec, Status};
use hx_core::load::load_file;
use hx_core::query::{group_by, summary};
use hx_core::rules::RuleSet;
use hx_store::{list_workspaces, StoreError, Workspace};
use hx_synth::{generate, write_workbook, SynthConfig};
use tempfile::TempDir;

use super::import::{ImportCommit, ImportPhase, TargetChoice};
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

    fn workspaces(&self) -> PathBuf {
        self.dir.path().join("data").join("workspaces")
    }

    fn state(&self) -> AppState {
        AppState::new(self.dir.path().join("config"), self.dir.path().join("data"))
    }

    fn synth(&self, name: &str, seed: u64) -> PathBuf {
        let cfg = SynthConfig::new(seed, 10, 60);
        let dir = self.dir.path().join("input");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        write_workbook(&generate(&cfg), &cfg, &path).unwrap();
        path
    }
}

fn at(text: &str) -> NaiveDateTime {
    NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S").unwrap()
}

fn no_progress(_: ImportPhase) {}

/// Imports the file as a snapshot dated `taken_at` into a new workspace, or into the open one.
fn import(state: &mut AppState, path: &Path, taken_at: &str, new_workspace: bool) -> i64 {
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

fn open_holds() -> FilterSpec {
    FilterSpec::default()
}

/// The numbers `overview` must give for a file, computed without the app.
fn direct(
    path: &Path,
    taken: NaiveDateTime,
    spec: &FilterSpec,
) -> (hx_core::query::Summary, Vec<hx_core::query::Group>) {
    let loaded = load_file(path).unwrap();
    let dataset = Dataset::build(loaded.parsed.holds.clone(), RuleSet::builtin(), taken);
    (
        summary(&dataset, spec),
        group_by(&dataset, spec, &Dim::Discipline),
    )
}

#[test]
fn overview_without_a_workspace_says_so_and_without_snapshots_is_none() {
    let fx = Fixture::new();
    let mut state = fx.state();
    assert_eq!(
        state.overview(&open_holds()).unwrap_err().kind,
        "NoWorkspace"
    );
    assert_eq!(state.select_snapshot(1).unwrap_err().kind, "NoWorkspace");
    state.create_workspace("Empty").unwrap();
    assert_eq!(state.overview(&open_holds()).unwrap(), None);
}

#[test]
fn the_overview_equals_the_engine_run_on_the_same_file() {
    let fx = Fixture::new();
    let path = fx.synth("a.xlsx", 1);
    let mut state = fx.state();
    let id = import(&mut state, &path, "2026-09-29 13:16:00", true);
    let view = state.overview(&open_holds()).unwrap().unwrap();
    let (expected, groups) = direct(&path, at("2026-09-29 13:16:00"), &open_holds());
    assert_eq!(view.snapshot.id, id);
    assert!(view.is_latest);
    assert_eq!(view.summary, expected);
    assert_eq!(view.by_discipline, groups);
    assert!(view.summary.holds > 0);
    let loaded = load_file(&path).unwrap();
    let dataset = Dataset::build(
        loaded.parsed.holds.clone(),
        RuleSet::builtin(),
        at("2026-09-29 13:16:00"),
    );
    assert_eq!(
        view.by_hold_type,
        group_by(&dataset, &open_holds(), &Dim::HoldType)
    );
}

#[test]
fn selecting_the_older_snapshot_gives_its_numbers_and_says_it_is_not_the_latest() {
    let fx = Fixture::new();
    let (first, second) = (fx.synth("a.xlsx", 1), fx.synth("b.xlsx", 2));
    let mut state = fx.state();
    let older = import(&mut state, &first, "2026-09-01 00:00:00", true);
    let newer = import(&mut state, &second, "2026-09-08 00:00:00", false);
    assert_eq!(state.selected_snapshot(), Some(newer));

    let opened = state.select_snapshot(older).unwrap();
    assert_eq!(opened.selected, Some(older));
    assert_eq!(opened.snapshots.len(), 2);
    assert_eq!(opened.workspace.snapshot_count, 2);
    assert_eq!(state.selected_snapshot(), Some(older));

    let view = state.overview(&open_holds()).unwrap().unwrap();
    assert_eq!(view.snapshot.id, older);
    assert!(!view.is_latest);
    let (expected, _) = direct(&first, at("2026-09-01 00:00:00"), &open_holds());
    assert_eq!(view.summary, expected);

    state.select_snapshot(newer).unwrap();
    let view = state.overview(&open_holds()).unwrap().unwrap();
    assert!(view.is_latest);
    let (expected, _) = direct(&second, at("2026-09-08 00:00:00"), &open_holds());
    assert_eq!(view.summary, expected);
}

#[test]
fn an_unknown_snapshot_id_is_refused_and_the_selection_stays() {
    let fx = Fixture::new();
    let path = fx.synth("a.xlsx", 1);
    let mut state = fx.state();
    let id = import(&mut state, &path, "2026-09-29 00:00:00", true);
    let error = state.select_snapshot(id + 100).unwrap_err();
    assert_eq!(error.kind, "SnapshotNotFound");
    assert_eq!(state.selected_snapshot(), Some(id));
}

#[test]
fn the_dataset_is_built_once_and_again_after_a_selection_or_an_import() {
    let fx = Fixture::new();
    let (first, second) = (fx.synth("a.xlsx", 1), fx.synth("b.xlsx", 2));
    let mut state = fx.state();
    let older = import(&mut state, &first, "2026-09-01 00:00:00", true);
    assert_eq!(state.dataset_builds(), 0);
    state.overview(&open_holds()).unwrap();
    state.overview(&open_holds()).unwrap();
    assert_eq!(state.dataset_builds(), 1);

    import(&mut state, &second, "2026-09-08 00:00:00", false);
    state.overview(&open_holds()).unwrap();
    assert_eq!(state.dataset_builds(), 2, "an import drops the dataset");
    state.overview(&open_holds()).unwrap();
    assert_eq!(state.dataset_builds(), 2);

    state.select_snapshot(older).unwrap();
    state.overview(&open_holds()).unwrap();
    assert_eq!(state.dataset_builds(), 3, "a selection drops the dataset");

    let id = state.open_id();
    state.open_workspace(&id).unwrap();
    state.overview(&open_holds()).unwrap();
    assert_eq!(state.dataset_builds(), 4, "opening a workspace drops it");
}

#[test]
fn a_filter_with_a_discipline_returns_only_that_disciplines_holds() {
    let fx = Fixture::new();
    let path = fx.synth("a.xlsx", 1);
    let mut state = fx.state();
    import(&mut state, &path, "2026-09-29 00:00:00", true);
    let all = state.overview(&open_holds()).unwrap().unwrap();
    let top = all.by_discipline.first().unwrap().clone();
    assert!(all.by_discipline.len() > 1);

    let spec = FilterSpec {
        fields: vec![FieldFilter {
            dim: Dim::Discipline,
            values: vec![top.key.clone()],
            negate: false,
        }],
        ..FilterSpec::default()
    };
    let view = state.overview(&spec).unwrap().unwrap();
    assert_eq!(view.by_discipline, std::slice::from_ref(&top));
    assert_eq!(view.summary.holds, top.holds);
    assert_eq!(
        view.by_hold_type.iter().map(|g| g.holds).sum::<usize>(),
        top.holds
    );
}

#[test]
fn the_complete_default_filter_the_interface_sends_means_open_holds() {
    let json = r#"{"status":"Open","fields":[],"text":"","age_bands":[],"created":{"from":null,"to":null},"released":{"from":null,"to":null},"size_mismatch":null}"#;
    let spec: FilterSpec = serde_json::from_str(json).unwrap();
    assert_eq!(spec, FilterSpec::default());
    assert_eq!(spec.status, Status::Open);
}

fn demo_snapshots(fx: &Fixture, id: &str) -> Workspace {
    Workspace::open(&fx.workspaces().join(format!("{id}.holdx-ws"))).unwrap()
}

#[test]
fn the_demo_workspace_has_four_snapshots_seven_days_apart_and_the_newest_selected() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let started = std::time::Instant::now();
    let opened = state.create_demo().unwrap();
    eprintln!("demo took {:?}", started.elapsed());

    assert_eq!(opened.workspace.name, "Demo");
    assert_eq!(opened.snapshots.len(), 4);
    let dates: Vec<NaiveDateTime> = opened.snapshots.iter().map(|s| s.taken_at).collect();
    for pair in dates.windows(2) {
        assert_eq!(pair[1] - pair[0], Duration::days(7));
    }
    assert_eq!(opened.selected, opened.snapshots.last().map(|s| s.id));
    assert_eq!(state.selected_snapshot(), opened.selected);
    assert_eq!(opened.snapshots[0].row_count, 9_300);
    assert_eq!(opened.workspace.project_numbers.len(), 1);

    let workspace = demo_snapshots(&fx, &opened.workspace.id);
    for snapshot in &opened.snapshots {
        let detail = workspace.snapshot_detail(snapshot.id).unwrap();
        assert!(detail.skipped.is_empty(), "snapshot {}", snapshot.id);
        assert!(!snapshot.limited);
    }
    assert!(workspace.saved_mapping().unwrap().is_some());

    let view = state.overview(&open_holds()).unwrap().unwrap();
    assert!(view.is_latest);
    assert!(view.summary.holds > 0);

    // A second demo is a second workspace; the first is not touched.
    let second = state.create_demo().unwrap();
    assert_ne!(second.workspace.id, opened.workspace.id);
    let list = list_workspaces(&fx.workspaces()).unwrap();
    assert_eq!(list.workspaces.len(), 2);
    assert!(list
        .workspaces
        .iter()
        .all(|w| w.name == "Demo" && w.snapshot_count == 4));
}

#[test]
fn a_demo_that_fails_part_way_removes_its_file_and_keeps_the_open_workspace() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let kept = state.create_workspace("Keep").unwrap();
    let missing = fx.dir.path().join("no-such-folder");

    let error = state
        .create_demo_with(&missing, &hx_store::delete_workspace)
        .unwrap_err();
    assert_eq!(error.kind, "Internal");
    assert!(
        !error.message.contains("could not be removed"),
        "{}",
        error.message
    );
    let list = list_workspaces(&fx.workspaces()).unwrap();
    assert_eq!(list.workspaces.len(), 1);
    assert_eq!(list.workspaces[0].id, kept.workspace.id);
    assert_eq!(state.open_id(), kept.workspace.id);
}

#[test]
fn a_demo_workspace_that_cannot_be_removed_is_named_in_the_error() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let missing = fx.dir.path().join("no-such-folder");
    let remover = |_: &Path| -> Result<(), StoreError> {
        Err(StoreError::Io {
            path: "x".into(),
            detail: "Permission denied".into(),
        })
    };
    let error = state.create_demo_with(&missing, &remover).unwrap_err();
    assert!(error.message.contains("\"Demo\""), "{}", error.message);
    assert!(
        error.message.contains("could not be removed"),
        "{}",
        error.message
    );
    assert!(
        error.message.contains("delete it by hand"),
        "{}",
        error.message
    );
    assert!(error.message.contains(".holdx-ws"), "{}", error.message);
}
