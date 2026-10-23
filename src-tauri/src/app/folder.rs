//! Changing the folder the workspaces are kept in, with the move of the workspace files there.

use std::fs::File;
use std::path::{Path, PathBuf};

use hx_store::{check_workspace, list_workspaces, Workspace};
use serde::Serialize;
use ts_rs::TS;

use super::error::{CommandError, ErrorKind};
use super::settings::Settings;
use super::workspaces::{list_view, AppStart, UnreadableView};
use super::{describe, list_folder, AppState};

/// A folder the workspaces may be kept in, as it was checked.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct FolderCheck {
    /// The folder as it will be used: absolute.
    pub path: String,
    /// The workspace files in the folder now in use that a move would take.
    pub movable: Vec<String>,
    /// How many files that is.
    pub count: usize,
}

/// What a change of the workspace folder did.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct FolderMoved {
    /// The new start state: settings, the list of the new folder, the workspace reopened.
    pub start: AppStart,
    /// Files moved, by name.
    pub moved: Vec<String>,
    /// Files left in the old folder, each with why.
    pub left: Vec<UnreadableView>,
}

/// The check a copy must pass before it takes its name.
type CopyCheck<'a> = &'a dyn Fn(&Path) -> Result<(), CommandError>;

/// The check of a copy in use: a workspace this version opens, read without writing.
fn supported_workspace(path: &Path) -> Result<(), CommandError> {
    check_workspace(path).map_err(CommandError::from)
}

impl AppState {
    /// Checks the folder `path` (the default folder for `None`) for the workspaces, and names the
    /// workspace files of the folder in use that a move to it would take. The folder must be
    /// absolute, other than the folder in use, and writable; a missing folder passes when the
    /// nearest folder above it that exists is writable. Nothing is created and nothing changes.
    pub fn check_workspace_folder(&self, path: Option<&str>) -> Result<FolderCheck, CommandError> {
        let folder = self.usable_folder(path, false)?;
        let movable: Vec<String> = workspace_files(&self.folder())?
            .iter()
            .map(|(file, _)| file_name(file))
            .collect();
        Ok(FolderCheck {
            path: folder.to_string_lossy().into_owned(),
            count: movable.len(),
            movable,
        })
    }

    /// Keeps the workspaces in the folder `path` from now on, or in the default folder for
    /// `None`, once the folder passed the checks of [`AppState::check_workspace_folder`]. With
    /// `move_files`, every workspace file of the folder in use (the files the store lists,
    /// readable or not, and no other) is moved there one by one, whole: the copy of a readable
    /// workspace must open as a workspace this version reads, the copy of any other file must
    /// equal it byte for byte. A file that cannot be moved
    /// stays whole where it is, and the answer says why. The open workspace is closed first, and
    /// reopened afterwards from where its file is then. The settings are saved with the new
    /// folder whether or not every file moved; when they cannot be saved, nothing on disk is put
    /// back, the folder is in use for this session all the same, and the start of the answer says
    /// so as its settings problem.
    pub fn set_workspace_folder(
        &mut self,
        path: Option<&str>,
        move_files: bool,
    ) -> Result<FolderMoved, CommandError> {
        self.set_workspace_folder_with(path, move_files, &supported_workspace)
    }

