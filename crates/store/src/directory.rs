//! Finding, matching, and deleting the workspace files in a folder.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::StoreError;
use crate::schema::{peek_version, SCHEMA_VERSION};
use crate::workspace::{io_error, Workspace, WorkspaceInfo, EXTENSION};

/// The workspaces of a folder, and the workspace files that could not be read.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceList {
    /// Readable workspaces, sorted by name, then id.
    pub workspaces: Vec<WorkspaceInfo>,
    /// Workspace files that could not be opened, sorted by path, each with the reason.
    pub unreadable: Vec<UnreadableWorkspace>,
}

/// A workspace file that could not be opened.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UnreadableWorkspace {
    /// The workspace file.
    pub path: PathBuf,
    /// Why it could not be opened.
    pub error: StoreError,
}

/// What the workspace file at `path` says about itself. A file a newer version wrote is refused
/// before anything else is read from it.
fn read_info(path: &Path) -> Result<WorkspaceInfo, StoreError> {
    let found = peek_version(path)?;
    if found > SCHEMA_VERSION {
        return Err(StoreError::NewerSchema {
            path: path.display().to_string(),
            found,
            supported: SCHEMA_VERSION,
        });
    }
    Workspace::open(path)?.info()
}

/// Every file in `dir` named `*.holdx-ws`: the workspaces that could be read, and the ones that
/// could not, each with the reason. One unreadable file never hides the others.
///
/// A file that is not a workspace at all is left out of both lists and left untouched. A
/// workspace a newer version wrote is listed as unreadable and never written to. A folder that
/// does not exist has no workspaces; an error is returned only when the folder itself cannot be
/// read.
pub fn list_workspaces(dir: &Path) -> Result<WorkspaceList, StoreError> {
    let mut list = WorkspaceList {
        workspaces: Vec::new(),
        unreadable: Vec::new(),
    };
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(list),
        Err(e) => return Err(io_error(dir, &e)),
    };
    for entry in entries {
        let path = entry.map_err(|e| io_error(dir, &e))?.path();
        let named_like_a_workspace = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(&format!(".{EXTENSION}")));
        if !named_like_a_workspace || !path.is_file() {
            continue;
        }
        match read_info(&path) {
            Ok(info) => list.workspaces.push(info),
            Err(StoreError::NotAWorkspace { .. }) => {}
            Err(error) => list.unreadable.push(UnreadableWorkspace { path, error }),
        }
    }
    list.workspaces
        .sort_by(|a, b| (&a.name, &a.id).cmp(&(&b.name, &b.id)));
    list.unreadable.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(list)
}

/// Readable workspaces in `dir` whose project numbers include `project_no` (trimmed, compared
/// exactly), sorted by name, then id.
pub fn find_by_project(dir: &Path, project_no: &str) -> Result<Vec<WorkspaceInfo>, StoreError> {
    let project_no = project_no.trim();
    Ok(list_workspaces(dir)?
        .workspaces
        .into_iter()
        .filter(|info| info.project_numbers.iter().any(|p| p == project_no))
        .collect())
}

