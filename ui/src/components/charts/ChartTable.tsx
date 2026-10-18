import { Table2 } from "lucide-react";
import { useId, useMemo, useRef, type SyntheticEvent } from "react";
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
} from "../DataTable/DataTable";
import { Icon } from "../Icon/Icon";
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
}

/** A row of the table view: one text per column, formatted as the chart formats it. */
export interface ChartTableRow {
  key: string;
  cells: readonly string[];
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

/**
 * The table view of a chart: the same numbers, formatted the same, in a read-only table. Every
 * chart builds its rows from the data it draws, so the two cannot differ.
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
        rows={rows}
        rowKey={(row) => row.key}
        height={{ maxRows }}
        isLoading={isLoading === true}
        isStale={isStale === true}
        {...(resultKey === undefined ? {} : { resultKey })}
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
