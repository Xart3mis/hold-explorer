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
    /// Checks the folder `path` for the workspaces, and names the workspace files of the folder in
    /// use that a move to it would take. The folder must be absolute, other than the folder in
    /// use, and writable; it is made when missing. Nothing else changes.
    pub fn check_workspace_folder(&self, path: &str) -> Result<FolderCheck, CommandError> {
        let folder = self.usable_folder(Some(path))?;
        let movable = workspace_files(&self.folder())?
            .iter()
            .map(|file| file_name(file))
            .collect();
        Ok(FolderCheck {
            path: folder.to_string_lossy().into_owned(),
            movable,
        })
    }

    /// Keeps the workspaces in the folder `path` from now on, or in the default folder for
    /// `None`, once the folder passed the checks of [`AppState::check_workspace_folder`]. With
    /// `move_files`, every workspace file of the folder in use (the files the store lists,
    /// readable or not, and no other) is moved there one by one; a file that cannot be moved
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

    /// [`AppState::set_workspace_folder`], with the check each copy must pass.
    pub(super) fn set_workspace_folder_with(
        &mut self,
        path: Option<&str>,
        move_files: bool,
        check: CopyCheck,
    ) -> Result<FolderMoved, CommandError> {
        let to = self.usable_folder(path)?;
        let from = self.folder();
        let files = if move_files {
            workspace_files(&from)?
        } else {
            Vec::new()
        };

        // Closed before any file is touched: a file that is open cannot be removed on Windows.
        let was_open = self.open.take().map(|open| open.path().to_path_buf());
        self.open_id = None;
        self.selected = None;
        self.cache = None;
        self.draft = None;

        let mut moved = Vec::new();
        let mut left = Vec::new();
        for file in files {
            let name = file_name(&file);
            match move_file(&file, &to, check) {
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
            workspace_dir: (to != self.default_folder()).then(|| to_text.clone()),
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
            .map(|(workspace, open)| {
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
    /// folder in use, made when missing, and shown to be writable by a file made in it and
    /// removed again.
    fn usable_folder(&self, path: Option<&str>) -> Result<PathBuf, CommandError> {
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
        std::fs::create_dir_all(&folder).map_err(|e| unusable("could not be created", &e))?;
        let probe = tempfile::Builder::new()
            .prefix(".hold-explorer-")
            .tempfile_in(&folder)
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

/// The workspace files of a folder, readable or not, as the store lists them, by name.
fn workspace_files(folder: &Path) -> Result<Vec<PathBuf>, CommandError> {
    let list = list_workspaces(folder)?;
    let mut files: Vec<PathBuf> = list
        .workspaces
        .into_iter()
        .map(|info| info.path)
        .chain(
            list.unreadable
                .into_iter()
                .map(|unreadable| unreadable.path),
        )
        .collect();
    files.sort_by_key(|file| file_name(file));
    Ok(files)
}

/// The name of a file, as text.
fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Moves the workspace file `file` into the folder `to` under its name: copied to a temporary
/// name there, flushed, checked with `check`, given its name (never over another file), and only
/// then removed from where it was. A failure at any step removes the copy and leaves the file
/// whole where it was; the error's kind names the step.
fn move_file(file: &Path, to: &Path, check: CopyCheck) -> Result<(), CommandError> {
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
    copy.as_file().sync_all().map_err(|e| not_copied(&e))?;
    drop(source);

    check(copy.path()).map_err(|error| {
        CommandError::new(
            ErrorKind::MoveCheck,
            format!(
                "The copy of {name} in {place} is not a workspace this version can open ({}), so the copy was removed and the file was left whole in {from}.",
                error.message
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

    std::fs::remove_file(file).map_err(|error| {
        // The original stays, so the copy goes: the file is in one folder only.
        let removed = std::fs::remove_file(&target);
        let copy_note = match removed {
            Ok(()) => "the copy was removed".to_string(),
            Err(e) => format!(
                "the copy in {place} could not be removed either ({e}), so the file is in both folders; delete one of the two"
            ),
        };
        CommandError::new(
            ErrorKind::MoveRemove,
            format!(
                "{name} could not be removed from {from} ({error}), so {copy_note}, and the file was left whole in {from}. Close any program that holds it, then move it by hand."
            ),
        )
    })
}
