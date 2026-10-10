//! The error a failed store operation reports.

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Every message says what went wrong and what the user can do about it.
#[derive(Debug, Clone, PartialEq, Error, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum StoreError {
    #[error("The file {path} is not a Hold Explorer workspace. Choose a workspace file, or create a new workspace in another folder.")]
    /// The file is not a Hold Explorer workspace.
    NotAWorkspace {
        /// The file that was opened.
        path: String,
    },

    #[error("The workspace {path} was written by a newer version of Hold Explorer (schema version {found}; this version supports up to {supported}). Update Hold Explorer to open it.")]
    /// The file was written by a newer version of the app.
    NewerSchema {
        /// The workspace file.
        path: String,
        /// The schema version found in the file.
        found: u32,
        /// The newest schema version this build supports.
        supported: u32,
    },

    #[error("This file was already imported as snapshot {snapshot_id} ({file_name}, taken {taken_at}). Choose a different file, or open the existing snapshot.")]
    /// The same file was imported before.
    AlreadyImported {
        /// The snapshot that holds the same file.
        snapshot_id: i64,
        /// The date of that snapshot.
        taken_at: NaiveDateTime,
        /// The name the file had when it was imported.
        file_name: String,
    },

    #[error("No snapshot has the id {snapshot_id}. It may have been deleted; choose a snapshot from the list.")]
    /// No snapshot has this id.
    SnapshotNotFound {
        /// The id that was looked up.
        snapshot_id: i64,
    },

    #[error("Could not read or write {path}: {}. Check that the folder exists, that you have permission to use it, and that there is free disk space, then try again.", .detail.trim_end_matches('.'))]
    /// A workspace file could not be read or written.
    Io {
        /// The file or folder involved.
        path: String,
        /// The underlying reason.
        detail: String,
    },

    #[error("The workspace database reported an error: {}. Close any other program that uses the workspace and try again; if it keeps happening, restore the workspace from a backup.", .detail.trim_end_matches('.'))]
    /// The database reported an error.
    Database {
        /// The underlying reason.
        detail: String,
    },

    #[error("Stored data could not be understood: {}. The workspace file may be damaged; restore it from a backup, or import the files again into a new workspace.", .detail.trim_end_matches('.'))]
    /// Stored data could not be understood.
    Corrupt {
        /// What was wrong with the stored data.
        detail: String,
    },
}

impl From<rusqlite::Error> for StoreError {
    fn from(error: rusqlite::Error) -> Self {
        StoreError::Database {
            detail: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn every_variant() -> Vec<(StoreError, &'static str)> {
        let taken_at = chrono::NaiveDate::from_ymd_opt(2026, 3, 1)
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .expect("a valid date");
        vec![
            (
                StoreError::NotAWorkspace {
                    path: "a.db".into(),
                },
                "Choose a workspace file",
            ),
            (
                StoreError::NewerSchema {
                    path: "a.db".into(),
                    found: 99,
                    supported: 1,
                },
                "Update Hold Explorer",
            ),
            (
                StoreError::AlreadyImported {
                    snapshot_id: 3,
                    taken_at,
                    file_name: "a.xlsx".into(),
                },
                "Choose a different file",
            ),
            (
                StoreError::SnapshotNotFound { snapshot_id: 7 },
                "choose a snapshot",
            ),
            (
                StoreError::Io {
                    path: "a.db".into(),
                    detail: "Permission denied".into(),
                },
                "free disk space",
            ),
            (
                StoreError::Database {
                    detail: "disk I/O error".into(),
                },
                "restore the workspace",
            ),
            (
                StoreError::Corrupt {
                    detail: "bad json".into(),
                },
                "into a new workspace",
            ),
        ]
    }

    #[test]
    fn every_message_ends_with_advice() {
        for (error, advice) in every_variant() {
            let message = error.to_string();
            assert!(message.ends_with('.'), "{message}");
            let last_sentence = message.rsplit(". ").next().unwrap();
            assert!(last_sentence.contains(advice), "{message}");
        }
    }

    #[test]
    fn a_detail_that_ends_in_a_period_does_not_double_it() {
        let io = StoreError::Io {
            path: "a.db".into(),
            detail: "Permission denied.".into(),
        };
        let database = StoreError::Database {
            detail: "disk I/O error.".into(),
        };
        let corrupt = StoreError::Corrupt {
            detail: "bad json.".into(),
        };
        for error in [io, database, corrupt] {
            assert!(!error.to_string().contains(".."), "{error}");
        }
    }

    #[test]
    fn every_variant_round_trips_through_json() {
        for (error, _) in every_variant() {
            let json = serde_json::to_value(&error).unwrap();
            assert!(json["kind"].is_string(), "{json}");
            let back: StoreError = serde_json::from_value(json).unwrap();
            assert_eq!(back, error);
        }
    }

    #[test]
    fn variant_serializes_with_its_kind() {
        assert_eq!(
            serde_json::to_value(StoreError::NewerSchema {
                path: "a.db".into(),
                found: 99,
                supported: 1,
            })
            .unwrap(),
            serde_json::json!({"kind": "NewerSchema", "path": "a.db", "found": 99, "supported": 1})
        );
    }
}
