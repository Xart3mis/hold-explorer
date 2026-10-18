//! The data commands: the filter bar's options and values, a page of Lines or Holds, and the
//! detail of one Line or one Hold, all for the snapshot in view.

use chrono::DateTime;
use hx_core::dataset::Dataset;
use hx_core::detail::{blocker_detail, line_detail, BlockerDetail, HoldRef, LineDetail};
use hx_core::filter::{default_age_bands, AgeBand, Dim, FieldFilter, FilterSpec, Inactive};
use hx_core::mapping::Field;
use hx_core::query::{
    facet_counts, group_by, holds, line_page, matrix_top, summary, value_page, FacetCounts,
    FoldedMatrix, Group, HoldQuery, LinePage, LineQuery, ValuePage,
};
use hx_core::rules::RuleSet;
use hx_core::solve::{solve_plan, solve_view, SolveView};
use serde::Serialize;
use ts_rs::TS;

use super::error::CommandError;
use super::snapshots::ViewRef;
use super::{AppState, Columns, GROUP_LINES, MATRIX_SIDE, PAGE_ROWS, PICKER_VALUES};

/// What the filter bar needs for the snapshot in view and a filter.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct FilterOptions {
    /// Holds the filter keeps.
    pub total: usize,
    /// How many holds each status, age band, and size choice would keep.
    pub facets: FacetCounts,
    /// The bands `facets.age_bands` counts, in order.
    pub age_bands: Vec<AgeBand>,
    /// Extra columns of the snapshot, by header name.
    pub custom_dims: Vec<String>,
    /// Optional fields the snapshot has no value for; empty for a workspace without a snapshot.
    pub absent: Vec<Field>,
    /// What the filter sets that the snapshot cannot apply, for want of a column: every data
    /// command leaves it out, as `FilterSpec::applicable` of the core says. Empty without a
    /// snapshot.
    pub inactive: Inactive,
}

/// A page of holds with their positions.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct HoldsView {
    /// Holds the filter keeps, before paging.
    pub total: usize,
    /// Characters of the longest line ID among them; 0 when there is none.
    pub widest_line_id: usize,
    /// The holds of the page, each with its position in the snapshot.
    pub rows: Vec<HoldRef>,
}

/// One group of a dimension with its numbers and its first Lines.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct GroupDetail {
    /// The group, counted among the holds the request's filter keeps.
    pub group: Group,
    /// The first `GROUP_LINES` Lines of the group in the default order, with the true total.
    pub lines: LinePage,
}

/// A snapshot without a hold, which is what a workspace without snapshots answers for.
fn empty_dataset() -> Dataset {
    Dataset::build(
        Vec::new(),
        RuleSet::builtin(),
        DateTime::UNIX_EPOCH.naive_utc(),
    )
}

/// The snapshot in view as a data command reads it.
pub(super) struct InView<'a> {
    /// The dataset of the snapshot in view; an empty one for a workspace without a snapshot.
    pub(super) dataset: &'a Dataset,
    /// The filter of the request as the snapshot can apply it: see [`FilterSpec::applicable`].
    /// A command reads with this one, never with the filter it was sent.
    pub(super) spec: FilterSpec,
    /// What the filter of the request sets that the snapshot cannot apply.
    pub(super) inactive: Inactive,
    /// The extra columns and absent fields of the snapshot; `None` without a snapshot.
    pub(super) columns: Option<&'a Columns>,
}

