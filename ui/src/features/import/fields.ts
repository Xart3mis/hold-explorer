import { t, type MessageKey } from "../../app/i18n";
import type { Field } from "../../bindings/Field";

/** The name of each field, in the text catalog. A field without a name does not compile. */
const labels: Record<Field, MessageKey> = {
  SourceId: "import.field.SourceId",
  LineId: "import.field.LineId",
  Name: "import.field.Name",
  Role: "import.field.Role",
  Remark: "import.field.Remark",
  HoldType: "import.field.HoldType",
  Discipline: "import.field.Discipline",
  Created: "import.field.Created",
  Released: "import.field.Released",
  ReleaseRemark: "import.field.ReleaseRemark",
  ReleaseDate: "import.field.ReleaseDate",
  ModelSize: "import.field.ModelSize",
  LdtSize: "import.field.LdtSize",
  StressCalc: "import.field.StressCalc",
};

/** The name of a field as the interface writes it: "Line ID". */
export function fieldLabel(field: Field): string {
  return t(labels[field]);
}

/**
 * The fields an import cannot do without. The engine decides this (`ColumnMap::missing_required` of hx-core)
 * and reports the ones a file lacks, but no command lists them, so the list is repeated here.
 */
export const REQUIRED_FIELDS: readonly Field[] = ["LineId", "Remark", "HoldType"];

/** The other fields, in the order the export writes its columns. */
export const OPTIONAL_FIELDS: readonly Field[] = [
  "SourceId",
  "Name",
  "Role",
  "Discipline",
  "Created",
  "Released",
  "ReleaseRemark",
  "ReleaseDate",
  "ModelSize",
  "LdtSize",
  "StressCalc",
];

/** Every field: the required ones first. */
export const ALL_FIELDS: readonly Field[] = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

/** A mapping: each field that has a column, with the zero-based index of that column. */
export type Fields = Partial<Record<Field, number>>;

/** The header of a column as a list shows it. A column without a header is named by its position. */
export function columnLabel(headers: readonly string[], column: number): string {
  const header = headers[column]?.trim() ?? "";
  return header === "" ? t("import.mapping.columnNoHeader", { number: column + 1 }) : header;
}
