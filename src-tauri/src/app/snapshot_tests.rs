use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::{Duration, NaiveDateTime};
use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FieldFilter, FilterSpec, Status};
use hx_core::load::load_file;
use hx_core::mapping::Field;
use hx_core::query::{group_by, summary};
use hx_core::rules::RuleSet;
use hx_core::warning::WarningKind;
use hx_store::{delete_workspace, list_workspaces, StoreError, Workspace};
use hx_synth::{generate, write_workbook, SynthConfig};
use tempfile::TempDir;

use super::error::CommandError;
use super::import::{ImportCommit, ImportPhase, TargetChoice};
use super::snapshots::{OverviewView, ViewRef};
use super::AppState;

pub(super) struct Fixture {
    pub(super) dir: TempDir,
}

impl Fixture {
    pub(super) fn new() -> Fixture {
        Fixture {
            dir: TempDir::new().unwrap(),
        }
    }

    fn workspaces(&self) -> PathBuf {
        self.dir.path().join("data").join("workspaces")
    }

    pub(super) fn state(&self) -> AppState {
        AppState::new(self.dir.path().join("config"), self.dir.path().join("data"))
    }

    pub(super) fn synth(&self, name: &str, seed: u64) -> PathBuf {
        let cfg = SynthConfig::new(seed, 10, 60);
        let dir = self.dir.path().join("input");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        write_workbook(&generate(&cfg), &cfg, &path).unwrap();
        path
    }
}

pub(super) fn at(text: &str) -> NaiveDateTime {
    NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S").unwrap()
}

fn no_progress(_: ImportPhase) {}

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

/// The overview as the interface asks for it when what it shows is what the state holds.
fn overview(state: &mut AppState, spec: &FilterSpec) -> Option<OverviewView> {
    let view = view_of(&state.open_id(), state.selected_snapshot());
    state.overview(spec, &view).unwrap()
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
    for snapshot_id in [None, Some(1)] {
        let view = view_of("0123456789abcdef", snapshot_id);
        assert_eq!(
            state.overview(&open_holds(), &view).unwrap_err().kind,
            "NoWorkspace"
        );
    }
    assert_eq!(state.select_snapshot(1).unwrap_err().kind, "NoWorkspace");
    state.create_workspace("Empty").unwrap();
    assert_eq!(overview(&mut state, &open_holds()), None);
}

#[test]
fn the_overview_equals_the_engine_run_on_the_same_file() {
    let fx = Fixture::new();
    let path = fx.synth("a.xlsx", 1);
    let mut state = fx.state();
    let id = import(&mut state, &path, "2026-09-29 13:16:00", true);
    let view = overview(&mut state, &open_holds()).unwrap();
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

    let view = overview(&mut state, &open_holds()).unwrap();
    assert_eq!(view.snapshot.id, older);
    assert!(!view.is_latest);
    let (expected, _) = direct(&first, at("2026-09-01 00:00:00"), &open_holds());
    assert_eq!(view.summary, expected);

    state.select_snapshot(newer).unwrap();
    let view = overview(&mut state, &open_holds()).unwrap();
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
    overview(&mut state, &open_holds());
    overview(&mut state, &open_holds());
    assert_eq!(state.dataset_builds(), 1);

    import(&mut state, &second, "2026-09-08 00:00:00", false);
    overview(&mut state, &open_holds());
    assert_eq!(state.dataset_builds(), 2, "an import drops the dataset");
    overview(&mut state, &open_holds());
    assert_eq!(state.dataset_builds(), 2);

    state.select_snapshot(older).unwrap();
    overview(&mut state, &open_holds());
    assert_eq!(state.dataset_builds(), 3, "a selection drops the dataset");

    let id = state.open_id();
    state.open_workspace(&id).unwrap();
    overview(&mut state, &open_holds());
    assert_eq!(state.dataset_builds(), 4, "opening a workspace drops it");
}