    /// [`AppState::set_workspace_folder`], with the check the copy of a readable workspace must
    /// pass.
    pub(super) fn set_workspace_folder_with(
        &mut self,
        path: Option<&str>,
        move_files: bool,
        check: CopyCheck,
    ) -> Result<FolderMoved, CommandError> {
        let to = self.usable_folder(path, true)?;
        let from = self.folder();
        let files = if move_files {
            workspace_files(&from)?
        } else {
            Vec::new()
        };

        // Closed before any file is touched: a file that is open cannot be removed on Windows.
        let was_open = self.open.take().map(|open| open.path().to_path_buf());
        let was_selected = self.selected;
        self.open_id = None;
        self.selected = None;
        self.cache = None;
        self.draft = None;

        let mut moved = Vec::new();
        let mut left = Vec::new();
        for (file, readable) in files {
            let name = file_name(&file);
            let removal = |path: &Path| std::fs::remove_file(path);
            let verified = if readable {
                move_file(
                    &file,
                    &to,
                    &|copy| {
                        check(copy).map_err(|error| {
                            format!(
                                "is not a workspace this version can open ({})",
                                error.message
                            )
                        })
                    },
                    &removal,
                )
            } else {
                move_file(&file, &to, &|copy| same_bytes(&file, copy), &removal)
            };
            match verified {
                Ok(()) => moved.push(name),
                Err(error) => left.push(UnreadableView {
                    file_name: name,
                    path: file.to_string_lossy().into_owned(),
                    kind: error.kind,
                    message: error.message,
                }),
            }
        }

        let to_text = to.to_string_lossy().into_owned();
        let next = Settings {
            workspace_dir: (!same_folder(&to, &self.default_folder())).then(|| to_text.clone()),
            ..self.settings.clone()
        };
        let saved = self.save(&next);
        // In use even when it could not be saved: the files that moved are there now.
        self.settings = next;

        let reopen = was_open.map(|path| match path.file_name() {
            Some(name) if moved.iter().any(|moved| *moved == name.to_string_lossy()) => {
                to.join(name)
            }
            _ => path,
        });
        let open = reopen
            .and_then(|path| Workspace::open(&path).ok())
            .and_then(|workspace| describe(&workspace).ok().map(|open| (workspace, open)))
            .map(|(workspace, mut open)| {
                // The snapshot that was selected stays selected while the workspace has it.
                if let Some(id) =
                    was_selected.filter(|id| open.snapshots.iter().any(|s| s.id == *id))
                {
                    open.selected = Some(id);
                }
                self.install(workspace, &open);
                open
            });

        let (raw, list_error) = list_folder(&to);
        let settings_problem = saved.err().map(|error| {
            CommandError::new(
                ErrorKind::Settings,
                format!(
                    "The workspaces are now kept in {to_text}, but Hold Explorer could not remember that for the next start, which will look in the folder before. {} Then choose {to_text} again in Settings.",
                    error.message
                ),
            )
        });
        Ok(FolderMoved {
            start: AppStart {
                version: env!("CARGO_PKG_VERSION").to_string(),
                settings: self.settings.clone(),
                list: list_view(raw, &to),
                list_error,
                open,
                settings_problem,
            },
            moved,
            left,
        })
    }

    /// The folder `path`, or the default folder for `None`, once it is absolute, other than the
    /// folder in use, and shown to be writable by a file made in it and removed again. With
    /// `create` a missing folder is made first; without, nothing is created, and a missing folder
    /// is shown writable by the nearest folder above it that exists.
    fn usable_folder(&self, path: Option<&str>, create: bool) -> Result<PathBuf, CommandError> {
        let folder = match path {
            Some(path) => PathBuf::from(path),
            None => self.default_folder(),
        };
        let shown = folder.display().to_string();
        if !folder.is_absolute() {
            return Err(CommandError::new(
                ErrorKind::FolderNotAbsolute,
                format!(
                    "The folder \"{shown}\" is not a full path, so the workspaces cannot be kept there. Choose the folder with Change folder."
                ),
            ));
        }
        if same_folder(&folder, &self.folder()) {
            return Err(CommandError::new(
                ErrorKind::SameFolder,
                format!(
                    "The workspaces are already kept in {shown}. Choose another folder to keep them in."
                ),
            ));
        }
        let unusable = |what: &str, error: &dyn std::fmt::Display| {
            CommandError::new(
                ErrorKind::FolderUnusable,
                format!(
                    "The folder {shown} {what} ({error}), so the workspaces cannot be kept there. Check that the drive is connected and that you may write to the folder, or choose another one."
                ),
            )
        };
        let probed = if create {
            std::fs::create_dir_all(&folder).map_err(|e| unusable("could not be created", &e))?;
            folder.clone()
        } else {
            nearest_existing(&folder)
        };
        if !probed.is_dir() {
            return Err(unusable(
                "could not be created",
                &format!("{} is not a folder", probed.display()),
            ));
        }
        let probe = tempfile::Builder::new()
            .prefix(".hold-explorer-")
            .tempfile_in(&probed)
            .map_err(|e| unusable("cannot be written to", &e))?;
        probe
            .close()
            .map_err(|e| unusable("does not let a file be removed", &e))?;
        Ok(folder)
    }
}

