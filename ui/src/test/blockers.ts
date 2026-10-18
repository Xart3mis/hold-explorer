// Fixtures of the Blockers destination: what the `solve_order` and `blocker_detail` commands
// answer for a snapshot.
import type { BlockerDetail } from "../bindings/BlockerDetail";
import type { SolveRow } from "../bindings/SolveRow";
import type { SolveView } from "../bindings/SolveView";
import { holdRef, lineId } from "./lines";

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
 * The solve order of the open holds: four steps that free the 1,262 lines on hold, the last of
 * them few. A step frees no more lines than its blocker has holds, since a hold is on one line,
 * and no more than the step before it, as the greedy order of the core takes the most first.
 * A blocker item is a tag as often as a word.
 */
export function solveView(): SolveView {
  return {
    rows: [
      step(1, "Piping", "Stress", "Other", 1204, 1000, 1000),
      step(2, "Process", "577-PR-400", "PR", 300, 234, 1234),
      step(3, "Piping", "577-PK-400", "PK", 14, 14, 1248),
      step(4, "Piping", "Client", "Other", 20, 14, 1262),
    ],
    lines_on_hold: 1262,
    steps_to_most: 2,
  };
}

/**
 * A solve order of `count` steps, each of a blocker of its own that frees one line, after which
 * `stepsToMost` steps free most lines.
 */
export function manySteps(count: number, stepsToMost: number): SolveView {
  return {
    rows: Array.from({ length: count }, (_, index) =>
      step(index + 1, "Piping", `Item ${String(index + 1)}`, "Other", 1, 1, index + 1),
    ),
    lines_on_hold: count,
    steps_to_most: stepsToMost,
  };
}

/**
 * What `blocker_detail` answers for a blocker, by its key (`<discipline>|<item>`): fourteen
 * holds, two lines it frees on its own and one it shares with the blocker of the client's
 * decision, and its oldest open hold, on the third line. It is at the step its key has in the
 * solve order of `solveView`, the default one at step 3; a key outside it is not ranked.
 */
export function blockerDetail(
  key = "Piping|577-PK-400",
  overrides: Partial<BlockerDetail> = {},
): BlockerDetail {
  const [discipline = "", item = ""] = key.split("|");
  return {
    key,
    label: `${discipline} / ${item}`,
    kind: "PK",
    discipline,
    item,
    holds: 14,
    frees: [lineId(0), lineId(2)],
    shared: [lineId(1)],
    linked: [
      {
        key: "Civil|Client decision",
        label: "Civil / Client decision",
        kind: "Other",
        shared_lines: 1,
      },
    ],
    oldest: holdRef(7, {
      line_id: lineId(2),
      remark: "HOLD FOR VENDOR DATA OF PACKAGE UNIT 577-PK-400, REV B",
      created: "2026-05-02T00:00:00",
    }),
    step: solveView().rows.find((row) => row.key === key)?.step ?? null,
    ...overrides,
  };
}
