//! Which holds a view shows.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::dataset::Row;
use crate::table::format_number;

/// A dimension holds can be grouped and filtered by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Dim {
    Discipline,
    HoldType,
    Role,
    Name,
    BlockerType,
    Blocker,
    Remark,
    LineId,
    ModelSize,
    StressCalc,
}

impl Dim {
    pub fn value(self, row: &Row) -> String {
        match self {
            Dim::Discipline => row.hold.discipline.clone(),
            Dim::HoldType => row.hold.hold_type.clone(),
            Dim::Role => row.hold.role.clone(),
            Dim::Name => row.hold.name.clone(),
            Dim::BlockerType => row.blocker.kind.clone(),
            Dim::Blocker => row.blocker_key(),
            Dim::Remark => row.remark_key.clone(),
            Dim::LineId => row.hold.line_id.clone(),
            Dim::ModelSize => row.hold.model_size.map(format_number).unwrap_or_default(),
            Dim::StressCalc => row.hold.stress_calc.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum Status {
    #[default]
    Open,
    Released,
    All,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct FieldFilter {
    /// Values combine with OR. An empty list does not filter.
    pub values: Vec<String>,
    /// "Is not": keep rows whose value is not in the list.
    pub negate: bool,
}

/// Fields combine with AND.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct FilterSpec {
    pub status: Status,
    pub fields: BTreeMap<Dim, FieldFilter>,
    /// Case-insensitive substring of line, remark, name, hold type, discipline, or blocker item.
    pub text: String,
    pub min_age_days: Option<i64>,
    pub max_age_days: Option<i64>,
    pub size_mismatch: Option<bool>,
}

impl FilterSpec {
    pub fn matches(&self, row: &Row) -> bool {
        match self.status {
            Status::Open if row.hold.released => return false,
            Status::Released if !row.hold.released => return false,
            _ => {}
        }

        for (dim, filter) in &self.fields {
            if filter.values.is_empty() {
                continue;
            }
            let value = dim.value(row);
            let listed = filter.values.contains(&value);
            if listed == filter.negate {
                return false;
            }
        }

        if let Some(min) = self.min_age_days {
            if row.age_days.is_none_or(|age| age < min) {
                return false;
            }
        }
        if let Some(max) = self.max_age_days {
            if row.age_days.is_none_or(|age| age > max) {
                return false;
            }
        }
        if let Some(wanted) = self.size_mismatch {
            if row.size_mismatch() != wanted {
                return false;
            }
        }

        let needle = self.text.trim().to_lowercase();
        if !needle.is_empty() {
            let haystacks = [
                &row.hold.line_id,
                &row.hold.remark,
                &row.hold.name,
                &row.hold.hold_type,
                &row.hold.discipline,
                &row.blocker.item,
            ];
            if !haystacks.iter().any(|h| h.to_lowercase().contains(&needle)) {
                return false;
            }
        }

        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::sample;

    fn count(spec: &FilterSpec) -> usize {
        sample().rows.iter().filter(|r| spec.matches(r)).count()
    }

    fn field(dim: Dim, values: &[&str], negate: bool) -> FilterSpec {
        let mut spec = FilterSpec::default();
        spec.fields.insert(
            dim,
            FieldFilter {
                values: values.iter().map(|s| s.to_string()).collect(),
                negate,
            },
        );
        spec
    }

    #[test]
    fn default_shows_open_holds() {
        assert_eq!(count(&FilterSpec::default()), 4);
    }

    #[test]
    fn status_released_and_all() {
        assert_eq!(
            count(&FilterSpec {
                status: Status::Released,
                ..Default::default()
            }),
            1
        );
        assert_eq!(
            count(&FilterSpec {
                status: Status::All,
                ..Default::default()
            }),
            5
        );
    }

    #[test]
    fn values_in_one_field_combine_with_or() {
        assert_eq!(count(&field(Dim::Discipline, &["Civil"], false)), 2);
        assert_eq!(
            count(&field(Dim::Discipline, &["Civil", "Piping"], false)),
            3
        );
    }

    #[test]
    fn is_not_excludes_values() {
        assert_eq!(count(&field(Dim::Discipline, &["Civil"], true)), 2);
    }

    #[test]
    fn different_fields_combine_with_and() {
        let mut spec = field(Dim::Discipline, &["Civil", "Piping"], false);
        spec.fields.insert(
            Dim::HoldType,
            FieldFilter {
                values: vec!["P&ID".to_string()],
                negate: false,
            },
        );
        assert_eq!(count(&spec), 1);
    }

    #[test]
    fn empty_value_list_does_not_filter() {
        assert_eq!(count(&field(Dim::Discipline, &[], false)), 4);
    }

    #[test]
    fn blocker_and_blocker_type_dimensions() {
        assert_eq!(count(&field(Dim::BlockerType, &["PR"], false)), 2);
        assert_eq!(count(&field(Dim::Blocker, &["Piping|P&ID"], false)), 1);
    }

    #[test]
    fn text_matches_several_fields_ignoring_case() {
        assert_eq!(
            count(&FilterSpec {
                text: "vendor".into(),
                ..Default::default()
            }),
            1
        );
        assert_eq!(
            count(&FilterSpec {
                text: "l1".into(),
                ..Default::default()
            }),
            2
        );
        assert_eq!(
            count(&FilterSpec {
                text: "538-pr".into(),
                ..Default::default()
            }),
            2
        );
        assert_eq!(
            count(&FilterSpec {
                text: "  ".into(),
                ..Default::default()
            }),
            4
        );
    }

    #[test]
    fn age_range() {
        assert_eq!(
            count(&FilterSpec {
                min_age_days: Some(10),
                ..Default::default()
            }),
            2
        );
        assert_eq!(
            count(&FilterSpec {
                max_age_days: Some(5),
                ..Default::default()
            }),
            2
        );
        assert_eq!(
            count(&FilterSpec {
                min_age_days: Some(5),
                max_age_days: Some(10),
                ..Default::default()
            }),
            2
        );
    }

    #[test]
    fn size_mismatch_flag() {
        assert_eq!(
            count(&FilterSpec {
                size_mismatch: Some(true),
                ..Default::default()
            }),
            1
        );
        assert_eq!(
            count(&FilterSpec {
                size_mismatch: Some(false),
                ..Default::default()
            }),
            3
        );
    }
}