/// Deletes the workspace file, and only that file.
pub fn delete_workspace(path: &Path) -> Result<(), StoreError> {
    std::fs::remove_file(path).map_err(|e| io_error(path, &e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{copy_with_hot_journal, journal_of};
    use rusqlite::Connection;

    fn names(list: &[WorkspaceInfo]) -> Vec<&str> {
        list.iter().map(|i| i.name.as_str()).collect()
    }

    fn nothing() -> WorkspaceList {
        WorkspaceList {
            workspaces: vec![],
            unreadable: vec![],
        }
    }

    #[test]
    fn lists_workspaces_sorted_by_name_then_id_and_skips_other_files() {
        let dir = tempfile::tempdir().unwrap();
        let b = Workspace::create(dir.path(), "Beta")
            .unwrap()
            .info()
            .unwrap();
        let a1 = Workspace::create(dir.path(), "Alpha")
            .unwrap()
            .info()
            .unwrap();
        let a2 = Workspace::create(dir.path(), "Alpha")
            .unwrap()
            .info()
            .unwrap();
        let notes = dir.path().join("notes.holdx-ws");
        std::fs::write(&notes, "just text\n".repeat(50)).unwrap();
        let notes_before = std::fs::read(&notes).unwrap();
        std::fs::write(dir.path().join("readme.txt"), "hello").unwrap();
        let foreign = dir.path().join("other.holdx-ws");
        Connection::open(&foreign)
            .unwrap()
            .execute_batch("CREATE TABLE foo (a INTEGER)")
            .unwrap();
        let before = std::fs::read(&foreign).unwrap();
        let WorkspaceList {
            workspaces: list,
            unreadable,
        } = list_workspaces(dir.path()).unwrap();
        assert_eq!(names(&list), vec!["Alpha", "Alpha", "Beta"]);
        let mut ids = [a1.id, a2.id];
        ids.sort();
        assert_eq!(list[0].id, ids[0]);
        assert_eq!(list[1].id, ids[1]);
        assert_eq!(list[2], b);
        assert_eq!(unreadable, vec![]);
        assert_eq!(std::fs::read(&foreign).unwrap(), before);
        assert_eq!(std::fs::read(&notes).unwrap(), notes_before);
        let files = std::fs::read_dir(dir.path()).unwrap().count();
        assert_eq!(files, 6);
    }

    #[test]
    fn a_missing_directory_lists_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            list_workspaces(&dir.path().join("nope")).unwrap(),
            nothing()
        );
    }

    #[test]
    fn find_by_project_returns_only_matching_workspaces() {
        let dir = tempfile::tempdir().unwrap();
        let mut a = Workspace::create(dir.path(), "A").unwrap();
        a.add_project_number("P1").unwrap();
        let mut b = Workspace::create(dir.path(), "B").unwrap();
        b.add_project_number("P2").unwrap();
        b.add_project_number("P1").unwrap();
        let mut c = Workspace::create(dir.path(), "C").unwrap();
        c.add_project_number("P3").unwrap();
        let found = find_by_project(dir.path(), "P1").unwrap();
        assert_eq!(names(&found), vec!["A", "B"]);
        assert_eq!(
            names(&find_by_project(dir.path(), " P3 ").unwrap()),
            vec!["C"]
        );
        assert!(find_by_project(dir.path(), "P9").unwrap().is_empty());
    }

    #[test]
    fn delete_removes_the_file_and_a_second_call_reports_io() {
        let dir = tempfile::tempdir().unwrap();
        let ws = Workspace::create(dir.path(), "A").unwrap();
        let path = ws.info().unwrap().path;
        drop(ws);
        delete_workspace(&path).unwrap();
        assert!(!path.exists());
        let error = delete_workspace(&path).unwrap_err();
        assert!(
            matches!(&error, StoreError::Io { path: p, .. } if *p == path.display().to_string()),
            "{error}"
        );
    }

    #[test]
    fn a_workspace_from_a_newer_version_is_listed_as_unreadable_and_untouched() {
        let dir = tempfile::tempdir().unwrap();
        Workspace::create(dir.path(), "Ok").unwrap();
        let newer = Workspace::create(dir.path(), "Newer")
            .unwrap()
            .info()
            .unwrap();
        Connection::open(&newer.path)
            .unwrap()
            .execute_batch("PRAGMA user_version = 99")
            .unwrap();
        let before = std::fs::read(&newer.path).unwrap();
        let list = list_workspaces(dir.path()).unwrap();
        assert_eq!(names(&list.workspaces), vec!["Ok"]);
        assert_eq!(
            list.unreadable,
            vec![UnreadableWorkspace {
                path: newer.path.clone(),
                error: StoreError::NewerSchema {
                    path: newer.path.display().to_string(),
                    found: 99,
                    supported: 1,
                },
            }]
        );
        assert_eq!(std::fs::read(&newer.path).unwrap(), before);
        let error = Workspace::open(&newer.path).err().unwrap();
        assert!(
            matches!(error, StoreError::NewerSchema { found: 99, .. }),
            "{error}"
        );
    }

    /// A workspace file whose `meta` table lacks the `name` entry.
    fn without_a_name(dir: &Path, file_name: &str) -> PathBuf {
        let elsewhere = tempfile::tempdir().unwrap();
        let made = Workspace::create(elsewhere.path(), "Nameless")
            .unwrap()
            .info()
            .unwrap();
        let path = dir.join(file_name);
        std::fs::copy(&made.path, &path).unwrap();
        Connection::open(&path)
            .unwrap()
            .execute("DELETE FROM meta WHERE key = 'name'", [])
            .unwrap();
        path
    }

    #[test]
    fn unreadable_workspaces_are_reported_beside_the_readable_one() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("ws");
        let healthy = Workspace::create(&folder, "Healthy")
            .unwrap()
            .info()
            .unwrap();
        let nameless = without_a_name(&folder, "a-nameless.holdx-ws");
        let newer = folder.join("b-newer.holdx-ws");
        std::fs::copy(&healthy.path, &newer).unwrap();
        Connection::open(&newer)
            .unwrap()
            .execute_batch("PRAGMA user_version = 99")
            .unwrap();
        let files = [&healthy.path, &nameless, &newer];
        let before: Vec<Vec<u8>> = files.iter().map(|f| std::fs::read(f).unwrap()).collect();

        let list = list_workspaces(&folder).unwrap();
        assert_eq!(list.workspaces, vec![healthy.clone()]);
        assert_eq!(list.unreadable.len(), 2, "{:?}", list.unreadable);
        assert_eq!(list.unreadable[0].path, nameless);
        assert!(
            matches!(&list.unreadable[0].error, StoreError::Corrupt { detail } if detail.contains("name")),
            "{}",
            list.unreadable[0].error
        );
        assert_eq!(list.unreadable[1].path, newer);
        assert_eq!(
            list.unreadable[1].error,
            StoreError::NewerSchema {
                path: newer.display().to_string(),
                found: 99,
                supported: 1,
            }
        );
        let after: Vec<Vec<u8>> = files.iter().map(|f| std::fs::read(f).unwrap()).collect();
        assert_eq!(after, before);
        assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 3);
    }

    #[test]
    fn the_listing_serializes_with_both_lists() {
        let list = WorkspaceList {
            workspaces: vec![],
            unreadable: vec![UnreadableWorkspace {
                path: PathBuf::from("w.holdx-ws"),
                error: StoreError::Corrupt {
                    detail: "bad".into(),
                },
            }],
        };
        let json = serde_json::to_value(&list).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "workspaces": [],
                "unreadable": [
                    {"path": "w.holdx-ws", "error": {"kind": "Corrupt", "detail": "bad"}}
                ],
            })
        );
        let back: WorkspaceList = serde_json::from_value(json).unwrap();
        assert_eq!(back, list);
    }

    #[test]
    fn find_by_project_goes_on_past_an_unreadable_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("ws");
        let mut a = Workspace::create(&folder, "A").unwrap();
        a.add_project_number("P1").unwrap();
        drop(a);
        without_a_name(&folder, "nameless.holdx-ws");
        assert_eq!(names(&find_by_project(&folder, "P1").unwrap()), vec!["A"]);
    }

    #[test]
    fn a_workspace_whose_last_write_was_interrupted_is_recovered_and_listed() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("ws");
        let original = Workspace::create(dir.path(), "Crashed")
            .unwrap()
            .info()
            .unwrap();
        std::fs::create_dir(&folder).unwrap();
        let crashed = folder.join("crashed.holdx-ws");
        copy_with_hot_journal(
            &original.path,
            &crashed,
            "INSERT INTO project (project_no) VALUES (?1)",
        );
        let list = list_workspaces(&folder).unwrap().workspaces;
        assert_eq!(names(&list), vec!["Crashed"]);
        assert_eq!(list[0].id, original.id);
        assert!(list[0].project_numbers.is_empty());
        assert!(!journal_of(&crashed).exists());
    }

    #[test]
    fn a_short_stray_file_is_skipped_and_left_byte_for_byte() {
        let dir = tempfile::tempdir().unwrap();
        Workspace::create(dir.path(), "Ok").unwrap();
        let stray = dir.path().join("short.holdx-ws");
        std::fs::write(&stray, "tiny\n").unwrap();
        let list = list_workspaces(dir.path()).unwrap();
        assert_eq!(names(&list.workspaces), vec!["Ok"]);
        assert_eq!(list.unreadable, vec![]);
        assert_eq!(std::fs::read(&stray).unwrap(), b"tiny\n");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
    }

    #[test]
    fn a_file_without_an_id_is_skipped_without_being_changed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("noid.holdx-ws");
        Connection::open(&path)
            .unwrap()
            .execute_batch(
                "PRAGMA application_id = 1213749075;
                 CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;",
            )
            .unwrap();
        let before = std::fs::read(&path).unwrap();
        assert_eq!(list_workspaces(dir.path()).unwrap(), nothing());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn a_file_whose_whole_name_is_the_extension_is_listed() {
        let dir = tempfile::tempdir().unwrap();
        let info = Workspace::create(dir.path(), "Hidden")
            .unwrap()
            .info()
            .unwrap();
        std::fs::copy(&info.path, dir.path().join(".holdx-ws")).unwrap();
        let list = list_workspaces(dir.path()).unwrap();
        assert_eq!(list.workspaces.len(), 2);
        assert_eq!(list.unreadable, vec![]);
    }

    #[test]
    fn a_workspace_marked_file_without_tables_is_skipped_without_being_changed() {
        let dir = tempfile::tempdir().unwrap();
        Workspace::create(dir.path(), "Ok").unwrap();
        let path = dir.path().join("empty.holdx-ws");
        Connection::open(&path)
            .unwrap()
            .execute_batch("PRAGMA application_id = 1213749075;")
            .unwrap();
        let before = std::fs::read(&path).unwrap();
        let list = list_workspaces(dir.path()).unwrap();
        assert_eq!(names(&list.workspaces), vec!["Ok"]);
        assert_eq!(list.unreadable, vec![]);
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
    }
}