/// Whether two folders are one: the same path once both are resolved, as far as they exist.
fn same_folder(a: &Path, b: &Path) -> bool {
    let resolved = |path: &Path| std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    resolved(a) == resolved(b)
}

/// The path itself when it exists, else the nearest folder above it that does. A check probes
/// that folder, and the change later creates the folder itself, so the two can disagree: the
/// folder above may change between them, or allow a file but not a folder. The change then
/// refuses on its own, before any file is touched.
fn nearest_existing(path: &Path) -> PathBuf {
    path.ancestors()
        .find(|ancestor| ancestor.symlink_metadata().is_ok())
        .unwrap_or(path)
        .to_path_buf()
}

/// The workspace files of a folder as the store lists them, by name, each with whether the store
/// could read it as a workspace.
fn workspace_files(folder: &Path) -> Result<Vec<(PathBuf, bool)>, CommandError> {
    let list = list_workspaces(folder)?;
    let mut files: Vec<(PathBuf, bool)> = list
        .workspaces
        .into_iter()
        .map(|info| (info.path, true))
        .chain(
            list.unreadable
                .into_iter()
                .map(|unreadable| (unreadable.path, false)),
        )
        .collect();
    files.sort_by_key(|(file, _)| file_name(file));
    Ok(files)
}

/// Whether the copy holds exactly the bytes of the original: the same length, then the same
/// content, read side by side. The problem, in words, when it does not.
pub(super) fn same_bytes(original: &Path, copy: &Path) -> Result<(), String> {
    use std::io::Read;
    let unreadable = |error: std::io::Error| format!("could not be read back ({error})");
    let mut a = std::io::BufReader::new(File::open(original).map_err(unreadable)?);
    let mut b = std::io::BufReader::new(File::open(copy).map_err(unreadable)?);
    let lengths = (
        a.get_ref().metadata().map_err(unreadable)?.len(),
        b.get_ref().metadata().map_err(unreadable)?.len(),
    );
    if lengths.0 != lengths.1 {
        return Err(format!(
            "has {} bytes where the file has {}",
            lengths.1, lengths.0
        ));
    }
    let mut left = [0u8; 64 * 1024];
    let mut right = [0u8; 64 * 1024];
    loop {
        let read = a.read(&mut left).map_err(unreadable)?;
        if read == 0 {
            return Ok(());
        }
        b.read_exact(&mut right[..read]).map_err(unreadable)?;
        if left[..read] != right[..read] {
            return Err("differs from the file".to_string());
        }
    }
}

