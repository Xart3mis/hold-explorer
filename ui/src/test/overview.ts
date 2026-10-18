// Fixtures of the Overview: what the `overview` command answers for a snapshot.
import type { Group } from "../bindings/Group";
import type { LineRow } from "../bindings/LineRow";
import type { OverviewView } from "../bindings/OverviewView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import { snapshot } from "./fixtures";

/** One value of a dimension. A blank value has the empty key and the label the core gives it. */
export function group(label: string, holds: number, lines: number, key = label): Group {
  return { key, label, holds, lines };
}

/** A line as the overview lists the lines that wait longest. */
export function lineRow(line_id: string, holds: number, oldest_age_days: number | null): LineRow {
  return {
    line_id,
    holds,
    disciplines: ["Piping"],
    hold_types: ["Vendor data"],
    blockers: 1,
    oldest_age_days,
    model_size: null,
    ldt_size: null,
    stress_calc: "",
    size_mismatch: false,
  };
}

/**
 * The overview of the newest snapshot of the workspace the tests open: 5,042 open holds on 2,208
 * lines, by seven disciplines, four hold types, and three roles, largest first, as the command
 * sends them, with the top blockers and lines and the stale holds.
 */
export function overviewView(overrides: Partial<OverviewView> = {}): OverviewView {
  return {
    snapshot: snapshot(2, "2026-10-07T08:00:00"),
    is_latest: true,
    summary: {
      holds: 5042,
      lines: 2208,
      single_hold_lines: 714,
      median_age_days: 41,
      median_duration_days: 18,
    },
    by_discipline: [
      group("Civil", 1515, 612),
      group("Piping", 1285, 540),
      group("Process", 846, 398),
      group("Instrumentation", 512, 301),
      group("Structural", 377, 190),
      group("Electrical", 266, 140),
      group("Unspecified", 241, 166, ""),
    ],
    by_hold_type: [
      group("Vendor data", 2118, 1507),
      group("Process data", 1406, 1022),
      group("Client decision", 911, 640),
      group("Stress analysis", 607, 442),
    ],
    by_role: [group("Lead", 2610, 1204), group("Checker", 1632, 802), group("Designer", 800, 402)],
    top_blockers: [
      group("Piping / PR-1042", 96, 61, "Piping|PR-1042"),
      group("Civil / DWG-220", 74, 49, "Civil|DWG-220"),
      group("Process / P&ID-7", 51, 40, "Process|P&ID-7"),
    ],
    top_lines: [lineRow("L-1001", 4, 212), lineRow("L-1187", 3, 160), lineRow("L-2040", 1, null)],
    stale: { holds: 903, days: 90, ages_known: true },
    ...overrides,
  };
}

/**
 * What the command answers for an open workspace: the overview of its selected snapshot, or
 * `null` when it has none.
 */
export function overviewOf(open: WorkspaceOpen | null): OverviewView | null {
  const selected = open?.snapshots.find(({ id }) => id === open.selected);
  if (selected === undefined) return null;
  const newest = open?.snapshots.at(-1);
  return overviewView({ snapshot: selected, is_latest: selected.id === newest?.id });
}
