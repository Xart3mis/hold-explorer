// What the development page answers for the `overview` command: made-up numbers of a plausible
// size, so the Overview can be looked at with thirteen disciplines, with three, and with
// twenty-five. For development only; see ui/src/dev/app.tsx.
import type { Group } from "../bindings/Group";
import type { OverviewView } from "../bindings/OverviewView";
import type { SnapshotInfo } from "../bindings/SnapshotInfo";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";

/** How many open holds the numbers below add up to. A snapshot with another count scales them. */
const OPEN_HOLDS = 5042;
const LINES = 3611;
const SINGLE_HOLD_LINES = 2548;

type Row = readonly [label: string, holds: number, lines: number];

/** Thirteen disciplines, the blank one among them under the label the core gives it. */
const DISCIPLINES: readonly Row[] = [
  ["Piping", 1186, 880],
  ["Process", 913, 690],
  ["Civil", 702, 418],
  ["Instrumentation and control", 588, 431],
  ["Structural", 446, 297],
  ["Mechanical", 361, 264],
  ["Electrical", 274, 190],
  ["Pipe stress", 203, 171],
  ["Materials", 148, 121],
  ["HVAC", 96, 71],
  ["Fire protection", 58, 44],
  ["Telecommunications", 37, 29],
  ["Unspecified", 30, 26],
];

const HOLD_TYPES: readonly Row[] = [
  ["Vendor data", 1322, 968],
  ["Process data", 1041, 803],
  ["Client decision", 742, 561],
  ["Stress analysis", 566, 437],
  ["Civil interface", 431, 305],
  ["Instrument data", 358, 266],
  ["Material change", 262, 204],
  ["Routing clash", 171, 139],
  ["Design change", 104, 88],
  ["Other", 45, 41],
];

/** Twenty-five values with labels of every length, some too long for the label column. */
const MANY: readonly Row[] = [
  ["Piping", 742, 566],
  ["Process", 611, 470],
  ["Civil and underground services", 498, 322],
  ["Instrumentation and control", 431, 318],
  ["Structural", 377, 250],
  ["Mechanical, rotating equipment", 322, 241],
  ["Mechanical, static equipment", 288, 213],
  ["Electrical", 251, 177],
  ["Pipe stress", 219, 180],
  ["Materials and corrosion", 188, 151],
  ["Process safety", 161, 122],
  ["HVAC", 139, 101],
  ["Fire protection", 118, 90],
  ["Telecommunications", 101, 78],
  ["Architecture and buildings", 96, 70],
  ["Package units, vendor engineering and expediting", 88, 71],
  ["Pipelines", 74, 60],
  ["Marine", 66, 51],
  ["Subsea", 58, 47],
  ["Commissioning", 51, 40],
  ["Construction", 44, 37],
  ["Quality", 38, 31],
  ["Environment", 31, 26],
  ["Document control", 24, 21],
  ["Unspecified", 126, 97],
];

function groups(rows: readonly Row[], share: number): Group[] {
  return rows.map(([label, holds, lines]) => ({
    // A blank value has the empty key; the label is the one the core writes for it.
    key: label === "Unspecified" ? "" : label,
    label,
    holds: Math.round(holds * share),
    lines: Math.round(lines * share),
  }));
}

/** The groups scaled to a snapshot, their holds adding up to exactly its open holds. */
function scaled(rows: readonly Row[], open: number): Group[] {
  const total = rows.reduce((sum, [, holds]) => sum + holds, 0);
  const list = groups(rows, open / total);
  const largest = list.reduce<Group | undefined>(
    (most, group) => (most === undefined || group.holds > most.holds ? group : most),
    undefined,
  );
  if (largest !== undefined) {
    largest.holds += open - list.reduce((sum, group) => sum + group.holds, 0);
  }
  // The command sends the largest group first.
  return list.sort((a, b) => b.holds - a.holds);
}

export type DevOverview = "full" | "no-dates" | "few" | "many";

/** The overview of one snapshot, in the shape the state of the development page asks for. */
function overviewOfSnapshot(
  snapshot: SnapshotInfo,
  isLatest: boolean,
  shape: DevOverview,
): OverviewView {
  const share = snapshot.open_count / OPEN_HOLDS;
  const disciplines =
    shape === "many" ? MANY : shape === "few" ? DISCIPLINES.slice(0, 3) : DISCIPLINES;
  const holdTypes =
    shape === "many" ? MANY.slice(0, 24) : shape === "few" ? HOLD_TYPES.slice(0, 3) : HOLD_TYPES;
  return {
    snapshot,
    is_latest: isLatest,
    summary: {
      holds: snapshot.open_count,
      lines: Math.round(LINES * share),
      single_hold_lines: Math.round(SINGLE_HOLD_LINES * share),
      // An older snapshot is a week younger for each step back.
      median_age_days: shape === "no-dates" ? null : 41 - 2 * (4 - Math.min(snapshot.id, 4)),
      median_duration_days: 18,
    },
    by_discipline: scaled(disciplines, snapshot.open_count),
    by_hold_type: scaled(holdTypes, snapshot.open_count),
  };
}

/** What `overview` answers for the open workspace: `null` when it has no snapshot. */
export function devOverview(open: WorkspaceOpen | null, shape: DevOverview): OverviewView | null {
  const selected = open?.snapshots.find(({ id }) => id === open.selected);
  if (selected === undefined) return null;
  return overviewOfSnapshot(selected, selected.id === open?.snapshots.at(-1)?.id, shape);
}
