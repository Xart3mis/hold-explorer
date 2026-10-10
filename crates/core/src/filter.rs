//! Which holds a view shows.

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

use crate::dataset::Row;
use crate::table::format_number;

/// A dimension holds can be grouped and filtered by.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
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
    /// An extra column, by the name it has in `Hold.extra`.
    Custom(String),
}

impl Dim {
    pub fn value(&self, row: &Row) -> String {
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
            Dim::Custom(name) => row.hold.extra.get(name).cloned().unwrap_or_default(),
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FieldFilter {
    pub dim: Dim,
    /// Values combine with OR. An empty list does not filter.
    pub values: Vec<String>,
    /// "Is not": keep rows whose value is not in the list.
    #[serde(default)]
    pub negate: bool,
}

/// Inclusive bounds in days. A missing bound is open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AgeBand {
    pub min_days: Option<i64>,
    pub max_days: Option<i64>,
}

impl AgeBand {
    fn contains(&self, age: i64) -> bool {
        self.min_days.is_none_or(|min| age >= min) && self.max_days.is_none_or(|max| age <= max)
    }
}

/// Inclusive calendar-date bounds. A missing bound is open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DateRange {
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
}

impl DateRange {
    /// A missing date fails a range that has any bound.
    fn admits(&self, at: Option<NaiveDateTime>) -> bool {
        if self.from.is_none() && self.to.is_none() {
            return true;
        }
        let Some(date) = at.map(|t| t.date()) else {
            return false;
        };
        self.from.is_none_or(|from| date >= from) && self.to.is_none_or(|to| date <= to)
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct FilterSpec {
    pub status: Status,
    /// Combined with AND. Values inside one entry combine with OR.
    pub fields: Vec<FieldFilter>,
    /// Case-insensitive substring of line, remark, name, hold type, discipline, or blocker item.
    pub text: String,
    /// Combined with OR. Empty means no age filter.
    pub age_bands: Vec<AgeBand>,
    pub created: DateRange,
    pub released: DateRange,
    pub size_mismatch: Option<bool>,
}

impl FilterSpec {
    pub fn matches(&self, row: &Row) -> bool {
        match self.status {
            Status::Open if row.hold.released => return false,
            Status::Released if !row.hold.released => return false,
            _ => {}
        }

        for filter in &self.fields {
            if filter.values.is_empty() {
                continue;
            }
            let value = filter.dim.value(row);
            let listed = filter.values.contains(&value);
            if listed == filter.negate {
                return false;
            }
        }

        if !self.age_bands.is_empty()
            && !row
                .days()
                .is_some_and(|age| self.age_bands.iter().any(|band| band.contains(age)))
        {
            return false;
        }
        if !self.created.admits(row.hold.created) || !self.released.admits(row.hold.release_date) {
            return false;
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
    use crate::dataset::Dataset;
    use crate::rules::RuleSet;
    use crate::testkit::{hold, sample, snapshot};
    use chrono::Duration;

    fn count(spec: &FilterSpec) -> usize {
        sample().rows.iter().filter(|r| spec.matches(r)).count()
    }

    fn entry(dim: Dim, values: &[&str], negate: bool) -> FieldFilter {
        FieldFilter {
            dim,
            values: values.iter().map(|s| s.to_string()).collect(),
            negate,
        }
    }

    fn field(dim: Dim, values: &[&str], negate: bool) -> FilterSpec {
        FilterSpec {
            fields: vec![entry(dim, values, negate)],
            ..Default::default()
        }
    }

    fn bands(list: &[(Option<i64>, Option<i64>)]) -> FilterSpec {
        FilterSpec {
            age_bands: list
                .iter()
                .map(|&(min_days, max_days)| AgeBand { min_days, max_days })
                .collect(),
            ..Default::default()
        }
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
        spec.fields.push(entry(Dim::HoldType, &["P&ID"], false));
        assert_eq!(count(&spec), 1);
    }

    #[test]
    fn two_entries_on_the_same_dimension_both_apply() {
        let mut spec = field(Dim::Discipline, &["Civil", "Piping"], false);
        spec.fields.push(entry(Dim::Discipline, &["Civil"], true));
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
    fn hold_without_a_creation_date_matches_no_age_band() {
        let mut ds = sample();
        ds.rows[0].age_days = None;
        ds.rows[0].duration_days = None;
        let count_with = |spec: &FilterSpec| ds.rows.iter().filter(|r| spec.matches(r)).count();
        assert_eq!(count_with(&FilterSpec::default()), 4);
        assert_eq!(count_with(&bands(&[(Some(0), None)])), 3);
        assert_eq!(count_with(&bands(&[(None, Some(1000))])), 3);
    }

    #[test]
    fn age_band_bounds_are_inclusive() {
        assert_eq!(count(&bands(&[(Some(10), None)])), 2);
        assert_eq!(count(&bands(&[(None, Some(5))])), 2);
        assert_eq!(count(&bands(&[(Some(5), Some(10))])), 2);
        assert_eq!(count(&bands(&[(Some(10), Some(10))])), 1);
    }

    #[test]
    fn several_age_bands_combine_with_or() {
        assert_eq!(count(&bands(&[(Some(0), Some(5)), (Some(40), None)])), 3);
    }

    #[test]
    fn no_age_bands_means_no_age_filter() {
        assert_eq!(count(&bands(&[])), 4);
    }

    #[test]
    fn custom_dimension_reads_the_extra_column() {
        let mut north = hold("L1", "Civil", "MISC.", "r", 3);
        north.extra.insert("Area".to_string(), "North".to_string());
        let other = hold("L2", "Civil", "MISC.", "r", 3);
        let ds = Dataset::build(vec![north, other], &RuleSet::builtin(), snapshot());
        let area = Dim::Custom("Area".to_string());

        let spec = field(area.clone(), &["North"], false);
        assert_eq!(ds.rows.iter().filter(|r| spec.matches(r)).count(), 1);

        let groups = crate::query::group_by(&ds, &FilterSpec::default(), &area);
        let mut keys: Vec<&str> = groups.iter().map(|g| g.key.as_str()).collect();
        keys.sort();
        assert_eq!(keys, vec!["", "North"]);
    }

    #[test]
    fn created_range_compares_calendar_dates() {
        let from = (snapshot() - Duration::days(5)).date();
        let spec = FilterSpec {
            created: DateRange {
                from: Some(from),
                to: None,
            },
            ..Default::default()
        };
        assert_eq!(count(&spec), 2);
    }

    #[test]
    fn released_range_matches_only_released_holds() {
        let date = (snapshot() - Duration::days(20)).date();
        let wide = FilterSpec {
            status: Status::All,
            released: DateRange {
                from: Some(date),
                to: Some(date),
            },
            ..Default::default()
        };
        assert_eq!(count(&wide), 1);
        let after = FilterSpec {
            status: Status::All,
            released: DateRange {
                from: Some(date + Duration::days(1)),
                to: None,
            },
            ..Default::default()
        };
        assert_eq!(count(&after), 0);
        let open_only = FilterSpec {
            released: DateRange {
                from: Some(date),
                to: None,
            },
            ..Default::default()
        };
        assert_eq!(count(&open_only), 0);
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

    #[test]
    fn empty_json_object_is_the_default_filter() {
        let spec: FilterSpec = serde_json::from_str("{}").unwrap();
        assert_eq!(spec, FilterSpec::default());
        let partial: FieldFilter =
            serde_json::from_str(r#"{"dim":"Discipline","values":["Civil"]}"#).unwrap();
        assert!(!partial.negate);
    }

    #[test]
    fn dimensions_serialize_as_names_or_custom_objects() {
        assert_eq!(
            serde_json::to_string(&Dim::Discipline).unwrap(),
            r#""Discipline""#
        );
        assert_eq!(
            serde_json::to_string(&Dim::Custom("Area".into())).unwrap(),
            r#"{"Custom":"Area"}"#
        );
    }

    #[test]
    fn filter_spec_round_trips_through_json() {
        let d = |text: &str| NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap();
        let spec = FilterSpec {
            status: Status::All,
            fields: vec![
                entry(Dim::Discipline, &["Civil"], true),
                entry(Dim::Custom("Area".into()), &["North"], false),
            ],
            text: "pr".to_string(),
            age_bands: vec![
                AgeBand {
                    min_days: Some(3),
                    max_days: None,
                },
                AgeBand {
                    min_days: None,
                    max_days: Some(9),
                },
            ],
            created: DateRange {
                from: Some(d("2026-01-02")),
                to: Some(d("2026-03-04")),
            },
            released: DateRange {
                from: None,
                to: Some(d("2026-05-06")),
            },
            size_mismatch: Some(true),
        };
        let json = serde_json::to_string(&spec).unwrap();
        assert_eq!(serde_json::from_str::<FilterSpec>(&json).unwrap(), spec);
    }
}
