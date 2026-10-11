use std::cell::RefCell;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::NaiveDateTime;
use hx_core::error::ImportError;
use hx_core::load::load_file;
use hx_core::mapping::Field;
use hx_core::snapshot_date::SnapshotSource;
use hx_core::warning::WarningKind;
use hx_store::{list_workspaces, Workspace};
use hx_synth::{generate, write_workbook, SynthConfig};
use rust_xlsxwriter::Workbook;
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

    fn input(&self, name: &str) -> PathBuf {
        let dir = self.dir.path().join("input");
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    fn synth(&self, name: &str, seed: u64, project_no: &str) -> PathBuf {
        let mut cfg = SynthConfig::new(seed, 10, 40);
        cfg.project_no = project_no.to_string();
        let path = self.input(name);
        write_workbook(&generate(&cfg), &cfg, &path).unwrap();
        path
    }

    fn text(&self, name: &str, content: &str) -> PathBuf {
        let path = self.input(name);
        std::fs::write(&path, content).unwrap();
        path
    }

    fn workspace_files(&self) -> usize {
        std::fs::read_dir(self.workspaces())
            .map(|entries| entries.count())
            .unwrap_or(0)
    }
}

fn at(text: &str) -> NaiveDateTime {
    NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S").unwrap()
}

fn commit(target: TargetChoice, taken_at: &str) -> ImportCommit {
    ImportCommit {
        target,
        taken_at: at(taken_at),
        date_edited: false,
        replace: None,
    }
}

fn new_target(name: &str) -> TargetChoice {
    TargetChoice::New { name: name.into() }
}

fn existing(id: &str) -> TargetChoice {
    TargetChoice::Existing { id: id.into() }
}

fn no_progress(_: ImportPhase) {}

/// The mapping of `Kind,Place,Why`: line, remark, type.
fn kind_line_why() -> BTreeMap<Field, usize> {
    BTreeMap::from([(Field::HoldType, 0), (Field::LineId, 1), (Field::Remark, 2)])
}

const KIND_LINE_WHY: &str = "Kind,Place,Why\nMISC.,L-1,waiting for a drawing\n";

#[test]
fn opening_a_workbook_gives_headers_a_twenty_row_preview_and_no_missing_fields() {
    let fx = Fixture::new();
    let path = fx.synth("holds.xlsx", 1, "P-1");
    let draft = fx.state().import_open(&path).unwrap();
    assert_eq!(draft.file.file_name, "holds.xlsx");
    assert_eq!(draft.file.headers.len(), 14);
    assert_eq!(draft.file.preview.len(), 20);
    assert_eq!(draft.file.row_count, 40);
    assert!(draft.missing_required.is_empty());
    assert!(!draft.used_saved_mapping);
}

#[test]
fn a_file_with_other_headers_lists_the_missing_fields_and_cannot_be_reviewed_as_it_is() {
    let fx = Fixture::new();
    let path = fx.text("kinds.csv", KIND_LINE_WHY);
    let mut state = fx.state();
    let draft = state.import_open(&path).unwrap();
    assert_eq!(
        draft.missing_required,
        [Field::LineId, Field::Remark, Field::HoldType]
    );
    let error = state.import_review(None).unwrap_err();
    assert_eq!(error.kind, "MissingColumns");
    assert!(error.message.contains("Missing required columns"));
}

#[test]
fn an_edited_mapping_reviews_and_commits() {
    let fx = Fixture::new();
    let path = fx.text("kinds.csv", KIND_LINE_WHY);
    let mut state = fx.state();
    state.import_open(&path).unwrap();
    let review = state.import_review(Some(kind_line_why())).unwrap();
    assert_eq!(review.row_count, 1);
    assert_eq!(review.mapping.fields, kind_line_why());
    let done = state
        .import_commit(commit(new_target("A"), "2026-10-07 00:00:00"), &no_progress)
        .unwrap();
    assert_eq!(done.snapshot.row_count, 1);
}

#[test]
fn a_saved_mapping_makes_the_next_draft_complete() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state.create_workspace("A").unwrap();
    state
        .import_open(&fx.text("kinds.csv", KIND_LINE_WHY))
        .unwrap();
    state.import_review(Some(kind_line_why())).unwrap();
    state
        .import_commit(
            commit(existing(&state.open_id()), "2026-10-07 00:00:00"),
            &no_progress,
        )
        .unwrap();

    let other = fx.text(
        "kinds2.csv",
        "Kind,Place,Why\nMISC.,L-2,waiting for a valve\n",
    );
    let draft = state.import_open(&other).unwrap();
    assert!(draft.missing_required.is_empty());
    assert!(draft.used_saved_mapping);
    assert_eq!(draft.file.auto_map.fields, kind_line_why());
    assert_eq!(state.import_review(None).unwrap().row_count, 1);
}

