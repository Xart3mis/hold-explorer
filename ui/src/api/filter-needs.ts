import type { Dim } from "../bindings/Dim";
import type { Field } from "../bindings/Field";
import type { FilterPart } from "../bindings/FilterPart";
import needs from "./filter-needs.json";

/** A dimension the export or the blocker rules give: every one but a custom column. */
type NamedDim = Exclude<Dim, { Custom: string }>;

/**
 * The columns of the export a filter on each dimension needs, and each part of a filter that is
 * not a dimension. The Rust side decides what a snapshot can apply (`FilterSpec::applicable`);
 * the interface reads the same table to offer only the fields a snapshot has. It is in the
 * fixture beside this module, which a Rust test compares with `Dim::needs` and
 * `FilterPart::needs`, so the two sides cannot differ. A dimension or a part without an entry
 * does not compile here.
 */
const dimEntries: Record<NamedDim, readonly string[]> = needs.dims;
const partEntries: Record<FilterPart, readonly string[]> = needs.parts;
// The names are fields: the Rust test reads each of them as one.
const dims = dimEntries as Record<NamedDim, readonly Field[]>;
const parts = partEntries as Record<FilterPart, readonly Field[]>;

/**
 * The columns a filter on this dimension needs. A custom column is needed by name, which the
 * snapshot's `custom_dims` say.
 */
export function dimNeeds(dim: Dim): readonly Field[] {
  return typeof dim === "string" ? dims[dim] : [];
}

/** The columns this part of a filter needs. */
export function partNeeds(part: FilterPart): readonly Field[] {
  return parts[part];
}
