//! Finding, matching, and deleting the workspace files in a folder.

use std::path::Path;

use crate::error::StoreError;
use crate::schema::{peek_version, SCHEMA_VERSION};
use crate::workspace::{io_error, Workspace, WorkspaceInfo, EXTENSION};

/// Every workspace file in `dir`, sorted by name then id. Files that are not workspaces, or that
/// a newer version wrote, are skipped and left untouched. A folder that does not exist has none.
pub fn list_workspaces(dir: &Path) -> Result<Vec<WorkspaceInfo>, StoreError> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(io_error(dir, &e)),
    };
    let mut found = Vec::new();
    for entry in entries {
        let path = entry.map_err(|e| io_error(dir, &e))?.path();
        let named_like_a_workspace = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(&format!(".{EXTENSION}")));
        if !named_like_a_workspace || !path.is_file() {
            continue;
        }
        match peek_version(&path) {
            Ok(version) if version <= SCHEMA_VERSION => {}
            Ok(_) | Err(StoreError::NotAWorkspace { .. }) => continue,
            Err(e) => return Err(e),
        }
        match Workspace::open(&path).and_then(|workspace| workspace.info()) {
            Ok(info) => found.push(info),
            Err(StoreError::NotAWorkspace { .. } | StoreError::NewerSchema { .. }) => {}
            Err(e) => return Err(e),
        }
    }
    found.sort_by(|a, b| (&a.name, &a.id).cmp(&(&b.name, &b.id)));
    Ok(found)
}

/// Workspaces in `dir` whose project numbers include `project_no` (trimmed, compared exactly).
pub fn find_by_project(dir: &Path, project_no: &str) -> Result<Vec<WorkspaceInfo>, StoreError> {
    let project_no = project_no.trim();
    Ok(list_workspaces(dir)?
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
    use rusqlite::Connection;

    fn names(list: &[WorkspaceInfo]) -> Vec<&str> {
        list.iter().map(|i| i.name.as_str()).collect()
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
        let list = list_workspaces(dir.path()).unwrap();
        assert_eq!(names(&list), vec!["Alpha", "Alpha", "Beta"]);
        let mut ids = [a1.id, a2.id];
        ids.sort();
        assert_eq!(list[0].id, ids[0]);
        assert_eq!(list[1].id, ids[1]);
        assert_eq!(list[2], b);
        assert_eq!(std::fs::read(&foreign).unwrap(), before);
        assert_eq!(std::fs::read(&notes).unwrap(), notes_before);
        let files = std::fs::read_dir(dir.path()).unwrap().count();
        assert_eq!(files, 6);
    }

    #[test]
    fn a_missing_directory_lists_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(list_workspaces(&dir.path().join("nope")).unwrap(), vec![]);
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
    fn a_workspace_from_a_newer_version_is_skipped_and_untouched() {
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
        assert_eq!(names(&list), vec!["Ok"]);
        assert_eq!(std::fs::read(&newer.path).unwrap(), before);
        let error = Workspace::open(&newer.path).err().unwrap();
        assert!(
            matches!(error, StoreError::NewerSchema { found: 99, .. }),
            "{error}"
        );
    }

    #[test]
    fn a_short_stray_file_is_skipped_and_left_byte_for_byte() {
        let dir = tempfile::tempdir().unwrap();
        Workspace::create(dir.path(), "Ok").unwrap();
        let stray = dir.path().join("short.holdx-ws");
        std::fs::write(&stray, "tiny\n").unwrap();
        let list = list_workspaces(dir.path()).unwrap();
        assert_eq!(names(&list), vec!["Ok"]);
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
        assert_eq!(list_workspaces(dir.path()).unwrap(), vec![]);
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
        assert_eq!(list_workspaces(dir.path()).unwrap().len(), 2);
    }
}
