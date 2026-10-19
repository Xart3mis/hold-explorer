import fileColumns from "../../api/file-columns.json";
import type { Filters } from "../../app/filters/state";
import type { Dim } from "../../bindings/Dim";
import type { ExportRequest } from "../../bindings/ExportRequest";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { HoldSort } from "../../bindings/HoldSort";
import type { LineQuery } from "../../bindings/LineQuery";
import type { RowScope } from "../../bindings/RowScope";
import type { Screen } from "../../bindings/Screen";
import type { Status } from "../../bindings/Status";
import { t, type MessageKey } from "../../text/i18n";
import { chipsOf } from "../filters/chips";
import type { ExportChoice } from "./choices";
import { exportText } from "./text";

/** The screens a file is made from: the data screens, with Lines in each of its two modes. */
export type ExportScreen = "overview" | "lines" | "holds" | "breakdown" | "matrix" | "blockers";

/**
 * The columns each screen's file can hold, in table order, as `ui/src/api/file-columns.json`
 * lists them for both sides. The Overview and the matrix write every column of their sheets and
 * have no choice of columns.
 */
export const FILE_COLUMNS: Readonly<Record<ExportScreen, readonly string[]>> = {
  overview: [],
  lines: fileColumns.lines,
  holds: fileColumns.holds,
  breakdown: fileColumns.breakdown,
  matrix: [],
  blockers: fileColumns.blockers,
};

/** What a screen's request is built from: its own state as its address and its table hold it. */
export type ScreenState =
  | { screen: "overview" }
  | { screen: "lines"; query: LineQuery }
  | { screen: "holds"; sort: HoldSort; reverse: boolean }
  | { screen: "breakdown"; dim: Dim; shownKeys: readonly string[] }
  | { screen: "matrix"; rows: Dim; cols: Dim }
  | { screen: "blockers"; shownKeys: readonly string[] };

/**
 * The rows a screen's table holds: how many are loaded, and the keys of those selected, in the
 * order of the table (line IDs, hold positions, group keys, or step keys).
 */
export interface TableRows {
  loaded: number;
  selected: readonly string[];
}

/** The name of each status, as the status control of the filter bar writes it. */
const STATUS_NAMES: Record<Status, MessageKey> = {
  Open: "filters.status.Open",
  Released: "filters.status.Released",
  All: "filters.status.All",
};

/**
 * The filters of the bar as a file names them: one text per chip, as the chip reads ("Discipline
 * Civil", "Area is not North, South"), whether or not the snapshot can apply it. The status is
 * not among them: `buildRequest` adds it, for the status the export applies.
 */
export function filterTexts(filters: Filters): string[] {
  return chipsOf(filters).map((chip) =>
    t(chip.isNegated ? "filterChip.isNot" : "filterChip.is", {
      field: chip.name,
      value: chip.value,
    }),
  );
}

function screenOf(state: ScreenState): Screen {
  switch (state.screen) {
    case "overview":
      return { kind: "Overview" };
    case "lines":
      return { kind: "Lines", query: state.query };
    case "holds":
      return { kind: "Holds", sort: state.sort, reverse: state.reverse };
    case "breakdown":
      return { kind: "Breakdown", dim: state.dim };
    case "matrix":
      return { kind: "Matrix", rows: state.rows, cols: state.cols };
    case "blockers":
      return { kind: "Blockers" };
  }
}

/**
 * The rows of the request. A paged table (Lines, the hold rows) asks for every row, the loaded
 * ones as the first `loaded`, or the selected ones by their keys in the order of the table. A
 * table the page holds whole (Breakdown, Blockers) always asks by keys, in the order shown, so the
 * file has the order the user sees: all of them, or the selected ones. Asked for the selected
 * rows with none selected, or for the loaded rows of a table that has not said how many, it asks
 * for every row. The Overview and the matrix have no rows to choose.
 */
function rowsOf(state: ScreenState, rows: ExportChoice["rows"], table: TableRows | undefined) {
  const selected = table?.selected ?? [];
  switch (state.screen) {
    case "overview":
    case "matrix":
      return { kind: "All" } satisfies RowScope;
    case "lines":
    case "holds":
      if (rows === "selected" && selected.length > 0) {
        return { kind: "Keys", keys: [...selected] } satisfies RowScope;
      }
      if (rows === "loaded" && table !== undefined && table.loaded > 0) {
        return { kind: "First", count: table.loaded } satisfies RowScope;
      }
      return { kind: "All" } satisfies RowScope;
    case "breakdown":
    case "blockers": {
      const chosen = new Set(selected);
      const keys =
        rows === "selected" && chosen.size > 0
          ? state.shownKeys.filter((key) => chosen.has(key))
          : [...state.shownKeys];
      return { kind: "Keys", keys } satisfies RowScope;
    }
  }
}

/**
 * Builds the request of a screen from its state, the filters, and the choice.
 *
 * `spec` is the filter of the screen as the command applies it; `filters` are the chips of the
 * filter bar as `filterTexts` writes them. The status the choice names (`Open`, `Released`, `All`)
 * replaces the filters' for this export only; `filters` keeps the filters' status. The request
 * names the status among the filters when it is not Open. The columns are the chosen ones the
 * screen has, in table order; none chosen means every column. `table` gives the rows the screen's
 * table holds, for a choice of the loaded or the selected rows.
 */
export function buildRequest(
  screen: ScreenState,
  spec: FilterSpec,
  filters: string[],
  choice: ExportChoice,
  table?: TableRows,
): ExportRequest {
  const status = choice.status === "filters" ? spec.status : choice.status;
  const chosen = new Set(choice.columns);
  const columns = FILE_COLUMNS[screen.screen].filter((column) => chosen.has(column));
  const named =
    status === "Open"
      ? [...filters]
      : [t("filters.status.name", { status: t(STATUS_NAMES[status]) }), ...filters];
  return {
    screen: screenOf(screen),
    columns,
    rows: rowsOf(screen, choice.rows, table),
    spec: { ...spec, status },
    text: exportText(),
    filters: named,
  };
}
