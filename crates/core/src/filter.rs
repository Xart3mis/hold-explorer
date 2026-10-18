//! Which holds a view shows.

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

use crate::dataset::Row;
use crate::mapping::Field;
use crate::table::format_number;

/// A dimension holds can be grouped and filtered by.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Dim {
    /// The hold's discipline (`Unspecified` when blank).
    Discipline,
    /// The hold type (`—` when blank).
    HoldType,
    /// The role (`—` when blank).
    Role,
    /// The name (`—` when blank).
    Name,
    /// The blocker's type, such as `PR` or `P&ID`.
    BlockerType,
    /// The blocker's identity, `<discipline>|<item>`.
    Blocker,
    /// The remark, cleaned and upper-cased, so remarks that differ only in case or spacing share a value.
    Remark,
    /// The line the hold is on.
    LineId,
    /// The model size as text; empty when the hold has none.
    ModelSize,
    /// The stress calculation reference; empty when none.
    StressCalc,
    /// An extra column, by the name it has in `Hold.extra`; empty for a hold that has no value there.
    Custom(String),
}

impl Dim {
    /// The value of this dimension for `row`, as text. Values are compared exactly, so
    /// grouping and filtering by them are case-sensitive.
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

impl Dim {
    /// The columns of the export a filter on this dimension needs, of those a snapshot can lack.
    /// The line ID, the hold remark, and the hold type are in every snapshot, and the blocker comes
    /// from the remark. A custom column is needed by name: see [`FilterSpec::applicable`].
    pub fn needs(&self) -> &'static [Field] {
        match self {
            Dim::Discipline => &[Field::Discipline],
            Dim::Role => &[Field::Role],
            Dim::Name => &[Field::Name],
            Dim::ModelSize => &[Field::ModelSize],
            Dim::StressCalc => &[Field::StressCalc],
            Dim::HoldType
            | Dim::BlockerType
            | Dim::Blocker
            | Dim::Remark
            | Dim::LineId
            | Dim::Custom(_) => &[],
        }
    }
}

/// A part of a filter that is not a field and needs columns of the export.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum FilterPart {
    /// `age_bands`: the age is counted from the creation date.
    AgeBands,
    /// `created`.
    Created,
    /// `released`.
    Released,
    /// `size_mismatch`: the two sizes are compared with each other.
    SizeMismatch,
}

impl FilterPart {
    /// Every part, in the order of the fields of [`FilterSpec`].
    pub const ALL: [FilterPart; 4] = [
        FilterPart::AgeBands,
        FilterPart::Created,
        FilterPart::Released,
        FilterPart::SizeMismatch,
    ];

    /// The columns of the export this part needs.
    pub fn needs(self) -> &'static [Field] {
        match self {
            FilterPart::AgeBands | FilterPart::Created => &[Field::Created],
            FilterPart::Released => &[Field::Released, Field::ReleaseDate],
            FilterPart::SizeMismatch => &[Field::ModelSize, Field::LdtSize],
        }
    }

    /// Whether `spec` sets this part.
    fn is_set(self, spec: &FilterSpec) -> bool {
        match self {
            FilterPart::AgeBands => !spec.age_bands.is_empty(),
            FilterPart::Created => spec.created.is_bounded(),
            FilterPart::Released => spec.released.is_bounded(),
            FilterPart::SizeMismatch => spec.size_mismatch.is_some(),
        }
    }

    /// Takes this part out of `spec`.
    fn clear(self, spec: &mut FilterSpec) {
        match self {
            FilterPart::AgeBands => spec.age_bands.clear(),
            FilterPart::Created => spec.created = DateRange::default(),
            FilterPart::Released => spec.released = DateRange::default(),
            FilterPart::SizeMismatch => spec.size_mismatch = None,
        }
    }
}

/// What a filter sets that a snapshot cannot apply, because it has no value in a column it needs.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Inactive {
    /// The dimensions of the field filters left out, in the order of the filter.
    pub dims: Vec<Dim>,
    /// The other parts left out, in the order of [`FilterPart::ALL`].
    pub parts: Vec<FilterPart>,
}

/// Which holds a filter keeps by release state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum Status {
    /// Holds not yet released (the default).
    #[default]
    Open,
    /// Released holds only.
    Released,
    /// Open and released holds.
    All,
}

/// Keeps rows by the value of one dimension.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct FieldFilter {
    /// The dimension tested.
    pub dim: Dim,
    /// Values combine with OR. An empty list does not filter.
    pub values: Vec<String>,
    /// "Is not": keep rows whose value is not in the list.
    #[serde(default)]
    pub negate: bool,
}

/// Inclusive bounds in days. A missing bound is open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(default)]
pub struct AgeBand {
    /// Smallest age kept, in days; `None` for no lower bound.
    pub min_days: Option<i64>,
    /// Largest age kept, in days; `None` for no upper bound.
    pub max_days: Option<i64>,
}

impl AgeBand {
    fn contains(&self, age: i64) -> bool {
        self.min_days.is_none_or(|min| age >= min) && self.max_days.is_none_or(|max| age <= max)
    }
}

