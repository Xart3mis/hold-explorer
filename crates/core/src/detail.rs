//! Everything about one line, for the detail panel.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::dataset::{Dataset, Row};
use crate::filter::{Dim, FilterSpec};
use crate::query::{blocker_label, label_for};
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

/// Another blocker on the lines of the one in view.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LinkedBlocker {
    /// `<discipline>|<item>`.
    pub key: String,
    /// `<discipline> / <item>`, as `Group::label` writes a blocker.
    pub label: String,
    /// Blocker type, such as `PR` or `P&ID`.
    pub kind: String,
    /// Lines both blockers are on.
    pub shared_lines: usize,
}

/// One blocker among the selected holds: what solving it frees and what it is tied to.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct BlockerDetail {
    /// `<discipline>|<item>`.
    pub key: String,
    /// `<discipline> / <item>`, as `Group::label` writes a blocker.
    pub label: String,
    /// Blocker type, such as `PR` or `P&ID`.
    pub kind: String,
    /// The discipline that owns the blocker.
    pub discipline: String,
    /// The specific thing waited for.
    pub item: String,
    /// Number of selected holds waiting for this blocker.
    pub holds: usize,
    /// Lines this blocker alone holds: solving it frees them. In order of first appearance.
    pub frees: Vec<String>,
    /// Lines it is on that other blockers also hold. In order of first appearance.
    pub shared: Vec<String>,
    /// Other blockers on its lines, most shared lines first, then by label.
    pub linked: Vec<LinkedBlocker>,
    /// Its oldest open hold; `None` when none has a creation date.
    pub oldest: Option<HoldRef>,
    /// One-based place in the solve order of the same holds; `None` when no step ranks it.
    pub step: Option<usize>,
}

