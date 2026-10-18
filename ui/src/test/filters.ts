// Fixtures of the filter bar and its picker: what the `filter_options` and `filter_values`
// commands answer for a snapshot.
import type { FilterOptions } from "../bindings/FilterOptions";
import type { Group } from "../bindings/Group";
import type { ValuePage } from "../bindings/ValuePage";

/**
 * The options for the newest snapshot of the workspace the tests open and the default filter:
 * 5,042 holds kept, the two status counts, the five age bands a workspace starts with, no extra
 * column, no field without a value, and nothing the snapshot cannot apply.
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
    inactive: { dims: [], parts: [] },
    ...overrides,
  };
}

/** One value of a dimension with the holds that have it. Its key is its label unless one is given. */
export function group(label: string, holds: number, key = label): Group {
  return { key, label, holds, lines: holds };
}

/**
 * The values the picker is offered for a dimension: three of them, all there are, as the command
 * counts them for the default filter. A test that looks at other values gives its own; `more` is
 * what the command would answer for the `total` and the `values` of the page unless it is given.
 */
export function valuePage(overrides: Partial<ValuePage> = {}): ValuePage {
  const values = overrides.values ?? [
    group("Piping", 1186),
    group("Process", 913),
    group("Civil", 702),
  ];
  const total = overrides.total ?? values.length;
  return { total, values, more: total - values.length, ...overrides };
}
