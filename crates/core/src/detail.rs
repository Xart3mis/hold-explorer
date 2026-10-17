//! Everything about one line, for the detail panel.

use std::collections::HashMap;

use serde::Serialize;

use crate::dataset::{Dataset, Row};
use crate::filter::Dim;
use crate::query::label_for;
use crate::solve::SolvePlan;

/// A hold with its position in the snapshot, by which the interface asks for it again.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HoldRef {
    /// The position of the hold in `Dataset::rows`.
    pub position: usize,
    /// The hold with its derived values.
    pub row: Row,
}

/// One blocker of a line, and where it stands in the solve order.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ChainLink {
    /// `<discipline>|<item>`.
    pub key: String,
    /// `<discipline> / <item>`, as `Group::label` writes a blocker.
    pub label: String,
    /// Blocker type, such as `PR` or `P&ID`.
    pub kind: String,
    /// One-based place of the blocker in `plan.steps`; `None` when the plan has no step for it.
    pub step: Option<usize>,
    /// Lines the blocker is on, in the whole snapshot.
    pub lines: usize,
}

/// One line with its holds and the blockers that keep it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LineDetail {
    /// The line.
    pub line_id: String,
    /// Model size of the line's first open hold, or of its first hold when none is open.
    pub model_size: Option<f64>,
    /// LDT size, taken from the same hold.
    pub ldt_size: Option<f64>,
    /// Stress calculation, taken from the same hold.
    pub stress_calc: String,
    /// Whether that hold has differing model and LDT sizes.
    pub size_mismatch: bool,
    /// The open holds, in file order.
    pub open: Vec<HoldRef>,
    /// The released holds, in file order.
    pub released: Vec<HoldRef>,
    /// Each distinct blocker of the open holds once: those with a step first, by step; the
    /// others after, in order of first appearance.
    pub chain: Vec<ChainLink>,
}

/// Everything about one line; `None` when no hold of the snapshot is on it. `plan` is the solve
/// plan of the open holds of `ds` with no other filter and no step limit.
pub fn line_detail(ds: &Dataset, plan: &SolvePlan, line_id: &str) -> Option<LineDetail> {
    let on_line: Vec<(usize, &Row)> = ds
        .rows
        .iter()
        .enumerate()
        .filter(|(_, row)| row.hold.line_id == line_id)
        .collect();
    let (open, released): (Vec<_>, Vec<_>) = on_line
        .iter()
        .copied()
        .partition(|(_, row)| !row.hold.released);
    let (_, first) = open.first().or(on_line.first())?;

    let steps: HashMap<&str, usize> = plan
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| (step.key.as_str(), index + 1))
        .collect();
    let mut chain: Vec<ChainLink> = Vec::new();
    for (_, row) in &open {
        let key = row.blocker_key();
        if chain.iter().any(|link| link.key == key) {
            continue;
        }
        // The plan has no node for the blocker only when it was built from another filter than
        // the open holds of `ds`, which the contract of this function excludes.
        let lines = match plan.nodes.iter().find(|node| node.key == key) {
            Some(node) => node.lines.len(),
            None => lines_with_open_blocker(ds, &key),
        };
        chain.push(ChainLink {
            label: label_for(&Dim::Blocker, &key, row),
            kind: row.blocker.kind.clone(),
            step: steps.get(key.as_str()).copied(),
            lines,
            key,
        });
    }
    chain.sort_by_key(|link| (link.step.is_none(), link.step));

    let hold_ref = |&(position, row): &(usize, &Row)| HoldRef {
        position,
        row: row.clone(),
    };
    Some(LineDetail {
        line_id: line_id.to_string(),
        model_size: first.hold.model_size,
        ldt_size: first.hold.ldt_size,
        stress_calc: first.hold.stress_calc.clone(),
        size_mismatch: first.size_mismatch(),
        open: open.iter().map(hold_ref).collect(),
        released: released.iter().map(hold_ref).collect(),
        chain,
    })
}

