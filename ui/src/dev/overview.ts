// What the development page answers for the `overview` command: made-up numbers of a plausible
// size, so the Overview can be looked at with thirteen disciplines, with three, and with
// twenty-five. For development only; see ui/src/dev/app.tsx.
import type { FilterSpec } from "../bindings/FilterSpec";
import type { Group } from "../bindings/Group";
import type { LineRow } from "../bindings/LineRow";
import type { OverviewView } from "../bindings/OverviewView";
import type { SnapshotInfo } from "../bindings/SnapshotInfo";
import type { Status } from "../bindings/Status";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";

/** How many open holds the numbers below add up to. A snapshot with another count scales them. */
const OPEN_HOLDS = 5042;
const LINES = 3611;
const SINGLE_HOLD_LINES = 2548;

type Row = readonly [label: string, holds: number, lines: number];

/** Thirteen disciplines, the blank one among them under the label the core gives it. */
export const DISCIPLINES: readonly Row[] = [
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

export const HOLD_TYPES: readonly Row[] = [
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

export const ROLES: readonly Row[] = [
  ["Lead", 2470, 1760],
  ["Checker", 1604, 1190],
  ["Designer", 822, 601],
  ["Unspecified", 146, 120],
];

/** Blockers of the first few holds, the label written as the core writes a blocker. */
const BLOCKERS: readonly Row[] = [
  ["Piping / PR-1042", 96, 61],
  ["Civil / DWG-220", 74, 49],
  ["Process / P&ID-7", 51, 40],
  ["Instrumentation and control / DS-318", 47, 38],
  ["Structural / CALC-55", 43, 31],
  ["Piping / PR-1077", 39, 33],
  ["Electrical / DWG-801", 36, 29],
  ["Pipe stress / SC-12", 33, 28],
  ["Materials / MTO-9", 30, 24],
  ["Process / DATA-64", 28, 22],
  ["Civil / DWG-231", 25, 20],
];

/** The lines that wait longest, as many as the Overview lists. */
const LINES_ON_TOP: readonly (readonly [string, number, number])[] = [
  ["L-1001", 4, 212],
  ["L-1187", 3, 188],
  ["L-2040", 6, 171],
  ["L-0312", 2, 160],
  ["L-3318", 1, 149],
  ["L-1450", 5, 143],
  ["L-2207", 2, 131],
  ["L-0988", 3, 120],
  ["L-1766", 1, 118],
  ["L-2951", 2, 104],
];

/** Open holds that are 90 days old or more, as a share of the open holds of the numbers above. */
const STALE_SHARE = 0.18;

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

function lineRows(shape: DevOverview): LineRow[] {
  return LINES_ON_TOP.map(([line_id, holds, age]) => ({
    line_id,
    holds,
    disciplines: ["Piping"],
    hold_types: ["Vendor data"],
    blockers: 1,
    oldest_age_days: shape === "no-dates" ? null : age,
    model_size: null,
    ldt_size: null,
    stress_calc: "",
    size_mismatch: false,
  }));
}

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
  holds: number,
  status: Status,
): OverviewView {
  const share = holds / OPEN_HOLDS;
  const disciplines =
    shape === "many" ? MANY : shape === "few" ? DISCIPLINES.slice(0, 3) : DISCIPLINES;
  const holdTypes =
    shape === "many" ? MANY.slice(0, 24) : shape === "few" ? HOLD_TYPES.slice(0, 3) : HOLD_TYPES;
  return {
    snapshot,
    is_latest: isLatest,
    summary: {
      holds,
      lines: Math.round(LINES * share),
      single_hold_lines: Math.round(SINGLE_HOLD_LINES * share),
      // An older snapshot is a week younger for each step back. Released holds have no age.
      median_age_days:
        shape === "no-dates" || status === "Released"
          ? null
          : 41 - 2 * (4 - Math.min(snapshot.id, 4)),
      median_duration_days: status === "Open" ? null : 18,
    },
    by_discipline: scaled(disciplines, holds),
    by_hold_type: scaled(holdTypes, holds),
    by_role: scaled(ROLES, holds),
    top_blockers: groups(BLOCKERS, share)
      .slice(0, 10)
      .map((group) => ({ ...group, key: group.label.replace(" / ", "|") })),
    top_lines: lineRows(shape),
    // A hold has an age only when the snapshot has dates, and only an open one.
    stale: {
      holds: shape === "no-dates" || status === "Released" ? 0 : Math.round(holds * STALE_SHARE),
      days: 90,
    },
  };
}

/**
 * How many holds of a snapshot a filter keeps on the development page. The status is counted
 * from the snapshot; every other part that is set keeps a fixed share of what is left, so the
 * numbers move when a filter is set. Nothing is filtered: there are no holds here to filter.
 */
export function devKept(snapshot: SnapshotInfo, spec: FilterSpec): number {
  const released = snapshot.row_count - snapshot.open_count;
  const base =
    spec.status === "Open"
      ? snapshot.open_count
      : spec.status === "Released"
        ? released
        : snapshot.row_count;
  const parts =
    spec.fields.filter((field) => field.values.length > 0).length +
    (spec.text === "" ? 0 : 1) +
    (spec.age_bands.length === 0 ? 0 : 1) +
    (spec.created.from === null && spec.created.to === null ? 0 : 1) +
    (spec.released.from === null && spec.released.to === null ? 0 : 1) +
    (spec.size_mismatch === null ? 0 : 1);
  return Math.round(base * 0.62 ** parts);
}

/** What `overview` answers for the open workspace and a filter: `null` when it has no snapshot. */
export function devOverview(
  open: WorkspaceOpen | null,
  shape: DevOverview,
  spec: FilterSpec,
): OverviewView | null {
  const selected = open?.snapshots.find(({ id }) => id === open.selected);
  if (selected === undefined) return null;
  return overviewOfSnapshot(
    selected,
    selected.id === open?.snapshots.at(-1)?.id,
    shape,
    devKept(selected, spec),
    spec.status,
  );
}
