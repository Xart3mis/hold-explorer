import type { Field } from "../bindings/Field";
import names from "./export-columns.json";
import required from "./required-fields.json";

/**
 * The name of the column that supplies each field in an export of PlantIM: the name the Rust side
 * uses in its own messages about missing columns (`Field::label`). It is not text to translate.
 * It is not always the header of the file a snapshot came from: a file may use another header the
 * import accepts, or a column that was mapped by hand.
 *
 * The names are in the fixture beside this module, which a Rust test reads as well and compares
 * with the labels of the fields, so the two sides cannot name a column differently. A field
 * without a name does not compile here.
 */
const columns: Record<Field, string> = names;

/** The name PlantIM gives the column that supplies a field: `model_size`. */
export function exportColumn(field: Field): string {
  return columns[field];
}

/**
 * The fields an import may be without, in the order the export writes its columns: every field
 * but those the engine requires (`Field::REQUIRED`), which are in the fixture beside this module
 * that a Rust test compares with the engine's.
 */
export const OPTIONAL_FIELDS: readonly Field[] = (Object.keys(columns) as Field[]).filter(
  (field) => !(required as readonly string[]).includes(field),
);
