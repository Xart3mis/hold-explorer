//! The search command: what a query finds among the holds of the snapshot in view.

use hx_core::search::{search, SearchResults};

use super::data::empty_dataset;
use super::error::CommandError;
use super::snapshots::ViewRef;
use super::{AppState, SEARCH_HITS};

impl AppState {
    /// What `query` finds in the snapshot in view, open and released holds alike, at most
    /// [`SEARCH_HITS`] hits in each group; nothing for a workspace without a snapshot.
    pub fn search(&mut self, query: &str, view: &ViewRef) -> Result<SearchResults, CommandError> {
        let Some(selected) = self.snapshot_in_view(view)? else {
            return Ok(search(&empty_dataset(), query, SEARCH_HITS));
        };
        Ok(search(self.dataset(selected)?, query, SEARCH_HITS))
    }
}

#[cfg(test)]
mod tests {
    use hx_core::search::{SearchGroupKind, SearchKind};

    use super::super::error::ErrorKind;
    use super::super::test_support::{shown, small, view_of, Fixture};
    use super::super::SEARCH_HITS;

    #[test]
    fn search_answers_for_the_snapshot_in_view_only() {
        let fx = Fixture::new();
        let mut state = fx.state();
        let none = view_of("0123456789abcdef", None);
        assert_eq!(
            state.search("pending", &none).unwrap_err().kind,
            ErrorKind::NoWorkspace
        );

        let mut state = small(&fx);
        let (workspace, snapshot) = (state.open_id(), state.selected_snapshot().unwrap());
        for stale in [
            view_of("0123456789abcdef", Some(snapshot)),
            view_of(&workspace, Some(snapshot + 100)),
            view_of(&workspace, None),
        ] {
            assert_eq!(
                state.search("pending", &stale).unwrap_err().kind,
                ErrorKind::ViewChanged,
                "{stale:?}"
            );
        }

        let view = shown(&state);
        let found = state.search("pending", &view).unwrap();
        assert_eq!(found.query, "pending");
        let remarks = found
            .groups
            .iter()
            .find(|group| group.kind == SearchGroupKind::Remarks)
            .expect("the synthetic remarks say pending");
        assert!(remarks.hits.len() <= SEARCH_HITS);
        assert!(remarks.total >= remarks.hits.len());
        assert!(remarks
            .hits
            .iter()
            .all(|hit| hit.kind == SearchKind::Remark));
    }

    #[test]
    fn a_workspace_without_snapshots_finds_nothing() {
        let fx = Fixture::new();
        let mut state = fx.state();
        state.create_workspace("Empty").unwrap();
        let view = shown(&state);
        let found = state.search("pending", &view).unwrap();
        assert!(found.groups.is_empty());
    }
}
