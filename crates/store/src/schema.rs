//! The workspace file's schema and the runner that brings a file up to the newest version.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use rusqlite::{Connection, ErrorCode, OpenFlags, OptionalExtension};

use crate::error::{database, StoreError};
use crate::workspace::io_error;

/// The schema version this build reads and writes.
pub const SCHEMA_VERSION: u32 = 1;

/// The `application_id` of a workspace file (the ASCII letters "HXWS"), which tells a workspace
/// from any other SQLite file.
const APPLICATION_ID: i64 = 0x4858_5753;

/// One step that brings a file from the version before `to` up to version `to`.
pub(crate) struct Migration {
    /// The `user_version` the file has after this step.
    pub to: u32,
    /// The statements of the step.
    pub sql: &'static str,
}

/// Version 1: the whole schema. It also marks the file as a workspace.
pub(crate) const V1_SQL: &str = "
PRAGMA application_id = 1213749075;
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE project (project_no TEXT PRIMARY KEY) STRICT;
CREATE TABLE setting (key TEXT PRIMARY KEY, value_json TEXT NOT NULL) STRICT;
CREATE TABLE row_state (
  id INTEGER PRIMARY KEY,
  hash BLOB NOT NULL UNIQUE,
  source_id INTEGER,
  line_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
  remark TEXT NOT NULL, hold_type TEXT NOT NULL, discipline TEXT NOT NULL,
  created TEXT, released INTEGER NOT NULL, release_remark TEXT NOT NULL, release_date TEXT,
  model_size REAL, ldt_size REAL, stress_calc TEXT NOT NULL,
  extra_json TEXT NOT NULL
) STRICT;
CREATE TABLE snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at TEXT NOT NULL,
  date_source TEXT NOT NULL,
  detected_at TEXT,
  detected_source TEXT,
  file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL,
  limited INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  open_count INTEGER NOT NULL,
  info_json TEXT NOT NULL,
  headers_json TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  skipped_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  rows BLOB NOT NULL
) STRICT;
CREATE INDEX snapshot_taken_at ON snapshot (taken_at, imported_at, id);
";

/// Every migration this build knows, oldest first.
pub(crate) const MIGRATIONS: &[Migration] = &[Migration { to: 1, sql: V1_SQL }];

fn database_error(path: &Path, error: rusqlite::Error) -> StoreError {
    match error.sqlite_error_code() {
        Some(ErrorCode::NotADatabase) => StoreError::NotAWorkspace {
            path: path.display().to_string(),
        },
        Some(ErrorCode::CannotOpen) => StoreError::Io {
            path: path.display().to_string(),
            detail: error.to_string(),
        },
        _ => database(error),
    }
}

/// The first bytes of every SQLite database file.
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

/// Where the 100-byte database header keeps `user_version`, as a big-endian `u32`.
const USER_VERSION_OFFSET: usize = 60;

/// Where the 100-byte database header keeps `application_id`, as a big-endian `u32`.
const APPLICATION_ID_OFFSET: usize = 68;

fn header_u32(header: &[u8; 100], offset: usize) -> u32 {
    u32::from_be_bytes([
        header[offset],
        header[offset + 1],
        header[offset + 2],
        header[offset + 3],
    ])
}

/// Whether SQLite refused to read the file through a read-only connection because a writer
/// died during a commit and left its rollback journal beside the file.
fn interrupted_write(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(e, _)
            if e.extended_code == rusqlite::ffi::SQLITE_READONLY_ROLLBACK
    )
}

/// Lets SQLite finish the roll-back of an interrupted write to the workspace file at `path`,
/// which brings the file back to what it held before that write and removes the journal.
///
/// The file is opened for writing only after its raw header shows that it is a workspace this
/// build may write to; any other file is left exactly as it was.
fn roll_back_interrupted_write(path: &Path) -> Result<(), StoreError> {
    let not_a_workspace = || StoreError::NotAWorkspace {
        path: path.display().to_string(),
    };
    let mut header = [0u8; 100];
    match File::open(path).and_then(|mut file| file.read_exact(&mut header)) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Err(not_a_workspace()),
        Err(e) => return Err(io_error(path, &e)),
    }
    if &header[..SQLITE_MAGIC.len()] != SQLITE_MAGIC
        || i64::from(header_u32(&header, APPLICATION_ID_OFFSET)) != APPLICATION_ID
    {
        return Err(not_a_workspace());
    }
    let found = header_u32(&header, USER_VERSION_OFFSET);
    if found > SCHEMA_VERSION {
        return Err(StoreError::NewerSchema {
            path: path.display().to_string(),
            found,
            supported: SCHEMA_VERSION,
        });
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| database_error(path, e))?;
    // Any read makes SQLite roll the journal back first.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    })
    .map_err(|e| database_error(path, e))?;
    conn.close().map_err(|(_, e)| database_error(path, e))
}

