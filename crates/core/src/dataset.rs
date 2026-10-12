//! Holds of one snapshot with their derived values.

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

use crate::mapping::Field;
use crate::model::Hold;
use crate::normalize::{fold_key, DASH, UNSPECIFIED};
use crate::rules::{Blocker, RuleSet};

/// A hold with the values derived from it for one snapshot.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Row {
    /// The hold as imported.
    pub hold: Hold,
    /// The blocker derived from the hold's remark.
    pub blocker: Blocker,
    /// Case-folded remark, for grouping.
    pub remark_key: String,
    /// Open holds only: calendar days from creation to the snapshot.
    pub age_days: Option<i64>,
    /// Released holds only: calendar days from creation to release.
    pub duration_days: Option<i64>,
}

impl Row {
    /// `age_days` for an open hold, `duration_days` for a released one.
    pub fn days(&self) -> Option<i64> {
        if self.hold.released {
            self.duration_days
        } else {
            self.age_days
        }
    }

    /// Blocker identity: owning discipline plus item.
    pub fn blocker_key(&self) -> String {
        format!("{}|{}", self.hold.discipline, self.blocker.item)
    }

    /// True when the hold has both a model size and an LDT size and they differ.
    pub fn size_mismatch(&self) -> bool {
        matches!((self.hold.model_size, self.hold.ldt_size), (Some(a), Some(b)) if a != b)
    }
}

/// The rows of one snapshot, in file order.
#[derive(Debug, Clone, PartialEq)]
pub struct Dataset {
    /// The moment open holds are aged against.
    pub snapshot: NaiveDateTime,
    /// In file order. Several queries depend on first-appearance order.
    pub rows: Vec<Row>,
}

impl Dataset {
    /// Derives a [`Row`] for every hold, keeping their order. Age and duration count calendar
    /// days (time of day ignored) and are never negative; they are `None` when the hold has no
    /// creation date, or, for a released hold, no release date.
    pub fn build(holds: Vec<Hold>, rules: &RuleSet, snapshot: NaiveDateTime) -> Dataset {
        let rows = holds
            .into_iter()
            .map(|hold| {
                let end = if hold.released {
                    hold.release_date
                } else {
                    Some(snapshot)
                };
                let elapsed = match (hold.created, end) {
                    (Some(created), Some(end)) => {
                        Some((end.date() - created.date()).num_days().max(0))
                    }
                    _ => None,
                };
                Row {
                    blocker: rules.classify(&hold.remark),
                    remark_key: fold_key(&hold.remark),
                    age_days: if hold.released { None } else { elapsed },
                    duration_days: if hold.released { elapsed } else { None },
                    hold,
                }
            })
            .collect();
        Dataset { snapshot, rows }
    }

    /// The distinct keys of `Hold::extra` over all rows, sorted: the custom dimensions the file
    /// supplies.
    pub fn custom_dims(&self) -> Vec<String> {
        let keys: std::collections::BTreeSet<&String> = self
            .rows
            .iter()
            .flat_map(|row| row.hold.extra.keys())
            .collect();
        keys.into_iter().cloned().collect()
    }

    /// The optional fields no row has a value for, in the order of `mapping::Field`: `SourceId`
    /// when no hold has one, `Released` when no hold is released, `Name`, `Role`, and
    /// `Discipline` when every row has the blank spelling, and so on for the others.
    pub fn absent_fields(&self) -> Vec<Field> {
        Field::ALL
            .into_iter()
            .filter(|field| !Field::REQUIRED.contains(field))
            .filter(|field| !self.rows.iter().any(|row| has_value(*field, &row.hold)))
            .collect()
    }
}

