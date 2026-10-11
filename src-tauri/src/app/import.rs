//! The import flow: a file is opened as a draft, reviewed with a mapping, checked against the
//! target workspace, and committed as a snapshot.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::{Datelike, NaiveDateTime};
use hx_core::import::SkippedRow;
use hx_core::load::{open_file, open_sheet, parse_opened, Loaded, Opened, OpenedView};
use hx_core::mapping::{ColumnMap, Field};
use hx_core::snapshot_date::{SnapshotDate, SnapshotSource};
use hx_core::warning::{ImportWarning, WarningKind};
use hx_store::{delete_workspace, list_workspaces, ImportOptions, SnapshotInfo, Workspace};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::CommandError;
use super::workspaces::{list_view, WorkspaceOpen, WorkspaceView};
use super::{describe, AppState};

/// How many rows of the file the draft previews.
const PREVIEW_ROWS: usize = 20;
/// How many skipped rows a review lists.
const MAX_SKIPPED: usize = 200;
/// How many example warnings a review lists per kind.
const MAX_EXAMPLES: usize = 5;
/// The years a snapshot date may have.
const YEARS: std::ops::RangeInclusive<i32> = 2000..=2100;

/// A file that is open for import but not yet imported.
pub(super) struct Draft {
    path: PathBuf,
    opened: Opened,
    /// The mapping `import_review(None)` uses.
    proposed: ColumnMap,
    /// Set by a review; the file as parsed with the mapping in `Loaded::map`.
    parsed: Option<Loaded>,
}

/// A file opened for import.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ImportDraft {
    /// The file as read; `auto_map` holds the mapping the draft proposes, which is the open
    /// workspace's saved mapping applied to the file when there is one.
    pub file: OpenedView,
    /// Required fields the proposed mapping does not cover; empty when the file can be read as it is.
    pub missing_required: Vec<Field>,
    /// True when the workspace's saved mapping changed the automatic one.
    pub used_saved_mapping: bool,
}

/// The warnings of one kind.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct WarningGroup {
    /// What the warnings are about.
    pub kind: WarningKind,
    /// How many warnings of this kind the file gave.
    pub count: usize,
    /// The first few of them, in file order.
    pub examples: Vec<ImportWarning>,
}

/// The workspaces the file could go to.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ImportTarget {
    /// The open workspace when the file's project number is among its numbers or it has none yet.
    pub suggested: Option<String>,
    /// Every workspace whose project numbers include the file's.
    pub matching: Vec<WorkspaceView>,
    /// Every workspace in the folder in use.
    pub all: Vec<WorkspaceView>,
}

/// What the import review page shows.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ImportReview {
    /// The file's name.
    pub file_name: String,
    /// The project number of the file's information sheet.
    pub project_no: Option<String>,
    /// The snapshot date the file gives, with its source.
    pub detected: Option<SnapshotDate>,
    /// True when the date is known only from the file's modified time, or not at all.
    pub date_needs_confirmation: bool,
    /// How many holds were read.
    pub row_count: usize,
    /// How many of them are not released.
    pub open_count: usize,
    /// How many of them are released.
    pub released_count: usize,
    /// True when the file has no `id` or no `released` column.
    pub limited: bool,
    /// How many rows were left out.
    pub skipped_count: usize,
    /// The first 200 skipped rows, in file order.
    pub skipped: Vec<SkippedRow>,
    /// How many warnings the file gave.
    pub warning_count: usize,
    /// The warnings by kind, with at most 5 examples each.
    pub warnings: Vec<WarningGroup>,
    /// The mapping the file was read with.
    pub mapping: ColumnMap,
    /// Where the file may go.
    pub target: ImportTarget,
}

/// What importing into a workspace would meet.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct TargetCheck {
    /// The snapshot of the same file, when the workspace has it.
    pub already_imported: Option<SnapshotInfo>,
    /// The snapshots dated on the same calendar day.
    pub same_day: Vec<SnapshotInfo>,
}

/// Where the snapshot goes.
#[derive(Debug, Clone, PartialEq, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "kind")]
pub enum TargetChoice {
    /// A workspace that exists.
    Existing {
        /// Its id.
        id: String,
    },
    /// A workspace to create.
    New {
        /// Its name.
        name: String,
    },
}

