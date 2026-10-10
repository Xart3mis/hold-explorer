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

    #[error("The file has a header row but no data rows. Export the report again or choose another file.")]
    Empty,

    #[error("No hold could be read: {skipped_rows} {} skipped, for example {example}. Check the column mapping and the date format.", if *.skipped_rows == 1 { "row was" } else { "rows were" })]
    NoHolds {
        skipped_rows: usize,
        example: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_holds_message_agrees_with_the_row_count() {
        let message = |skipped_rows| {
            ImportError::NoHolds {
                skipped_rows,
                example: "row 2: blank line_id".to_string(),
            }
            .to_string()
        };
        assert!(message(1).contains("1 row was skipped"), "{}", message(1));
        assert!(message(4).contains("4 rows were skipped"), "{}", message(4));
    }
}