/// Distinct lines of the snapshot with an open hold waiting for the blocker `key`.
fn lines_with_open_blocker(ds: &Dataset, key: &str) -> usize {
    let mut lines: Vec<&str> = ds
        .rows
        .iter()
        .filter(|row| !row.hold.released && row.blocker_key() == key)
        .map(|row| row.hold.line_id.as_str())
        .collect();
    lines.sort_unstable();
    lines.dedup();
    lines.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filter::FilterSpec;
    use crate::rules::RuleSet;
    use crate::solve::solve_plan;
    use crate::testkit::{hold, snapshot};

    /// Positions 0 to 6. Line X: a released hold, then open holds waiting for C, B, and A in that
    /// order. A is on X, Y, and Z; B on X and W; C on X alone. Solve order: A, B, C.
    fn snapshot_of_lines() -> Dataset {
        let mut released = hold("X", "Piping", "MISC.", "P&ID update", 50);
        released.released = true;
        released.release_date = Some(snapshot());
        released.model_size = Some(1.0);
        released.ldt_size = Some(1.0);
        released.stress_calc = "R".to_string();
        let mut first_open = hold("X", "Piping", "MISC.", "P&ID update", 9);
        first_open.model_size = Some(8.0);
        first_open.ldt_size = Some(10.0);
        first_open.stress_calc = "S1".to_string();
        Dataset::build(
            vec![
                released,
                first_open,
                hold("X", "Civil", "MISC.", "Pending 538-PR-200", 8),
                hold("X", "Civil", "MISC.", "Pending 538-PR-100", 7),
                hold("Y", "Civil", "MISC.", "Pending 538-PR-100", 6),
                hold("Z", "Civil", "MISC.", "Pending 538-PR-100", 5),
                hold("W", "Civil", "MISC.", "Pending 538-PR-200", 4),
            ],
            RuleSet::builtin(),
            snapshot(),
        )
    }

    fn plan(ds: &Dataset, steps: Option<usize>) -> SolvePlan {
        solve_plan(ds, &FilterSpec::default(), steps)
    }

    #[test]
    fn an_unknown_line_has_no_detail() {
        let ds = snapshot_of_lines();
        assert_eq!(line_detail(&ds, &plan(&ds, None), "nope"), None);
    }

    #[test]
    fn open_and_released_holds_are_split_in_file_order_with_true_positions() {
        let ds = snapshot_of_lines();
        let detail = line_detail(&ds, &plan(&ds, None), "X").unwrap();
        let positions = |holds: &[HoldRef]| holds.iter().map(|h| h.position).collect::<Vec<_>>();
        assert_eq!(positions(&detail.open), vec![1, 2, 3]);
        assert_eq!(positions(&detail.released), vec![0]);
        for hold in detail.open.iter().chain(&detail.released) {
            assert_eq!(hold.row, ds.rows[hold.position]);
        }
    }

    #[test]
    fn attributes_follow_the_first_open_hold() {
        let ds = snapshot_of_lines();
        let detail = line_detail(&ds, &plan(&ds, None), "X").unwrap();
        assert_eq!(detail.line_id, "X");
        assert_eq!(detail.model_size, Some(8.0));
        assert_eq!(detail.ldt_size, Some(10.0));
        assert_eq!(detail.stress_calc, "S1");
        assert!(detail.size_mismatch);
    }

    #[test]
    fn the_chain_is_in_step_order_with_the_stepless_blocker_last() {
        let ds = snapshot_of_lines();
        let full = line_detail(&ds, &plan(&ds, None), "X").unwrap();
        let brief: Vec<_> = full
            .chain
            .iter()
            .map(|c| (c.key.as_str(), c.step, c.lines))
            .collect();
        assert_eq!(
            brief,
            vec![
                ("Civil|538-PR-100", Some(1), 3),
                ("Civil|538-PR-200", Some(2), 2),
                ("Piping|P&ID", Some(3), 1),
            ]
        );
        assert_eq!(full.chain[0].label, "Civil / 538-PR-100");
        assert_eq!(full.chain[2].kind, "P&ID");

        let cut = line_detail(&ds, &plan(&ds, Some(2)), "X").unwrap();
        let steps: Vec<_> = cut.chain.iter().map(|c| c.step).collect();
        assert_eq!(steps, vec![Some(1), Some(2), None]);
        assert_eq!(cut.chain[2].key, "Piping|P&ID");
    }

    #[test]
    fn a_blocker_missing_from_the_plan_is_counted_from_the_snapshot() {
        let ds = snapshot_of_lines();
        let empty = SolvePlan {
            nodes: Vec::new(),
            steps: Vec::new(),
        };
        let detail = line_detail(&ds, &empty, "X").unwrap();
        let keys: Vec<_> = detail
            .chain
            .iter()
            .map(|c| (c.key.as_str(), c.lines))
            .collect();
        assert_eq!(
            keys,
            vec![
                ("Piping|P&ID", 1),
                ("Civil|538-PR-200", 2),
                ("Civil|538-PR-100", 3)
            ]
        );
    }

    #[test]
    fn a_line_with_only_released_holds_has_an_empty_chain() {
        let mut only = hold("V", "Civil", "MISC.", "Pending 538-PR-100", 20);
        only.released = true;
        only.release_date = Some(snapshot());
        only.model_size = Some(2.0);
        let ds = Dataset::build(vec![only], RuleSet::builtin(), snapshot());
        let detail = line_detail(&ds, &plan(&ds, None), "V").unwrap();
        assert!(detail.open.is_empty() && detail.chain.is_empty());
        assert_eq!(detail.released.len(), 1);
        assert_eq!(detail.model_size, Some(2.0));
    }
}