fn two_sheet_workbook(path: &Path) {
    let mut workbook = Workbook::new();
    for (name, rows) in [("Alpha", 1u32), ("Beta", 2)] {
        let sheet = workbook.add_worksheet();
        sheet.set_name(name).unwrap();
        for (column, header) in ["line_id", "hold_remark", "hold_type"].iter().enumerate() {
            sheet.write_string(0, column as u16, *header).unwrap();
        }
        for row in 1..=rows {
            sheet.write_string(row, 0, format!("L-{row}")).unwrap();
            sheet.write_string(row, 1, "waiting for a drawing").unwrap();
            sheet.write_string(row, 2, "MISC.").unwrap();
        }
    }
    workbook.save(path).unwrap();
}

#[test]
fn choosing_a_sheet_switches_it_and_an_unknown_sheet_names_the_sheets() {
    let fx = Fixture::new();
    let path = fx.input("two.xlsx");
    two_sheet_workbook(&path);
    let mut state = fx.state();
    let draft = state.import_open(&path).unwrap();
    assert_eq!(draft.file.sheets, ["Alpha", "Beta"]);
    assert_eq!(draft.file.sheet_name, "Alpha");
    assert_eq!(draft.file.row_count, 1);

    let draft = state.import_choose_sheet("Beta").unwrap();
    assert_eq!(draft.file.sheet_name, "Beta");
    assert_eq!(draft.file.row_count, 2);
    assert_eq!(state.import_review(None).unwrap().row_count, 2);

    let error = state.import_choose_sheet("Gamma").unwrap_err();
    assert_eq!(error.kind, "SheetNotFound");
    assert!(error.message.contains("Alpha, Beta"), "{}", error.message);
    // The draft is as it was.
    assert_eq!(state.import_review(None).unwrap().row_count, 2);
}

#[test]
fn review_counts_equal_those_of_the_engine() {
    let fx = Fixture::new();
    let path = fx.synth("holds.xlsx", 3, "P-1");
    let loaded = load_file(&path).unwrap();
    let mut state = fx.state();
    state.import_open(&path).unwrap();
    let review = state.import_review(None).unwrap();
    let open = loaded.parsed.holds.iter().filter(|h| !h.released).count();
    assert_eq!(review.row_count, loaded.parsed.holds.len());
    assert_eq!(review.open_count, open);
    assert_eq!(review.released_count, review.row_count - open);
    assert_eq!(review.limited, loaded.parsed.limited);
    assert_eq!(review.skipped_count, loaded.parsed.skipped.len());
    assert_eq!(review.warning_count, loaded.parsed.warnings.len());
    assert_eq!(review.detected, loaded.snapshot);
    assert_eq!(review.project_no.as_deref(), Some("P-1"));
    assert_eq!(review.file_name, "holds.xlsx");
}

#[test]
fn many_skipped_rows_are_counted_in_full_and_listed_up_to_two_hundred() {
    let fx = Fixture::new();
    let mut content = String::from("line_id,hold_remark,hold_type\nL-1,x,MISC.\n");
    for _ in 0..300 {
        content.push_str(",x,MISC.\n");
    }
    let mut state = fx.state();
    state.import_open(&fx.text("holds.csv", &content)).unwrap();
    let review = state.import_review(None).unwrap();
    assert_eq!(review.row_count, 1);
    assert_eq!(review.skipped_count, 300);
    assert_eq!(review.skipped.len(), 200);
    let rows: Vec<usize> = review.skipped.iter().map(|s| s.row_number).collect();
    assert!(rows.windows(2).all(|pair| pair[0] < pair[1]));
}

