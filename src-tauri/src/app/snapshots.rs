//! Selecting a snapshot, and the query behind the first Overview.

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::query::{group_by, summary, Group, Summary};
use hx_core::rules::RuleSet;
use hx_store::SnapshotInfo;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::CommandError;
use super::workspaces::WorkspaceOpen;
use super::{describe, AppState};

/// The view the interface is showing when it asks for data. A command that reads the data in
/// view answers only when this names the open workspace and the selected snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[ts(export)]
pub struct ViewRef {
    /// The id of the workspace the interface shows.
    pub workspace_id: String,
    /// The id of the snapshot it shows; `None` when it shows a workspace without snapshots.
    pub snapshot_id: Option<i64>,
}

/// What the Overview shows for the selected snapshot and a filter.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct OverviewView {
    /// The selected snapshot.
    pub snapshot: SnapshotInfo,
    /// False when a newer snapshot exists.
    pub is_latest: bool,
    /// Headline numbers for the holds the filter keeps.
    pub summary: Summary,
    /// The kept holds by discipline, largest group first.
    pub by_discipline: Vec<Group>,
    /// The kept holds by hold type, largest group first.
    pub by_hold_type: Vec<Group>,
}

impl AppState {
    /// Selects a snapshot of the open workspace and describes the workspace as it is now. The
    /// settings are not touched.
    pub fn select_snapshot(&mut self, snapshot_id: i64) -> Result<WorkspaceOpen, CommandError> {
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        workspace.snapshot(snapshot_id)?;
        let mut open = describe(workspace)?;
        open.selected = Some(snapshot_id);
        if self.selected != Some(snapshot_id) {
            self.dataset = None;
        }
        self.selected = Some(snapshot_id);
        Ok(open)
    }

    /// Refuses to answer for a view the interface is not showing: `NoWorkspace` when no workspace
    /// is open, `ViewChanged` when `view` names another workspace or another snapshot than the
    /// open workspace and its selected snapshot. Every command that reads the data in view calls
    /// this first, so an answer can never be kept under the name of another view.
    pub(super) fn check_view(&self, view: &ViewRef) -> Result<(), CommandError> {
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        if workspace.info()?.id == view.workspace_id && self.selected == view.snapshot_id {
            return Ok(());
        }
        Err(CommandError::new(
            "ViewChanged",
            "The workspace or the snapshot in view changed while the request was on its way, so its answer would belong to a view that is no longer shown. Nothing is wrong and nothing was changed; the page reads it again for the view it shows now.",
        ))
    }

    /// The dataset of this snapshot of the open workspace. It is built on the first call for a
    /// snapshot and kept until another snapshot is asked for or another workspace is opened, so
    /// the dataset of one snapshot is never given for another.
    pub(super) fn dataset(&mut self, snapshot_id: i64) -> Result<&Dataset, CommandError> {
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        let entry = match self.dataset.take() {
            Some(entry) if entry.0 == snapshot_id => entry,
            _ => {
                let built = workspace.dataset(snapshot_id, RuleSet::builtin())?;
                #[cfg(test)]
                {
                    self.dataset_builds += 1;
                }
                (snapshot_id, built)
            }
        };
        Ok(&self.dataset.insert(entry).1)
    }

    /// The Overview of the selected snapshot for this filter; `None` when the workspace has no
    /// snapshot. `view` is what the interface shows; see [`AppState::check_view`].
    pub fn overview(
        &mut self,
        spec: &FilterSpec,
        view: &ViewRef,
    ) -> Result<Option<OverviewView>, CommandError> {
        self.check_view(view)?;
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        let Some(selected) = self.selected else {
            return Ok(None);
        };
        let snapshot = workspace.snapshot(selected)?;
        let is_latest = workspace
            .snapshots()?
            .last()
            .is_none_or(|latest| latest.id == selected);
        let dataset = self.dataset(selected)?;
        Ok(Some(OverviewView {
            snapshot,
            is_latest,
            summary: summary(dataset, spec),
            by_discipline: group_by(dataset, spec, &Dim::Discipline),
            by_hold_type: group_by(dataset, spec, &Dim::HoldType),
        }))
    }

    /// How many datasets were built since the application started.
    #[cfg(test)]
    pub(super) fn dataset_builds(&self) -> usize {
        self.dataset_builds
    }
}