/// The detail of one blocker among the holds `spec` keeps; `None` when no kept hold has it.
/// `plan` is the solve plan of the same holds.
pub fn blocker_detail(
    ds: &Dataset,
    spec: &FilterSpec,
    plan: &SolvePlan,
    key: &str,
) -> Option<BlockerDetail> {
    let kept = || {
        ds.rows
            .iter()
            .enumerate()
            .filter(|(_, row)| spec.matches(row))
    };
    let mut first: Option<&Row> = None;
    let mut holds = 0;
    let mut lines: Vec<&str> = Vec::new();
    let mut on_blocker: HashSet<&str> = HashSet::new();
    let mut oldest: Option<(i64, usize)> = None;
    for (position, row) in kept().filter(|(_, row)| row.blocker_key() == key) {
        first.get_or_insert(row);
        holds += 1;
        if on_blocker.insert(row.hold.line_id.as_str()) {
            lines.push(row.hold.line_id.as_str());
        }
        if let Some(age) = row.age_days.filter(|_| !row.hold.released) {
            if oldest.is_none_or(|(best, _)| age > best) {
                oldest = Some((age, position));
            }
        }
    }
    let first = first?;

    // Other blockers on the same lines, with the lines they share with this one.
    let mut others: HashMap<String, (LinkedBlocker, HashSet<&str>)> = HashMap::new();
    for (_, row) in kept() {
        let other = row.blocker_key();
        if other == key || !on_blocker.contains(row.hold.line_id.as_str()) {
            continue;
        }
        let entry = others.entry(other).or_insert_with_key(|other| {
            let linked = LinkedBlocker {
                key: other.clone(),
                label: blocker_label(&row.hold.discipline, &row.blocker.item),
                kind: row.blocker.kind.clone(),
                shared_lines: 0,
            };
            (linked, HashSet::new())
        });
        entry.1.insert(row.hold.line_id.as_str());
    }
    let held_by_others: HashSet<&str> = others
        .values()
        .flat_map(|(_, shared)| shared.iter().copied())
        .collect();
    let (shared, frees): (Vec<&str>, Vec<&str>) = lines
        .iter()
        .partition(|line| held_by_others.contains(**line));
    let mut linked: Vec<LinkedBlocker> = others
        .into_values()
        .map(|(mut linked, shared)| {
            linked.shared_lines = shared.len();
            linked
        })
        .collect();
    linked.sort_by(|a, b| {
        b.shared_lines
            .cmp(&a.shared_lines)
            .then_with(|| a.label.cmp(&b.label))
            .then_with(|| a.key.cmp(&b.key))
    });

    Some(BlockerDetail {
        key: key.to_string(),
        label: blocker_label(&first.hold.discipline, &first.blocker.item),
        kind: first.blocker.kind.clone(),
        discipline: first.hold.discipline.clone(),
        item: first.blocker.item.clone(),
        holds,
        frees: frees.into_iter().map(str::to_string).collect(),
        shared: shared.into_iter().map(str::to_string).collect(),
        linked,
        oldest: oldest.map(|(_, position)| HoldRef {
            position,
            row: ds.rows[position].clone(),
        }),
        step: plan
            .steps
            .iter()
            .position(|step| step.key == key)
            .map(|index| index + 1),
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
    use crate::filter::{FilterSpec, Status};
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

    fn spec_of(status: Status) -> FilterSpec {
        FilterSpec {
            status,
            ..Default::default()
        }
    }

    #[test]
    fn a_blocker_alone_on_a_line_frees_it_and_a_shared_one_is_linked() {
        let ds = snapshot_of_lines();
        let spec = spec_of(Status::Open);
        let plan = solve_plan(&ds, &spec, None);
        let a = blocker_detail(&ds, &spec, &plan, "Civil|538-PR-100").unwrap();
        assert_eq!(a.label, "Civil / 538-PR-100");
        assert_eq!(
            (a.kind.as_str(), a.discipline.as_str(), a.item.as_str()),
            ("PR", "Civil", "538-PR-100")
        );
        assert_eq!(a.holds, 3);
        assert_eq!(a.frees, vec!["Y", "Z"]);
        assert_eq!(a.shared, vec!["X"]);
        let linked: Vec<_> = a
            .linked
            .iter()
            .map(|l| {
                (
                    l.key.as_str(),
                    l.label.as_str(),
                    l.kind.as_str(),
                    l.shared_lines,
                )
            })
            .collect();
        assert_eq!(
            linked,
            vec![
                ("Civil|538-PR-200", "Civil / 538-PR-200", "PR", 1),
                ("Piping|P&ID", "Piping / P&ID", "P&ID", 1),
            ]
        );
        assert_eq!(a.step, Some(1));
        let oldest = a.oldest.unwrap();
        assert_eq!(oldest.position, 3);

        let b = blocker_detail(&ds, &spec, &plan, "Civil|538-PR-200").unwrap();
        assert_eq!(
            (b.frees.as_slice(), b.shared.as_slice()),
            (&["W".to_string()][..], &["X".to_string()][..])
        );
        assert_eq!(b.oldest.unwrap().position, 2);
        assert_eq!(b.step, Some(2));
    }

    #[test]
    fn linked_blockers_are_ordered_by_shared_lines_then_label() {
        let ds = Dataset::build(
            vec![
                hold("1", "Civil", "MISC.", "Pending 538-PR-100", 1),
                hold("1", "Civil", "MISC.", "Pending 538-PR-300", 1),
                hold("2", "Civil", "MISC.", "Pending 538-PR-100", 1),
                hold("2", "Civil", "MISC.", "Pending 538-PR-300", 1),
                hold("2", "Civil", "MISC.", "Pending 538-PR-200", 1),
                hold("3", "Civil", "MISC.", "Pending 538-PR-100", 1),
                hold("3", "Civil", "MISC.", "Pending 538-PR-200", 1),
            ],
            RuleSet::builtin(),
            snapshot(),
        );
        let spec = FilterSpec::default();
        let plan = solve_plan(&ds, &spec, None);
        let a = blocker_detail(&ds, &spec, &plan, "Civil|538-PR-100").unwrap();
        let linked: Vec<_> = a
            .linked
            .iter()
            .map(|l| (l.key.as_str(), l.shared_lines))
            .collect();
        assert_eq!(
            linked,
            vec![("Civil|538-PR-200", 2), ("Civil|538-PR-300", 2)]
        );
    }

    #[test]
    fn the_oldest_hold_has_the_greatest_age_and_none_without_dates() {
        let mut undated = hold("U", "Civil", "MISC.", "Pending 538-PR-900", 1);
        undated.created = None;
        let ds = Dataset::build(
            vec![
                hold("A", "Civil", "MISC.", "Pending 538-PR-100", 5),
                hold("B", "Civil", "MISC.", "Pending 538-PR-100", 30),
                hold("C", "Civil", "MISC.", "Pending 538-PR-100", 12),
                undated,
            ],
            RuleSet::builtin(),
            snapshot(),
        );
        let spec = FilterSpec::default();
        let plan = solve_plan(&ds, &spec, None);
        let a = blocker_detail(&ds, &spec, &plan, "Civil|538-PR-100").unwrap();
        assert_eq!(a.oldest.unwrap().position, 1);
        let u = blocker_detail(&ds, &spec, &plan, "Civil|538-PR-900").unwrap();
        assert_eq!(u.oldest, None);
    }

    #[test]
    fn an_unknown_blocker_or_one_the_filter_removes_has_no_detail() {
        let ds = snapshot_of_lines();
        let spec = spec_of(Status::Open);
        let plan = solve_plan(&ds, &spec, None);
        assert_eq!(blocker_detail(&ds, &spec, &plan, "nope|nothing"), None);
        let released = spec_of(Status::Released);
        let plan = solve_plan(&ds, &released, None);
        assert_eq!(
            blocker_detail(&ds, &released, &plan, "Civil|538-PR-100"),
            None
        );
    }

    #[test]
    fn a_blocker_without_a_step_has_no_place() {
        let ds = snapshot_of_lines();
        let spec = spec_of(Status::Open);
        let cut = solve_plan(&ds, &spec, Some(1));
        let b = blocker_detail(&ds, &spec, &cut, "Civil|538-PR-200").unwrap();
        assert_eq!(b.step, None);
    }
}
