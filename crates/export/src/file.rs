//! The safe write: a file is on disk whole or not at all.

use std::fs::{self, File};
use std::io::{self, ErrorKind, Write};
use std::path::Path;

use crate::ExportError;

/// Writes `bytes` to `path` whole or not at all: a temporary file in the same folder, then
/// renamed over `path`. The temporary file is removed on every failure.
///
/// A new file gets the permissions the user's umask leaves of read and write for everyone
/// (`0o666`), as any program's new file does; a replaced file keeps its permissions.
///
/// A file that is read-only, held open by another program (a sharing violation on Windows), or
/// that the system refuses to replace gives [`ExportError::FileInUse`]; a folder that does not
/// exist, is not a folder, or cannot be written gives [`ExportError::Folder`]; any other failure
/// [`ExportError::Write`].
pub fn write_file(path: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    write_with(path, |file| file.write_all(bytes))
}

/// [`write_file`], with `fill` writing the content of the temporary file.
fn write_with(
    path: &Path,
    fill: impl FnOnce(&mut File) -> io::Result<()>,
) -> Result<(), ExportError> {
    let file = path.file_name().map_or_else(
        || path.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    let folder = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    let folder_error = |reason: &str| ExportError::Folder {
        folder: folder.display().to_string(),
        reason: reason.into(),
    };
    let write_error = |error: &io::Error| ExportError::Write {
        file: file.clone(),
        reason: error.to_string(),
    };
    match fs::metadata(folder) {
        Ok(meta) if meta.is_dir() => {}
        Ok(_) => return Err(folder_error("it is a file, not a folder")),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Err(folder_error("the folder does not exist"))
        }
        Err(error) => return Err(folder_error(&format!("it cannot be read ({error})"))),
    }
    let earlier = fs::metadata(path).ok().filter(fs::Metadata::is_file);
    // A rename replaces a read-only file on some systems; such a file is left as it is.
    if earlier
        .as_ref()
        .is_some_and(|meta| meta.permissions().readonly())
    {
        return Err(ExportError::FileInUse { file });
    }
    let mut builder = tempfile::Builder::new();
    builder.prefix(".hold-explorer-").suffix(".tmp");
    // The temporary file becomes the saved file, so it is created as a new file is: read and
    // write for everyone before the umask, not the owner-only mode of a temporary file.
    #[cfg(unix)]
    builder.permissions(std::os::unix::fs::PermissionsExt::from_mode(0o666));
    let mut temp = builder
        .tempfile_in(folder)
        .map_err(|error| match error.kind() {
            ErrorKind::PermissionDenied => {
                folder_error("you do not have permission to write to it")
            }
            ErrorKind::ReadOnlyFilesystem => folder_error("it is on a read-only disk"),
            _ => write_error(&error),
        })?;
    // On an error below, dropping the temporary file removes it. A failure to write the
    // temporary file is never another program's doing: it is a `Write`.
    #[cfg(unix)]
    if let Some(meta) = &earlier {
        temp.as_file()
            .set_permissions(meta.permissions())
            .map_err(|error| write_error(&error))?;
    }
    fill(temp.as_file_mut())
        .and_then(|()| temp.as_file().sync_all())
        .map_err(|error| write_error(&error))?;
    temp.persist(path)
        .map_err(|error| failure(path, &file, &error.error))?;
    Ok(())
}

/// What a failure to replace `path` with the temporary file means to the user.
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

    #[test]
    fn a_folder_that_is_a_file_gives_folder_and_says_so() {
        let dir = tempfile::tempdir().unwrap();
        let not_a_folder = dir.path().join("report");
        fs::write(&not_a_folder, b"x").unwrap();
        match write_file(&not_a_folder.join("holds.csv"), b"new") {
            Err(ExportError::Folder { reason, .. }) => {
                assert_eq!(reason, "it is a file, not a folder");
            }
            other => panic!("expected Folder, got {other:?}"),
        }
        assert_eq!(fs::read(&not_a_folder).unwrap(), b"x");
    }

    #[test]
    fn a_missing_folder_says_it_does_not_exist() {
        let dir = tempfile::tempdir().unwrap();
        match write_file(&dir.path().join("gone").join("holds.csv"), b"x") {
            Err(ExportError::Folder { reason, .. }) => {
                assert_eq!(reason, "the folder does not exist");
            }
            other => panic!("expected Folder, got {other:?}"),
        }
    }

    #[test]
    fn a_write_that_fails_after_the_temporary_file_exists_leaves_the_earlier_file_and_no_temporary_file(
    ) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.csv");
        fs::write(&path, b"earlier").unwrap();
        let result = write_with(&path, |file| {
            file.write_all(b"half of the ")?;
            Err(io::Error::other("the disk is full"))
        });
        match result {
            Err(ExportError::Write { file, reason }) => {
                assert_eq!(file, "holds.csv");
                assert_eq!(reason, "the disk is full");
            }
            other => panic!("expected Write, got {other:?}"),
        }
        assert_eq!(fs::read(&path).unwrap(), b"earlier");
        assert_eq!(entries(dir.path()), vec!["holds.csv"]);
    }

    #[test]
    fn a_failed_write_of_a_new_file_leaves_no_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.csv");
        let result = write_with(&path, |_| Err(io::Error::from(ErrorKind::PermissionDenied)));
        assert!(
            matches!(result, Err(ExportError::Write { .. })),
            "{result:?}"
        );
        assert!(entries(dir.path()).is_empty());
    }

    /// The process umask, read without changing it: the mode a file created with `0o666` gets.
    #[cfg(unix)]
    fn created_mode(dir: &Path) -> u32 {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let probe = dir.join("probe");
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o666)
            .open(&probe)
            .unwrap();
        let mode = fs::metadata(&probe).unwrap().permissions().mode() & 0o777;
        fs::remove_file(&probe).unwrap();
        mode
    }

    #[cfg(unix)]
    #[test]
    fn a_new_file_gets_the_mode_the_umask_gives_a_new_file() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let expected = created_mode(dir.path());
        let path = dir.path().join("holds.csv");
        write_file(&path, b"new").unwrap();
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, expected, "{mode:o} is not {expected:o}");
        assert_ne!(mode, 0o600, "the owner-only mode of a temporary file");
    }

    #[cfg(unix)]
    #[test]
    fn a_replaced_file_keeps_its_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.csv");
        fs::write(&path, b"earlier").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        write_file(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o640, "{mode:o}");
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