/// Runs `read` on a read-only connection to the existing file at `path`, so nothing is written
/// and the file is never created. When a writer died during a commit, SQLite refuses such a
/// connection; the interrupted write of a workspace is then rolled back and `read` runs again.
fn peek<T>(
    path: &Path,
    read: impl Fn(&Connection) -> rusqlite::Result<T>,
) -> Result<T, StoreError> {
    let attempt = || {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        read(&conn)
    };
    match attempt() {
        Err(error) if interrupted_write(&error) => {
            roll_back_interrupted_write(path)?;
            attempt().map_err(|e| database_error(path, e))
        }
        result => result.map_err(|e| database_error(path, e)),
    }
}

/// Reads the schema version of the existing workspace file at `path` without creating the file.
/// A file that is not a workspace gives `NotAWorkspace` and is left as it was. The only write
/// this can cause is the roll-back of an interrupted write to a workspace.
pub(crate) fn peek_version(path: &Path) -> Result<u32, StoreError> {
    let (application_id, version): (i64, u32) = peek(path, |conn| {
        Ok((
            conn.query_row("PRAGMA application_id", [], |r| r.get(0))?,
            conn.query_row("PRAGMA user_version", [], |r| r.get(0))?,
        ))
    })?;
    if application_id != APPLICATION_ID {
        return Err(StoreError::NotAWorkspace {
            path: path.display().to_string(),
        });
    }
    Ok(version)
}

/// Reads the workspace id of the existing workspace file at `path` through a read-only
/// connection, so nothing is migrated or backed up. `None` when `meta` has no id. Every schema
/// version written by this app has the `meta` table; a file without one gives `None`.
pub(crate) fn peek_id(path: &Path) -> Result<Option<String>, StoreError> {
    peek(path, |conn| {
        let has_meta: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta')",
            [],
            |r| r.get(0),
        )?;
        if !has_meta {
            return Ok(None);
        }
        conn.query_row("SELECT value FROM meta WHERE key = 'id'", [], |r| r.get(0))
            .optional()
    })
}

/// Opens the workspace file at `path`, creating it when it does not exist, and brings it up to
/// the newest schema version. Nothing is written until the file is known to be a workspace (or
/// new), so a foreign file stays exactly as it was.
pub(crate) fn open_database(path: &Path) -> Result<Connection, StoreError> {
    let mut conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| database_error(path, e))?;
    let not_a_workspace = || StoreError::NotAWorkspace {
        path: path.display().to_string(),
    };
    let application_id: i64 = conn
        .query_row("PRAGMA application_id", [], |r| r.get(0))
        .map_err(|e| database_error(path, e))?;
    if application_id != APPLICATION_ID {
        let tables: i64 = conn
            .query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get(0))
            .map_err(|e| database_error(path, e))?;
        if application_id != 0 || tables != 0 {
            return Err(not_a_workspace());
        }
    }
    conn.execute_batch("PRAGMA foreign_keys = ON")
        .map_err(|e| database_error(path, e))?;
    migrate(&mut conn, path, MIGRATIONS)?;
    Ok(conn)
}

