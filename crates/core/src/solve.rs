//! Which blockers to solve first.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::dataset::Dataset;
use crate::filter::FilterSpec;

/// One blocker among the selected holds, with the lines it is on.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct BlockerNode {
    /// `<discipline>|<item>`.
    pub key: String,
    /// The discipline that owns the blocker (the discipline of its holds).
    pub discipline: String,
    /// Blocker type, such as `PR` or `P&ID`.
    pub kind: String,
    /// The specific thing waited for.
    pub item: String,
    /// Number of selected holds waiting for this blocker.
    pub holds: usize,
    /// Lines this blocker is on, in order of first appearance.
    pub lines: Vec<String>,
}

impl BlockerNode {
    /// How the blocker is written for display: `<discipline> / <item>`.
    pub fn blocker_label(&self) -> String {
        crate::query::blocker_label(&self.discipline, &self.item)
    }
}

/// One blocker to solve, in plan order.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Step {
    /// The `key` of the blocker solved in this step.
    pub key: String,
    /// Lines freed by this step.
    pub gain: usize,
    /// Lines freed by this step and all steps before it.
    pub cumulative: usize,
    /// The lines freed by this step, in the order of the blocker's `lines`.
    pub freed: Vec<String>,
}

/// The order in which to solve blockers, and every blocker it is drawn from.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SolvePlan {
    /// Every blocker, in order of first appearance.
    pub nodes: Vec<BlockerNode>,
    /// The blockers to solve, in order.
    pub steps: Vec<Step>,
}

/// Plans which blockers of the selected holds to solve first, one greedy step at a time. Each
/// step picks the blocker that frees the most lines (a line is freed when none of its blockers
/// remain), breaking ties by a score that favors blockers sharing lines with few other
/// blockers; remaining ties go to the blocker that appeared first. Stops after `max_steps`
/// steps (`None` for no limit) or when no blocker makes progress.
pub fn solve_plan(ds: &Dataset, spec: &FilterSpec, max_steps: Option<usize>) -> SolvePlan {
    let mut nodes: Vec<BlockerNode> = Vec::new();
    let mut node_index: HashMap<String, usize> = HashMap::new();
    let mut node_lines: Vec<Vec<usize>> = Vec::new();

    // The original tool iterates JavaScript object keys, where integer-like keys sort first,
    // so a purely numeric line ID could order differently there.
    let mut line_ids: Vec<String> = Vec::new();
    let mut line_index: HashMap<String, usize> = HashMap::new();
    let mut line_nodes: Vec<Vec<usize>> = Vec::new();

    for row in ds.rows.iter().filter(|row| spec.matches(row)) {
        let key = row.blocker_key();
        let node = match node_index.get(&key) {
            Some(&existing) => existing,
            None => {
                nodes.push(BlockerNode {
                    key: key.clone(),
                    discipline: row.hold.discipline.clone(),
                    kind: row.blocker.kind.clone(),
                    item: row.blocker.item.clone(),
                    holds: 0,
                    lines: Vec::new(),
                });
                node_lines.push(Vec::new());
                node_index.insert(key, nodes.len() - 1);
                nodes.len() - 1
            }
        };
        nodes[node].holds += 1;

        let line = match line_index.get(&row.hold.line_id) {
            Some(&existing) => existing,
            None => {
                line_ids.push(row.hold.line_id.clone());
                line_nodes.push(Vec::new());
                line_index.insert(row.hold.line_id.clone(), line_ids.len() - 1);
                line_ids.len() - 1
            }
        };
        if !line_nodes[line].contains(&node) {
            line_nodes[line].push(node);
            node_lines[node].push(line);
        }
    }

    for (node, lines) in nodes.iter_mut().zip(&node_lines) {
        node.lines = lines.iter().map(|&l| line_ids[l].clone()).collect();
    }

    // Unsolved blockers left on each line.
    let mut remaining: Vec<usize> = line_nodes.iter().map(Vec::len).collect();
    let mut freed = vec![false; line_ids.len()];
    let mut solved = vec![false; nodes.len()];
    let mut steps: Vec<Step> = Vec::new();
    let mut cumulative = 0;
    let limit = max_steps.unwrap_or(nodes.len());

    while steps.len() < limit {
        let mut best: Option<usize> = None;
        let mut best_gain = 0usize;
        let mut best_score = 0.0_f64;
        for (node, lines) in node_lines.iter().enumerate() {
            if solved[node] {
                continue;
            }
            let mut gain = 0usize;
            let mut partial = 0.0_f64;
            for &line in lines {
                if freed[line] {
                    continue;
                }
                if remaining[line] == 1 {
                    gain += 1;
                } else {
                    partial += 1.0 / remaining[line] as f64;
                }
            }
            // Most lines freed first, then the original tool's score `gain * 1000 + partial`,
            // which absorbs last-bit differences in `partial`. Strictly greater: on a tie the
            // earlier blocker keeps the lead, and a blocker with neither is never chosen.
            let score = gain as f64 * 1000.0 + partial;
            if gain > best_gain || (gain == best_gain && score > best_score) {
                best_gain = gain;
                best_score = score;
                best = Some(node);
            }
        }
        let Some(node) = best else { break };

        let mut freed_now = Vec::new();
        for &line in &node_lines[node] {
            remaining[line] -= 1;
            if remaining[line] == 0 && !freed[line] {
                freed[line] = true;
                freed_now.push(line_ids[line].clone());
            }
        }
        solved[node] = true;
        cumulative += freed_now.len();
        steps.push(Step {
            key: nodes[node].key.clone(),
            gain: freed_now.len(),
            cumulative,
            freed: freed_now,
        });
    }

    SolvePlan { nodes, steps }
}