/// The request to import the draft.
#[derive(Debug, Clone, PartialEq, Deserialize, TS)]
#[ts(export)]
pub struct ImportCommit {
    /// Where the snapshot goes.
    pub target: TargetChoice,
    /// The snapshot date, as the user confirmed or edited it.
    pub taken_at: NaiveDateTime,
    /// True when the user changed the date the file gave.
    pub date_edited: bool,
    /// A snapshot to replace.
    pub replace: Option<i64>,
}

/// How far a commit has come.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub enum ImportPhase {
    /// The file is being parsed.
    Reading,
    /// The target is being checked.
    Checking,
    /// The snapshot is being stored.
    Storing,
    /// The snapshot is stored and the workspace is open.
    Done,
}

/// The result of a commit.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ImportDone {
    /// The workspace, open, with the new snapshot selected.
    pub open: WorkspaceOpen,
    /// The new snapshot.
    pub snapshot: SnapshotInfo,
}

fn no_draft() -> CommandError {
    CommandError::new(
        "NoDraft",
        "No file is open for import. Choose a file to import, and try again.",
    )
}

/// The position of a kind in the declaration of `WarningKind`; the match lists every variant, so
/// a new kind cannot be left out.
fn kind_order(kind: WarningKind) -> usize {
    match kind {
        WarningKind::UnreadableReleaseDate => 0,
        WarningKind::UnrecognizedReleased => 1,
        WarningKind::AssumedDateOrder => 2,
        WarningKind::ErrorCells => 3,
        WarningKind::DuplicateHeader => 4,
        WarningKind::UnreadableSize => 5,
        WarningKind::UnreadableId => 6,
        WarningKind::DuplicateId => 7,
        WarningKind::UnreadableReportDate => 8,
    }
}

fn group_warnings(warnings: &[ImportWarning]) -> Vec<WarningGroup> {
    let mut groups: Vec<WarningGroup> = Vec::new();
    for warning in warnings {
        match groups.iter_mut().find(|g| g.kind == warning.kind) {
            Some(group) => {
                group.count += 1;
                if group.examples.len() < MAX_EXAMPLES {
                    group.examples.push(warning.clone());
                }
            }
            None => groups.push(WarningGroup {
                kind: warning.kind,
                count: 1,
                examples: vec![warning.clone()],
            }),
        }
    }
    groups.sort_by_key(|g| kind_order(g.kind));
    groups
}

fn check_year(at: NaiveDateTime) -> Result<(), CommandError> {
    if YEARS.contains(&at.year()) {
        return Ok(());
    }
    Err(CommandError::new(
        "SnapshotDateOutOfRange",
        format!(
            "The snapshot date {at} is outside the years 2000 to 2100. Dates outside that range are almost always a typing mistake. Enter a date between the years 2000 and 2100, for example 2026-10-07."
        ),
    ))
}

/// Where the workspace of a commit came from, to put things back when the import fails.
enum Origin {
    /// It was the open workspace, taken out of the state for the import.
    Open,
    /// It was opened for this import only.
    Other,
    /// It was created for this import; the file is at this path.
    Created(PathBuf),
}

impl AppState {
    /// Reads the file and keeps it as the draft, replacing any earlier draft. The proposed
    /// mapping is the open workspace's saved mapping applied to the file, else the automatic one.
    pub fn import_open(&mut self, path: &Path) -> Result<ImportDraft, CommandError> {
        let opened = open_file(path)?;
        self.set_draft(path.to_path_buf(), opened)
    }

    /// Reads the draft's file again with this sheet as the data sheet. An earlier review is dropped.
    pub fn import_choose_sheet(&mut self, sheet: &str) -> Result<ImportDraft, CommandError> {
        let path = self.draft.as_ref().ok_or_else(no_draft)?.path.clone();
        let opened = open_sheet(&path, sheet)?;
        self.set_draft(path, opened)
    }