/// Brings the file up to the newest version in `migrations`. A file already at that version is
/// left alone; an older one is copied to `<file name>.backup-v<old version>` beside it first;
/// a newer one is refused without being touched. Each step runs in its own transaction, so a
/// failed step leaves the file at the version it had.
pub(crate) fn migrate(
    conn: &mut Connection,
    path: &Path,
    migrations: &[Migration],
) -> Result<(), StoreError> {
    let newest = migrations.last().map_or(0, |m| m.to);
    let found: u32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| database_error(path, e))?;
    if found > newest {
        return Err(StoreError::NewerSchema {
            path: path.display().to_string(),
            found,
            supported: newest,
        });
    }
    if found == newest {
        return Ok(());
    }
    if found > 0 {
        let mut backup = path.as_os_str().to_owned();
        backup.push(format!(".backup-v{found}"));
        std::fs::copy(path, &backup).map_err(|e| StoreError::Io {
            path: path.display().to_string(),
            detail: format!("could not make a backup before updating the workspace: {e}"),
        })?;
    }
    for migration in migrations.iter().filter(|m| m.to > found) {
        let tx = conn.transaction().map_err(database)?;
        tx.execute_batch(migration.sql).map_err(database)?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", migration.to))
            .map_err(database)?;
        tx.commit().map_err(database)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::path::PathBuf;

    const TABLES: [&str; 5] = ["meta", "project", "setting", "row_state", "snapshot"];

    fn user_version(path: &Path) -> u32 {
        let conn = Connection::open(path).unwrap();
        conn.query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap()
    }

    fn table_names(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 7) != 'sqlite_' ORDER BY name")
            .unwrap();
        let rows = stmt.query_map([], |r| r.get(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    }

    fn files_in(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn new_workspace(dir: &Path) -> PathBuf {
        let path = dir.join("w.hxw");
        open_database(&path).unwrap();
        path
    }

    #[test]
    fn the_schema_sql_sets_the_application_id_the_check_expects() {
        assert!(V1_SQL.contains(&format!("application_id = {APPLICATION_ID};")));
    }

    #[test]
    fn a_new_file_ends_at_version_1_with_all_tables() {
        let dir = tempfile::tempdir().unwrap();
        let path = new_workspace(dir.path());
        assert_eq!(user_version(&path), SCHEMA_VERSION);
        let conn = open_database(&path).unwrap();
        let mut expected: Vec<String> = TABLES.iter().map(|t| t.to_string()).collect();
        expected.sort();
        assert_eq!(table_names(&conn), expected);
        let foreign_keys: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);
    }

    #[test]
    fn opening_again_changes_nothing_and_makes_no_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = new_workspace(dir.path());
        let before = std::fs::read(&path).unwrap();
        drop(open_database(&path).unwrap());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert_eq!(files_in(dir.path()), vec!["w.hxw".to_string()]);
    }

    fn step(to: u32, sql: &'static str) -> Migration {
        Migration { to, sql }
    }

    #[test]
    fn migrations_apply_in_order_after_a_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = new_workspace(dir.path());
        let mut conn = open_database(&path).unwrap();
        conn.execute("INSERT INTO project (project_no) VALUES ('P1')", [])
            .unwrap();
        let list = [
            step(1, V1_SQL),
            step(2, "CREATE TABLE two (a INTEGER) STRICT;"),
            step(3, "CREATE TABLE three (a INTEGER) STRICT;"),
        ];
        migrate(&mut conn, &path, &list).unwrap();
        drop(conn);
        assert_eq!(user_version(&path), 3);
        let backup = dir.path().join("w.hxw.backup-v1");
        assert_eq!(user_version(&backup), 1);
        let kept: String = Connection::open(&path)
            .unwrap()
            .query_row("SELECT project_no FROM project", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "P1");
    }

    #[test]
    fn a_failing_migration_leaves_version_and_data_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let path = new_workspace(dir.path());
        let mut conn = open_database(&path).unwrap();
        conn.execute("INSERT INTO project (project_no) VALUES ('P1')", [])
            .unwrap();
        let list = [
            step(1, V1_SQL),
            step(
                2,
                "CREATE TABLE two (a INTEGER) STRICT; INSERT INTO nowhere VALUES (1);",
            ),
        ];
        let error = migrate(&mut conn, &path, &list).unwrap_err();
        assert!(matches!(error, StoreError::Database { .. }), "{error}");
        drop(conn);
        assert_eq!(user_version(&path), 1);
        let conn = Connection::open(&path).unwrap();
        assert!(!table_names(&conn).contains(&"two".to_string()));
        let count: i64 = conn
            .query_row("SELECT count(*) FROM project", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn a_newer_schema_is_refused_and_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = new_workspace(dir.path());
        Connection::open(&path)
            .unwrap()
            .execute_batch("PRAGMA user_version = 99")
            .unwrap();
        let before = std::fs::read(&path).unwrap();
        let error = open_database(&path).unwrap_err();
        assert_eq!(
            error,
            StoreError::NewerSchema {
                path: path.display().to_string(),
                found: 99,
                supported: 1,
            }
        );
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert_eq!(files_in(dir.path()), vec!["w.hxw".to_string()]);
    }

    #[test]
    fn a_text_file_is_not_a_workspace_and_is_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.txt");
        std::fs::write(
            &path,
            "just some text, long enough to not be a database header\n".repeat(20),
        )
        .unwrap();
        let before = std::fs::read(&path).unwrap();
        let error = open_database(&path).unwrap_err();
        assert!(matches!(error, StoreError::NotAWorkspace { .. }), "{error}");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert_eq!(files_in(dir.path()), vec!["notes.txt".to_string()]);
    }

    #[test]
    fn a_tiny_text_file_is_not_a_workspace_and_is_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tiny.txt");
        std::fs::write(&path, "0123456789").unwrap();
        let error = open_database(&path).unwrap_err();
        assert!(matches!(error, StoreError::NotAWorkspace { .. }), "{error}");
        assert_eq!(std::fs::read(&path).unwrap(), b"0123456789");
        assert_eq!(files_in(dir.path()), vec!["tiny.txt".to_string()]);
    }

    #[test]
    fn a_foreign_sqlite_file_is_not_a_workspace_and_is_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("other.db");
        Connection::open(&path)
            .unwrap()
            .execute_batch("CREATE TABLE foo (a INTEGER)")
            .unwrap();
        let before = std::fs::read(&path).unwrap();
        let error = open_database(&path).unwrap_err();
        assert!(matches!(error, StoreError::NotAWorkspace { .. }), "{error}");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert_eq!(files_in(dir.path()), vec!["other.db".to_string()]);
    }
}