#[test]
fn warnings_are_grouped_by_kind_in_declaration_order_with_five_examples() {
    let fx = Fixture::new();
    let mut content =
        String::from("line_id,hold_remark,hold_type,id\nL-0,x,MISC.,9\nL-9,x,MISC.,9\n");
    for n in 1..=7 {
        content.push_str(&format!("L-{n},x,MISC.,abc\n"));
    }
    let mut state = fx.state();
    state.import_open(&fx.text("holds.csv", &content)).unwrap();
    let review = state.import_review(None).unwrap();
    assert_eq!(review.warning_count, 8);
    let kinds: Vec<_> = review.warnings.iter().map(|g| (g.kind, g.count)).collect();
    assert_eq!(
        kinds,
        [
            (WarningKind::UnreadableId, 7),
            (WarningKind::DuplicateId, 1)
        ]
    );
    assert_eq!(review.warnings[0].examples.len(), 5);
    assert_eq!(review.warnings[1].examples.len(), 1);
}

#[test]
fn the_date_needs_confirmation_only_without_a_date_from_the_file_or_its_name() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state
        .import_open(&fx.text("holds.csv", KIND_LINE_WHY))
        .unwrap();
    let review = state.import_review(Some(kind_line_why())).unwrap();
    assert!(review.date_needs_confirmation);
    assert_eq!(
        review.detected.map(|d| d.source),
        Some(SnapshotSource::FileTime)
    );

    state.import_open(&fx.synth("x.xlsx", 1, "P-1")).unwrap();
    let review = state.import_review(None).unwrap();
    assert!(!review.date_needs_confirmation);
    assert_eq!(
        review.detected.map(|d| d.source),
        Some(SnapshotSource::InfoSheet)
    );
}

fn workspace_with_numbers(folder: &Path, name: &str, numbers: &[&str]) -> String {
    let mut workspace = Workspace::create(folder, name).unwrap();
    for number in numbers {
        workspace.add_project_number(number).unwrap();
    }
    workspace.info().unwrap().id
}

#[test]
fn the_suggested_target_follows_the_four_rules() {
    let fx = Fixture::new();
    let folder = fx.workspaces();
    let numbered = workspace_with_numbers(&folder, "Numbered", &["P-1"]);
    let other = workspace_with_numbers(&folder, "Other", &["P-2"]);
    let empty = workspace_with_numbers(&folder, "Empty", &[]);
    let file = fx.synth("p1.xlsx", 1, "P-1");
    let mut state = fx.state();

    // The open workspace has the file's number.
    state.open_workspace(&numbered).unwrap();
    state.import_open(&file).unwrap();
    let target = state.import_review(None).unwrap().target;
    assert_eq!(target.suggested.as_deref(), Some(numbered.as_str()));
    assert_eq!(target.all.len(), 3);
    assert_eq!(target.matching.len(), 1);

    // The open workspace has no number yet.
    state.open_workspace(&empty).unwrap();
    state.import_open(&file).unwrap();
    let target = state.import_review(None).unwrap().target;
    assert_eq!(target.suggested.as_deref(), Some(empty.as_str()));

    // The open workspace has other numbers, and exactly one workspace matches.
    state.open_workspace(&other).unwrap();
    state.import_open(&file).unwrap();
    let target = state.import_review(None).unwrap().target;
    assert_eq!(target.suggested.as_deref(), Some(numbered.as_str()));

    // None matches and the open workspace has other numbers.
    state.import_open(&fx.synth("p3.xlsx", 2, "P-3")).unwrap();
    let target = state.import_review(None).unwrap().target;
    assert_eq!(target.suggested, None);
    assert!(target.matching.is_empty());

    // The file has no project number: the open workspace.
    state
        .import_open(&fx.text("kinds.csv", KIND_LINE_WHY))
        .unwrap();
    let target = state.import_review(Some(kind_line_why())).unwrap().target;
    assert_eq!(target.suggested.as_deref(), Some(other.as_str()));

    // Nothing open and two matching: none.
    let mut fresh = fx.state();
    workspace_with_numbers(&folder, "Twin", &["P-1"]);
    fresh.import_open(&file).unwrap();
    assert_eq!(fresh.import_review(None).unwrap().target.suggested, None);
}