#[test]
fn the_overview_answers_only_for_the_view_the_interface_shows() {
    let fx = Fixture::new();
    let (first, second) = (fx.synth("a.xlsx", 1), fx.synth("b.xlsx", 2));
    let mut state = fx.state();
    let older = import(&mut state, &first, "2026-09-01 00:00:00", true);
    let newer = import(&mut state, &second, "2026-09-08 00:00:00", false);
    let workspace = state.open_id();

    // The view the interface shows: answered, for that snapshot.
    let answer = state
        .overview(&open_holds(), &view_of(&workspace, Some(newer)))
        .unwrap()
        .unwrap();
    assert_eq!(answer.snapshot.id, newer);
    assert_eq!(state.dataset_builds(), 1);

    // Another workspace, another snapshot, and no snapshot at all: refused, and nothing is read.
    for stale in [
        view_of("0123456789abcdef", Some(newer)),
        view_of(&workspace, Some(older)),
        view_of(&workspace, Some(newer + 100)),
        view_of(&workspace, None),
    ] {
        let error = state.overview(&open_holds(), &stale).unwrap_err();
        assert_eq!(error.kind, "ViewChanged", "{stale:?}");
        assert!(
            error
                .message
                .contains("changed while the request was on its way"),
            "{}",
            error.message
        );
        assert!(
            error.message.contains("reads it again"),
            "{}",
            error.message
        );
    }
    assert_eq!(state.dataset_builds(), 1);

    // A request made for the newer snapshot that arrives after the older one was selected is
    // refused, and so is one made for the workspace that was open before another was opened.
    state.select_snapshot(older).unwrap();
    let late = state.overview(&open_holds(), &view_of(&workspace, Some(newer)));
    assert_eq!(late.unwrap_err().kind, "ViewChanged");
    let now = overview(&mut state, &open_holds()).unwrap();
    assert_eq!(now.snapshot.id, older);
    let other = state.create_workspace("Other").unwrap().workspace.id;
    let late = state.overview(&open_holds(), &view_of(&workspace, Some(older)));
    assert_eq!(late.unwrap_err().kind, "ViewChanged");

    // A workspace without snapshots answers `None` for no snapshot, and refuses a snapshot.
    assert_eq!(
        state
            .overview(&open_holds(), &view_of(&other, None))
            .unwrap(),
        None
    );
    let error = state
        .overview(&open_holds(), &view_of(&other, Some(older)))
        .unwrap_err();
    assert_eq!(error.kind, "ViewChanged");
}

