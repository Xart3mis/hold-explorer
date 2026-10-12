// Fixtures of the Overview: what the `overview` command answers for a snapshot.
import type { Group } from "../bindings/Group";
import type { OverviewView } from "../bindings/OverviewView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import { snapshot } from "./fixtures";

/** One value of a dimension. A blank value has the empty key and the label the core gives it. */
export function group(label: string, holds: number, lines: number, key = label): Group {
  return { key, label, holds, lines };
}

/**
 * The overview of the newest snapshot of the workspace the tests open: 5,042 open holds on 2,208
 * lines, by seven disciplines and by four hold types, largest first, as the command sends them.
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
