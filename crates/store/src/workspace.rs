//! A workspace: one SQLite file that holds the snapshots, the project numbers, and the saved
//! mapping of one body of work.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::{NaiveDateTime, Utc};
use hx_core::mapping::SavedMapping;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::StoreError;
use crate::schema::{open_database, peek_version};

/// The extension of a workspace file.
pub(crate) const EXTENSION: &str = "holdx-ws";

/// The text format of every stored timestamp: nine fractional digits, so text order is time order.
const TIMESTAMP_FORMAT: &str = "%Y-%m-%dT%H:%M:%S%.9f";

/// The name given to a workspace whose name is blank.
const DEFAULT_NAME: &str = "Untitled workspace";

/// The `setting` key under which the saved mapping is kept.
const MAPPING_KEY: &str = "saved_mapping";

/// What a workspace file says about itself.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    /// The workspace id: 16 lower-case hex characters.
    pub id: String,
    /// The name the user gave the workspace.
    pub name: String,
    /// The project numbers this workspace covers, sorted.
    pub project_numbers: Vec<String>,
    /// When the workspace was created.
    pub created_at: NaiveDateTime,
    /// The file the workspace was opened or created with.
    pub path: PathBuf,
    /// How many snapshots the workspace holds.
    pub snapshot_count: usize,
    /// Date of the newest snapshot.
    pub latest_taken_at: Option<NaiveDateTime>,
}

/// An open workspace.
pub struct Workspace {
    pub(crate) conn: Connection,
    path: PathBuf,
}

fn format_timestamp(at: NaiveDateTime) -> String {
    at.format(TIMESTAMP_FORMAT).to_string()
}

fn parse_timestamp(text: &str) -> Result<NaiveDateTime, StoreError> {
    NaiveDateTime::parse_from_str(text, TIMESTAMP_FORMAT).map_err(|e| StoreError::Corrupt {
        detail: format!("the stored time \"{text}\" is not a valid time ({e})"),
    })
}

fn clean_name(name: &str) -> String {
    let name = name.trim();
    if name.is_empty() {
        DEFAULT_NAME.to_string()
    } else {
        name.to_string()
    }
}

/// A fresh 16-character hex id, hashed from the name, the time, the process id, and a counter.
fn new_id(name: &str) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = Utc::now().timestamp_nanos_opt().unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    hasher.update(nanos.to_le_bytes());
    hasher.update(std::process::id().to_le_bytes());
    hasher.update(COUNTER.fetch_add(1, Ordering::Relaxed).to_le_bytes());
    hasher
        .finalize()
        .iter()
        .take(8)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn io_error(path: &Path, error: &std::io::Error) -> StoreError {
    StoreError::Io {
        path: path.display().to_string(),
        detail: error.to_string(),
    }
}

impl Workspace {
    /// Creates `<dir>/<id>.holdx-ws` and returns it open. The folder is created when missing and
    /// an existing file is never overwritten.
    pub fn create(dir: &Path, name: &str) -> Result<Workspace, StoreError> {
        std::fs::create_dir_all(dir).map_err(|e| io_error(dir, &e))?;
        let name = clean_name(name);
        let (id, path) = loop {
            let id = new_id(&name);
            let path = dir.join(format!("{id}.{EXTENSION}"));
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
            {
                Ok(_) => break (id, path),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(io_error(&path, &e)),
            }
        };
        match Workspace::initialise(&path, &id, &name) {
            Ok(workspace) => Ok(workspace),
            Err(error) => {
                // The file was created just now, so removing it loses nothing.
                let _ = std::fs::remove_file(&path);
                Err(error)
            }
        }
    }

    fn initialise(path: &Path, id: &str, name: &str) -> Result<Workspace, StoreError> {
        let mut conn = open_database(path)?;
        let tx = conn.transaction()?;
        {
            let mut insert = tx.prepare("INSERT INTO meta (key, value) VALUES (?1, ?2)")?;
            insert.execute(["id", id])?;
            insert.execute(["name", name])?;
            insert.execute(["created_at", &format_timestamp(Utc::now().naive_utc())])?;
        }
        tx.commit()?;
        Ok(Workspace {
            conn,
            path: path.to_path_buf(),
        })
    }

    /// Opens the existing workspace at `path`, bringing it up to the newest schema version. A
    /// missing file is an `Io` error; a file that is not a workspace is left as it was.
    pub fn open(path: &Path) -> Result<Workspace, StoreError> {
        peek_version(path)?;
        let conn = open_database(path)?;
        let workspace = Workspace {
            conn,
            path: path.to_path_buf(),
        };
        if workspace.meta("id")?.is_none() {
            return Err(StoreError::NotAWorkspace {
                path: path.display().to_string(),
            });
        }
        Ok(workspace)
    }

