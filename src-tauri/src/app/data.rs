//! The data commands: the filter bar's options and values, a page of Lines or Holds, and the
//! detail of one Line or one Hold, all for the snapshot in view.

use chrono::DateTime;
use hx_core::dataset::Dataset;
use hx_core::detail::{blocker_detail, line_detail, BlockerDetail, HoldRef, LineDetail};
use hx_core::filter::{default_age_bands, AgeBand, Dim, FieldFilter, FilterSpec};
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
use super::{AppState, GROUP_LINES, MATRIX_SIDE, PAGE_ROWS, PICKER_VALUES};

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

/// The options of the filter bar for the holds of `ds` that `spec` keeps, with the snapshot's
/// extra columns and absent fields.
fn options(
    ds: &Dataset,
    spec: &FilterSpec,
    custom_dims: Vec<String>,
    absent: Vec<Field>,
) -> FilterOptions {
    let bands = default_age_bands();
    FilterOptions {
        total: summary(ds, spec).holds,
        facets: facet_counts(ds, spec, &bands),
        age_bands: bands,
        custom_dims,
        absent,
    }
}

impl AppState {
    /// Checks `view` and gives `read` the dataset of the snapshot in view, or an empty one for a
    /// workspace without a snapshot, so the two cases cannot answer differently.
    fn in_view<T>(
        &mut self,
        view: &ViewRef,
        read: impl FnOnce(&Dataset, bool) -> T,
    ) -> Result<T, CommandError> {
        self.check_view(view)?;
        Ok(match self.selected {
            Some(selected) => read(self.dataset(selected)?, true),
            None => read(&empty_dataset(), false),
        })
    }

    /// Checks `view` and returns the selected snapshot, or `None` for a workspace without one.
    fn snapshot_in_view(&self, view: &ViewRef) -> Result<Option<i64>, CommandError> {
        self.check_view(view)?;
        Ok(self.selected)
    }

    /// The options of the filter bar for this filter. Without a snapshot every count is zero and
    /// `absent` is empty: nothing is missing from a snapshot that does not exist. The extra
    /// columns and absent fields of a snapshot are found once; see [`AppState::columns`].
    pub fn filter_options(
        &mut self,
        spec: &FilterSpec,
        view: &ViewRef,
    ) -> Result<FilterOptions, CommandError> {
        let Some(selected) = self.snapshot_in_view(view)? else {
            let ds = empty_dataset();
            return Ok(options(&ds, spec, ds.custom_dims(), Vec::new()));
        };
        let (ds, columns) = self.columns(selected)?;
        Ok(options(
            ds,
            spec,
            columns.custom_dims.clone(),
            columns.absent.clone(),
        ))
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
        self.in_view(view, |ds, _| {
            value_page(ds, spec, dim, search, PICKER_VALUES)
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
        self.in_view(view, |ds, _| {
            line_page(ds, spec, query, offset, Some(PAGE_ROWS))
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
        let page = self.in_view(view, |ds, _| holds(ds, spec, &query))?;
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
        self.in_view(view, |ds, _| group_by(ds, spec, dim))
    }

    /// The kept holds crossed by two dimensions, folded at [`MATRIX_SIDE`] on each side.
    pub fn matrix(
        &mut self,
        spec: &FilterSpec,
        row_dim: &Dim,
        col_dim: &Dim,
        view: &ViewRef,
    ) -> Result<FoldedMatrix, CommandError> {
        self.in_view(view, |ds, _| {
            matrix_top(ds, spec, row_dim, col_dim, MATRIX_SIDE, MATRIX_SIDE)
        })
    }

    /// The solve order of the kept holds. The plan is built for this filter on every request and
    /// not kept; the cached plan of the open holds belongs to the line panel.
    pub fn solve_order(
        &mut self,
        spec: &FilterSpec,
        view: &ViewRef,
    ) -> Result<SolveView, CommandError> {
        self.in_view(view, |ds, _| solve_view(ds, spec))
    }

    /// The detail of one blocker among the kept holds; `None` when no kept hold has it.
    pub fn blocker_detail(
        &mut self,
        spec: &FilterSpec,
        key: &str,
        view: &ViewRef,
    ) -> Result<Option<BlockerDetail>, CommandError> {
        self.in_view(view, |ds, _| {
            let plan = solve_plan(ds, spec, None);
            blocker_detail(ds, spec, &plan, key)
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
        self.in_view(view, |ds, _| {
            let group = group_by(ds, spec, dim)
                .into_iter()
                .find(|group| group.key == key)?;
            let mut of_group = spec.without(dim);
            of_group.fields.push(FieldFilter {
                dim: dim.clone(),
                values: vec![key.to_string()],
                negate: false,
            });
            let lines = line_page(ds, &of_group, &LineQuery::default(), 0, Some(GROUP_LINES));
            Some(GroupDetail { group, lines })
        })
    }
}
