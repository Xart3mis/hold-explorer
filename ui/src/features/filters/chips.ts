import { dimId, dimName } from "../../app/filters/dims";
import type { Filters } from "../../app/filters/state";
import type { Dim } from "../../bindings/Dim";
import { formatAgeBand, formatDateRange, formatList } from "../../text/format";
import { t } from "../../text/i18n";

/**
 * What a filter can be on: a dimension, with the values kept or left out, or one of the five
 * filters that are not a dimension. The status is none of them: it is always set.
 */
export type FilterField =
  | { kind: "dim"; dim: Dim }
  | { kind: "ageBands" }
  | { kind: "created" }
  | { kind: "released" }
  | { kind: "sizeMismatch" }
  | { kind: "text" };

/** A field in one word, to tell it from every other: `dim:Discipline`, `ageBands`. */
export function fieldId(field: FilterField): string {
  return field.kind === "dim" ? `dim:${dimId(field.dim)}` : field.kind;
}

/**
 * The name of a field as a chip and its picker write it. A field that a column of the export
 * supplies has the name that column has everywhere else in the interface.
 */
export function fieldName(field: FilterField): string {
  switch (field.kind) {
    case "dim":
      return dimName(field.dim);
    case "ageBands":
      return t("filters.field.age");
    case "created":
      return t("import.field.Created");
    case "released":
      return t("import.field.ReleaseDate");
    case "sizeMismatch":
      return t("filters.field.sizeMismatch");
    case "text":
      return t("filters.field.text");
  }
}

/** One active filter as the bar shows it. */
export interface Chip {
  /** The id of its field. A field has at most one chip. */
  id: string;
  field: FilterField;
  /** The name of the field: "Discipline". */
  name: string;
  /** What it is filtered to, as text: "Civil", "Civil, Piping", "Civil +3". */
  value: string;
  /** The filter keeps what does not match. */
  isNegated: boolean;
  /** The filters without this one. */
  remove: (filters: Filters) => Filters;
}

/**
 * Several values in the room of a chip: one by its label, two as a list, more as the first and
 * how many more there are. The picker the chip opens lists every one.
 */
function summary(labels: readonly string[]): string {
  const [first = "", ...others] = labels;
  if (others.length === 0) return first;
  if (others.length === 1) return formatList(labels);
  return t("filters.more", { first, more: others.length });
}

/**
 * The chips of the filters: the fields first, in the order they were added, then the filters that
 * are not a field, in the order the picker lists them. An entry without values filters nothing
 * and has no chip, and neither has the status.
 */
export function chipsOf(filters: Filters): Chip[] {
  const chips: Chip[] = [];
  for (const entry of filters.fields) {
    if (entry.values.length === 0) continue;
    const field: FilterField = { kind: "dim", dim: entry.dim };
    const id = fieldId(field);
    chips.push({
      id,
      field,
      name: fieldName(field),
      value: summary(entry.values.map((value) => value.label)),
      isNegated: entry.negate,
      remove: (from) => ({
        ...from,
        fields: from.fields.filter((other) => fieldId({ kind: "dim", dim: other.dim }) !== id),
      }),
    });
  }
  const single = (field: FilterField, value: string, remove: Chip["remove"]) => {
    chips.push({
      id: fieldId(field),
      field,
      name: fieldName(field),
      value,
      isNegated: false,
      remove,
    });
  };
  if (filters.ageBands.length > 0) {
    single({ kind: "ageBands" }, summary(filters.ageBands.map(formatAgeBand)), (from) => ({
      ...from,
      ageBands: [],
    }));
  }
  if (filters.created.from !== null || filters.created.to !== null) {
    single({ kind: "created" }, formatDateRange(filters.created), (from) => ({
      ...from,
      created: { from: null, to: null },
    }));
  }
  if (filters.released.from !== null || filters.released.to !== null) {
    single({ kind: "released" }, formatDateRange(filters.released), (from) => ({
      ...from,
      released: { from: null, to: null },
    }));
  }
  if (filters.sizeMismatch !== null) {
    single(
      { kind: "sizeMismatch" },
      t(filters.sizeMismatch ? "filters.sizeMismatch.differ" : "filters.sizeMismatch.match"),
      (from) => ({ ...from, sizeMismatch: null }),
    );
  }
  if (filters.text !== "") {
    single({ kind: "text" }, t("filters.textValue", { text: filters.text }), (from) => ({
      ...from,
      text: "",
    }));
  }
  return chips;
}
