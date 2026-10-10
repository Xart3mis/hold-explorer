//! Things the import changed or assumed, for the import review to show.

use serde::{Deserialize, Serialize};

/// The kind of thing an [`ImportWarning`] reports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WarningKind {
    /// A release date could not be read as a date; the hold is kept with no release date.
    UnreadableReleaseDate,
    /// The released cell held a value that is not a recognized true or false; the hold is treated as open.
    UnrecognizedReleased,
    /// A date column's day/month order could not be decided from its values, so it was read day-first.
    AssumedDateOrder,
    /// Cells held an Excel error such as `#N/A` and were read as blank; the warning is not tied to one row.
    ErrorCells,
    /// Several unrecognized columns share a header; the later ones were renamed with a number, for example `Notes (2)`.
    DuplicateHeader,
    /// A size cell held a value that is not a number of zero or more; the hold is kept with no size.
    UnreadableSize,
    /// An id cell held a value that is not an exact whole number; the hold is kept with no id.
    UnreadableId,
    /// An id was already used by an earlier hold; both holds are kept with that id.
    DuplicateId,
    /// The information sheet's `Report Date` could not be read, so it gave no snapshot date.
    UnreadableReportDate,
}

/// One thing the import changed or assumed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImportWarning {
    /// What sort of warning this is.
    pub kind: WarningKind,
    /// The row the warning is about, when it is about one row.
    pub row_number: Option<usize>,
    /// The column the warning is about: the header as written in the file, when it is about one column.
    pub column: Option<String>,
    /// The value as found in the file, when the warning is about one value.
    pub value: Option<String>,
    /// A full sentence for the import review.
    pub detail: String,
}
