import type { FilterSpec } from "../../bindings/FilterSpec";
import type { Filters } from "./state";

/** The spec each set of filters was turned into, for as long as that set is held anywhere. */
const specs = new WeakMap<Filters, FilterSpec>();

/**
 * The filter as the commands take it. A value is sent by its key; its label is only what the
 * interface shows. An entry without values filters nothing and is left out. Every part is sent,
 * as the generated type requires.
 *
 * The same filters give the same object, so a screen may hand the spec to a reading on every
 * render without building it again.
 */
export function toSpec(filters: Filters): FilterSpec {
  const held = specs.get(filters);
  if (held !== undefined) return held;
  const spec: FilterSpec = {
    status: filters.status,
    fields: filters.fields
      .filter((entry) => entry.values.length > 0)
      .map((entry) => ({
        dim: entry.dim,
        values: entry.values.map((value) => value.key),
        negate: entry.negate,
      })),
    text: filters.text,
    age_bands: filters.ageBands.map((band) => ({ ...band })),
    created: { ...filters.created },
    released: { ...filters.released },
    size_mismatch: filters.sizeMismatch,
  };
  specs.set(filters, spec);
  return spec;
}