impl AppState {
    /// Checks `view` and gives `read` the snapshot in view with the filter of the request as it
    /// can apply it. A workspace without a snapshot is read as an empty snapshot, so the two cases
    /// cannot answer differently; nothing is left out of the filter then, since nothing is missing
    /// from a snapshot that does not exist. Every data command that takes a filter reads through
    /// this, so none can apply a filter to a column the snapshot lacks.
    pub(super) fn in_view<T>(
        &mut self,
        view: &ViewRef,
        spec: &FilterSpec,
        read: impl FnOnce(InView<'_>) -> T,
    ) -> Result<T, CommandError> {
        self.check_view(view)?;
        Ok(match self.selected {
            Some(selected) => {
                let (dataset, columns) = self.columns(selected)?;
                let (spec, inactive) = spec.applicable(&columns.absent, &columns.custom_dims);
                read(InView {
                    dataset,
                    spec,
                    inactive,
                    columns: Some(columns),
                })
            }
            None => read(InView {
                dataset: &empty_dataset(),
                spec: spec.clone(),
                inactive: Inactive::default(),
                columns: None,
            }),
        })
    }

    /// Checks `view` and returns the selected snapshot, or `None` for a workspace without one.
    pub(super) fn snapshot_in_view(&self, view: &ViewRef) -> Result<Option<i64>, CommandError> {
        self.check_view(view)?;
        Ok(self.selected)
    }

    /// The options of the filter bar for this filter. Without a snapshot every count is zero and
    /// `absent` and `inactive` are empty: nothing is missing from a snapshot that does not exist.
    /// The extra columns and absent fields of a snapshot are found once; see
    /// [`AppState::columns`].
    pub fn filter_options(
        &mut self,
        spec: &FilterSpec,
        view: &ViewRef,
    ) -> Result<FilterOptions, CommandError> {
        let bands = default_age_bands();
        self.in_view(view, spec, |v| FilterOptions {
            total: summary(v.dataset, &v.spec).holds,
            facets: facet_counts(v.dataset, &v.spec, &bands),
            age_bands: bands.clone(),
            custom_dims: v
                .columns
                .map(|columns| columns.custom_dims.clone())
                .unwrap_or_default(),
            absent: v
                .columns
                .map(|columns| columns.absent.clone())
                .unwrap_or_default(),
            inactive: v.inactive,
        })
    }

    /// The values of `dim` the picker offers, at most [`PICKER_VALUES`], whose label contains
    /// `search`.
    pub fn filter_values(
        &mut self,
        spec: &FilterSpec,
        dim: &Dim,
        search: &str,
        view: &ViewRef,
    ) -> Result<ValuePage, CommandError> {
        self.in_view(view, spec, |v| {
            value_page(v.dataset, &v.spec, dim, search, PICKER_VALUES)
        })
    }

    /// A page of Lines from `offset`, at most [`PAGE_ROWS`].
    pub fn lines(
        &mut self,
        spec: &FilterSpec,
        query: &LineQuery,
        offset: usize,
        view: &ViewRef,
    ) -> Result<LinePage, CommandError> {
        self.in_view(view, spec, |v| {
            line_page(v.dataset, &v.spec, query, offset, Some(PAGE_ROWS))
        })
    }

    /// A page of Holds as `query` asks, at most [`PAGE_ROWS`] of them.
    pub fn holds(
        &mut self,
        spec: &FilterSpec,
        query: &HoldQuery,
        view: &ViewRef,
    ) -> Result<HoldsView, CommandError> {
        let query = HoldQuery {
            limit: Some(query.limit.map_or(PAGE_ROWS, |limit| limit.min(PAGE_ROWS))),
            ..*query
        };
        let page = self.in_view(view, spec, |v| holds(v.dataset, &v.spec, &query))?;
        Ok(HoldsView {
            total: page.total,
            widest_line_id: page.widest_line_id,
            rows: page
                .rows
                .into_iter()
                .zip(page.positions)
                .map(|(row, position)| HoldRef { position, row })
                .collect(),
        })
    }

    /// The detail of one Line of the snapshot in view; `None` when the snapshot has no such Line.
    pub fn line_detail(
        &mut self,
        line_id: &str,
        view: &ViewRef,
    ) -> Result<Option<LineDetail>, CommandError> {
        let Some(selected) = self.snapshot_in_view(view)? else {
            return Ok(None);
        };
        let (dataset, plan) = self.plan(selected)?;
        Ok(line_detail(dataset, plan, line_id))
    }

    /// The Hold at this position of the snapshot in view; `None` past the end.
    pub fn hold_detail(
        &mut self,
        position: usize,
        view: &ViewRef,
    ) -> Result<Option<HoldRef>, CommandError> {
        let Some(selected) = self.snapshot_in_view(view)? else {
            return Ok(None);
        };
        Ok(self
            .dataset(selected)?
            .rows
            .get(position)
            .map(|row| HoldRef {
                position,
                row: row.clone(),
            }))
    }

    /// The kept holds grouped by `dim`, largest group first.
    pub fn breakdown(
        &mut self,
        spec: &FilterSpec,
        dim: &Dim,
        view: &ViewRef,
    ) -> Result<Vec<Group>, CommandError> {
        self.in_view(view, spec, |v| group_by(v.dataset, &v.spec, dim))
    }

    /// The kept holds crossed by two dimensions, folded at [`MATRIX_SIDE`] on each side.
    pub fn matrix(
        &mut self,
        spec: &FilterSpec,
        row_dim: &Dim,
        col_dim: &Dim,
        view: &ViewRef,
    ) -> Result<FoldedMatrix, CommandError> {
        self.in_view(view, spec, |v| {
            matrix_top(
                v.dataset,
                &v.spec,
                row_dim,
                col_dim,
                MATRIX_SIDE,
                MATRIX_SIDE,
            )
        })
    }

    /// The solve order of the kept holds. The plan is built for this filter on every request and
    /// not kept; the cached plan of the open holds belongs to the line panel.
    pub fn solve_order(
        &mut self,
        spec: &FilterSpec,
        view: &ViewRef,
    ) -> Result<SolveView, CommandError> {
        self.in_view(view, spec, |v| solve_view(v.dataset, &v.spec))
    }

    /// The detail of one blocker among the kept holds; `None` when no kept hold has it.
    pub fn blocker_detail(
        &mut self,
        spec: &FilterSpec,
        key: &str,
        view: &ViewRef,
    ) -> Result<Option<BlockerDetail>, CommandError> {
        self.in_view(view, spec, |v| {
            let plan = solve_plan(v.dataset, &v.spec, None);
            blocker_detail(v.dataset, &v.spec, &plan, key)
        })
    }

    /// One group of `dim` with its numbers and its first [`GROUP_LINES`] Lines; `None` when the
    /// filter keeps no hold with this key.
    pub fn group_detail(
        &mut self,
        spec: &FilterSpec,
        dim: &Dim,
        key: &str,
        view: &ViewRef,
    ) -> Result<Option<GroupDetail>, CommandError> {
        self.in_view(view, spec, |v| {
            let group = group_by(v.dataset, &v.spec, dim)
                .into_iter()
                .find(|group| group.key == key)?;
            let mut of_group = v.spec.without(dim);
            of_group.fields.push(FieldFilter {
                dim: dim.clone(),
                values: vec![key.to_string()],
                negate: false,
            });
            let lines = line_page(
                v.dataset,
                &of_group,
                &LineQuery::default(),
                0,
                Some(GROUP_LINES),
            );
            Some(GroupDetail { group, lines })
        })
    }
}
