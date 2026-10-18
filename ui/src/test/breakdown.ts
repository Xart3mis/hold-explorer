// Fixtures of the Breakdown destination: what the `breakdown`, `group_detail`, and `matrix`
// commands answer for a snapshot.
import type { FoldedMatrix } from "../bindings/FoldedMatrix";
import type { Group } from "../bindings/Group";
import type { GroupDetail } from "../bindings/GroupDetail";
import { linePage } from "./lines";

/** The groups of a dimension, most holds first: three disciplines unless the test says otherwise. */
export function breakdownGroups(): Group[] {
  return [
    { key: "Piping", label: "Piping", holds: 1204, lines: 312 },
    { key: "Civil", label: "Civil", holds: 602, lines: 3 },
    { key: "", label: "(blank)", holds: 12, lines: 2 },
  ];
}

/**
 * A group with its first lines: the lines of `linePage`, `total` of them (three by default),
 * of which the first 200 come with it.
 */
export function groupDetail(key: string, total = 3): GroupDetail {
  return {
    group: { key, label: key === "" ? "(blank)" : key, holds: total * 2, lines: total },
    lines: linePage({ total }),
  };
}

/**
 * A matrix of three disciplines (a blank one among them) by two hold types, with an Other row of
 * 12 folded disciplines and an Other column of 4 folded hold types, unless the test folds less.
 */
export function foldedMatrix({ folded = true }: { folded?: boolean } = {}): FoldedMatrix {
  const other = (holds: number, lines: number): Group => ({ key: "", label: "", holds, lines });
  const rows: Group[] = [
    { key: "Piping", label: "Piping", holds: 1204, lines: 312 },
    { key: "Civil", label: "Civil", holds: 602, lines: 3 },
    { key: "", label: "(blank)", holds: 12, lines: 2 },
  ];
  const cols: Group[] = [
    { key: "Vendor data", label: "Vendor data", holds: 1100, lines: 200 },
    { key: "Client", label: "Client", holds: 640, lines: 90 },
  ];
  const cells = [
    [700, 400, 104],
    [380, 200, 22],
    [10, 0, 2],
    [10, 40, 0],
  ];
  if (!folded) {
    return {
      rows,
      cols,
      other_row: null,
      other_col: null,
      cells: cells.slice(0, 3).map((row) => row.slice(0, 2)),
      max_cell: 700,
      folded_rows: 0,
      folded_cols: 0,
    };
  }
  return {
    rows,
    cols,
    other_row: other(50, 20),
    other_col: other(128, 40),
    cells,
    max_cell: 700,
    folded_rows: 12,
    folded_cols: 4,
  };
}