/// One step of the solve order with what the interface shows of its blocker.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SolveRow {
    /// One-based place of the step in the plan.
    pub step: usize,
    /// `<discipline>|<item>`.
    pub key: String,
    /// `<discipline> / <item>`, as `Group::label` writes a blocker.
    pub label: String,
    /// Blocker type, such as `PR` or `P&ID`.
    pub kind: String,
    /// The discipline that owns the blocker.
    pub discipline: String,
    /// Number of selected holds waiting for this blocker.
    pub holds: usize,
    /// Lines freed by this step.
    pub gain: usize,
    /// Lines freed by this step and all steps before it.
    pub cumulative: usize,
}

/// The solve order of the selected holds as rows.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SolveView {
    /// The steps, in order.
    pub rows: Vec<SolveRow>,
    /// Lines on hold among the planned holds: the end the cumulative curve climbs to.
    pub lines_on_hold: usize,
    /// Steps after which 90 percent of `lines_on_hold` are freed; 0 when there is no line.
    pub steps_to_most: usize,
}

/// The solve order of `plan` as rows, each step with its blocker looked up. Give it a plan with
/// no step limit, or `lines_on_hold` is more than its steps free.
pub fn solve_view(plan: &SolvePlan) -> SolveView {
    let nodes: HashMap<&str, &BlockerNode> = plan
        .nodes
        .iter()
        .map(|node| (node.key.as_str(), node))
        .collect();
    let rows = plan
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| {
            let node = nodes
                .get(step.key.as_str())
                .expect("every step of a plan names a node of the same plan");
            SolveRow {
                step: index + 1,
                key: step.key.clone(),
                label: node.blocker_label(),
                kind: node.kind.clone(),
                discipline: node.discipline.clone(),
                holds: node.holds,
                gain: step.gain,
                cumulative: step.cumulative,
            }
        })
        .collect();
    let mut lines: HashSet<&str> = HashSet::new();
    for node in &plan.nodes {
        lines.extend(node.lines.iter().map(String::as_str));
    }
    let lines_on_hold = lines.len();
    // The first step whose cumulative count reaches 90 percent, in whole numbers.
    let steps_to_most = plan
        .steps
        .iter()
        .position(|step| step.cumulative * 10 >= lines_on_hold * 9)
        .map_or(plan.steps.len(), |index| index + 1);
    SolveView {
        rows,
        lines_on_hold,
        steps_to_most,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dataset::Dataset;
    use crate::filter::FilterSpec;
    use crate::query::summary;
    use crate::rules::RuleSet;
    use crate::testkit::{hold, sample, snapshot};

    /// L1 and L2 wait for A. L3 waits for A and B. L4 waits for B and C. L5 waits for C.
    fn chain() -> Dataset {
        let a = "Pending 538-PR-100";
        let b = "Pending 538-PR-200";
        let c = "Pending 538-PR-300";
        Dataset::build(
            vec![
                hold("L1", "Civil", "MISC.", a, 1),
                hold("L2", "Civil", "MISC.", a, 1),
                hold("L3", "Civil", "MISC.", a, 1),
                hold("L3", "Civil", "MISC.", b, 1),
                hold("L4", "Civil", "MISC.", b, 1),
                hold("L4", "Civil", "MISC.", c, 1),
                hold("L5", "Civil", "MISC.", c, 1),
            ],
            RuleSet::builtin(),
            snapshot(),
        )
    }

    fn brief(plan: &SolvePlan) -> Vec<(&str, usize, usize)> {
        plan.steps
            .iter()
            .map(|s| (s.key.as_str(), s.gain, s.cumulative))
            .collect()
    }

    #[test]
    fn nodes_keep_first_appearance_order_and_count_holds() {
        let plan = solve_plan(&chain(), &FilterSpec::default(), None);
        let nodes: Vec<(&str, usize, usize)> = plan
            .nodes
            .iter()
            .map(|n| (n.key.as_str(), n.holds, n.lines.len()))
            .collect();
        assert_eq!(
            nodes,
            vec![
                ("Civil|538-PR-100", 3, 3),
                ("Civil|538-PR-200", 2, 2),
                ("Civil|538-PR-300", 2, 2),
            ]
        );
        assert_eq!(plan.nodes[0].kind, "PR");
        assert_eq!(plan.nodes[0].lines, vec!["L1", "L2", "L3"]);
    }

    #[test]
    fn greedy_order_frees_most_lines_first_and_breaks_ties_by_appearance() {
        let plan = solve_plan(&chain(), &FilterSpec::default(), None);
        assert_eq!(
            brief(&plan),
            vec![
                ("Civil|538-PR-100", 2, 2),
                ("Civil|538-PR-200", 1, 3),
                ("Civil|538-PR-300", 2, 5),
            ]
        );
        assert_eq!(plan.steps[0].freed, vec!["L1", "L2"]);
        assert_eq!(plan.steps[1].freed, vec!["L3"]);
        assert_eq!(plan.steps[2].freed, vec!["L4", "L5"]);
    }

    #[test]
    fn max_steps_caps_the_plan() {
        let plan = solve_plan(&chain(), &FilterSpec::default(), Some(1));
        assert_eq!(brief(&plan), vec![("Civil|538-PR-100", 2, 2)]);
    }

    #[test]
    fn plan_follows_the_filter() {
        let plan = solve_plan(&sample(), &FilterSpec::default(), None);
        assert_eq!(
            brief(&plan),
            vec![
                ("Civil|538-PR-100", 1, 1),
                ("Piping|P&ID", 1, 2),
                ("Unspecified|VENDOR", 1, 3),
            ]
        );
    }

    #[test]
    fn empty_selection_gives_empty_plan() {
        let spec = FilterSpec {
            text: "no such text".into(),
            ..Default::default()
        };
        let plan = solve_plan(&sample(), &spec, None);
        assert!(plan.nodes.is_empty());
        assert!(plan.steps.is_empty());
    }

    #[test]
    fn lines_freed_outrank_partial_progress_on_very_large_selections() {
        let mut holds = Vec::new();
        for i in 0..2100 {
            let line = format!("L{i}");
            holds.push(hold(&line, "Civil", "MISC.", "Pending 538-PR-100", 1));
            holds.push(hold(&line, "Civil", "MISC.", "Pending 538-PR-200", 1));
        }
        holds.push(hold("SOLO-LINE", "Civil", "MISC.", "Pending 538-PR-300", 1));
        let ds = Dataset::build(holds, RuleSet::builtin(), snapshot());

        let plan = solve_plan(&ds, &FilterSpec::default(), Some(1));
        assert_eq!(brief(&plan), vec![("Civil|538-PR-300", 1, 1)]);
    }

    /// Blocker 100 is on four lines needing 2, 2, 3 and 7 blockers; blocker 101 is on four lines
    /// needing 7, 3, 2 and 2. Each also has a line of its own. The two partial sums differ by
    /// one rounding step, which the original's `gain * 1000 + partial` absorbs.
    #[test]
    fn partial_sums_that_differ_by_rounding_tie_like_the_original() {
        let mut holds = Vec::new();
        let mut next = 102;
        let mut add_line = |holds: &mut Vec<_>, line: String, blocker: u32, total: u32| {
            holds.push(hold(
                &line,
                "Civil",
                "MISC.",
                &format!("Pending 538-PR-{blocker}"),
                1,
            ));
            for _ in 1..total {
                holds.push(hold(
                    &line,
                    "Civil",
                    "MISC.",
                    &format!("Pending 538-PR-{next}"),
                    1,
                ));
                next += 1;
            }
        };
        for (i, total) in [2, 2, 3, 7].into_iter().enumerate() {
            add_line(&mut holds, format!("A{i}"), 100, total);
        }
        add_line(&mut holds, "A-SOLO".into(), 100, 1);
        for (i, total) in [7, 3, 2, 2].into_iter().enumerate() {
            add_line(&mut holds, format!("B{i}"), 101, total);
        }
        add_line(&mut holds, "B-SOLO".into(), 101, 1);
        let ds = Dataset::build(holds, RuleSet::builtin(), snapshot());

        let plan = solve_plan(&ds, &FilterSpec::default(), Some(1));
        assert_eq!(brief(&plan), vec![("Civil|538-PR-100", 1, 1)]);
    }

    #[test]
    fn the_solve_view_rows_are_the_plan_steps_with_labels() {
        let ds = chain();
        let spec = FilterSpec::default();
        let plan = solve_plan(&ds, &spec, None);
        let view = solve_view(&plan);
        assert_eq!(view.rows.len(), plan.steps.len());
        for (index, (row, step)) in view.rows.iter().zip(&plan.steps).enumerate() {
            let node = plan.nodes.iter().find(|n| n.key == step.key).unwrap();
            assert_eq!(row.step, index + 1);
            assert_eq!(row.key, step.key);
            assert_eq!(row.label, format!("{} / {}", node.discipline, node.item));
            assert_eq!(row.kind, node.kind);
            assert_eq!(row.discipline, node.discipline);
            assert_eq!(row.holds, node.holds);
            assert_eq!((row.gain, row.cumulative), (step.gain, step.cumulative));
        }
        assert_eq!(view.rows[0].label, "Civil / 538-PR-100");
        assert_eq!(view.lines_on_hold, summary(&ds, &spec).lines);
        assert_eq!(view.lines_on_hold, 5);
    }

    #[test]
    fn the_solve_view_of_nothing_is_empty() {
        let spec = FilterSpec {
            status: crate::filter::Status::Released,
            ..Default::default()
        };
        let view = solve_view(&solve_plan(&chain(), &spec, None));
        assert_eq!(
            (view.rows.len(), view.lines_on_hold, view.steps_to_most),
            (0, 0, 0)
        );
    }

    #[test]
    fn most_lines_are_freed_at_the_first_step_reaching_ninety_percent() {
        // The chain frees 2, then 3, then 5 of its 5 lines: 90 percent (4.5) needs all three.
        let view = solve_view(&solve_plan(&chain(), &FilterSpec::default(), None));
        assert_eq!(view.steps_to_most, 3);

        // One blocker on nine of ten lines frees exactly 90 percent at once; the last line, on
        // its own blocker, is the tail.
        let mut holds: Vec<_> = (0..9)
            .map(|i| hold(&format!("L{i}"), "Civil", "MISC.", "Pending 538-PR-100", 1))
            .collect();
        holds.push(hold("SOLO", "Civil", "MISC.", "Pending 538-PR-200", 1));
        let ds = Dataset::build(holds, RuleSet::builtin(), snapshot());
        let view = solve_view(&solve_plan(&ds, &FilterSpec::default(), None));
        assert_eq!((view.rows.len(), view.lines_on_hold), (2, 10));
        assert_eq!(view.steps_to_most, 1);

        // Eight of ten is short of it: the second step is needed.
        let mut holds: Vec<_> = (0..8)
            .map(|i| hold(&format!("L{i}"), "Civil", "MISC.", "Pending 538-PR-100", 1))
            .collect();
        holds.push(hold("S1", "Civil", "MISC.", "Pending 538-PR-200", 1));
        holds.push(hold("S2", "Civil", "MISC.", "Pending 538-PR-300", 1));
        let ds = Dataset::build(holds, RuleSet::builtin(), snapshot());
        let view = solve_view(&solve_plan(&ds, &FilterSpec::default(), None));
        assert_eq!((view.rows.len(), view.lines_on_hold), (3, 10));
        assert_eq!(view.steps_to_most, 2);
    }
}
