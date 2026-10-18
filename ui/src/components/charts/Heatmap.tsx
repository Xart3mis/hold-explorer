import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Skeleton } from "../Skeleton/Skeleton";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import {
  ChartTable,
  type ChartTableColumn,
  type ChartTableRow,
  type ChartView,
} from "./ChartTable";
import { ChartTooltip, useChartTooltip, type ChartTooltipRow } from "./ChartTooltip";
import styles from "./Heatmap.module.css";
import { RAMP_STEPS, step } from "./scale";

/** A value of one of the two dimensions: what a filter takes (`key`) and what is shown (`label`). */
export interface HeatmapItem {
  key: string;
  label: string;
}

export interface HeatmapProps {
  /** The name of the grid: "Holds by discipline and hold type". */
  "aria-label": string;
  /** The values of the row dimension, in the order to show them, Other left out. */
  rows: readonly HeatmapItem[];
  /** The values of the column dimension, in the order to show them, Other left out. */
  cols: readonly HeatmapItem[];
  /**
   * `cells[r][c]` is the value of row r and column c. With `otherRow`, the last row of cells is
   * Other; with `otherCol`, the last column is.
   */
  cells: readonly (readonly number[])[];
  /** The upper end of the color domain, as the command gives it. */
  max: number;
  /** The name of the Other row, when the command folded row values into one. */
  otherRow?: string | undefined;
  /** The name of the Other column, when the command folded column values into one. */
  otherCol?: string | undefined;
  /** Called with the keys of a cell that is pressed. Cells of Other are never pressed. */
  onCellPress?: (rowKey: string, colKey: string) => void;
  /**
   * What a press on a cell does, as the last line of the tooltip of every cell that can be
   * pressed: "Press to open these holds in Lines". The screen also says it above the grid.
   */
  pressHint?: string | undefined;
  /** Formats a value, for the cells, the tooltip, the legend, and the table view alike. */
  formatCell: (value: number) => string;
  /** The name of the row dimension: the corner, the tooltip, the first column of the table. */
  rowsLabel: string;
  /** The name of the column dimension, in the tooltip. */
  colsLabel: string;
  /** What a value counts, in the tooltip: "Holds". */
  valueLabel: string;
  /** The chart, or its table view. */
  view?: ChartView;
  /** A first load: skeleton blocks in the shape of the grid. */
  isLoading?: boolean;
  /** A refetch: the grid of before, dimmed. */
  isStale?: boolean;
  /** What shows in the place of the grid when it has no row or no column. */
  emptyState?: ReactNode;
  /**
   * What the numbers are a result of (the filter, the snapshot): when it changes, the table view
   * returns to its top, as a table does with its rows (see `DataTable`'s `resultKey`).
   */
  resultKey?: string;
  className?: string | undefined;
}

/** How large the skeleton of a first load is. */
const SKELETON_ROWS = 6;
const SKELETON_COLS = 8;

/** A cell's place, as the tooltip and the focus know it. */
const placeKey = (row: number, col: number) => `${String(row)}:${String(col)}`;

interface Axis {
  items: readonly HeatmapItem[];
  /** The index of Other, past the real values, or -1. */
  other: number;
}

function axis(
  items: readonly HeatmapItem[],
  other: string | undefined,
): Axis & {
  all: readonly HeatmapItem[];
} {
  if (other === undefined) return { items, other: -1, all: items };
  // Other has no key a filter could take; the empty key here never leaves the component.
  return { items, other: items.length, all: [...items, { key: "", label: other }] };
}

/**
 * A count for every pair of two dimensions, as a grid of cells colored by the step of their
 * value, with a legend. One stop in the Tab order: the arrow keys move from cell to cell, Home
 * and End to the ends of a row, and with Ctrl to the ends of the grid. A cell shows its tooltip
 * at once on focus and after the tooltip delay under the pointer. See DESIGN.md, "Heatmap".
 */
