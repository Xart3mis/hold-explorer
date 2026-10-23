//! Saved views: named screens with their filters, kept in the workspace's `setting` table under
//! one key, as a list in sidebar order. The ids are given out from a counter in `meta`.

use hx_core::filter::FilterSpec;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

use crate::error::{database, StoreError};
use crate::workspace::Workspace;

/// The `setting` key under which the list of saved views is kept.
const VIEWS_KEY: &str = "saved_views";

/// The `meta` key of the id the next saved view gets, so an id is not given twice even after the
/// view that held it was deleted.
const NEXT_ID_KEY: &str = "next_view_id";

/// A screen of the workspace with its filters, saved under a name.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SavedView {
    /// Stable within the workspace: one more than the highest id ever given (kept in `meta`).
    pub id: i64,
    /// The name the user gave the view.
    pub name: String,
    /// A data screen's address without its selection: path and query, as
    /// `/lines?mode=holds&sort=age`.
    pub address: String,
    /// The filters the view applies.
    pub filters: FilterSpec,
}

impl Workspace {
    /// The saved views, in sidebar order; none when none were saved. A stored value that cannot
    /// be read is [`StoreError::Corrupt`] and is left as it is.
    pub fn saved_views(&self) -> Result<Vec<SavedView>, StoreError> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT value_json FROM setting WHERE key = ?1",
                [VIEWS_KEY],
                |r| r.get(0),
            )
            .optional()
            .map_err(database)?;
        match json {
            None => Ok(Vec::new()),
            Some(json) => serde_json::from_str(&json).map_err(|e| StoreError::Corrupt {
                detail: format!("the saved views could not be read ({e})"),
            }),
        }
    }

    /// The id the next saved view gets: one more than the highest id ever given.
    pub fn next_view_id(&self) -> Result<i64, StoreError> {
        let counter: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [NEXT_ID_KEY],
                |r| r.get(0),
            )
            .optional()
            .map_err(database)?;
        let counter = counter
            .and_then(|text| text.parse::<i64>().ok())
            .unwrap_or(1);
        // Whatever the counter says, never an id a view in the list holds. A damaged list holds
        // none we can read, and the next write replaces it, so it counts as empty here.
        let highest = self
            .saved_views()
            .unwrap_or_default()
            .iter()
            .map(|view| view.id)
            .max()
            .unwrap_or(0);
        Ok(counter.max(highest.saturating_add(1)))
    }

    /// Replaces the saved views with `views`, in this order, and moves the id counter past the
    /// highest id in the list, in one transaction. A damaged stored value is replaced.
    pub fn set_saved_views(&mut self, views: &[SavedView]) -> Result<(), StoreError> {
        let json = serde_json::to_string(views).map_err(|e| StoreError::Corrupt {
            detail: format!("the saved views could not be saved ({e})"),
        })?;
        let next = self.next_view_id()?.max(
            views
                .iter()
                .map(|view| view.id.saturating_add(1))
                .max()
                .unwrap_or(1),
        );
        let tx = self.conn.transaction().map_err(database)?;
        tx.execute(
            "INSERT OR REPLACE INTO setting (key, value_json) VALUES (?1, ?2)",
            [VIEWS_KEY, json.as_str()],
        )
        .map_err(database)?;
        tx.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
            [NEXT_ID_KEY, next.to_string().as_str()],
        )
        .map_err(database)?;
        tx.commit().map_err(database)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hx_core::filter::FilterSpec;

    fn view(id: i64, name: &str) -> SavedView {
        SavedView {
            id,
            name: name.into(),
            address: "/lines?mode=holds&sort=age".into(),
            filters: FilterSpec {
                text: "valve".into(),
                ..FilterSpec::default()
            },
        }
    }

    #[test]
    fn views_start_empty_and_round_trip_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "A").unwrap();
        assert_eq!(ws.saved_views().unwrap(), vec![]);
        let views = vec![view(2, "Second"), view(1, "First")];
        ws.set_saved_views(&views).unwrap();
        assert_eq!(ws.saved_views().unwrap(), views);
    }

    #[test]
    fn a_reopened_workspace_keeps_its_views() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "A").unwrap();
        let views = vec![view(1, "First")];
        ws.set_saved_views(&views).unwrap();
        let path = ws.info().unwrap().path;
        drop(ws);
        let ws = Workspace::open(&path).unwrap();
        assert_eq!(ws.saved_views().unwrap(), views);
        assert_eq!(ws.next_view_id().unwrap(), 2);
    }

    #[test]
    fn ids_are_never_reused_after_a_delete() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "A").unwrap();
        assert_eq!(ws.next_view_id().unwrap(), 1);
        ws.set_saved_views(&[view(1, "A"), view(2, "B")]).unwrap();
        assert_eq!(ws.next_view_id().unwrap(), 3);
        ws.set_saved_views(&[view(1, "A")]).unwrap();
        assert_eq!(ws.next_view_id().unwrap(), 3);
        ws.set_saved_views(&[]).unwrap();
        assert_eq!(ws.next_view_id().unwrap(), 3);
    }

    #[test]
    fn a_damaged_value_is_corrupt_and_the_next_write_replaces_it() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "A").unwrap();
        ws.conn
            .execute(
                "INSERT INTO setting (key, value_json) VALUES ('saved_views', '{not json')",
                [],
            )
            .unwrap();
        assert!(matches!(
            ws.saved_views().unwrap_err(),
            crate::StoreError::Corrupt { .. }
        ));
        assert_eq!(ws.next_view_id().unwrap(), 1);
        ws.set_saved_views(&[view(1, "A")]).unwrap();
        assert_eq!(ws.saved_views().unwrap(), vec![view(1, "A")]);
    }

    #[test]
    fn saving_views_does_not_change_the_schema_version() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "A").unwrap();
        ws.set_saved_views(&[view(1, "A")]).unwrap();
        let version: i64 = ws
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, i64::from(crate::SCHEMA_VERSION));
        assert_eq!(crate::SCHEMA_VERSION, 1);
    }
}
