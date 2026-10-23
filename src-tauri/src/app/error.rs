//! The error a failed command returns to the interface.

use hx_core::error::ImportError;
use hx_export::ExportError;
use hx_store::StoreError;
use serde::Serialize;
use ts_rs::TS;

/// Every kind of error a command can answer with. Serialized as its name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub enum ErrorKind {
    /// [`StoreError::NotAWorkspace`], and [`StoreError::NotADatabase`]: a file named like a
    /// workspace that is damaged beyond repair.
    NotAWorkspace,
    /// [`StoreError::DuplicateWorkspace`].
    DuplicateWorkspace,
    /// [`StoreError::NewerSchema`].
    NewerSchema,
    /// [`StoreError::AlreadyImported`].
    AlreadyImported,
    /// [`StoreError::SnapshotNotFound`].
    SnapshotNotFound,
    /// [`StoreError::SnapshotDateOutOfRange`], and a snapshot date the commands refuse
    /// themselves for the same reason.
    SnapshotDateOutOfRange,
    /// [`StoreError::Io`].
    Io,
    /// [`StoreError::Database`].
    Database,
    /// [`StoreError::Corrupt`].
    Corrupt,
    /// [`ImportError::NotFound`].
    NotFound,
    /// [`ImportError::Unreadable`].
    Unreadable,
    /// [`ImportError::EmptyFile`].
    EmptyFile,
    /// [`ImportError::NoDataSheet`].
    NoDataSheet,
    /// [`ImportError::SheetNotFound`].
    SheetNotFound,
    /// [`ImportError::MissingColumns`].
    MissingColumns,
    /// [`ImportError::Empty`].
    Empty,
    /// [`ImportError::NoHolds`].
    NoHolds,
    /// [`ExportError::FileInUse`].
    FileInUse,
    /// [`ExportError::Folder`].
    Folder,
    /// [`ExportError::Write`].
    Write,
    /// [`ExportError::TooManyRows`].
    TooManyRows,
    /// [`ExportError::Workbook`].
    Workbook,
    /// [`ExportError::Image`].
    Image,
    /// [`ExportError::Report`].
    Report,
    /// [`ExportError::Text`].
    Text,
    /// No workspace is open.
    NoWorkspace,
    /// No file is open for import.
    NoDraft,
    /// The workspace asked for is not in the workspace folder.
    WorkspaceNotFound,
    /// A snapshot was to be replaced that the check of the target did not offer.
    ReplaceNotOffered,
    /// The workspace or snapshot the page shows is no longer the one in view.
    ViewChanged,
    /// The settings could not be read or saved.
    Settings,
    /// The settings file could not be understood, so it was set aside and the defaults are in
    /// use.
    SettingsSetAside,
    /// A file the app did not write this session was to be opened.
    NotWritten,
    /// The clipboard could not be read or set.
    Clipboard,
    /// The system could not open a file.
    Open,
    /// A file name has an extension other than the format's.
    Extension,
    /// A workspace folder was given as a path that is not absolute.
    FolderNotAbsolute,
    /// A workspace folder could not be created, or cannot be written to.
    FolderUnusable,
    /// The workspace folder chosen is the one in use.
    SameFolder,
    /// A workspace file was not moved because a file of its name is in the new folder.
    NameTaken,
    /// A workspace file was not moved because it could not be copied to the new folder.
    MoveCopy,
    /// A workspace file was not moved because its copy is not a workspace this version opens.
    MoveCheck,
    /// A workspace file was not moved because its copy could not be given its name.
    MoveRename,
    /// A workspace file was not moved because it could not be removed from the old folder.
    MoveRemove,
    /// A saved view's name is empty or longer than 80 characters.
    ViewName,
    /// A saved view's name is the name of another, without regard to case.
    ViewNameTaken,
    /// The workspace holds 100 saved views already.
    TooManyViews,
    /// A saved view's address is not that of a data screen, or carries a selection.
    ViewAddress,
    /// No saved view has the id.
    ViewNotFound,
    /// A fault of the application itself rather than of the user's input.
    Internal,
}

/// What a failed command returns: the error's kind and its full text.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct CommandError {
    /// The error's kind.
    pub kind: ErrorKind,
    /// The text to show the user: what happened, why, and how to fix it.
    pub message: String,
}

impl CommandError {
    /// An error of the given kind.
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> CommandError {
        CommandError {
            kind,
            message: message.into(),
        }
    }

    /// A fault of the application itself rather than of the user's input.
    pub fn internal(message: impl Into<String>) -> CommandError {
        CommandError::new(ErrorKind::Internal, message)
    }

    /// No workspace is open.
    pub fn no_workspace() -> CommandError {
        CommandError::new(
            ErrorKind::NoWorkspace,
            "No workspace is open. Open a workspace, or create one, and try again.",
        )
    }
}

impl From<StoreError> for CommandError {
    fn from(error: StoreError) -> CommandError {
        let kind = match &error {
            StoreError::NotAWorkspace { .. } | StoreError::NotADatabase { .. } => {
                ErrorKind::NotAWorkspace
            }
            StoreError::DuplicateWorkspace { .. } => ErrorKind::DuplicateWorkspace,
            StoreError::NewerSchema { .. } => ErrorKind::NewerSchema,
            StoreError::AlreadyImported { .. } => ErrorKind::AlreadyImported,
            StoreError::SnapshotNotFound { .. } => ErrorKind::SnapshotNotFound,
            StoreError::SnapshotDateOutOfRange { .. } => ErrorKind::SnapshotDateOutOfRange,
            StoreError::Io { .. } => ErrorKind::Io,
            StoreError::Database { .. } => ErrorKind::Database,
            StoreError::Corrupt { .. } => ErrorKind::Corrupt,
        };
        CommandError::new(kind, error.to_string())
    }
}

impl From<ImportError> for CommandError {
    fn from(error: ImportError) -> CommandError {
        let kind = match &error {
            ImportError::NotFound { .. } => ErrorKind::NotFound,
            ImportError::Unreadable { .. } => ErrorKind::Unreadable,
            ImportError::EmptyFile { .. } => ErrorKind::EmptyFile,
            ImportError::NoDataSheet { .. } => ErrorKind::NoDataSheet,
            ImportError::SheetNotFound { .. } => ErrorKind::SheetNotFound,
            ImportError::MissingColumns { .. } => ErrorKind::MissingColumns,
            ImportError::Empty => ErrorKind::Empty,
            ImportError::NoHolds { .. } => ErrorKind::NoHolds,
        };
        CommandError::new(kind, error.to_string())
    }
}

impl From<ExportError> for CommandError {
    fn from(error: ExportError) -> CommandError {
        let kind = match &error {
            ExportError::FileInUse { .. } => ErrorKind::FileInUse,
            ExportError::Folder { .. } => ErrorKind::Folder,
            ExportError::Write { .. } => ErrorKind::Write,
            ExportError::TooManyRows { .. } => ErrorKind::TooManyRows,
            ExportError::Workbook { .. } => ErrorKind::Workbook,
            ExportError::Image { .. } => ErrorKind::Image,
            ExportError::Report { .. } => ErrorKind::Report,
            ExportError::Text { .. } => ErrorKind::Text,
        };
        CommandError::new(kind, error.to_string())
    }
}