export function Heatmap({
  rows,
  cols,
  cells,
  max,
  otherRow,
  otherCol,
  onCellPress,
  pressHint,
  formatCell,
  rowsLabel,
  colsLabel,
  valueLabel,
  view = "chart",
  isLoading,
  isStale,
  resultKey,
  emptyState,
  className,
  ...props
}: HeatmapProps) {
  const name = props["aria-label"];
  const across = axis(cols, otherCol);
  const down = axis(rows, otherRow);
  const rowCount = down.all.length;
  const colCount = across.all.length;
  const loading = isLoading === true;
  const stale = isStale === true && !loading;

  if (view === "table") {
    return (
      <ChartTable
        aria-label={t("charts.tableName", { name })}
        {...heatmapTable(
          down.all,
          across.all,
          cells,
          formatCell,
          rowsLabel,
          down.other,
          across.other,
        )}
        isLoading={loading}
        isStale={stale}
        {...(resultKey === undefined ? {} : { resultKey })}
        className={className}
      />
    );
  }

  if (loading) {
    return (
      <div aria-busy="true" className={cx(styles.heatmap, className)}>
        <VisuallyHidden>{t("common.loading")}</VisuallyHidden>
        <div className={styles.skeleton} aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <div key={row} className={styles.skeletonRow}>
              <Skeleton width={`${String(8 + ((row * 5) % 7))}ch`} />
              {Array.from({ length: SKELETON_COLS }, (__, col) => (
                <span key={col} className={styles.skeletonCell} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rowCount === 0 || colCount === 0) {
    return <div className={cx(styles.heatmap, className)}>{emptyState}</div>;
  }

  return (
    <div className={cx(styles.heatmap, className)} data-stale={stale ? "" : undefined}>
      <Legend max={max} formatCell={formatCell} />
      <HeatmapGrid
        name={name}
        down={down}
        across={across}
        cells={cells}
        max={max}
        onCellPress={onCellPress}
        pressHint={pressHint}
        formatCell={formatCell}
        rowsLabel={rowsLabel}
        colsLabel={colsLabel}
        valueLabel={valueLabel}
      />
    </div>
  );
}

interface GridProps {
  name: string;
  down: Axis & { all: readonly HeatmapItem[] };
  across: Axis & { all: readonly HeatmapItem[] };
  cells: readonly (readonly number[])[];
  max: number;
  onCellPress: ((rowKey: string, colKey: string) => void) | undefined;
  pressHint: string | undefined;
  formatCell: (value: number) => string;
  rowsLabel: string;
  colsLabel: string;
  valueLabel: string;
}

function HeatmapGrid({
  name,
  down,
  across,
  cells,
  max,
  onCellPress,
  pressHint,
  formatCell,
  rowsLabel,
  colsLabel,
  valueLabel,
}: GridProps) {
  const rowCount = down.all.length;
  const colCount = across.all.length;
  const tooltipId = useId();
  const tip = useChartTooltip<string>();
  const elements = useRef(new Map<string, HTMLElement>());
  // The cell that holds the one stop of the Tab order: the one the keyboard was last on.
  const [stop, setStop] = useState({ row: 0, col: 0 });
  const at = {
    row: Math.min(stop.row, rowCount - 1),
    col: Math.min(stop.col, colCount - 1),
  };

  const valueAt = useCallback((row: number, col: number) => cells[row]?.[col] ?? 0, [cells]);
  const isPressable = (row: number, col: number) =>
    onCellPress !== undefined && row !== down.other && col !== across.other;

  const press = (row: number, col: number) => {
    const rowItem = down.all[row];
    const colItem = across.all[col];
    if (!onCellPress || !rowItem || !colItem || !isPressable(row, col)) return;
    onCellPress(rowItem.key, colItem.key);
  };

  const moveTo = (row: number, col: number) => {
    const next = {
      row: Math.max(0, Math.min(rowCount - 1, row)),
      col: Math.max(0, Math.min(colCount - 1, col)),
    };
    setStop(next);
    elements.current.get(placeKey(next.row, next.col))?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { row, col } = at;
    const whole = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "ArrowRight":
        moveTo(row, col + 1);
        break;
      case "ArrowLeft":
        moveTo(row, col - 1);
        break;
      case "ArrowDown":
        moveTo(row + 1, col);
        break;
      case "ArrowUp":
        moveTo(row - 1, col);
        break;
      case "Home":
        moveTo(whole ? 0 : row, 0);
        break;
      case "End":
        moveTo(whole ? rowCount - 1 : row, colCount - 1);
        break;
      case "Enter":
        press(row, col);
        break;
      case "Escape":
        if (tip.active === null) return;
        tip.dismiss();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const activeCell = useMemo(() => {
    if (tip.active === null) return null;
    const [row, col] = tip.active.split(":").map(Number);
    return row === undefined || col === undefined ? null : { row, col };
  }, [tip.active]);

  const tooltipRows = useMemo((): ChartTooltipRow[] => {
    if (activeCell === null) return [];
    const { row, col } = activeCell;
    const value = valueAt(row, col);
    return [
      { label: rowsLabel, value: down.all[row]?.label ?? "" },
      { label: colsLabel, value: across.all[col]?.label ?? "" },
      { label: valueLabel, value: formatCell(value), mark: step(value, max, RAMP_STEPS) },
    ];
  }, [
    activeCell,
    valueAt,
    rowsLabel,
    colsLabel,
    valueLabel,
    down.all,
    across.all,
    formatCell,
    max,
  ]);

  const columns = { "--heatmap-cols": across.items.length } as CSSProperties;

  return (
    <div className={styles.region}>
      <div
        role="grid"
        aria-label={name}
        aria-rowcount={rowCount + 1}
        aria-colcount={colCount + 1}
        className={styles.grid}
        data-other-col={across.other >= 0 ? "" : undefined}
        style={columns}
        onPointerLeave={tip.leave}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) tip.blur();
        }}
      >
        <div role="row" aria-rowindex={1} className={styles.headRow}>
          <div role="columnheader" aria-colindex={1} className={styles.corner}>
            <span className={styles.cornerLabel}>{rowsLabel}</span>
          </div>
          {across.all.map((item, col) => (
            <div
              key={col}
              role="columnheader"
              aria-colindex={col + 2}
              className={styles.colLabel}
              data-other={col === across.other ? "" : undefined}
            >
              <span className={styles.upright}>{item.label}</span>
            </div>
          ))}
        </div>
        {down.all.map((item, row) => (
          <div
            key={row}
            role="row"
            aria-rowindex={row + 2}
            className={styles.row}
            data-other={row === down.other ? "" : undefined}
          >
            <div role="rowheader" aria-colindex={1} className={styles.rowLabel}>
              {item.label}
            </div>
            {across.all.map((_, col) => {
              const value = valueAt(row, col);
              const key = placeKey(row, col);
              const shown = tip.active === key;
              return (
                <div
                  key={col}
                  ref={(element) => {
                    if (element) elements.current.set(key, element);
                    else elements.current.delete(key);
                  }}
                  role="gridcell"
                  aria-colindex={col + 2}
                  tabIndex={row === at.row && col === at.col ? 0 : -1}
                  aria-describedby={shown ? tooltipId : undefined}
                  className={styles.cell}
                  data-step={step(value, max, RAMP_STEPS)}
                  data-other={col === across.other ? "" : undefined}
                  data-pressable={isPressable(row, col) ? "" : undefined}
                  onFocus={() => {
                    setStop({ row, col });
                    tip.focus(key);
                  }}
                  onKeyDown={onKeyDown}
                  onPointerEnter={() => {
                    tip.hover(key);
                  }}
                  onClick={() => {
                    press(row, col);
                  }}
                >
                  {value > 0 ? (
                    <span data-part="value">{formatCell(value)}</span>
                  ) : (
                    <VisuallyHidden>{formatCell(0)}</VisuallyHidden>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ChartTooltip
        id={tooltipId}
        anchor={
          tip.active === null
            ? null
            : () => (tip.active === null ? null : (elements.current.get(tip.active) ?? null))
        }
        rows={tooltipRows}
        note={
          activeCell !== null && isPressable(activeCell.row, activeCell.col) ? pressHint : undefined
        }
      />
    </div>
  );
}

/** The key of the heatmap: the empty cell, then the ramp from few to the domain it was given. */
function Legend({ max, formatCell }: { max: number; formatCell: (value: number) => string }) {
  return (
    <div role="group" aria-label={t("charts.legend")} className={styles.legend}>
      <span className={styles.legendPart}>
        <span aria-hidden="true" className={styles.legendSwatch} data-step={0} />
        {formatCell(0)}
      </span>
      <span className={styles.legendPart}>
        {t("charts.legendFewer")}
        <span aria-hidden="true" className={styles.legendRamp}>
          {Array.from({ length: RAMP_STEPS }, (_, index) => (
            <span key={index} className={styles.legendStep} data-step={index + 1} />
          ))}
        </span>
        {t("charts.legendMore", { max: formatCell(max) })}
      </span>
    </div>
  );
}

/**
 * The table view of a heatmap: a row per row value, a column per column value, Other last, its
 * row (`otherRow`) and its column (`otherCol`) marked as folded.
 */
export function heatmapTable(
  rows: readonly HeatmapItem[],
  cols: readonly HeatmapItem[],
  cells: readonly (readonly number[])[],
  formatCell: (value: number) => string,
  rowsLabel: string,
  otherRow = -1,
  otherCol = -1,
): { columns: ChartTableColumn[]; rows: ChartTableRow[] } {
  return {
    columns: [
      { id: "row", header: rowsLabel, isRowHeader: true },
      ...cols.map((col, index) => ({
        id: `col-${String(index)}`,
        header: col.label,
        isNumber: true,
        ...(index === otherCol ? { isFolded: true } : {}),
      })),
    ],
    rows: rows.map((row, r) => ({
      key: `${String(r)}:${row.key}`,
      cells: [row.label, ...cols.map((_, c) => formatCell(cells[r]?.[c] ?? 0))],
      ...(r === otherRow ? { isFolded: true } : {}),
    })),
  };
}
