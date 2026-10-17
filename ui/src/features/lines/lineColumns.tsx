import { TriangleAlert } from "lucide-react";
import type { Field } from "../../bindings/Field";
import type { LineRow } from "../../bindings/LineRow";
import { Tag, textChars, type DataTableColumn } from "../../components";
import { formatCount, formatDays, formatList, formatSize } from "../../text/format";
import { t } from "../../text/i18n";
import { LINE_SORTS } from "./sorts";

/** A column of the table, with the fields of the export it needs to have values. */
export interface NeedingColumn<Row> extends DataTableColumn<Row> {
  /** The column is left out when the snapshot has no value in one of these. */
  needs: readonly Field[];
}

/** The room of a figure that is no larger than this: its digits and its separators. */
export function figures(largest: number): number {
  return textChars(formatCount(largest));
}

/** What a cell shows for a value the hold or the line does not have. */
export function missing(): string {
  return t("common.noValue");
}

/** The columns a snapshot has values for, as the table takes them. */
export function present<Row>(
  columns: readonly NeedingColumn<Row>[],
  absent: readonly Field[],
): DataTableColumn<Row>[] {
  return columns.filter((column) => !column.needs.some((field) => absent.includes(field)));
}

const sortable = (id: string) => LINE_SORTS.some((entry) => entry.column === id);

/** Room for the widest age the table may show: four figures of days. */
const DAYS_CHARS = textChars(formatDays(9999));
/** Room for a size of the export: two figures and a fraction. */
const SIZE_CHARS = textChars(formatSize(99.75));

/**
 * The columns of a row per line. The line ID is never cut: its column is as wide as the widest
 * line ID of the result, which the command sends with the rows. A column whose field the snapshot
 * has no value in is left out.
 */
export function lineColumns(widestLineId: number, absent: readonly Field[]) {
  const mismatchLabel = t("lines.sizeMismatch");
  const columns: NeedingColumn<LineRow>[] = [
    {
      id: "line",
      header: t("lines.column.line"),
      cell: (line) => line.line_id,
      kind: "identifier",
      isRowHeader: true,
      size: { chars: widestLineId },
      needs: [],
    },
    {
      id: "holds",
      header: t("lines.column.holds"),
      cell: (line) => formatCount(line.holds),
      kind: "number",
      size: { chars: figures(999) },
      needs: [],
    },
    {
      id: "disciplines",
      header: t("lines.column.disciplines"),
      cell: (line) => formatList(line.disciplines),
      size: { flex: 1, minChars: 14 },
      needs: ["Discipline"],
    },
    {
      id: "holdTypes",
      header: t("lines.column.holdTypes"),
      cell: (line) => formatList(line.hold_types),
      size: { flex: 1, minChars: 12 },
      needs: ["HoldType"],
    },
    {
      id: "blockers",
      header: t("lines.column.blockers"),
      cell: (line) => formatCount(line.blockers),
      kind: "number",
      size: { chars: figures(999) },
      needs: ["Remark"],
    },
    {
      id: "oldest",
      header: t("lines.column.oldest"),
      cell: (line) =>
        line.oldest_age_days === null ? missing() : formatDays(line.oldest_age_days),
      kind: "number",
      size: { chars: DAYS_CHARS },
      needs: ["Created"],
    },
    {
      id: "modelSize",
      header: t("lines.column.modelSize"),
      cell: (line) => (line.model_size === null ? missing() : formatSize(line.model_size)),
      kind: "number",
      size: { chars: SIZE_CHARS },
      needs: ["ModelSize"],
    },
    {
      id: "ldtSize",
      header: t("lines.column.ldtSize"),
      cell: (line) => (line.ldt_size === null ? missing() : formatSize(line.ldt_size)),
      kind: "number",
      size: { chars: SIZE_CHARS },
      needs: ["LdtSize"],
    },
    {
      id: "stressCalc",
      header: t("lines.column.stressCalc"),
      cell: (line) => (line.stress_calc === "" ? missing() : line.stress_calc),
      isSupporting: true,
      size: { chars: 10 },
      needs: ["StressCalc"],
    },
    {
      id: "sizes",
      header: t("lines.column.sizes"),
      cell: (line) =>
        line.size_mismatch ? (
          <Tag tone="warning" icon={TriangleAlert}>
            {mismatchLabel}
          </Tag>
        ) : null,
      // The tag: its words, its icon, and its padding.
      size: { chars: textChars(mismatchLabel) + 4 },
      needs: ["ModelSize", "LdtSize"],
    },
  ];
  return present(
    columns.map((column) => ({ ...column, allowsSorting: sortable(column.id) })),
    absent,
  );
}
