import type { Dim } from "../../bindings/Dim";
import type { Field } from "../../bindings/Field";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { Filters } from "./state";

/** The filters that are not a dimension and need a column of the export. */
export type ColumnFilter = "ageBands" | "created" | "released" | "sizeMismatch";

/**
 * The columns of the export a filter on each dimension needs: a snapshot without a value in one
 * of them has nothing to filter it by. A dimension not named needs none: the line ID, the hold
 * remark, and the hold type are in every snapshot, the blocker comes from the remark, and a
 * custom column is one the snapshot names itself.
 */
const DIM_NEEDS: Partial<Record<Exclude<Dim, { Custom: string }>, readonly Field[]>> = {
  Discipline: ["Discipline"],
  Role: ["Role"],
  Name: ["Name"],
  ModelSize: ["ModelSize"],
  StressCalc: ["StressCalc"],
};

/**
 * The columns each filter that is not a dimension needs. The age is counted from the creation
 * date, and the two sizes are compared with each other, so each needs what it is made of.
 */
export const FILTER_NEEDS: Record<ColumnFilter, readonly Field[]> = {
  ageBands: ["Created"],
  created: ["Created"],
  released: ["Released", "ReleaseDate"],
  sizeMismatch: ["ModelSize", "LdtSize"],
};

/** The columns of the export a filter on this dimension needs. */
export function dimNeeds(dim: Dim): readonly Field[] {
  return typeof dim === "string" ? (DIM_NEEDS[dim] ?? []) : [];
}

/** Whether a snapshot without values in the `absent` columns lacks one of these. */
export function lacksAny(needs: readonly Field[], absent: readonly Field[]): boolean {
  return needs.some((field) => absent.includes(field));
}

/**
 * The spec each set of filters was turned into, for as long as that set is held anywhere, by the
 * filters it left out.
 */
const specs = new WeakMap<Filters, Map<string, FilterSpec>>();

/**
 * The filter as the commands take it. A value is sent by its key; its label is only what the
 * interface shows. An entry without values filters nothing and is left out. Every part is sent,
 * as the generated type requires.
 *
 * A filter that needs a column the snapshot has no value in (`absent`, as the filter options say
 * it) is left out as well, as if it were not set: applied, it would be applied to empty values.
 * The filters keep it, and it is sent again once a snapshot has the column.
 *
 * The same filters give the same object for as long as the same filters are left out, so a
 * screen may hand the spec to a reading on every render without building it again.
 */
export function toSpec(filters: Filters, absent: readonly Field[]): FilterSpec {
  const lacks = (needs: readonly Field[]) => lacksAny(needs, absent);
  const fields = filters.fields.filter(
    (entry) => entry.values.length > 0 && !lacks(dimNeeds(entry.dim)),
  );
  const isSet: Record<ColumnFilter, boolean> = {
    ageBands: filters.ageBands.length > 0,
    created: filters.created.from !== null || filters.created.to !== null,
    released: filters.released.from !== null || filters.released.to !== null,
    sizeMismatch: filters.sizeMismatch !== null,
  };
  const leftOut = (Object.keys(FILTER_NEEDS) as ColumnFilter[]).filter(
    (filter) => isSet[filter] && lacks(FILTER_NEEDS[filter]),
  );
  // What is left out, in one word: the entries that are not sent, and the other filters.
  const key = JSON.stringify([
    filters.fields.filter((entry) => !fields.includes(entry)).map((entry) => entry.dim),
    leftOut,
  ]);
  const held = specs.get(filters) ?? new Map<string, FilterSpec>();
  specs.set(filters, held);
  const known = held.get(key);
  if (known !== undefined) return known;
  const isOut = (filter: ColumnFilter) => leftOut.includes(filter);
  const spec: FilterSpec = {
    status: filters.status,
    fields: fields.map((entry) => ({
      dim: entry.dim,
      values: entry.values.map((value) => value.key),
      negate: entry.negate,
    })),
    text: filters.text,
    age_bands: isOut("ageBands") ? [] : filters.ageBands.map((band) => ({ ...band })),
    created: isOut("created") ? { from: null, to: null } : { ...filters.created },
    released: isOut("released") ? { from: null, to: null } : { ...filters.released },
    size_mismatch: isOut("sizeMismatch") ? null : filters.sizeMismatch,
  };
  held.set(key, spec);
  return spec;
}
