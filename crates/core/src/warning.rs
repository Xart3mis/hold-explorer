//! Things the import changed or assumed, for the import review to show.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WarningKind {
    UnreadableReleaseDate,
    UnrecognizedReleased,
    AssumedDateOrder,
    ErrorCells,
    DuplicateHeader,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImportWarning {
    pub kind: WarningKind,
    /// The row the warning is about, when it is about one row.
    pub row_number: Option<usize>,
    /// A full sentence for the import review.
    pub detail: String,
}