/// Inclusive calendar-date bounds. A missing bound is open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(default)]
pub struct DateRange {
    /// First day kept; `None` for no lower bound.
    pub from: Option<NaiveDate>,
    /// Last day kept; `None` for no upper bound.
    pub to: Option<NaiveDate>,
}

impl DateRange {
    /// Whether it has a bound, and so filters.
    fn is_bounded(&self) -> bool {
        self.from.is_some() || self.to.is_some()
    }

    /// A missing date fails a range that has any bound.
    fn admits(&self, at: Option<NaiveDateTime>) -> bool {
        if !self.is_bounded() {
            return true;
        }
        let Some(date) = at.map(|t| t.date()) else {
            return false;
        };
        self.from.is_none_or(|from| date >= from) && self.to.is_none_or(|to| date <= to)
    }
}

/// A complete filter: every part must hold for a row to be kept.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(default)]
pub struct FilterSpec {
    /// Release state kept; open holds by default.
    pub status: Status,
    /// Combined with AND. Values inside one entry combine with OR.
    pub fields: Vec<FieldFilter>,
    /// Case-insensitive substring of line, remark, name, hold type, discipline, or blocker item.
    pub text: String,
    /// Combined with OR. Empty means no age filter. A band tests the row's age in days, or its
    /// duration for a released hold; a row with no such value fails any age filter.
    pub age_bands: Vec<AgeBand>,
    /// Calendar days the creation date must fall in; a hold with no creation date fails a bounded range.
    pub created: DateRange,
    /// Calendar days the release date must fall in; a hold with no release date fails a bounded range.
    pub released: DateRange,
    /// `Some(true)` keeps only holds whose model and LDT sizes differ, `Some(false)` only the
    /// others; `None` does not filter.
    pub size_mismatch: Option<bool>,
}

/// The age bands a workspace starts with: 0 to 13, 14 to 29, 30 to 59, 60 to 89, and 90 or more days.
pub fn default_age_bands() -> Vec<AgeBand> {
    let band = |min_days, max_days| AgeBand {
        min_days: Some(min_days),
        max_days,
    };
    vec![
        band(0, Some(13)),
        band(14, Some(29)),
        band(30, Some(59)),
        band(60, Some(89)),
        band(90, None),
    ]
}

impl FilterSpec {
    /// This filter without its entries for `dim`: what a picker for `dim` counts against.
    pub fn without(&self, dim: &Dim) -> FilterSpec {
        let mut spec = self.clone();
        spec.fields.retain(|filter| &filter.dim != dim);
        spec
    }

    /// This filter as a snapshot can apply it, with what it leaves out. A field filter with values
    /// is left out when the snapshot has no value in a column its dimension needs (`absent`, as
    /// `Dataset::absent_fields` names them) or, for a custom column, when the snapshot has no such
    /// column (`custom_dims`, as `Dataset::custom_dims` names them); another part when it is set
    /// and needs an absent column. Applied, such a filter would test empty values; left out, the
    /// rest of the filter keeps what it keeps. The status and the text are always kept.
    pub fn applicable(&self, absent: &[Field], custom_dims: &[String]) -> (FilterSpec, Inactive) {
        let lacks = |needs: &[Field]| needs.iter().any(|field| absent.contains(field));
        let mut spec = self.clone();
        let mut inactive = Inactive::default();
        spec.fields.retain(|filter| {
            let is_absent = match &filter.dim {
                Dim::Custom(name) => !custom_dims.contains(name),
                dim => lacks(dim.needs()),
            };
            let is_kept = filter.values.is_empty() || !is_absent;
            if !is_kept {
                inactive.dims.push(filter.dim.clone());
            }
            is_kept
        });
        for part in FilterPart::ALL {
            if part.is_set(&spec) && lacks(part.needs()) {
                part.clear(&mut spec);
                inactive.parts.push(part);
            }
        }
        (spec, inactive)
    }

    /// Whether `row` passes every part of the filter.
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
        let ds = Dataset::build(vec![north, other], RuleSet::builtin(), snapshot());
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

    #[test]
    fn without_drops_every_entry_of_the_dimension_and_nothing_else() {
        let day = NaiveDate::parse_from_str("2026-01-02", "%Y-%m-%d").unwrap();
        let spec = FilterSpec {
            status: Status::Released,
            fields: vec![
                entry(Dim::Discipline, &["Civil"], false),
                entry(Dim::HoldType, &["P&ID"], false),
                entry(Dim::Discipline, &["Piping"], true),
            ],
            text: "pr".to_string(),
            age_bands: default_age_bands(),
            created: DateRange {
                from: Some(day),
                to: None,
            },
            released: DateRange {
                from: None,
                to: Some(day),
            },
            size_mismatch: Some(true),
        };
        let expected = FilterSpec {
            fields: vec![entry(Dim::HoldType, &["P&ID"], false)],
            ..spec.clone()
        };
        assert_eq!(spec.without(&Dim::Discipline), expected);
        assert_eq!(spec.without(&Dim::Custom("Area".into())), spec);
        assert_eq!(spec.without(&Dim::HoldType).fields.len(), 2);
    }

