import type { Field } from "../bindings/Field";

/**
 * The name of the column of the raw export that supplies each field, as the export writes it in
 * its header row. These names are not text to translate: a page that says which column a snapshot
 * lacks names it the way the user finds it in the file. A field without a column does not compile.
 */
const columns: Record<Field, string> = {
  SourceId: "id",
  LineId: "line_id",
  Name: "name",
  Role: "role",
  Remark: "hold_remark",
  HoldType: "hold_type",
  Discipline: "discipline",
  Created: "date",
  Released: "released",
  ReleaseRemark: "release_remark",
  ReleaseDate: "release_date",
  ModelSize: "model_size",
  LdtSize: "ldt_size",
  StressCalc: "stress_calc",
};

/** The header of the export column that supplies a field: `model_size`. */
export function exportColumn(field: Field): string {
  return columns[field];
}
