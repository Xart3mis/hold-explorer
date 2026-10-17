import type { Dim } from "../../bindings/Dim";
import { t, type MessageKey } from "../../text/i18n";

/** A dimension the export or the blocker rules give: every one but a custom column. */
type NamedDim = Exclude<Dim, { Custom: string }>;

/**
 * The name of each dimension, in the text catalog. A dimension that a field of the export
 * supplies has the name that field has everywhere else; the two that the blocker rules derive
 * have their own. A dimension without a name does not compile.
 */
const names: Record<NamedDim, MessageKey> = {
  Discipline: "import.field.Discipline",
  HoldType: "import.field.HoldType",
  Role: "import.field.Role",
  Name: "import.field.Name",
  BlockerType: "filters.dim.BlockerType",
  Blocker: "filters.dim.Blocker",
  Remark: "import.field.Remark",
  LineId: "import.field.LineId",
  ModelSize: "import.field.ModelSize",
  StressCalc: "import.field.StressCalc",
};

/**
 * A dimension in one word, to tell it from every other: `Discipline`, and `Custom:Area` for an
 * extra column of the file. No name of a built-in dimension holds a colon, so a custom column
 * called like one of them still has an id of its own.
 */
export function dimId(dim: Dim): string {
  return typeof dim === "string" ? dim : `Custom:${dim.Custom}`;
}

/** The name of a dimension as the interface writes it. A custom dimension is its header. */
export function dimName(dim: Dim): string {
  return typeof dim === "string" ? t(names[dim]) : dim.Custom;
}

/** Whether two dimensions are the same one. */
export function isSameDim(one: Dim, other: Dim): boolean {
  return dimId(one) === dimId(other);
}