/// Whether `hold` has a value for `field`, the blank spellings of an import counting as none.
fn has_value(field: Field, hold: &Hold) -> bool {
    match field {
        Field::SourceId => hold.source_id.is_some(),
        Field::Name => hold.name != DASH,
        Field::Role => hold.role != DASH,
        Field::Discipline => hold.discipline != UNSPECIFIED,
        Field::Created => hold.created.is_some(),
        Field::Released => hold.released,
        Field::ReleaseRemark => !hold.release_remark.is_empty(),
        Field::ReleaseDate => hold.release_date.is_some(),
        Field::ModelSize => hold.model_size.is_some(),
        Field::LdtSize => hold.ldt_size.is_some(),
        Field::StressCalc => !hold.stress_calc.is_empty(),
        Field::LineId | Field::Remark | Field::HoldType => true,
    }
}

#[cfg(test)]
mod tests {
    use crate::testkit::sample;

    #[test]
    fn derives_blocker_key_and_remark_key() {
        let ds = sample();
        assert_eq!(ds.rows[0].blocker.kind, "PR");
        assert_eq!(ds.rows[0].blocker_key(), "Civil|538-PR-100");
        assert_eq!(ds.rows[1].blocker_key(), "Piping|P&ID");
        assert_eq!(ds.rows[4].blocker_key(), "Unspecified|VENDOR");
        assert_eq!(ds.rows[0].remark_key, "PENDING 538-PR-100");
    }

    #[test]
    fn age_runs_to_snapshot_for_open_and_to_release_for_released() {
        let ds = sample();
        let days: Vec<Option<i64>> = ds.rows.iter().map(|r| r.days()).collect();
        assert_eq!(days, vec![Some(10), Some(40), Some(5), Some(30), Some(1)]);
    }

    #[test]
    fn open_rows_have_an_age_and_no_duration() {
        let ds = sample();
        let open: Vec<&crate::dataset::Row> = ds.rows.iter().filter(|r| !r.hold.released).collect();
        let ages: Vec<Option<i64>> = open.iter().map(|r| r.age_days).collect();
        assert_eq!(ages, vec![Some(10), Some(40), Some(5), Some(1)]);
        assert!(open.iter().all(|r| r.duration_days.is_none()));
    }

    #[test]
    fn released_row_has_a_duration_and_no_age() {
        let ds = sample();
        let r = &ds.rows[3];
        assert_eq!(r.age_days, None);
        assert_eq!(r.duration_days, Some(30));
        assert_eq!(r.days(), Some(30));
    }

    #[test]
    fn age_is_unknown_without_a_creation_date() {
        let mut ds = sample();
        ds.rows[0].hold.created = None;
        let rebuilt = super::Dataset::build(
            ds.rows.iter().map(|r| r.hold.clone()).collect(),
            crate::rules::RuleSet::builtin(),
            ds.snapshot,
        );
        assert_eq!(rebuilt.rows[0].days(), None);
    }

    fn age_of(mut hold: crate::model::Hold, snapshot: &str) -> Option<i64> {
        hold.remark = "x".to_string();
        let ds = super::Dataset::build(
            vec![hold],
            crate::rules::RuleSet::builtin(),
            crate::testkit::at(snapshot),
        );
        ds.rows[0].days()
    }

    #[test]
    fn open_age_counts_calendar_days() {
        let mut h = crate::testkit::hold("L1", "Civil", "MISC.", "x", 0);
        h.created = Some(crate::testkit::at("2026-09-30 18:00:00"));
        assert_eq!(age_of(h, "2026-10-01 13:00:00"), Some(1));
    }

    #[test]
    fn released_duration_counts_calendar_days() {
        let mut h = crate::testkit::hold("L1", "Civil", "MISC.", "x", 0);
        h.created = Some(crate::testkit::at("2026-09-01 23:30:00"));
        h.released = true;
        h.release_date = Some(crate::testkit::at("2026-09-03 00:10:00"));
        assert_eq!(age_of(h, "2026-10-01 00:00:00"), Some(2));
    }

    #[test]
    fn hold_created_after_the_snapshot_has_age_zero() {
        let mut h = crate::testkit::hold("L1", "Civil", "MISC.", "x", 0);
        h.created = Some(crate::testkit::at("2026-10-05 09:00:00"));
        assert_eq!(age_of(h, "2026-10-01 13:00:00"), Some(0));
    }

