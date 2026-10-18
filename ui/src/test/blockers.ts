// Fixtures of the Blockers destination: what the `solve_order` command answers for a snapshot.
import type { SolveRow } from "../bindings/SolveRow";
import type { SolveView } from "../bindings/SolveView";

/** A step of the solve order, its numbers given and the rest written from its blocker. */
function step(
  step: number,
  discipline: string,
  item: string,
  kind: string,
  holds: number,
  gain: number,
  cumulative: number,
): SolveRow {
  return {
    step,
    key: `${discipline}|${item}`,
    label: `${discipline} / ${item}`,
    kind,
    discipline,
    holds,
    gain,
    cumulative,
  };
}

/**
 * The solve order of the open holds: four steps that free the 1,262 lines on hold, the last of them few. A
 * blocker item is a tag as often as a word.
 */
export function solveView(): SolveView {
  return {
    rows: [
      step(1, "Piping", "Stress", "Other", 1204, 1000, 1000),
      step(2, "Process", "577-PR-400", "PR", 300, 200, 1200),
      step(3, "Civil", "Vendor data", "Vendor", 42, 50, 1250),
      step(4, "Piping", "Client", "Other", 7, 12, 1262),
    ],
    lines_on_hold: 1262,
  };
}
