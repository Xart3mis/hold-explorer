// The dimensions Breakdown groups the holds by, in the order of its group-by select.
import { dimNeeds } from "../../api/filter-needs";
import { dimId } from "../../app/filters/dims";
import type { Dim } from "../../bindings/Dim";
import type { Field } from "../../bindings/Field";

/** A dimension the export or the blocker rules give: every one but a custom column. */
type NamedDim = Exclude<Dim, { Custom: string }>;

/**
 * The dimensions of the export Breakdown offers, in the order of the spec (9.2). The line ID is
 * no group: Lines lists the lines. Which columns each one needs is the one table of
 * ui/src/api/filter-needs.json, which the Rust side checks (`dimNeeds`).
 */
const OFFERED: readonly NamedDim[] = [
  "Discipline",
  "HoldType",
  "Role",
  "Name",
  "BlockerType",
  "Blocker",
  "Remark",
  "ModelSize",
  "StressCalc",
];

/** What the page groups by when its address names nothing it offers. */
export const DEFAULT_DIM: Dim = "Discipline";

/** The rows of the matrix when its address names nothing it offers. */
export const DEFAULT_ROWS: Dim = "Discipline";

/** The columns of the matrix when its address names nothing it offers. */
export const DEFAULT_COLS: Dim = "HoldType";

/**
 * The dimensions the page offers for a snapshot: those of the export none of whose needed fields
 * the snapshot lacks (`absent` lists those it has no value in), then the extra columns of its
 * export.
 */
export function breakdownDims(absent: readonly Field[], custom: readonly string[]): Dim[] {
  return [
    ...OFFERED.filter((dim) => !dimNeeds(dim).some((field) => absent.includes(field))),
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
  return OFFERED.find((dim) => dimId(dim) === id) ?? null;
}
