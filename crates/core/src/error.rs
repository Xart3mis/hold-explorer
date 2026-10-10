//! The error a failed import reports.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::mapping::Field;

/// Every message says what went wrong and what the user can do about it.
#[derive(Debug, Clone, PartialEq, Error, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ImportError {
    #[error(
        "The file {path} was not found. It may have been moved or deleted; choose the file again."
    )]
    /// The file does not exist at `path` (moved or deleted).
    NotFound {
        /// The path that was looked up.
        path: String,
    },

    #[error("Could not read {path}: {detail}. Check that the file is an Excel workbook or a CSV file, that it is saved without a password, and that you have permission to read it, then choose it again.")]
    /// The file at `path` exists but could not be read; `detail` is the underlying reason.
    Unreadable {
        /// The file that could not be read.
        path: String,
        /// The underlying reason, as reported by the reader.
        detail: String,
    },

    #[error("The file {path} is empty. Export the report again and choose the new file.")]
    /// The file at `path` has no content at all.
    EmptyFile {
        /// The empty file.
        path: String,
    },

    #[error("No sheet with hold data was found; the sheets in the file are: {}. Expected a sheet named \"data\" with the columns line_id, hold_remark, and hold_type.", .sheets.join(", "))]
    /// The workbook has no sheet that holds hold data; `sheets` lists the sheet names found.
    NoDataSheet {
        /// Names of the sheets in the workbook.
        sheets: Vec<String>,
    },

    #[error("Missing required columns: {}. Map them to columns of the file.", .missing.iter().map(|f| f.label()).collect::<Vec<_>>().join(", "))]
    /// Required fields have no column mapped to them; `missing` lists those fields.
    MissingColumns {
        /// The required fields with no mapped column.
        missing: Vec<Field>,
    },

    #[error("The file has a header row but no data rows. Export the report again or choose another file.")]
    /// The file has a header row but no data rows.
    Empty,

    #[error("No hold could be read: {skipped_rows} {} skipped, for example {example}. Check the column mapping and the date format.", if *.skipped_rows == 1 { "row was" } else { "rows were" })]
    /// Every data row was skipped, so no hold was read.
    NoHolds {
        /// How many rows were skipped.
        skipped_rows: usize,
        /// A description of one skipped row and why it was skipped.
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

    #[test]
    fn unreadable_advice_fits_every_cause() {
        let message = ImportError::Unreadable {
            path: "a.xlsx".into(),
            detail: "Permission denied".into(),
        }
        .to_string();
        for part in [
            "Permission denied",
            "Excel workbook or a CSV",
            "password",
            "permission",
        ] {
            assert!(message.contains(part), "{message}");
        }
    }

    fn every_variant() -> Vec<(ImportError, &'static str)> {
        vec![
            (
                ImportError::NotFound {
                    path: "a.xlsx".into(),
                },
                "choose the file again",
            ),
            (
                ImportError::Unreadable {
                    path: "a.xlsx".into(),
                    detail: "bad zip".into(),
                },
                "without a password",
            ),
            (
                ImportError::EmptyFile {
                    path: "a.csv".into(),
                },
                "Export the report again",
            ),
            (
                ImportError::NoDataSheet {
                    sheets: vec!["info".into()],
                },
                "named \"data\"",
            ),
            (
                ImportError::MissingColumns {
                    missing: vec![Field::Remark],
                },
                "Map them",
            ),
            (ImportError::Empty, "choose another file"),
            (
                ImportError::NoHolds {
                    skipped_rows: 2,
                    example: "row 2".into(),
                },
                "Check the column mapping",
            ),
        ]
    }

    #[test]
    fn every_message_ends_with_advice() {
        for (error, advice) in every_variant() {
            let message = error.to_string();
            assert!(message.contains(advice), "{message}");
            assert!(message.ends_with('.'), "{message}");
        }
    }

    #[test]
    fn every_variant_round_trips_through_json() {
        for (error, _) in every_variant() {
            let json = serde_json::to_string(&error).unwrap();
            let back: ImportError = serde_json::from_str(&json).unwrap();
            assert_eq!(back, error, "{json}");
        }
    }

    #[test]
    fn missing_columns_serialize_as_field_names() {
        let error = ImportError::MissingColumns {
            missing: vec![Field::Remark, Field::HoldType],
        };
        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({"kind": "MissingColumns", "missing": ["Remark", "HoldType"]})
        );
        assert!(error.to_string().contains("hold_remark, hold_type"));
    }

    #[test]
    fn unit_variant_serializes_with_its_kind() {
        assert_eq!(
            serde_json::to_value(ImportError::Empty).unwrap(),
            serde_json::json!({"kind": "Empty"})
        );
    }
}
