import { Table2 } from "lucide-react";
import { useId, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { ToggleButton } from "react-aria-components";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import {
  columnOfHeader,
  DataTable,
  headerOfColumn,
  isHeaderCut,
  textChars,
  type DataTableColumn,
  type DataTableSort,
} from "../DataTable/DataTable";
import { Icon } from "../Icon/Icon";
import { nextSort, useTableSort } from "../useTableSort";
import styles from "./ChartTable.module.css";
import { ChartTooltip, useChartTooltip } from "./ChartTooltip";

/** Which of its two forms a chart shows. */
export type ChartView = "chart" | "table";

/** A column of the table view. */
export interface ChartTableColumn {
  id: string;
  /** Named as the chart names what it shows: an axis, a dimension, a value. */
  header: string;
  /** Numbers are right-aligned on tabular figures. */
  isNumber?: boolean;
  /** The column that names the row; it stays in view while the others scroll sideways. */
  isRowHeader?: boolean;
  /** The column of the values a chart folded into one, such as the last column of a heatmap. */
  isFolded?: boolean;
  /**
   * The direction of a first press of its header: the most first for a number, from A for text,
   * unless the column says otherwise (the steps of a curve, from the first).
   */
  sortFirst?: "ascending" | "descending";
}

/**
 * A row of the table view: one text per column, formatted as the chart formats it, and the value
 * each text formats, by which the column sorts.
 */
export interface ChartTableRow {
  key: string;
  cells: readonly string[];
  /** The raw value of each cell, one per column; `null` for a cell without one. */
  values: readonly (string | number | null)[];
  /** The row of the values a chart folded into one, such as the last row of a heatmap. */
  isFolded?: boolean;
}

export interface ChartTableProps {
  "aria-label": string;
  columns: readonly ChartTableColumn[];
  rows: readonly ChartTableRow[];
  /** How many rows show before the table scrolls. */
  maxRows?: number;
  /** A first load: skeleton rows. */
  isLoading?: boolean;
  /** A refetch: the rows of before, dimmed. */
  isStale?: boolean;
  /**
   * What the numbers are a result of (the filter, the snapshot): when it changes, the table view
   * returns to its top, as a table does with its rows (see `DataTable`'s `resultKey`).
   */
  resultKey?: string;
  className?: string | undefined;
}

/** The widest a column of text is declared, in characters; longer text is cut at the end. */
const TEXT_MOST = 48;

const TABLE_ROWS = 12;

/**
 * The most characters of a header a column makes room for. The headers of a table view are
 * values of the data, such as thirty long remarks; a longer one is cut at the end, and shows
 * whole in a tooltip.
 */
const HEADER_MOST = 24;

/** The folded row stays last whatever the sort, as the chart draws it last. */
const isFoldedRow = (row: ChartTableRow) => row.isFolded === true;

/**
 * The table view of a chart: the same numbers, formatted the same, in a read-only table. Every
 * chart builds its rows from the data it draws, so the two cannot differ. Every column sorts by
 * the values of its cells; the rows start in the order of the chart, unmarked, and a folded row
 * stays last. The sort is the table's own: it is not kept when the table goes, and it is
 * forgotten when the columns are others.
 */
export function ChartTable({
  columns,
  rows,
  maxRows = TABLE_ROWS,
  isLoading,
  isStale,
  resultKey,
  className,
  ...props
}: ChartTableProps) {
  const area = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const tip = useChartTooltip<string>();
  // The headers that are cut, by column id, with their whole text.
  const cut = useMemo(
    () =>
      new Map(
        columns
          .filter((column) => isHeaderCut(column.header, HEADER_MOST))
          .map((column) => [column.id, column.header]),
      ),
    [columns],
  );
  const shown = tip.active === null ? undefined : cut.get(tip.active);
  /** Shows the whole text of a cut header that the event is at; anywhere else, it goes. */
  const onHeader = (event: SyntheticEvent, show: (id: string) => void, hide: () => void) => {
    const id = columnOfHeader(event.target);
    if (id !== null && cut.has(id)) show(id);
    else hide();
  };

  // The rows are all here, so each column is declared from the longest text it holds. The
  // columns are declared once for the columns and rows they are given: new columns would have
  // the table build every row again, at each render of the chart.
  const tableColumns = useMemo(() => declareColumns(columns, rows), [columns, rows]);
  // The sort, for the columns it was asked for: other columns (a heatmap of other dimensions)
  // start again in the order of the chart.
  const [asked, setAsked] = useState<{
    columns: readonly ChartTableColumn[];
    sort: DataTableSort;
  }>();
  const sort = asked?.columns === columns ? asked.sort : undefined;
  const sorted = useTableSort(rows, tableColumns, sort, isFoldedRow);
  // Another sort is another result: the table returns to its top.
  const sortedKey =
    sort === undefined ? resultKey : `${resultKey ?? ""}|${sort.column}:${sort.direction}`;
  return (
    <div
      ref={area}
      className={styles.area}
      onFocus={(event) => {
        onHeader(event, tip.focus, tip.blur);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) tip.blur();
      }}
      onPointerOver={(event) => {
        onHeader(event, tip.hover, tip.leave);
      }}
      onPointerLeave={tip.leave}
    >
      <DataTable
        aria-label={props["aria-label"]}
        columns={tableColumns}
        rows={sorted}
        rowKey={(row) => row.key}
        {...(sort === undefined ? {} : { sort })}
        onSortChange={(pressed) => {
          setAsked({ columns, sort: nextSort(tableColumns, sort, pressed.column) });
        }}
        height={{ maxRows }}
        isLoading={isLoading === true}
        isStale={isStale === true}
        {...(sortedKey === undefined ? {} : { resultKey: sortedKey })}
        className={className}
      />
      <ChartTooltip
        id={tooltipId}
        anchor={
          shown === undefined || tip.active === null
            ? null
            : () =>
                area.current === null || tip.active === null
                  ? null
                  : headerOfColumn(area.current, tip.active)
        }
        rows={shown === undefined ? [] : [{ label: t("charts.column"), value: shown }]}
      />
    </div>
  );
}