    fn set_draft(&mut self, path: PathBuf, opened: Opened) -> Result<ImportDraft, CommandError> {
        let (proposed, used_saved_mapping) = match self
            .open
            .as_ref()
            .map(Workspace::saved_mapping)
            .transpose()?
            .flatten()
        {
            Some(saved) => {
                let map = ColumnMap::auto_with(&opened.table.headers, &saved);
                let changed = map != opened.auto_map;
                (map, changed)
            }
            None => (opened.auto_map.clone(), false),
        };
        let mut file = opened.view(PREVIEW_ROWS);
        file.auto_map = proposed.clone();
        let draft = ImportDraft {
            file,
            missing_required: proposed.missing_required(),
            used_saved_mapping,
        };
        self.draft = Some(Draft {
            path,
            opened,
            proposed,
            parsed: None,
        });
        Ok(draft)
    }

    /// Parses the draft with `fields` (field to column index), or with the proposed mapping when
    /// `None`, and reports what the import would do. A review replaces an earlier one.
    pub fn import_review(
        &mut self,
        fields: Option<BTreeMap<Field, usize>>,
    ) -> Result<ImportReview, CommandError> {
        self.parse_draft(fields)?;
        let draft = self.draft.as_ref().ok_or_else(no_draft)?;
        let loaded = draft.parsed.as_ref().ok_or_else(no_draft)?;
        let row_count = loaded.parsed.holds.len();
        let open_count = loaded.parsed.holds.iter().filter(|h| !h.released).count();
        Ok(ImportReview {
            file_name: loaded.file_name.clone(),
            project_no: loaded.project_no().map(str::to_string),
            detected: loaded.snapshot,
            date_needs_confirmation: loaded
                .snapshot
                .is_none_or(|date| date.source == SnapshotSource::FileTime),
            row_count,
            open_count,
            released_count: row_count - open_count,
            limited: loaded.parsed.limited,
            skipped_count: loaded.parsed.skipped.len(),
            skipped: loaded
                .parsed
                .skipped
                .iter()
                .take(MAX_SKIPPED)
                .cloned()
                .collect(),
            warning_count: loaded.parsed.warnings.len(),
            warnings: group_warnings(&loaded.parsed.warnings),
            mapping: loaded.map.clone(),
            target: self.import_target(loaded.project_no())?,
        })
    }

    /// Parses the draft and keeps the result in it. A failed parse leaves no earlier review.
    fn parse_draft(&mut self, fields: Option<BTreeMap<Field, usize>>) -> Result<(), CommandError> {
        let draft = self.draft.as_mut().ok_or_else(no_draft)?;
        draft.parsed = None;
        let map = match fields {
            Some(fields) => ColumnMap::from_fields(&draft.opened.table.headers, fields),
            None => draft.proposed.clone(),
        };
        draft.parsed = Some(parse_opened(&draft.opened, &map)?);
        Ok(())
    }

    fn import_target(&self, project_no: Option<&str>) -> Result<ImportTarget, CommandError> {
        let folder = self.folder();
        let all = list_view(list_workspaces(&folder)?, &folder).workspaces;
        let matching: Vec<WorkspaceView> = all
            .iter()
            .filter(|w| {
                project_no.is_some_and(|p| w.project_numbers.iter().any(|number| number == p))
            })
            .cloned()
            .collect();
        let open_suggestion = match &self.open {
            Some(workspace) => {
                let info = workspace.info()?;
                let fits = project_no.is_none_or(|p| {
                    info.project_numbers.is_empty() || info.project_numbers.iter().any(|n| n == p)
                });
                fits.then_some(info.id)
            }
            None => None,
        };
        let suggested = open_suggestion.or_else(|| match matching.as_slice() {
            [only] => Some(only.id.clone()),
            _ => None,
        });
        Ok(ImportTarget {
            suggested,
            matching,
            all,
        })
    }

    /// What importing the draft into this target would meet. Writes nothing.
    pub fn import_check_target(
        &self,
        target: &TargetChoice,
        taken_at: NaiveDateTime,
    ) -> Result<TargetCheck, CommandError> {
        let draft = self.draft.as_ref().ok_or_else(no_draft)?;
        let id = match target {
            TargetChoice::New { .. } => {
                return Ok(TargetCheck {
                    already_imported: None,
                    same_day: Vec::new(),
                })
            }
            TargetChoice::Existing { id } => id,
        };
        let check = |workspace: &Workspace| -> Result<TargetCheck, CommandError> {
            Ok(TargetCheck {
                already_imported: workspace
                    .snapshots()?
                    .into_iter()
                    .find(|s| s.content_hash == draft.opened.content_hash),
                same_day: workspace.snapshots_on(taken_at)?,
            })
        };
        match &self.open {
            Some(open) if open.info()?.id == *id => check(open),
            _ => check(&self.load(id)?.0),
        }
    }