    #[test]
    fn default_age_bands_are_the_five_bands_of_the_spec() {
        let bands = default_age_bands();
        let bounds: Vec<_> = bands.iter().map(|b| (b.min_days, b.max_days)).collect();
        assert_eq!(
            bounds,
            vec![
                (Some(0), Some(13)),
                (Some(14), Some(29)),
                (Some(30), Some(59)),
                (Some(60), Some(89)),
                (Some(90), None),
            ]
        );
        let in_bands = |age: i64| -> Vec<usize> {
            (0..bands.len())
                .filter(|&i| bands[i].contains(age))
                .collect()
        };
        assert_eq!(in_bands(13), vec![0]);
        assert_eq!(in_bands(14), vec![1]);
        assert_eq!(in_bands(90), vec![4]);
        assert_eq!(in_bands(5000), vec![4]);
    }

    fn date(text: &str) -> Option<NaiveDate> {
        NaiveDate::parse_from_str(text, "%Y-%m-%d").ok()
    }

    /// One filter of every kind that needs a column, and two that need none.
    fn every_kind() -> FilterSpec {
        FilterSpec {
            status: Status::All,
            fields: vec![
                entry(Dim::Discipline, &["Civil"], false),
                entry(Dim::HoldType, &["MISC."], false),
                entry(Dim::Custom("Area".into()), &["North"], true),
                entry(Dim::Role, &[], false),
                entry(Dim::ModelSize, &["6"], false),
            ],
            text: "577-PR".into(),
            age_bands: vec![AgeBand {
                min_days: Some(90),
                max_days: None,
            }],
            created: DateRange {
                from: date("2026-09-01"),
                to: None,
            },
            released: DateRange {
                from: None,
                to: date("2026-09-30"),
            },
            size_mismatch: Some(true),
        }
    }

    #[test]
    fn applicable_leaves_out_what_needs_a_column_the_snapshot_lacks() {
        let spec = every_kind();
        let (applied, inactive) = spec.applicable(
            &[Field::Discipline, Field::Created, Field::LdtSize],
            &["Zone".into()],
        );
        assert_eq!(
            applied.fields,
            vec![
                entry(Dim::HoldType, &["MISC."], false),
                entry(Dim::Role, &[], false),
                entry(Dim::ModelSize, &["6"], false),
            ]
        );
        assert!(applied.age_bands.is_empty());
        assert_eq!(applied.created, DateRange::default());
        assert_eq!(applied.size_mismatch, None);
        assert_eq!(applied.released, spec.released);
        assert_eq!(
            (applied.status, applied.text.as_str()),
            (Status::All, "577-PR")
        );
        // The custom column the snapshot does not name is left out as well.
        assert_eq!(
            inactive,
            Inactive {
                dims: vec![Dim::Discipline, Dim::Custom("Area".into())],
                parts: vec![
                    FilterPart::AgeBands,
                    FilterPart::Created,
                    FilterPart::SizeMismatch
                ],
            }
        );

        let (applied, inactive) =
            spec.applicable(&[Field::ReleaseDate, Field::ModelSize], &["Area".into()]);
        assert_eq!(applied.released, DateRange::default());
        assert_eq!(applied.created, spec.created);
        assert_eq!(
            inactive,
            Inactive {
                dims: vec![Dim::ModelSize],
                parts: vec![FilterPart::Released, FilterPart::SizeMismatch],
            }
        );
    }

    #[test]
    fn applicable_keeps_the_filter_whole_when_the_snapshot_has_its_columns() {
        let spec = every_kind();
        let (applied, inactive) =
            spec.applicable(&[Field::SourceId, Field::StressCalc], &["Area".into()]);
        assert_eq!(applied, spec);
        assert_eq!(inactive, Inactive::default());
        // A part that is not set is not inactive, whatever the snapshot lacks; nor is an entry
        // without values, which filters nothing.
        let (applied, inactive) = FilterSpec::default().applicable(&Field::ALL, &[]);
        assert_eq!(applied, FilterSpec::default());
        assert_eq!(inactive, Inactive::default());
        let role = field(Dim::Role, &[], false);
        assert_eq!(
            role.applicable(&[Field::Role], &[]),
            (role.clone(), Inactive::default())
        );
    }

    #[test]
    fn an_applicable_filter_keeps_what_the_filter_without_its_inactive_parts_keeps() {
        // Every hold of the sample has a discipline: with Discipline said to be absent the
        // filter on it is left out, so the rows kept are those of the rest of the filter.
        let spec = FilterSpec {
            fields: vec![
                entry(Dim::Discipline, &["Nothing"], false),
                entry(Dim::HoldType, &["P&ID"], false),
            ],
            ..Default::default()
        };
        assert_eq!(count(&spec), 0);
        let (applied, _) = spec.applicable(&[Field::Discipline], &[]);
        assert_eq!(
            count(&applied),
            count(&field(Dim::HoldType, &["P&ID"], false))
        );
    }
}
