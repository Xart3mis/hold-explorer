use thiserror::Error;

/// Every message says what went wrong and what the user can do about it.
#[derive(Debug, Error, PartialEq)]
pub enum ImportError {
    #[error("Could not read {path}: {detail}. Check that the file is an Excel or CSV file and is not password-protected.")]
    Unreadable { path: String, detail: String },

    #[error("No sheet with hold data was found. Expected a sheet named \"data\" with the columns line_id, hold_remark, and hold_type.")]
    NoDataSheet,

    #[error("Missing required columns: {}. Map them to columns in your file.", .0.join(", "))]
    MissingColumns(Vec<String>),

    #[error("The file has a header row but no data rows.")]
    Empty,
}