    fn meta(&self, key: &str) -> Result<Option<String>, StoreError> {
        Ok(self
            .conn
            .query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
            .optional()?)
    }

    fn required_meta(&self, key: &str) -> Result<String, StoreError> {
        self.meta(key)?.ok_or_else(|| StoreError::Corrupt {
            detail: format!("the workspace has no \"{key}\" entry"),
        })
    }

    /// What the workspace file says about itself.
    pub fn info(&self) -> Result<WorkspaceInfo, StoreError> {
        let mut stmt = self
            .conn
            .prepare("SELECT project_no FROM project ORDER BY project_no")?;
        let project_numbers = stmt
            .query_map([], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        let (count, latest): (i64, Option<String>) =
            self.conn
                .query_row("SELECT count(*), max(taken_at) FROM snapshot", [], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })?;
        Ok(WorkspaceInfo {
            id: self.required_meta("id")?,
            name: self.required_meta("name")?,
            project_numbers,
            created_at: parse_timestamp(&self.required_meta("created_at")?)?,
            path: self.path.clone(),
            snapshot_count: usize::try_from(count).unwrap_or_default(),
            latest_taken_at: latest.as_deref().map(parse_timestamp).transpose()?,
        })
    }

    /// Renames the workspace. The name is trimmed; a blank name becomes `Untitled workspace`.
    pub fn rename(&mut self, name: &str) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('name', ?1)",
            [clean_name(name)],
        )?;
        Ok(())
    }

    /// Adds a project number (trimmed, compared exactly). Adding one twice, or a blank one, does
    /// nothing.
    pub fn add_project_number(&mut self, project_no: &str) -> Result<(), StoreError> {
        let project_no = project_no.trim();
        if !project_no.is_empty() {
            self.conn.execute(
                "INSERT OR IGNORE INTO project (project_no) VALUES (?1)",
                [project_no],
            )?;
        }
        Ok(())
    }

    /// Removes a project number (trimmed, compared exactly). A number not in the list is ignored.
    pub fn remove_project_number(&mut self, project_no: &str) -> Result<(), StoreError> {
        self.conn.execute(
            "DELETE FROM project WHERE project_no = ?1",
            [project_no.trim()],
        )?;
        Ok(())
    }

    /// The column mapping remembered for this workspace, if one was saved.
    pub fn saved_mapping(&self) -> Result<Option<SavedMapping>, StoreError> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT value_json FROM setting WHERE key = ?1",
                [MAPPING_KEY],
                |r| r.get(0),
            )
            .optional()?;
        json.map(|json| {
            serde_json::from_str(&json).map_err(|e| StoreError::Corrupt {
                detail: format!("the saved column mapping could not be read ({e})"),
            })
        })
        .transpose()
    }

    /// Remembers the column mapping for this workspace, replacing any earlier one.
    pub fn set_saved_mapping(&mut self, mapping: &SavedMapping) -> Result<(), StoreError> {
        let json = serde_json::to_string(mapping).map_err(|e| StoreError::Corrupt {
            detail: format!("the column mapping could not be saved ({e})"),
        })?;
        self.conn.execute(
            "INSERT OR REPLACE INTO setting (key, value_json) VALUES (?1, ?2)",
            [MAPPING_KEY, json.as_str()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hx_core::mapping::{Field, SavedColumn};

    fn mapping() -> SavedMapping {
        SavedMapping {
            columns: vec![
                SavedColumn {
                    key: "line".into(),
                    occurrence: 0,
                    field: Some(Field::LineId),
                },
                SavedColumn {
                    key: "remark".into(),
                    occurrence: 0,
                    field: Some(Field::Remark),
                },
                SavedColumn {
                    key: "remark".into(),
                    occurrence: 1,
                    field: None,
                },
            ],
        }
    }

    #[test]
    fn create_then_open_gives_the_same_info() {
        let dir = tempfile::tempdir().unwrap();
        let created = Workspace::create(dir.path(), "Unit 4").unwrap();
        let info = created.info().unwrap();
        assert_eq!(info.id.len(), 16);
        assert!(info
            .id
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)));
        assert_eq!(info.name, "Unit 4");
        assert_eq!(info.path, dir.path().join(format!("{}.holdx-ws", info.id)));
        assert!(info.project_numbers.is_empty());
        drop(created);
        let reopened = Workspace::open(&info.path).unwrap();
        assert_eq!(reopened.info().unwrap(), info);
    }

    #[test]
    fn a_new_workspace_has_no_snapshots() {
        let dir = tempfile::tempdir().unwrap();
        let info = Workspace::create(dir.path(), "A").unwrap().info().unwrap();
        assert_eq!(info.snapshot_count, 0);
        assert_eq!(info.latest_taken_at, None);
    }

    #[test]
    fn create_makes_a_missing_directory() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("a").join("b");
        let info = Workspace::create(&nested, "A").unwrap().info().unwrap();
        assert!(info.path.is_file());
    }

    #[test]
    fn names_are_trimmed_and_blank_names_get_a_default() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "  Unit 4  ").unwrap();
        assert_eq!(ws.info().unwrap().name, "Unit 4");
        ws.rename("   ").unwrap();
        assert_eq!(ws.info().unwrap().name, "Untitled workspace");
        assert_eq!(
            Workspace::create(dir.path(), "")
                .unwrap()
                .info()
                .unwrap()
                .name,
            "Untitled workspace"
        );
    }

    #[test]
    fn rename_persists_across_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "Old").unwrap();
        ws.rename(" New ").unwrap();
        let path = ws.info().unwrap().path;
        drop(ws);
        assert_eq!(Workspace::open(&path).unwrap().info().unwrap().name, "New");
    }

    #[test]
    fn project_numbers_add_deduplicate_remove_and_persist() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "A").unwrap();
        ws.add_project_number(" P2 ").unwrap();
        ws.add_project_number("P1").unwrap();
        ws.add_project_number("P2").unwrap();
        ws.add_project_number("  ").unwrap();
        assert_eq!(ws.info().unwrap().project_numbers, vec!["P1", "P2"]);
        let path = ws.info().unwrap().path;
        drop(ws);
        let mut ws = Workspace::open(&path).unwrap();
        assert_eq!(ws.info().unwrap().project_numbers, vec!["P1", "P2"]);
        ws.remove_project_number("p1").unwrap();
        assert_eq!(ws.info().unwrap().project_numbers, vec!["P1", "P2"]);
        ws.remove_project_number(" P1 ").unwrap();
        ws.remove_project_number("P9").unwrap();
        assert_eq!(ws.info().unwrap().project_numbers, vec!["P2"]);
    }

    #[test]
    fn the_saved_mapping_starts_empty_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = Workspace::create(dir.path(), "A").unwrap();
        assert_eq!(ws.saved_mapping().unwrap(), None);
        ws.set_saved_mapping(&mapping()).unwrap();
        assert_eq!(ws.saved_mapping().unwrap(), Some(mapping()));
        let path = ws.info().unwrap().path;
        drop(ws);
        let mut ws = Workspace::open(&path).unwrap();
        assert_eq!(ws.saved_mapping().unwrap(), Some(mapping()));
        ws.set_saved_mapping(&SavedMapping::default()).unwrap();
        assert_eq!(ws.saved_mapping().unwrap(), Some(SavedMapping::default()));
    }

    #[test]
    fn two_creations_with_the_same_name_give_two_files() {
        let dir = tempfile::tempdir().unwrap();
        let a = Workspace::create(dir.path(), "Same")
            .unwrap()
            .info()
            .unwrap();
        let b = Workspace::create(dir.path(), "Same")
            .unwrap()
            .info()
            .unwrap();
        assert_ne!(a.id, b.id);
        assert_ne!(a.path, b.path);
        assert!(a.path.is_file() && b.path.is_file());
    }

    #[test]
    fn open_of_a_missing_file_is_an_io_error_and_creates_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("missing.holdx-ws");
        let error = Workspace::open(&path).err().unwrap();
        assert!(
            matches!(&error, StoreError::Io { path: p, .. } if *p == path.display().to_string()),
            "{error}"
        );
        assert!(!path.exists());
    }

    #[test]
    fn open_of_an_empty_file_is_not_a_workspace_and_leaves_it_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("empty.holdx-ws");
        std::fs::write(&path, b"").unwrap();
        let error = Workspace::open(&path).err().unwrap();
        assert!(matches!(error, StoreError::NotAWorkspace { .. }), "{error}");
        assert_eq!(std::fs::metadata(&path).unwrap().len(), 0);
    }

    #[test]
    fn open_refuses_a_file_without_a_workspace_id() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.holdx-ws");
        drop(crate::schema::open_database(&path).unwrap());
        let error = Workspace::open(&path).err().unwrap();
        assert!(matches!(error, StoreError::NotAWorkspace { .. }), "{error}");
    }

    #[test]
    fn created_at_is_stored_with_nine_fractional_digits() {
        let dir = tempfile::tempdir().unwrap();
        let ws = Workspace::create(dir.path(), "A").unwrap();
        let text: String = ws
            .conn
            .query_row("SELECT value FROM meta WHERE key = 'created_at'", [], |r| {
                r.get(0)
            })
            .unwrap();
        let (_, fraction) = text.split_once('.').unwrap();
        assert_eq!(fraction.len(), 9, "{text}");
        assert_eq!(text.as_bytes()[10], b'T');
    }
}
