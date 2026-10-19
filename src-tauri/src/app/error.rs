//! The error a failed command returns to the interface.

use hx_core::error::ImportError;
use hx_export::ExportError;
use hx_store::StoreError;
use serde::Serialize;
use ts_rs::TS;

/// What a failed command returns: the error's kind and its full text.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct CommandError {
    /// The error's variant name, for example `NewerSchema`, or one of `NoWorkspace`, `NoDraft`,
    /// `WorkspaceNotFound`, `ReplaceNotOffered`, `ViewChanged`, `Settings`, `NotWritten`,
    /// `Clipboard`, `Open`, `Internal`.
    pub kind: String,
    /// The text to show the user: what happened, why, and how to fix it.
    pub message: String,
}

impl CommandError {
    /// An error of the given kind.
    pub fn new(kind: &str, message: impl Into<String>) -> CommandError {
        CommandError {
            kind: kind.to_string(),
            message: message.into(),
        }
    }

    /// A fault of the application itself rather than of the user's input.
    pub fn internal(message: impl Into<String>) -> CommandError {
        CommandError::new("Internal", message)
    }

    /// No workspace is open.
    pub fn no_workspace() -> CommandError {
        CommandError::new(
            "NoWorkspace",
            "No workspace is open. Open a workspace, or create one, and try again.",
        )
    }
}

/// The `kind` tag the error serializes with, so the kind cannot drift from the variant.
fn serde_kind<E: Serialize>(error: &E) -> String {
    serde_json::to_value(error)
        .ok()
        .and_then(|value| {
            value
                .get("kind")
                .and_then(|kind| kind.as_str().map(String::from))
        })
        .unwrap_or_else(|| "Internal".to_string())
}

impl From<StoreError> for CommandError {
    fn from(error: StoreError) -> CommandError {
        CommandError::new(&serde_kind(&error), error.to_string())
    }
}

impl From<ImportError> for CommandError {
    fn from(error: ImportError) -> CommandError {
        CommandError::new(&serde_kind(&error), error.to_string())
    }
}

impl From<ExportError> for CommandError {
    fn from(error: ExportError) -> CommandError {
        CommandError::new(&serde_kind(&error), error.to_string())
    }
}
