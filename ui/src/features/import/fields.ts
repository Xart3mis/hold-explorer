import { t, type MessageKey } from "../../text/i18n";
import type { Field } from "../../bindings/Field";

/**
 * The name of each field, in the text catalog, in the order the export writes its columns. A
 * field without a name does not compile.
 */
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

function isField(name: string): name is Field {
  return Object.hasOwn(labels, name);
}

/** Every field, in the order the export writes its columns. */
export const FIELDS: readonly Field[] = Object.keys(labels).filter(isField);

/**
 * The fields in the order a page lists them: the ones the draft calls required first, as the
 * engine orders them, then the others. Which fields are required is the engine's to say
 * (`ImportDraft.required`); nothing here repeats it.
 */
export function orderFields(required: readonly Field[]): {
  required: readonly Field[];
  optional: readonly Field[];
  all: readonly Field[];
} {
  const optional = FIELDS.filter((field) => !required.includes(field));
  return { required, optional, all: [...required, ...optional] };
}

/** A mapping: each field that has a column, with the zero-based index of that column. */
export type Fields = Partial<Record<Field, number>>;

/** The header of a column as a list shows it. A column without a header is named by its position. */
export function columnLabel(headers: readonly string[], column: number): string {
  const header = headers[column]?.trim() ?? "";
  return header === "" ? t("import.mapping.columnNoHeader", { number: column + 1 }) : header;
}
