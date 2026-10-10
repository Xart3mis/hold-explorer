//! Which blockers to solve first.

use std::collections::HashMap;

use serde::Serialize;

use crate::dataset::Dataset;
use crate::filter::FilterSpec;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BlockerNode {
    /// `<discipline>|<item>`.
    pub key: String,
    pub discipline: String,
    /// Blocker type.
    pub kind: String,
    pub item: String,
    pub holds: usize,
    /// Lines this blocker is on, in order of first appearance.
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Step {
    pub key: String,
    /// Lines freed by this step.
    pub gain: usize,
    /// Lines freed by this step and all steps before it.
    pub cumulative: usize,
    pub freed: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SolvePlan {
    /// Every blocker, in order of first appearance.
    pub nodes: Vec<BlockerNode>,
    pub steps: Vec<Step>,
}

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
        let mut best_partial = 0.0_f64;
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
            // Most lines freed first, then most partial progress. Strictly greater: on a tie the
            // earlier blocker keeps the lead, and a blocker with neither is never chosen.
            if gain > best_gain || (gain == best_gain && partial > best_partial) {
                best_gain = gain;
                best_partial = partial;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dataset::Dataset;
    use crate::filter::FilterSpec;
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
            &RuleSet::builtin(),
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
        let ds = Dataset::build(holds, &RuleSet::builtin(), snapshot());

        let plan = solve_plan(&ds, &FilterSpec::default(), Some(1));
        assert_eq!(brief(&plan), vec![("Civil|538-PR-300", 1, 1)]);
    }
}