#[test]
fn the_target_check_finds_the_same_file_and_other_files_of_the_same_day() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let id = state.create_workspace("A").unwrap().workspace.id;
    let file = fx.synth("one.xlsx", 1, "P-1");
    state.import_open(&file).unwrap();
    state.import_review(None).unwrap();
    let done = state
        .import_commit(commit(existing(&id), "2026-10-07 08:00:00"), &no_progress)
        .unwrap();

    // The same file again.
    state.import_open(&file).unwrap();
    let check = state
        .import_check_target(&existing(&id), at("2026-10-09 00:00:00"))
        .unwrap();
    assert_eq!(check.already_imported, Some(done.snapshot.clone()));
    assert!(check.same_day.is_empty());

    // A different file on the same day.
    state.import_open(&fx.synth("two.xlsx", 2, "P-1")).unwrap();
    let check = state
        .import_check_target(&existing(&id), at("2026-10-07 17:30:00"))
        .unwrap();
    assert_eq!(check.already_imported, None);
    assert_eq!(check.same_day, [done.snapshot]);

    // A new workspace has neither, and checking writes nothing.
    let files = fx.workspace_files();
    let check = state
        .import_check_target(&new_target("B"), at("2026-10-07 17:30:00"))
        .unwrap();
    assert_eq!((check.already_imported, check.same_day), (None, Vec::new()));
    assert_eq!(fx.workspace_files(), files);
}

#[test]
fn the_target_check_of_another_workspace_leaves_the_open_one_open() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let first = state.create_workspace("First").unwrap().workspace.id;
    let second = state.create_workspace("Second").unwrap().workspace.id;
    state.import_open(&fx.synth("one.xlsx", 1, "P-1")).unwrap();
    state
        .import_check_target(&existing(&first), at("2026-10-07 00:00:00"))
        .unwrap();
    assert_eq!(state.open_id(), second);
    assert_eq!(
        state.settings().last_workspace.as_deref(),
        Some(second.as_str())
    );
}

#[test]
fn a_commit_into_a_new_workspace_creates_and_opens_it_with_everything_stored() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let file = fx.synth("one.xlsx", 1, "P-1");
    state.import_open(&file).unwrap();
    let done = state
        .import_commit(
            commit(new_target("Plant"), "2026-10-07 08:00:00"),
            &no_progress,
        )
        .unwrap();
    assert_eq!(done.open.workspace.name, "Plant");
    assert_eq!(done.open.workspace.project_numbers, ["P-1"]);
    assert_eq!(done.open.snapshots, std::slice::from_ref(&done.snapshot));
    assert_eq!(done.open.selected, Some(done.snapshot.id));
    assert_eq!(state.selected_snapshot(), Some(done.snapshot.id));
    assert_eq!(done.open.warning, None);
    assert_eq!(done.snapshot.file_name, "one.xlsx");
    assert_eq!(
        state.settings().last_workspace.as_deref(),
        Some(done.open.workspace.id.as_str())
    );

    let stored = Workspace::open(
        &fx.workspaces()
            .join(format!("{}.holdx-ws", done.open.workspace.id)),
    )
    .unwrap();
    assert!(stored.saved_mapping().unwrap().is_some());
    assert_eq!(stored.snapshots().unwrap().len(), 1);

    // The draft is gone.
    assert_eq!(state.import_review(None).unwrap_err().kind, "NoDraft");
}

#[test]
fn a_commit_into_a_workspace_that_is_not_open_opens_it() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let first = state.create_workspace("First").unwrap().workspace.id;
    state.create_workspace("Second").unwrap();
    state.import_open(&fx.synth("one.xlsx", 1, "P-1")).unwrap();
    let done = state
        .import_commit(
            commit(existing(&first), "2026-10-07 08:00:00"),
            &no_progress,
        )
        .unwrap();
    assert_eq!(done.open.workspace.id, first);
    assert_eq!(state.open_id(), first);
    assert_eq!(done.open.workspace.snapshot_count, 1);
}

#[test]
fn an_unedited_date_keeps_the_detected_source_and_an_edited_one_is_the_users() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let id = state.create_workspace("A").unwrap().workspace.id;
    let file = fx.synth("one.xlsx", 1, "P-1");

    state.import_open(&file).unwrap();
    let kept = state
        .import_commit(commit(existing(&id), "2026-10-07 08:00:00"), &no_progress)
        .unwrap();
    assert_eq!(kept.snapshot.date_source, SnapshotSource::InfoSheet);
    assert_eq!(kept.snapshot.taken_at, at("2026-10-07 08:00:00"));

    state.import_open(&fx.synth("two.xlsx", 2, "P-1")).unwrap();
    let edited = state
        .import_commit(
            ImportCommit {
                date_edited: true,
                ..commit(existing(&id), "2026-10-08 08:00:00")
            },
            &no_progress,
        )
        .unwrap();
    assert_eq!(edited.snapshot.date_source, SnapshotSource::User);
    let workspace = Workspace::open(&fx.workspaces().join(format!("{id}.holdx-ws"))).unwrap();
    let detail = workspace.snapshot_detail(edited.snapshot.id).unwrap();
    assert_eq!(
        detail.detected.map(|d| d.source),
        Some(SnapshotSource::InfoSheet)
    );
}

