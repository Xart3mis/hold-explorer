use std::collections::BTreeMap;

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

/// One row of the export after normalization.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Hold {
    /// The `id` column. Absent in limited files.
    pub source_id: Option<i64>,
    pub line_id: String,
    pub name: String,
    pub role: String,
    /// Cleaned remark text, original case.
    pub remark: String,
    pub hold_type: String,
    pub discipline: String,
    pub created: Option<NaiveDateTime>,
    pub released: bool,
    pub release_remark: String,
    pub release_date: Option<NaiveDateTime>,
    /// `None` when blank or zero.
    pub model_size: Option<f64>,
    /// `None` when blank or zero.
    pub ldt_size: Option<f64>,
    pub stress_calc: String,
    /// Columns the mapping did not recognize, by header name.
    pub extra: BTreeMap<String, String>,
}
