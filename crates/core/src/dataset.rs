//! Holds of one snapshot with their derived values.

use chrono::NaiveDateTime;
use serde::Serialize;

use crate::model::Hold;
use crate::normalize::fold_key;
use crate::rules::{Blocker, RuleSet};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Row {
    pub hold: Hold,
    pub blocker: Blocker,
    /// Case-folded remark, for grouping.
    pub remark_key: String,
    /// Open: days from creation to the snapshot. Released: days from creation to release.
    pub age_days: Option<i64>,
}

impl Row {
    /// Blocker identity: owning discipline plus item.
    pub fn blocker_key(&self) -> String {
        format!("{}|{}", self.hold.discipline, self.blocker.item)
    }

    pub fn size_mismatch(&self) -> bool {
        matches!((self.hold.model_size, self.hold.ldt_size), (Some(a), Some(b)) if a != b)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Dataset {
    pub snapshot: NaiveDateTime,
    /// In file order. Several queries depend on first-appearance order.
    pub rows: Vec<Row>,
}

impl Dataset {
    pub fn build(holds: Vec<Hold>, rules: &RuleSet, snapshot: NaiveDateTime) -> Dataset {
        let rows = holds
            .into_iter()
            .map(|hold| {
                let end = if hold.released {
                    hold.release_date
                } else {
                    Some(snapshot)
                };
                let age_days = match (hold.created, end) {
                    (Some(created), Some(end)) => Some((end - created).num_days().max(0)),
                    _ => None,
                };
                Row {
                    blocker: rules.classify(&hold.remark),
                    remark_key: fold_key(&hold.remark),
                    age_days,
                    hold,
                }
            })
            .collect();
        Dataset { snapshot, rows }
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
        let ages: Vec<Option<i64>> = ds.rows.iter().map(|r| r.age_days).collect();
        assert_eq!(ages, vec![Some(10), Some(40), Some(5), Some(30), Some(1)]);
    }

    #[test]
    fn age_is_unknown_without_a_creation_date() {
        let mut ds = sample();
        ds.rows[0].hold.created = None;
        let rebuilt = super::Dataset::build(
            ds.rows.iter().map(|r| r.hold.clone()).collect(),
            &crate::rules::RuleSet::builtin(),
            ds.snapshot,
        );
        assert_eq!(rebuilt.rows[0].age_days, None);
    }

    #[test]
    fn size_mismatch_needs_both_sizes() {
        let ds = sample();
        assert!(ds.rows[4].size_mismatch());
        assert!(!ds.rows[0].size_mismatch());
    }
}
