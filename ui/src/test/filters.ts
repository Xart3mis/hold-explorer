// Fixtures of the filter bar: what the `filter_options` command answers for a snapshot.
import type { FilterOptions } from "../bindings/FilterOptions";

/**
 * The options for the newest snapshot of the workspace the tests open and the default filter:
 * 5,042 holds kept, the two status counts, the five age bands a workspace starts with, no extra
 * column, and no field without a value.
 */
export function filterOptions(overrides: Partial<FilterOptions> = {}): FilterOptions {
  return {
    total: 5042,
    facets: {
      open: 5042,
      released: 4258,
      age_bands: [412, 655, 1103, 986, 1886],
      size_mismatch: 318,
      size_match: 4724,
    },
    age_bands: [
      { min_days: 0, max_days: 13 },
      { min_days: 14, max_days: 29 },
      { min_days: 30, max_days: 59 },
      { min_days: 60, max_days: 89 },
      { min_days: 90, max_days: null },
    ],
    custom_dims: [],
    absent: [],
    ...overrides,
  };
}