/** The columns of the table view, each declared from the longest text it holds in `rows`. */
function declareColumns(
  columns: readonly ChartTableColumn[],
  rows: readonly ChartTableRow[],
): DataTableColumn<ChartTableRow>[] {
  return columns.map((column, index) => {
    const longest = rows.reduce(
      (most, row) => Math.max(most, textChars(row.cells[index] ?? "")),
      0,
    );
    return {
      id: column.id,
      header: column.header,
      kind: column.isNumber === true ? "number" : "text",
      isRowHeader: column.isRowHeader === true,
      headerChars: HEADER_MOST,
      sortValue: (row: ChartTableRow) => row.values[index] ?? null,
      sortFirst: column.sortFirst ?? (column.isNumber === true ? "descending" : "ascending"),
      size:
        column.isNumber === true
          ? { chars: Math.max(1, Math.ceil(longest)) }
          : { flex: 1, minChars: Math.max(1, Math.min(TEXT_MOST, Math.ceil(longest))) },
      cell: (row: ChartTableRow) => {
        const text = row.cells[index] ?? "";
        // A folded row or column is written in the ink the chart gives its fold.
        return row.isFolded === true || column.isFolded === true ? (
          <span data-folded="" className={styles.folded}>
            {text}
          </span>
        ) : (
          text
        );
      },
    };
  });
}

export interface ChartViewToggleProps {
  view: ChartView;
  onChange: (view: ChartView) => void;
  className?: string | undefined;
}

/**
 * The toggle between a chart and its table view, which every chart has. A quiet toggle button
 * that is marked while the table shows. The focus stays on it when it is pressed.
 */
export function ChartViewToggle({ view, onChange, className }: ChartViewToggleProps) {
  return (
    <ToggleButton
      isSelected={view === "table"}
      onChange={(table) => {
        onChange(table ? "table" : "chart");
      }}
      className={cx(styles.toggle, className)}
    >
      <Icon icon={Table2} />
      {t("charts.tableView")}
    </ToggleButton>
  );
}
