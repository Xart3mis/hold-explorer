//! Selecting a snapshot, and the query behind the first Overview.

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::query::{
    ages_known, group_by, line_page, stale_count, summary, Group, LineQuery, LineRow, Summary,
};
use hx_core::rules::RuleSet;
use hx_core::solve::{solve_plan, SolvePlan};
use hx_store::SnapshotInfo;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::CommandError;
use super::workspaces::WorkspaceOpen;
use super::{describe, AppState, Cache, Columns, STALE_DAYS, TOP_ITEMS};

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
    /// The kept holds by role, largest group first.
    pub by_role: Vec<Group>,
    /// The blockers with the most kept holds, largest first, at most `TOP_ITEMS`.
    pub top_blockers: Vec<Group>,
    /// The first Lines in the default order, at most `TOP_ITEMS`.
    pub top_lines: Vec<LineRow>,
    /// The open holds the filter keeps that have waited long.
    pub stale: StaleCount,
}

/// Open holds that have waited at least `days` days.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct StaleCount {
    /// Open kept holds whose age is at least `days`.
    pub holds: usize,
    /// The age that makes a hold stale.
    pub days: i64,
    /// Whether it can be known which kept open holds are stale. False only when the filter keeps
    /// open holds and none of them has an age, because none has a creation date: `holds` is then
    /// 0 for want of dates, not because no hold has waited long. True when it keeps no open hold,
    /// as there is nothing to know then.
    pub ages_known: bool,
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
            self.cache = None;
        }
        self.selected = Some(snapshot_id);
        Ok(open)
    }

    /// Refuses to answer for a view the interface is not showing: `NoWorkspace` when no workspace
    /// is open, `ViewChanged` when `view` names another workspace or another snapshot than the
    /// open workspace and its selected snapshot. Every command that reads the data in view calls
    /// this first, so an answer can never be kept under the name of another view.
    pub(super) fn check_view(&self, view: &ViewRef) -> Result<(), CommandError> {
        let open_id = self
            .open_id
            .as_ref()
            .ok_or_else(CommandError::no_workspace)?;
        if *open_id == view.workspace_id && self.selected == view.snapshot_id {
            return Ok(());
        }
        Err(CommandError::new(
            "ViewChanged",
            "The workspace or the snapshot in view changed while the request was on its way, so its answer would belong to a view that is no longer shown. Nothing is wrong and nothing was changed; the page reads it again for the view it shows now.",
        ))
    }

    /// The cache for this snapshot of the open workspace, built on the first call for the pair
    /// and kept until another snapshot is asked for or another workspace is installed, so what
    /// one workspace or snapshot built is never given for another.
    fn cache(&mut self, snapshot_id: i64) -> Result<&mut Cache, CommandError> {
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        let workspace_id = self
            .open_id
            .clone()
            .ok_or_else(CommandError::no_workspace)?;
        let cache = match self.cache.take() {
            Some(cache)
                if cache.workspace_id == workspace_id && cache.snapshot_id == snapshot_id =>
            {
                cache
            }
            _ => {
                let dataset = workspace.dataset(snapshot_id, RuleSet::builtin())?;
                #[cfg(test)]
                {
                    self.dataset_builds += 1;
                }
                Cache {
                    workspace_id,
                    snapshot_id,
                    dataset,
                    plan: None,
                    columns: None,
                    #[cfg(test)]
                    plan_builds: self.plan_builds.clone(),
                    #[cfg(test)]
                    column_builds: self.column_builds.clone(),
                }
            }
        };
        Ok(self.cache.insert(cache))
    }

    /// The dataset of this snapshot of the open workspace; see [`AppState::cache`].
    pub(super) fn dataset(&mut self, snapshot_id: i64) -> Result<&Dataset, CommandError> {
        Ok(&self.cache(snapshot_id)?.dataset)
    }

    /// The dataset of this snapshot with the solve plan of its open holds, which is built on the
    /// first call for the snapshot and kept with the dataset.
    pub(super) fn plan(
        &mut self,
        snapshot_id: i64,
    ) -> Result<(&Dataset, &SolvePlan), CommandError> {
        let cache = self.cache(snapshot_id)?;
        let plan = cache.plan.get_or_insert_with(|| {
            #[cfg(test)]
            cache
                .plan_builds
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            solve_plan(&cache.dataset, &FilterSpec::default(), None)
        });
        Ok((&cache.dataset, plan))
    }

    /// The dataset of this snapshot with its extra columns and absent fields, which are found on
    /// the first call for the snapshot and kept with the dataset.
    pub(super) fn columns(
        &mut self,
        snapshot_id: i64,
    ) -> Result<(&Dataset, &Columns), CommandError> {
        let cache = self.cache(snapshot_id)?;
        let columns = cache.columns.get_or_insert_with(|| {
            #[cfg(test)]
            cache
                .column_builds
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            Columns {
                custom_dims: cache.dataset.custom_dims(),
                absent: cache.dataset.absent_fields(),
            }
        });
        Ok((&cache.dataset, columns))
    }

    /// The Overview of the selected snapshot for this filter; `None` when the workspace has no
    /// snapshot. `view` is what the interface shows; see [`AppState::check_view`].
    pub fn overview(
        &mut self,
        spec: &FilterSpec,
        view: &ViewRef,
    ) -> Result<Option<OverviewView>, CommandError> {
        let Some(selected) = self.snapshot_in_view(view)? else {
            return Ok(None);
        };
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        let snapshot = workspace.snapshot(selected)?;
        let is_latest = workspace
            .snapshots()?
            .last()
            .is_none_or(|latest| latest.id == selected);
        self.in_view(view, spec, |v| {
            let (dataset, spec) = (v.dataset, &v.spec);
            Some(OverviewView {
                snapshot,
                is_latest,
                summary: summary(dataset, spec),
                by_discipline: group_by(dataset, spec, &Dim::Discipline),
                by_hold_type: group_by(dataset, spec, &Dim::HoldType),
                by_role: group_by(dataset, spec, &Dim::Role),
                top_blockers: group_by(dataset, spec, &Dim::Blocker)
                    .into_iter()
                    .take(TOP_ITEMS)
                    .collect(),
                top_lines: line_page(dataset, spec, &LineQuery::default(), 0, Some(TOP_ITEMS)).rows,
                stale: StaleCount {
                    holds: stale_count(dataset, spec, STALE_DAYS),
                    days: STALE_DAYS,
                    ages_known: ages_known(dataset, spec),
                },
            })
        })
    }

    /// How many datasets were built since the application started.
    #[cfg(test)]
    pub(super) fn dataset_builds(&self) -> usize {
        self.dataset_builds
    }

    /// How many solve plans were built since the application started.
    #[cfg(test)]
    pub(super) fn plan_builds(&self) -> usize {
        self.plan_builds.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// How many times the columns of a snapshot were found since the application started.
    #[cfg(test)]
    pub(super) fn column_builds(&self) -> usize {
        self.column_builds
            .load(std::sync::atomic::Ordering::Relaxed)
    }
}
