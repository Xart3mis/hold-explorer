// Fixtures of the Breakdown destination: what the `breakdown` and `group_detail` commands answer
// for a snapshot.
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