#[test]
fn the_view_reference_reads_what_the_interface_sends() {
    let view: ViewRef =
        serde_json::from_str(r#"{"workspace_id":"0123456789abcdef","snapshot_id":3}"#).unwrap();
    assert_eq!(view, view_of("0123456789abcdef", Some(3)));
    let view: ViewRef =
        serde_json::from_str(r#"{"workspace_id":"0123456789abcdef","snapshot_id":null}"#).unwrap();
    assert_eq!(view, view_of("0123456789abcdef", None));
}

/// A file of the given rows, imported into a new workspace: its overview for open holds, and
/// the kinds of the warnings its review gave.
fn overview_of_text(fx: &Fixture, name: &str, content: &str) -> (OverviewView, Vec<WarningKind>) {
    let dir = fx.dir.path().join("input");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, content).unwrap();
    let mut state = fx.state();
    state.import_open(&path).unwrap();
    let review = state.import_review(None).unwrap();
    let kinds = review.warnings.iter().map(|group| group.kind).collect();
    import(&mut state, &path, "2026-09-29 00:00:00", true);
    (overview(&mut state, &open_holds()).unwrap(), kinds)
}

#[test]
fn the_open_count_of_the_snapshot_equals_the_holds_of_the_default_overview() {
    let fx = Fixture::new();

    // A full file: an id and a released column, some holds released.
    let mut state = fx.state();
    import(
        &mut state,
        &fx.synth("a.xlsx", 1),
        "2026-09-29 00:00:00",
        true,
    );
    let full = overview(&mut state, &open_holds()).unwrap();
    assert!(!full.snapshot.limited);
    assert!(full.snapshot.open_count > 0);
    assert!(full.snapshot.open_count < full.snapshot.row_count);
    assert_eq!(full.summary.holds, full.snapshot.open_count);

    // A limited file: no released column, so every hold counts as open.
    let (limited, _) = overview_of_text(
        &fx,
        "limited.csv",
        "line_id,hold_remark,hold_type\nL-1,waiting for a drawing,MISC.\nL-2,waiting for a valve,MISC.\nL-2,waiting for a datasheet,MISC.\n",
    );
    assert!(limited.snapshot.limited);
    assert_eq!(limited.snapshot.open_count, 3);
    assert_eq!(limited.summary.holds, limited.snapshot.open_count);

    // Released values the engine does not recognize, beside ones it does.
    let (odd, warnings) = overview_of_text(
        &fx,
        "odd.csv",
        "id,line_id,hold_remark,hold_type,released\n1,L-1,a,MISC.,maybe\n2,L-2,b,MISC.,Yes\n3,L-3,c,MISC.,No\n4,L-4,d,MISC.,??\n5,L-5,e,MISC.,\n",
    );
    assert!(
        warnings.contains(&WarningKind::UnrecognizedReleased),
        "{warnings:?}"
    );
    assert_eq!(odd.snapshot.row_count, 5);
    assert!(odd.snapshot.open_count < odd.snapshot.row_count);
    assert_eq!(odd.summary.holds, odd.snapshot.open_count);
}

#[test]
fn a_filter_with_a_discipline_returns_only_that_disciplines_holds() {
    let fx = Fixture::new();
    let path = fx.synth("a.xlsx", 1);
    let mut state = fx.state();
    import(&mut state, &path, "2026-09-29 00:00:00", true);
    let all = overview(&mut state, &open_holds()).unwrap();
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
    let view = overview(&mut state, &spec).unwrap();
    assert_eq!(view.by_discipline, std::slice::from_ref(&top));
    assert_eq!(view.summary.holds, top.holds);
    assert_eq!(
        view.by_hold_type.iter().map(|g| g.holds).sum::<usize>(),
        top.holds
    );
}

#[test]
fn the_complete_default_filter_the_interface_sends_means_open_holds() {
    let json = include_str!("../../../ui/src/api/open-holds-filter.json");
    let spec: FilterSpec = serde_json::from_str(json).unwrap();
    assert_eq!(spec, FilterSpec::default());
    assert_eq!(spec.status, Status::Open);
}

#[test]
fn the_export_column_names_the_interface_shows_are_the_labels_of_the_fields() {
    let json = include_str!("../../../ui/src/api/export-columns.json");
    let names: BTreeMap<String, String> = serde_json::from_str(json).unwrap();
    for field in Field::ALL {
        let key = serde_json::to_value(field).unwrap();
        let key = key.as_str().unwrap();
        assert_eq!(
            names.get(key).map(String::as_str),
            Some(field.label()),
            "the interface names the column of {key} as the engine does"
        );
    }
    // Every name belongs to a field: the loop found one for each field, and there is no other.
    assert_eq!(names.len(), Field::ALL.len());
}

fn demo_snapshots(fx: &Fixture, id: &str) -> Workspace {
    Workspace::open(&fx.workspaces().join(format!("{id}.holdx-ws"))).unwrap()
}

fn no_hook(_: u64) -> Result<(), CommandError> {
    Ok(())
}

fn is_empty(dir: &Path) -> bool {
    std::fs::read_dir(dir).unwrap().next().is_none()
}

#[test]
fn the_demo_workspace_has_four_snapshots_seven_days_apart_and_the_newest_selected() {
    let fx = Fixture::new();
    let scratch = fx.dir.path().join("scratch");
    std::fs::create_dir_all(&scratch).unwrap();
    let mut state = fx.state();
    let opened = state
        .create_demo_with(&scratch, &delete_workspace, &no_hook)
        .unwrap();
    assert!(is_empty(&scratch), "the temporary files are removed");

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

    let view = overview(&mut state, &open_holds()).unwrap();
    assert!(view.is_latest);
    assert!(view.summary.holds > 0);

    // A second demo is a second workspace; the first is not touched.
    let second = state
        .create_demo_with(&scratch, &delete_workspace, &no_hook)
        .unwrap();
    assert_ne!(second.workspace.id, opened.workspace.id);
    assert!(is_empty(&scratch));
    let list = list_workspaces(&fx.workspaces()).unwrap();
    assert_eq!(list.workspaces.len(), 2);
    assert!(list
        .workspaces
        .iter()
        .all(|w| w.name == "Demo" && w.snapshot_count == 4));
}

fn late_failure(step: u64) -> Result<(), CommandError> {
    if step == 0 {
        Err(CommandError::internal("stopped after the first file"))
    } else {
        Ok(())
    }
}

#[test]
fn a_demo_that_fails_after_writing_a_file_removes_its_file_and_its_temporary_files() {
    let fx = Fixture::new();
    let scratch = fx.dir.path().join("scratch");
    std::fs::create_dir_all(&scratch).unwrap();
    let mut state = fx.state();
    let kept = state.create_workspace("Keep").unwrap();

    let error = state
        .create_demo_with(&scratch, &delete_workspace, &late_failure)
        .unwrap_err();
    assert_eq!(error.message, "stopped after the first file");
    assert!(is_empty(&scratch), "the temporary files are removed");
    let list = list_workspaces(&fx.workspaces()).unwrap();
    assert_eq!(list.workspaces.len(), 1);
    assert_eq!(list.workspaces[0].id, kept.workspace.id);
    assert_eq!(state.open_id(), kept.workspace.id);
}

#[test]
fn a_demo_that_fails_before_any_file_removes_its_workspace_and_keeps_the_open_one() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let kept = state.create_workspace("Keep").unwrap();
    let missing = fx.dir.path().join("no-such-folder");

    let error = state
        .create_demo_with(&missing, &delete_workspace, &no_hook)
        .unwrap_err();
    assert_eq!(error.kind, "Internal");
    assert!(error
        .message
        .starts_with("The demo workspace could not be built"));
    assert!(
        !error.message.contains("could not be removed"),
        "{}",
        error.message
    );
    let list = list_workspaces(&fx.workspaces()).unwrap();
    assert_eq!(list.workspaces.len(), 1);
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
    let error = state
        .create_demo_with(&missing, &remover, &no_hook)
        .unwrap_err();
    assert!(error
        .message
        .starts_with("The demo workspace could not be built"));
    assert!(
        error
            .message
            .contains("A workspace named \"Demo\" was created for the demo workspace but could not be removed"),
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
