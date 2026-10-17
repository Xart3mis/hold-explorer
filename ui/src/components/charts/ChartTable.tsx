import { Table2 } from "lucide-react";
import { ToggleButton } from "react-aria-components";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { DataTable, textChars, type DataTableColumn } from "../DataTable/DataTable";
import { Icon } from "../Icon/Icon";
import styles from "./ChartTable.module.css";

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
}

/** A row of the table view: one text per column, formatted as the chart formats it. */
export interface ChartTableRow {
  key: string;
  cells: readonly string[];
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
  className?: string | undefined;
}

/** The widest a column of text is declared, in characters; longer text is cut at the end. */
const TEXT_MOST = 48;

const TABLE_ROWS = 12;

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
  className,
  ...props
}: ChartTableProps) {
  // The rows are all here, so each column is declared from the longest text it holds.
  const tableColumns: DataTableColumn<ChartTableRow>[] = columns.map((column, index) => {
    const longest = rows.reduce(
      (most, row) => Math.max(most, textChars(row.cells[index] ?? "")),
      0,
    );
    return {
      id: column.id,
      header: column.header,
      kind: column.isNumber === true ? "number" : "text",
      isRowHeader: column.isRowHeader === true,
      size:
        column.isNumber === true
          ? { chars: Math.max(1, Math.ceil(longest)) }
          : { flex: 1, minChars: Math.max(1, Math.min(TEXT_MOST, Math.ceil(longest))) },
      cell: (row: ChartTableRow) => row.cells[index] ?? "",
    };
  });
  return (
    <DataTable
      aria-label={props["aria-label"]}
      columns={tableColumns}
      rows={rows}
      rowKey={(row) => row.key}
      height={{ maxRows }}
      isLoading={isLoading === true}
      isStale={isStale === true}
      className={className}
    />
  );
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
