//! The files Hold Explorer writes: the tables of a screen as a workbook, a CSV file, or text on
//! the clipboard, and the safe write that puts a file on disk whole or not at all.
//!
//! Every table of a file is a [`sheet::Sheet`]: named columns of a [`sheet::ColumnKind`] and
//! rows of [`sheet::Cell`]s. [`text::csv`] and [`text::tab_separated`] write a sheet as text;
//! [`text::line_ids`] writes a list of line IDs. Every word a file contains comes from the
//! interface's catalog through [`text::ExportText`]. [`file::write_file`] writes the bytes.
//!
//! [`views::screen_sheets`] makes the sheets of a screen for an [`views::ExportRequest`],
//! [`views::workbook_sheets`] those of the full workbook, and [`views::scope_line_ids`] the line
//! IDs of the rows in scope, all with the same functions of `hx_core` the commands call.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod file;
pub mod sheet;
pub mod text;
pub mod views;

pub use file::write_file;
pub use sheet::{Cell, Column, ColumnKind, Sheet};
pub use text::{csv, line_ids, tab_separated, ExportText, FILE_TEXT_KEYS, KEY_NO, KEY_YES};
pub use views::{
    name_sheets, scope_line_ids, screen_sheets, workbook_sheets, ExportRequest, RowScope, Screen,
};

use serde::Serialize;

/// Why a file could not be written. Every message says what happened, why, and how to fix it.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize)]
#[serde(tag = "kind")]
pub enum ExportError {
    /// Another program holds the file open, or it is read-only.
    #[error("Hold Explorer could not save {file}: another program has it open, or it is read-only. Close it in that program, or choose another name, and save again.")]
    FileInUse {
        /// The name of the file.
        file: String,
    },
    /// The folder does not exist or cannot be written.
    #[error("Hold Explorer could not save in the folder {folder}: {reason}. Choose a folder that exists and that you can write to, and save again.")]
    Folder {
        /// The folder the file was to be saved in.
        folder: String,
        /// The system's reason.
        reason: String,
    },
    /// Any other failure to write, with the system's reason.
    #[error("Hold Explorer could not save {file}: {reason}. Check that the disk has room and that you can write there, or choose another place, and save again.")]
    Write {
        /// The name of the file.
        file: String,
        /// The system's reason.
        reason: String,
    },
    /// A label the request lacks: a fault of the application.
    #[error("Hold Explorer could not write the file: the text \"{key}\" is missing from the request. This is a fault of Hold Explorer; restart it and try again, and report it if it happens again.")]
    Text {
        /// The key of the missing label.
        key: String,
    },
}

#[cfg(all(test, feature = "ts"))]
mod ts_tests;
