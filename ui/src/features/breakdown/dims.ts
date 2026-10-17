// The dimensions Breakdown groups the holds by, in the order of its group-by select.
import { dimId } from "../../app/filters/dims";
import type { Dim } from "../../bindings/Dim";
import type { Field } from "../../bindings/Field";

/** A dimension the export or the blocker rules give: every one but a custom column. */
type NamedDim = Exclude<Dim, { Custom: string }>;

/**
 * The dimensions of the export Breakdown offers, in the order of the spec (9.2), with the field
 * each one needs a value in. The blocker and its type are derived from the remark, so they need
 * it. The line ID is no group: Lines lists the lines.
 */
const OFFERED: readonly (readonly [NamedDim, Field])[] = [
  ["Discipline", "Discipline"],
  ["HoldType", "HoldType"],
  ["Role", "Role"],
  ["Name", "Name"],
  ["BlockerType", "Remark"],
  ["Blocker", "Remark"],
  ["Remark", "Remark"],
  ["ModelSize", "ModelSize"],
  ["StressCalc", "StressCalc"],
];

/** What the page groups by when its address names nothing it offers. */
export const DEFAULT_DIM: Dim = "Discipline";

/**
 * The dimensions the page offers for a snapshot: those of the export whose field the snapshot has
 * a value in (`absent` lists those it has none in), then the extra columns of its export.
 */
export function breakdownDims(absent: readonly Field[], custom: readonly string[]): Dim[] {
  return [
    ...OFFERED.filter(([, field]) => !absent.includes(field)).map(([dim]) => dim),
    ...custom.map((header): Dim => ({ Custom: header })),
  ];
}

const CUSTOM = "Custom:";

/**
 * The dimension an id names (`dimId`), when the page offers one by that id; `null` otherwise. A
 * custom dimension is read by its header, whether or not the snapshot in view has that column:
 * the page says so when it has not.
 */
export function dimOfId(id: string | null): Dim | null {
  if (id === null) return null;
  if (id.startsWith(CUSTOM)) {
    const header = id.slice(CUSTOM.length);
    return header === "" ? null : { Custom: header };
  }
  return OFFERED.find(([dim]) => dimId(dim) === id)?.[0] ?? null;
}