    /// Stores the draft as a snapshot of the target workspace, which becomes the open workspace
    /// with the new snapshot selected. Nothing is written when the date is out of range. When
    /// the import fails, a workspace created for it is removed again and the workspace that was
    /// open stays open. `progress` is told `Reading` (only when the draft was not reviewed yet),
    /// `Checking`, `Storing`, and `Done`, in that order.
    pub fn import_commit(
        &mut self,
        request: ImportCommit,
        progress: &dyn Fn(ImportPhase),
    ) -> Result<ImportDone, CommandError> {
        if self.draft.is_none() {
            return Err(no_draft());
        }
        check_year(request.taken_at)?;
        if self.draft.as_ref().is_some_and(|d| d.parsed.is_none()) {
            progress(ImportPhase::Reading);
            self.parse_draft(None)?;
        }

        progress(ImportPhase::Checking);
        let other = match &request.target {
            TargetChoice::Existing { id } if !self.is_open(id)? => Some(self.load(id)?.0),
            _ => None,
        };

        progress(ImportPhase::Storing);
        let (mut workspace, origin) = match (request.target, other) {
            (TargetChoice::Existing { .. }, Some(workspace)) => (workspace, Origin::Other),
            (TargetChoice::Existing { .. }, None) => (
                self.open.take().ok_or_else(CommandError::no_workspace)?,
                Origin::Open,
            ),
            (TargetChoice::New { name }, _) => {
                let workspace = Workspace::create(&self.folder(), &name)?;
                let info = workspace.info()?;
                (workspace, Origin::Created(info.path))
            }
        };

        match self.store_draft(
            &mut workspace,
            &request.taken_at,
            request.date_edited,
            request.replace,
        ) {
            Ok((snapshot, mut open)) => {
                open.selected = Some(snapshot.id);
                let open = self.install_and_remember(workspace, open);
                progress(ImportPhase::Done);
                Ok(ImportDone { open, snapshot })
            }
            Err(error) => {
                self.abandon(workspace, origin);
                Err(error)
            }
        }
    }

    fn is_open(&self, id: &str) -> Result<bool, CommandError> {
        match &self.open {
            Some(workspace) => Ok(workspace.info()?.id == id),
            None => Ok(false),
        }
    }

    /// Imports the reviewed draft into `workspace` and describes the workspace afterwards.
    fn store_draft(
        &self,
        workspace: &mut Workspace,
        taken_at: &NaiveDateTime,
        date_edited: bool,
        replace: Option<i64>,
    ) -> Result<(SnapshotInfo, WorkspaceOpen), CommandError> {
        let loaded = self
            .draft
            .as_ref()
            .and_then(|d| d.parsed.as_ref())
            .ok_or_else(no_draft)?;
        let source = match loaded.snapshot {
            Some(detected) if !date_edited => detected.source,
            _ => SnapshotSource::User,
        };
        let options = ImportOptions {
            replace,
            save_mapping: Some(loaded.map.to_saved(&loaded.headers)),
            add_project_number: loaded.project_no().map(str::to_string),
        };
        let snapshot = workspace.import(
            loaded,
            SnapshotDate {
                at: *taken_at,
                source,
            },
            &options,
        )?;
        Ok((snapshot, describe(workspace)?))
    }

    /// Undoes what a failed commit did to the workspaces.
    fn abandon(&mut self, workspace: Workspace, origin: Origin) {
        match origin {
            Origin::Open => self.open = Some(workspace),
            Origin::Other => {}
            Origin::Created(path) => {
                // Close the file first: Windows refuses to delete an open file. A file that
                // cannot be removed is a stray empty workspace, which the user can delete.
                drop(workspace);
                let _ = delete_workspace(&path);
            }
        }
    }

    /// Drops the draft. Never fails.
    pub fn import_cancel(&mut self) {
        self.draft = None;
    }
}