#[test]
fn a_file_dated_by_its_time_keeps_that_source_when_the_date_is_not_edited() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state
        .import_open(&fx.text("kinds.csv", KIND_LINE_WHY))
        .unwrap();
    state.import_review(Some(kind_line_why())).unwrap();
    let done = state
        .import_commit(commit(new_target("A"), "2026-10-07 00:00:00"), &no_progress)
        .unwrap();
    // The file's own time was detected, and the date was not edited: that source stays.
    assert_eq!(done.snapshot.date_source, SnapshotSource::FileTime);
}

#[test]
fn years_outside_2000_to_2100_are_refused_before_anything_is_written() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let id = state.create_workspace("A").unwrap().workspace.id;
    let files = fx.workspace_files();
    state.import_open(&fx.synth("one.xlsx", 1, "P-1")).unwrap();
    for taken in ["1999-12-31 00:00:00", "2101-01-01 00:00:00"] {
        for target in [new_target("B"), existing(&id)] {
            let error = state
                .import_commit(commit(target, taken), &|phase| {
                    panic!("no phase may be reported, got {phase:?}")
                })
                .unwrap_err();
            assert_eq!(error.kind, "SnapshotDateOutOfRange");
            assert!(error.message.contains("2000"), "{}", error.message);
            assert!(error.message.contains("2100"), "{}", error.message);
            assert!(
                error.message.contains("typing mistake"),
                "{}",
                error.message
            );
        }
    }
    assert_eq!(fx.workspace_files(), files);
    assert_eq!(state.rename_workspace("A").unwrap().snapshot_count, 0);
    // The draft is still there.
    assert!(state.import_review(None).is_ok());
}

#[test]
fn a_failed_import_into_a_new_workspace_removes_it_again_and_keeps_the_open_one() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let id = state.create_workspace("A").unwrap().workspace.id;
    state.import_open(&fx.synth("one.xlsx", 1, "P-1")).unwrap();
    let files = fx.workspace_files();
    // A snapshot to replace that does not exist makes the import fail after the workspace was made.
    let error = state
        .import_commit(
            ImportCommit {
                replace: Some(999),
                ..commit(new_target("Doomed"), "2026-10-07 08:00:00")
            },
            &no_progress,
        )
        .unwrap_err();
    assert_eq!(error.kind, "SnapshotNotFound");
    assert_eq!(fx.workspace_files(), files);
    assert_eq!(state.open_id(), id);
    assert!(state.import_review(None).is_ok());
}

#[test]
fn a_file_imported_before_is_refused_with_already_imported() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let id = state.create_workspace("A").unwrap().workspace.id;
    let file = fx.synth("one.xlsx", 1, "P-1");
    state.import_open(&file).unwrap();
    state
        .import_commit(commit(existing(&id), "2026-10-07 08:00:00"), &no_progress)
        .unwrap();
    state.import_open(&file).unwrap();
    let error = state
        .import_commit(commit(existing(&id), "2026-10-07 08:00:00"), &no_progress)
        .unwrap_err();
    assert_eq!(error.kind, "AlreadyImported");
    assert_eq!(state.open_id(), id);
    assert_eq!(state.rename_workspace("A").unwrap().snapshot_count, 1);
}

#[test]
fn a_failed_import_into_a_workspace_that_is_not_open_keeps_the_open_one() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let target = state.create_workspace("Target").unwrap().workspace.id;
    let file = fx.synth("one.xlsx", 1, "P-1");
    state.import_open(&file).unwrap();
    state
        .import_commit(
            commit(existing(&target), "2026-10-07 08:00:00"),
            &no_progress,
        )
        .unwrap();
    let open = state.create_workspace("Open").unwrap().workspace.id;

    state.import_open(&file).unwrap();
    let error = state
        .import_commit(
            commit(existing(&target), "2026-10-07 08:00:00"),
            &no_progress,
        )
        .unwrap_err();
    assert_eq!(error.kind, "AlreadyImported");
    assert_eq!(state.open_id(), open);
    // The draft is kept so the user can pick another target.
    assert!(state.import_review(None).is_ok());
}

