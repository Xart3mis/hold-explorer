//! The safe write: a file is on disk whole or not at all.

use std::fs;
use std::io::{self, ErrorKind, Write};
use std::path::Path;

use crate::ExportError;

/// Writes `bytes` to `path` whole or not at all: a temporary file in the same folder, then
/// renamed over `path`. The temporary file is removed on every failure.
///
/// A file that is read-only, held open by another program (a sharing violation on Windows), or
/// that the system refuses to replace gives [`ExportError::FileInUse`]; a folder that does not
/// exist or cannot be written gives [`ExportError::Folder`]; any other failure
/// [`ExportError::Write`].
pub fn write_file(path: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    let file = path.file_name().map_or_else(
        || path.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    let folder = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    if !folder.is_dir() {
        return Err(ExportError::Folder {
            folder: folder.display().to_string(),
            reason: "the folder does not exist".into(),
        });
    }
    // A rename replaces a read-only file on some systems; such a file is left as it is.
    if fs::metadata(path).is_ok_and(|meta| meta.is_file() && meta.permissions().readonly()) {
        return Err(ExportError::FileInUse { file });
    }
    let mut temp = tempfile::Builder::new()
        .prefix(".hold-explorer-")
        .suffix(".tmp")
        .tempfile_in(folder)
        .map_err(|error| match error.kind() {
            ErrorKind::PermissionDenied | ErrorKind::ReadOnlyFilesystem => ExportError::Folder {
                folder: folder.display().to_string(),
                reason: error.to_string(),
            },
            _ => ExportError::Write {
                file: file.clone(),
                reason: error.to_string(),
            },
        })?;
    // On an error below, dropping the temporary file removes it.
    temp.write_all(bytes)
        .and_then(|()| temp.as_file().sync_all())
        .map_err(|error| failure(path, &file, &error))?;
    temp.persist(path)
        .map_err(|error| failure(path, &file, &error.error))?;
    Ok(())
}

/// What a failure to write or to replace `path` means to the user.
fn failure(path: &Path, file: &str, error: &io::Error) -> ExportError {
    // ERROR_SHARING_VIOLATION and ERROR_LOCK_VIOLATION: another program holds the file open.
    let shared = cfg!(windows) && matches!(error.raw_os_error(), Some(32 | 33));
    let refused = error.kind() == ErrorKind::PermissionDenied && path.exists();
    if shared || refused {
        ExportError::FileInUse { file: file.into() }
    } else {
        ExportError::Write {
            file: file.into(),
            reason: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    use super::*;

    /// The names of the entries of `dir`, sorted.
    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn writes_the_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.csv");
        write_file(&path, b"a,b\r\n").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"a,b\r\n");
        assert_eq!(entries(dir.path()), vec!["holds.csv"]);
    }

    #[test]
    fn replaces_an_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.csv");
        fs::write(&path, b"an earlier, longer content").unwrap();
        write_file(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(entries(dir.path()), vec!["holds.csv"]);
    }

    #[test]
    fn a_missing_folder_gives_folder_and_writes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("gone");
        let path = folder.join("holds.csv");
        match write_file(&path, b"x") {
            Err(ExportError::Folder { folder: named, .. }) => {
                assert_eq!(named, folder.display().to_string());
            }
            other => panic!("expected Folder, got {other:?}"),
        }
        assert!(!folder.exists());
        assert!(entries(dir.path()).is_empty());
    }

    #[test]
    fn a_failed_write_leaves_the_earlier_file_as_it_was_and_no_temporary_file() {
        // The target is a folder holding a file: the temporary file is written, and the rename
        // over the folder fails.
        let dir = tempfile::tempdir().unwrap();
        let path: PathBuf = dir.path().join("holds.csv");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("inside.txt"), b"kept").unwrap();
        let result = write_file(&path, b"new");
        assert!(
            matches!(
                result,
                Err(ExportError::Write { .. }) | Err(ExportError::FileInUse { .. })
            ),
            "{result:?}"
        );
        assert_eq!(entries(dir.path()), vec!["holds.csv"]);
        assert_eq!(entries(&path), vec!["inside.txt"]);
        assert_eq!(fs::read(path.join("inside.txt")).unwrap(), b"kept");
    }

    #[test]
    fn a_read_only_file_gives_file_in_use_and_is_left_as_it_was() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.csv");
        fs::write(&path, b"earlier").unwrap();
        let earlier = fs::metadata(&path).unwrap().permissions();
        let mut permissions = earlier.clone();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();
        let result = write_file(&path, b"new");
        assert_eq!(
            result,
            Err(ExportError::FileInUse {
                file: "holds.csv".into()
            })
        );
        assert_eq!(fs::read(&path).unwrap(), b"earlier");
        assert_eq!(entries(dir.path()), vec!["holds.csv"]);
        // Lets the temporary folder be removed on every system.
        fs::set_permissions(&path, earlier).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_file_held_open_with_sharing_denied_gives_file_in_use() {
        use std::os::windows::fs::OpenOptionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.xlsx");
        fs::write(&path, b"earlier").unwrap();
        let held = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        let result = write_file(&path, b"new");
        assert_eq!(
            result,
            Err(ExportError::FileInUse {
                file: "holds.xlsx".into()
            })
        );
        drop(held);
        assert_eq!(fs::read(&path).unwrap(), b"earlier");
        assert_eq!(entries(dir.path()), vec!["holds.xlsx"]);
    }
}
