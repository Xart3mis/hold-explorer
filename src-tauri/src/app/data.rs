//! The data commands: the filter bar's options and values, a page of Lines or Holds, and the
//! detail of one Line or one Hold, all for the snapshot in view.

use chrono::DateTime;
use hx_core::dataset::Dataset;
use hx_core::detail::{line_detail, HoldRef, LineDetail};
use hx_core::filter::{default_age_bands, AgeBand, Dim, FilterSpec};
use hx_core::mapping::Field;
use hx_core::query::{
    facet_counts, holds, line_page, value_page, FacetCounts, HoldQuery, LinePage, LineQuery,
    ValuePage,
};
use hx_core::rules::RuleSet;
use serde::Serialize;
use ts_rs::TS;

use super::error::CommandError;
use super::snapshots::ViewRef;
use super::AppState;

/// Most rows a data command returns in one answer.
pub const PAGE_ROWS: usize = 200;
/// Most values `filter_values` returns.
pub const PICKER_VALUES: usize = 200;

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
    /// Optional fields the snapshot has no value for.
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

/// A snapshot without a hold, which is what a workspace without snapshots answers for.
fn empty_dataset() -> Dataset {
    Dataset::build(
        Vec::new(),
        RuleSet::builtin(),
        DateTime::UNIX_EPOCH.naive_utc(),
    )
}

impl AppState {
    /// Checks `view` and returns the selected snapshot, or `None` for a workspace without one.
    fn snapshot_in_view(&self, view: &ViewRef) -> Result<Option<i64>, CommandError> {
        self.check_view(view)?;
        Ok(self.selected)
    }

    /// The options of the filter bar for this filter. Without a snapshot every count is zero.
    pub fn filter_options(
        &mut self,
        spec: &FilterSpec,
        view: &ViewRef,
    ) -> Result<FilterOptions, CommandError> {
        let bands = default_age_bands();
        let options = |ds: &Dataset| FilterOptions {
            total: hx_core::query::summary(ds, spec).holds,
            facets: facet_counts(ds, spec, &bands),
            age_bands: bands.clone(),
            custom_dims: ds.custom_dims(),
            absent: ds.absent_fields(),
        };
        Ok(match self.snapshot_in_view(view)? {
            Some(selected) => options(self.dataset(selected)?),
            None => options(&empty_dataset()),
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
        Ok(match self.snapshot_in_view(view)? {
            Some(selected) => value_page(self.dataset(selected)?, spec, dim, search, PICKER_VALUES),
            None => value_page(&empty_dataset(), spec, dim, search, PICKER_VALUES),
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
        Ok(match self.snapshot_in_view(view)? {
            Some(selected) => line_page(
                self.dataset(selected)?,
                spec,
                query,
                offset,
                Some(PAGE_ROWS),
            ),
            None => line_page(&empty_dataset(), spec, query, offset, Some(PAGE_ROWS)),
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
        let page = match self.snapshot_in_view(view)? {
            Some(selected) => holds(self.dataset(selected)?, spec, &query),
            None => holds(&empty_dataset(), spec, &query),
        };
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
}
