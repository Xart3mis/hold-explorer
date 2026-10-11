//! Selecting a snapshot, and the query behind the first Overview.

use hx_core::filter::{Dim, FilterSpec};
use hx_core::query::{group_by, summary, Group, Summary};
use hx_core::rules::RuleSet;
use hx_store::SnapshotInfo;
use serde::Serialize;
use ts_rs::TS;

use super::error::CommandError;
use super::workspaces::WorkspaceOpen;
use super::{describe, AppState};

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

    /// The Overview of the selected snapshot for this filter; `None` when the workspace has no
    /// snapshot. The dataset is built on the first call after a selection and kept after that.
    pub fn overview(&mut self, spec: &FilterSpec) -> Result<Option<OverviewView>, CommandError> {
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        let Some(selected) = self.selected else {
            return Ok(None);
        };
        let snapshot = workspace.snapshot(selected)?;
        let is_latest = workspace
            .snapshots()?
            .last()
            .is_none_or(|latest| latest.id == selected);
        let dataset = match &mut self.dataset {
            Some(dataset) => dataset,
            slot @ None => {
                let built = workspace.dataset(selected, RuleSet::builtin())?;
                self.dataset_builds += 1;
                slot.insert(built)
            }
        };
        Ok(Some(OverviewView {
            snapshot,
            is_latest,
            summary: summary(dataset, spec),
            by_discipline: group_by(dataset, spec, &Dim::Discipline),
            by_hold_type: group_by(dataset, spec, &Dim::HoldType),
        }))
    }

    /// How many datasets were built since the application started.
    pub fn dataset_builds(&self) -> usize {
        self.dataset_builds
    }
}
