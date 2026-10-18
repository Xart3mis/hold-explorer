import type { Dim } from "../../bindings/Dim";
import type { Field } from "../../bindings/Field";
import type { FilterOptions } from "../../bindings/FilterOptions";
import type { FilterField } from "./chips";

/**
 * A field of the picker, and the columns of the export it needs: a snapshot that has no value in
 * one of them is not offered the field. A field that needs none is always offered.
 */
interface Offered {
  field: FilterField;
  needs: readonly Field[];
}

const dim = (of: Exclude<Dim, { Custom: string }>, ...needs: Field[]): Offered => ({
  field: { kind: "dim", dim: of },
  needs,
});

/**
 * The fields the picker lists, in its order: what the export says of a hold and what the blocker
 * rules derive from it, then its age and its dates, its sizes, and text in any of them. The line
 * ID, the hold remark, and the hold type are in every snapshot, and the blocker comes from the
 * remark. The age is counted from the creation date, and the two sizes are compared with each
 * other, so each of those needs what it is made of.
 */
const FIELDS: readonly Offered[] = [
  dim("Discipline", "Discipline"),
  dim("HoldType"),
  dim("Role", "Role"),
  dim("Name", "Name"),
  dim("BlockerType"),
  dim("Blocker"),
  dim("Remark"),
  dim("LineId"),
  { field: { kind: "ageBands" }, needs: ["Created"] },
  { field: { kind: "created" }, needs: ["Created"] },
  { field: { kind: "released" }, needs: ["Released", "ReleaseDate"] },
  dim("ModelSize", "ModelSize"),
  dim("StressCalc", "StressCalc"),
  { field: { kind: "sizeMismatch" }, needs: ["ModelSize", "LdtSize"] },
  { field: { kind: "text" }, needs: [] },
];

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
    ...FIELDS.filter(({ needs }) => !needs.some((field) => absent.has(field))).map(
      ({ field }) => field,
    ),
    ...options.custom_dims.map((header): FilterField => ({ kind: "dim", dim: { Custom: header } })),
  ];
}