/// The name of a file, as text.
fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Moves the workspace file `file` into the folder `to` under its name: copied to a temporary
/// name there, flushed, verified with `verify` (which says what is wrong with the copy), given its
/// name (never over another file), and only then removed from where it was with `remove`. A
/// failure at any step removes the copy and leaves the file whole where it was; the error's kind
/// names the step. The one exception: when `remove` fails but the original is gone all the same,
/// the copy is the last one, so it stays and the file counts as moved.
pub(super) fn move_file(
    file: &Path,
    to: &Path,
    verify: &dyn Fn(&Path) -> Result<(), String>,
    remove: &dyn Fn(&Path) -> std::io::Result<()>,
) -> Result<(), CommandError> {
    let name = file_name(file);
    let from = file
        .parent()
        .map(|parent| parent.display().to_string())
        .unwrap_or_default();
    let target = to.join(&name);
    let place = to.display();
    if target.symlink_metadata().is_ok() {
        return Err(CommandError::new(
            ErrorKind::NameTaken,
            format!(
                "{name} was left in {from}, because a file of that name is already in {place}. Rename or remove one of the two, then move the file there by hand."
            ),
        ));
    }

    let not_copied = |error: &dyn std::fmt::Display| {
        CommandError::new(
            ErrorKind::MoveCopy,
            format!(
                "{name} could not be copied to {place} ({error}), so it was left whole in {from}. Close any program that holds it and check that there is free space, then move it there by hand."
            ),
        )
    };
    let mut source = File::open(file).map_err(|e| not_copied(&e))?;
    let length = source.metadata().map_err(|e| not_copied(&e))?.len();
    let mut copy = tempfile::Builder::new()
        .prefix(".")
        .suffix(".moving")
        .tempfile_in(to)
        .map_err(|e| not_copied(&e))?;
    let copied = std::io::copy(&mut source, copy.as_file_mut()).map_err(|e| not_copied(&e))?;
    if copied != length {
        return Err(not_copied(&format!(
            "{copied} of its {length} bytes were copied"
        )));
    }
    // The copy is made as the system's temporary files are, readable by its owner only.
    #[cfg(unix)]
    if let Ok(metadata) = source.metadata() {
        // Best effort: a drive without file modes (FAT) refuses the change, and the file moves
        // all the same, with the mode that drive gives every file.
        let _ = copy.as_file().set_permissions(metadata.permissions());
    }
    copy.as_file().sync_all().map_err(|e| not_copied(&e))?;
    drop(source);

    verify(copy.path()).map_err(|problem| {
        CommandError::new(
            ErrorKind::MoveCheck,
            format!(
                "The copy of {name} in {place} {problem}, so the copy was removed and the file was left whole in {from}."
            ),
        )
    })?;

    // Never over another file: a file of the name that came meanwhile stays, and so does this.
    let placed = copy.persist_noclobber(&target).map_err(|failed| {
        if failed.error.kind() == std::io::ErrorKind::AlreadyExists {
            CommandError::new(
                ErrorKind::NameTaken,
                format!(
                    "{name} was left in {from}, because a file of that name is now in {place}. Rename or remove one of the two, then move the file there by hand."
                ),
            )
        } else {
            CommandError::new(
                ErrorKind::MoveRename,
                format!(
                    "The copy of {name} in {place} could not be given its name ({}), so the copy was removed and the file was left whole in {from}. Move it there by hand.",
                    failed.error
                ),
            )
        }
    })?;
    drop(placed);

    // The new folder holds the name for good before the original goes.
    #[cfg(unix)]
    File::open(to)
        .and_then(|folder| folder.sync_all())
        .map_err(|error| {
            let removed = std::fs::remove_file(&target);
            CommandError::new(
                ErrorKind::MoveRename,
                match removed {
                    Ok(()) => format!(
                        "The copy of {name} could not be written for good in {place} ({error}). The copy was removed again, and the file is whole in {from}. Move it there by hand."
                    ),
                    Err(e) => format!(
                        "The copy of {name} could not be written for good in {place} ({error}), and it could not be removed again ({e}). The file is whole in {from}. Delete the copy in {place}, then move the file there by hand."
                    ),
                },
            )
        })?;

    let error = match remove(file) {
        Ok(()) => return Ok(()),
        // Gone already: the copy is the file now.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => error,
    };
    // Only while the original is known to be there may the copy go. When it is known to be gone
    // the copy is the last one; when that cannot be known, both stay.
    match file.symlink_metadata() {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => {
            return Err(CommandError::new(
                ErrorKind::MoveRemove,
                format!(
                    "{name} could not be removed from {from} ({error}), and Hold Explorer cannot tell whether it is still there ({e}). Its copy in {place} was kept. The file may now be in both folders. Check {from}, and delete the file there once the workspace opens from {place}."
                ),
            ));
        }
    }
    let message = match std::fs::remove_file(&target) {
        Ok(()) => format!(
            "{name} could not be removed from {from} ({error}). The copy in {place} was removed again, and the file is whole in {from}. Close any program that holds it, then move it by hand."
        ),
        Err(e) => format!(
            "{name} could not be removed from {from} ({error}). Its copy in {place} could not be removed either ({e}). The file is now in both folders. Delete the one in {from} once the workspace opens from {place}."
        ),
    };
    Err(CommandError::new(ErrorKind::MoveRemove, message))
}