    #[test]
    fn size_mismatch_needs_both_sizes() {
        let ds = sample();
        assert!(ds.rows[4].size_mismatch());
        assert!(!ds.rows[0].size_mismatch());
    }

    #[test]
    fn custom_dims_lists_distinct_extra_keys_sorted() {
        let mut ds = sample();
        ds.rows[0].hold.extra.insert("Zone".into(), "a".into());
        ds.rows[1].hold.extra.insert("Area".into(), "b".into());
        ds.rows[2].hold.extra.insert("Zone".into(), "c".into());
        assert_eq!(ds.custom_dims(), vec!["Area", "Zone"]);
        assert!(sample().custom_dims().is_empty());
    }

    fn full_hold(line: &str) -> crate::model::Hold {
        let mut h = crate::testkit::hold(line, "Civil", "MISC.", "x", 3);
        h.source_id = Some(1);
        h.released = true;
        h.release_remark = "done".to_string();
        h.release_date = Some(crate::testkit::snapshot());
        h.model_size = Some(4.0);
        h.ldt_size = Some(4.0);
        h.stress_calc = "NR".to_string();
        h
    }

    fn build(holds: Vec<crate::model::Hold>) -> super::Dataset {
        super::Dataset::build(
            holds,
            crate::rules::RuleSet::builtin(),
            crate::testkit::snapshot(),
        )
    }

    #[test]
    fn absent_fields_lists_what_no_row_has_in_field_order() {
        use crate::mapping::Field;
        // `sample` has no id, no release remark, no release date on open rows... but one release.
        let ds = build(vec![
            crate::testkit::hold("L1", "Civil", "MISC.", "x", 3),
            crate::testkit::hold("L2", "Piping", "P&ID", "x", 4),
        ]);
        assert_eq!(
            ds.absent_fields(),
            vec![
                Field::SourceId,
                Field::Released,
                Field::ReleaseRemark,
                Field::ReleaseDate,
                Field::ModelSize,
                Field::LdtSize,
                Field::StressCalc
            ]
        );
    }

    #[test]
    fn absent_fields_is_empty_when_every_value_is_there() {
        assert!(build(vec![full_hold("L1")]).absent_fields().is_empty());
    }

    #[test]
    fn one_row_with_a_value_removes_its_field() {
        use crate::mapping::Field;
        let mut with_id = crate::testkit::hold("L2", "Civil", "MISC.", "x", 4);
        with_id.source_id = Some(7);
        with_id.model_size = Some(2.0);
        let ds = build(vec![
            crate::testkit::hold("L1", "Civil", "MISC.", "x", 3),
            with_id,
        ]);
        let absent = ds.absent_fields();
        assert!(!absent.contains(&Field::SourceId));
        assert!(!absent.contains(&Field::ModelSize));
        assert!(absent.contains(&Field::LdtSize));
    }

    #[test]
    fn blank_spellings_count_as_no_value() {
        use crate::mapping::Field;
        let mut h = full_hold("L1");
        h.name = crate::normalize::DASH.to_string();
        h.role = crate::normalize::DASH.to_string();
        h.discipline = crate::normalize::UNSPECIFIED.to_string();
        h.created = None;
        assert_eq!(
            build(vec![h.clone()]).absent_fields(),
            vec![Field::Name, Field::Role, Field::Discipline, Field::Created]
        );
        let mut named = h;
        named.name = "Alice".to_string();
        assert!(!build(vec![named]).absent_fields().contains(&Field::Name));
    }

    #[test]
    fn required_fields_are_never_absent() {
        use crate::mapping::Field;
        let mut h = crate::testkit::hold("", "Civil", "—", "", 3);
        h.line_id.clear();
        let absent = build(vec![h]).absent_fields();
        for field in Field::REQUIRED {
            assert!(!absent.contains(&field), "{field:?}");
        }
    }
}
