import type { FilterSpec } from "../bindings/FilterSpec";

/**
 * The complete default filter: open holds, nothing else set. Every field is sent, as the
 * generated type requires. It defines the default of the filters every data screen shares
 * (ui/src/app/filters/state.tsx), and the fixture beside this module says the same to the Rust
 * side, where a test reads it.
 */
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