#[test]
fn a_replaced_snapshot_is_removed() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let id = state.create_workspace("A").unwrap().workspace.id;
    state.import_open(&fx.synth("one.xlsx", 1, "P-1")).unwrap();
    let first = state
        .import_commit(commit(existing(&id), "2026-10-07 08:00:00"), &no_progress)
        .unwrap();
    state.import_open(&fx.synth("two.xlsx", 2, "P-1")).unwrap();
    let second = state
        .import_commit(
            ImportCommit {
                replace: Some(first.snapshot.id),
                ..commit(existing(&id), "2026-10-07 09:00:00")
            },
            &no_progress,
        )
        .unwrap();
    assert_eq!(
        second.open.snapshots,
        std::slice::from_ref(&second.snapshot)
    );
    assert_eq!(second.open.workspace.snapshot_count, 1);
}

#[test]
fn progress_arrives_in_order_and_reading_only_without_a_review() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let phases = RefCell::new(Vec::new());
    let record = |phase| phases.borrow_mut().push(phase);

    state.import_open(&fx.synth("one.xlsx", 1, "P-1")).unwrap();
    state
        .import_commit(commit(new_target("A"), "2026-10-07 08:00:00"), &record)
        .unwrap();
    assert_eq!(
        *phases.borrow(),
        [
            ImportPhase::Reading,
            ImportPhase::Checking,
            ImportPhase::Storing,
            ImportPhase::Done
        ]
    );

    phases.borrow_mut().clear();
    state.import_open(&fx.synth("two.xlsx", 2, "P-1")).unwrap();
    state.import_review(None).unwrap();
    state
        .import_commit(commit(new_target("B"), "2026-10-08 08:00:00"), &record)
        .unwrap();
    assert_eq!(
        *phases.borrow(),
        [
            ImportPhase::Checking,
            ImportPhase::Storing,
            ImportPhase::Done
        ]
    );
}

#[test]
fn every_method_without_a_draft_gives_no_draft() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let kinds = [
        state.import_choose_sheet("data").unwrap_err().kind,
        state.import_review(None).unwrap_err().kind,
        state
            .import_check_target(&new_target("A"), at("2026-10-07 00:00:00"))
            .unwrap_err()
            .kind,
        state
            .import_commit(commit(new_target("A"), "2026-10-07 00:00:00"), &no_progress)
            .unwrap_err()
            .kind,
    ];
    assert!(kinds.iter().all(|kind| kind == "NoDraft"), "{kinds:?}");
    state.import_cancel();
    assert_eq!(fx.workspace_files(), 0);
}

#[test]
fn cancel_clears_the_draft_and_opening_a_workspace_does_too() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let file = fx.synth("one.xlsx", 1, "P-1");
    state.import_open(&file).unwrap();
    state.import_cancel();
    assert_eq!(state.import_review(None).unwrap_err().kind, "NoDraft");
    state.import_cancel();

    state.import_open(&file).unwrap();
    let id = state.create_workspace("A").unwrap().workspace.id;
    assert_eq!(state.import_review(None).unwrap_err().kind, "NoDraft");
    state.import_open(&file).unwrap();
    state.open_workspace(&id).unwrap();
    assert_eq!(state.import_review(None).unwrap_err().kind, "NoDraft");
}

#[test]
fn a_second_open_replaces_the_draft_and_a_file_that_fails_to_open_keeps_it() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state.import_open(&fx.synth("one.xlsx", 1, "P-1")).unwrap();
    let error = state.import_open(&fx.input("missing.xlsx")).unwrap_err();
    assert_eq!(error.kind, "NotFound");
    assert_eq!(state.import_review(None).unwrap().file_name, "one.xlsx");
    state.import_open(&fx.synth("two.xlsx", 2, "P-1")).unwrap();
    assert_eq!(state.import_review(None).unwrap().file_name, "two.xlsx");
}

#[test]
fn a_failed_review_leaves_no_earlier_review_and_commit_reviews_again() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state
        .import_open(&fx.text("kinds.csv", KIND_LINE_WHY))
        .unwrap();
    state.import_review(Some(kind_line_why())).unwrap();
    assert!(state.import_review(None).is_err());
    let error = state
        .import_commit(commit(new_target("A"), "2026-10-07 00:00:00"), &no_progress)
        .unwrap_err();
    assert_eq!(error.kind, "MissingColumns");
    assert_eq!(
        ImportError::MissingColumns {
            missing: vec![Field::LineId, Field::Remark, Field::HoldType]
        }
        .to_string(),
        error.message
    );
    assert_eq!(
        list_workspaces(&fx.workspaces()).unwrap().workspaces.len(),
        0
    );
}
