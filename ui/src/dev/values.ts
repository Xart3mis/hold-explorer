// What the development page answers for the `filter_values` command: the values of each
// dimension with made-up weights, counted as the command counts them, so the filter picker can be
// looked at. For development only; see ui/src/dev/app.tsx.
import { isSameDim } from "../app/filters/dims";
import type { Dim } from "../bindings/Dim";
import type { FilterSpec } from "../bindings/FilterSpec";
import type { Group } from "../bindings/Group";
import type { SnapshotInfo } from "../bindings/SnapshotInfo";
import type { ValuePage } from "../bindings/ValuePage";
import { devKept, DISCIPLINES, HOLD_TYPES } from "./overview";

/** How many values the command answers at most, as `query::filter_values` does. */
const LIMIT = 200;

/** A value and how many holds it has, relative to the other values of its dimension. */
type Weighted = readonly [label: string, weight: number];

const weighted = (rows: readonly (readonly [string, number, number])[]): Weighted[] =>
  rows.map(([label, holds]) => [label, holds]);

/** The same weight for each label, with a little to tell them apart. */
const even = (...labels: string[]): Weighted[] =>
  labels.map((label, index) => [label, labels.length + 4 - index]);

/** As many line IDs as asked for, in the form of the export, with weights that fall away. */
function lineIds(count: number): Weighted[] {
  return Array.from({ length: count }, (_, index): Weighted => {
    const unit = ["PR", "PL", "CW", "SW", "FW"][index % 5] ?? "PR";
    return [`577-${unit}-${String(1000 + index)}`, 1 + ((count - index) % 9)];
  });
}

/** The values of a dimension. A snapshot of the state that looks at many has 1,500 line IDs. */
function valuesOf(dim: Dim, manyLines: boolean): Weighted[] {
  if (typeof dim !== "string") {
    // The values the made-up holds of Lines carry (ui/src/dev/lines.ts).
    if (dim.Custom === "Area") {
      return even("North rack", "South rack", "Pump house", "Tank farm", "Unspecified");
    }
    if (dim.Custom === "Work pack") {
      return even("WP-500-1", "WP-501-2", "WP-502-3", "WP-503-4", "Unspecified");
    }
    return even("Unspecified");
  }
  switch (dim) {
    case "Discipline":
      return weighted(DISCIPLINES);
    case "HoldType":
      return weighted(HOLD_TYPES);
    case "Role":
      return even("Lead engineer", "Designer", "Checker", "Package engineer", "Unspecified");
    case "Name":
      return even(
        "A. Haddad",
        "M. Okafor",
        "S. Lindqvist",
        "R. Tanaka",
        "J. Moreau",
        "Unspecified",
      );
    case "BlockerType":
      return even("PR", "PK", "TIE-IN", "Vendor data", "Stress", "Other");
    case "Blocker":
      return even("577-PK-400", "577-PR-1400", "577-TIE-12", "Vendor data", "Stress", "Other");
    case "Remark":
      return even(
        "HOLD FOR VENDOR DATA OF PACKAGE UNIT 577-PK-400",
        "AWAITING STRESS CALCULATION",
        "TIE-IN 577-TIE-12 TO BE CONFIRMED",
        "HOLD PENDING 577-PR-1400",
      );
    case "LineId":
      return lineIds(manyLines ? 1500 : 48);
    case "ModelSize":
      return even('2"', '3"', '4"', '6"', '8"', '10"', '12"');
    case "StressCalc":
      return even("Required", "Not required", "Done", "Unspecified");
  }
}

/**
 * What `filter_values` answers on the development page: the values of the dimension whose label
 * holds the search text, ignoring case, the ones with the most holds first, at most 200 of them.
 * The holds of the values add up to what the filter keeps without the dimension's own entry,
 * which is how the command counts them.
 */
export function devValues(
  selected: SnapshotInfo | undefined,
  spec: FilterSpec,
  dim: Dim,
  search: string,
  manyLines: boolean,
): ValuePage {
  const others = { ...spec, fields: spec.fields.filter((field) => !isSameDim(field.dim, dim)) };
  const kept = selected === undefined ? 0 : devKept(selected, others);
  const values = valuesOf(dim, manyLines);
  const sum = values.reduce((total, [, weight]) => total + weight, 0);
  const needle = search.toLowerCase();
  const matching = values
    .filter(([label]) => label.toLowerCase().includes(needle))
    .map(([label, weight]): Group => ({
      // A blank value has the empty key; the label is the one the core writes for it.
      key: label === "Unspecified" ? "" : label,
      label,
      holds: Math.round((kept * weight) / sum),
      lines: Math.round((kept * weight) / sum / 1.4),
    }))
    .sort((a, b) => b.holds - a.holds);
  return { total: matching.length, values: matching.slice(0, LIMIT) };
}
