import type { FilterSpec } from "../bindings/FilterSpec";

/** The complete default filter: open holds, nothing else set. Every field is sent, as the generated type requires. */
export function openHoldsFilter(): FilterSpec {
  return {
    status: "Open",
    fields: [],
    text: "",
    age_bands: [],
    created: { from: null, to: null },
    released: { from: null, to: null },
    size_mismatch: null,
  };
}
