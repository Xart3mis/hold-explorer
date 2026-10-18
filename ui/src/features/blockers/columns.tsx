import type { SolveRow } from "../../bindings/SolveRow";
import type { LeavingColumn } from "../../components";
import { formatCount } from "../../text/format";
import { t } from "../../text/i18n";

/** Room for a count the table may show: `999,999`. */
const COUNT_CHARS = formatCount(999_999).length;

/**
 * The columns of the steps of the solve order: the step, which names the row as it does the
 * points of the curve; its blocker; the blocker's type and discipline; the holds that wait for
 * it; the lines the step frees; and the lines freed by it and the steps before. The blocker is
 * written as the command labels it, in the face of the body: its item is as often a word as a
 * tag (DESIGN.md, the Identifier Rule).
 *
 * A column whose value the blocker panel shows has a priority, and leaves a table that is too
 * narrow for all of them, the highest number first: the discipline, which the blocker's label
 * names already, then the type, then the holds. The step, the blocker, and the two counts of
 * freed lines always stay: they are the solve order.
 */
export function stepColumns(): readonly LeavingColumn<SolveRow>[] {
  return [
    {
      id: "step",
      header: t("blockers.column.step"),
      cell: (row) => formatCount(row.step),
      kind: "number",
      isRowHeader: true,
      size: { chars: COUNT_CHARS },
    },
    {
      id: "blocker",
      header: t("blockers.column.blocker"),
      cell: (row) => row.label,
      // At least as wide as a label such as "Piping / 577-PK-400". A longer label is cut, and read
      // in full in the panel: at 1280 the panel beside the table leaves the four columns that
      // stay no room for more.
      size: { flex: 1, minChars: 20 },
    },
    {
      id: "kind",
      header: t("blockers.column.kind"),
      cell: (row) => row.kind,
      isSupporting: true,
      size: { chars: 10 },
      priority: 2,
    },
    {
      id: "discipline",
      header: t("blockers.column.discipline"),
      cell: (row) => row.discipline,
      isSupporting: true,
      // Room for the longer names, such as "Instrumentation and control".
      size: { chars: 24 },
      priority: 3,
    },
    {
      id: "holds",
      header: t("blockers.column.holds"),
      cell: (row) => formatCount(row.holds),
      kind: "number",
      size: { chars: COUNT_CHARS },
      priority: 1,
    },
    {
      id: "gain",
      header: t("blockers.column.gain"),
      cell: (row) => formatCount(row.gain),
      kind: "number",
      size: { chars: COUNT_CHARS },
    },
    {
      id: "cumulative",
      header: t("blockers.column.cumulative"),
      cell: (row) => formatCount(row.cumulative),
      kind: "number",
      size: { chars: COUNT_CHARS },
    },
  ];
}
