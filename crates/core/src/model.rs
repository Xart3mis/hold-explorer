//! The normalized hold record.

use std::collections::BTreeMap;

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

/// One row of the export after normalization.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Hold {
    /// The `id` column. Absent in limited files.
    pub source_id: Option<i64>,
    /// The line the hold is on, as written in the export; holds with the same `line_id` belong to one line.
    pub line_id: String,
    /// The person named on the hold (the `name` column), or `—` when blank.
    pub name: String,
    /// The `role` column, or `—` when blank.
    pub role: String,
    /// Cleaned remark text, original case.
    pub remark: String,
    /// The `hold_type` column, or `—` when blank.
    pub hold_type: String,
    /// The discipline that owns the hold, or `Unspecified` when blank.
    pub discipline: String,
    /// When the hold was created; `None` when the date cell is blank.
    pub created: Option<NaiveDateTime>,
    /// Whether the hold is released. Treated as `false` when the cell is blank or unrecognized.
    pub released: bool,
    /// Cleaned text recorded at release; empty when none.
    pub release_remark: String,
    /// When the hold was released; `None` when the cell is blank or unreadable.
    pub release_date: Option<NaiveDateTime>,
    /// `None` when blank or zero.
    pub model_size: Option<f64>,
    /// `None` when blank or zero.
    pub ldt_size: Option<f64>,
    /// Cleaned `stress_calc` text; empty when none.
    pub stress_calc: String,
    /// Columns the mapping did not recognize, by header name.
    pub extra: BTreeMap<String, String>,
}
