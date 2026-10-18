import type { Dim } from "../../bindings/Dim";
import type { Field } from "../../bindings/Field";
import type { FilterOptions } from "../../bindings/FilterOptions";
import { dimNeeds, partNeeds } from "../../api/filter-needs";
import { filterPart, type FilterField } from "./chips";

const dim = (of: Exclude<Dim, { Custom: string }>): FilterField => ({ kind: "dim", dim: of });

/**
 * The fields the picker lists, in its order: what the export says of a hold and what the blocker
 * rules derive from it, then its age and its dates, its sizes, and text in any of them. A snapshot
 * that has no value in a column a field needs (ui/src/api/filter-needs.ts, the table the Rust side
 * applies) is not offered the field; a field that needs none is always offered.
 */
const FIELDS: readonly FilterField[] = [
  dim("Discipline"),
  dim("HoldType"),
  dim("Role"),
  dim("Name"),
  dim("BlockerType"),
  dim("Blocker"),
  dim("Remark"),
  dim("LineId"),
  { kind: "ageBands" },
  { kind: "created" },
  { kind: "released" },
  dim("ModelSize"),
  dim("StressCalc"),
  { kind: "sizeMismatch" },
  { kind: "text" },
];

/** The columns of the export a field of the picker needs. */
function needsOf(field: FilterField): readonly Field[] {
  if (field.kind === "dim") return dimNeeds(field.dim);
  const part = filterPart(field);
  return part === null ? [] : partNeeds(part);
}

/**
 * The fields a snapshot can be filtered by, in the order the picker lists them: the fields above
 * whose columns the snapshot has values in, then its custom columns, by header, in the order the
 * command names them.
 */
export function pickerFields(
  options: Pick<FilterOptions, "absent" | "custom_dims">,
): FilterField[] {
  const absent = new Set(options.absent);
  return [
    ...FIELDS.filter((field) => !needsOf(field).some((needed) => absent.has(needed))),
    ...options.custom_dims.map((header): FilterField => ({ kind: "dim", dim: { Custom: header } })),
  ];
}
