import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { lengthToken } from "../../design/token-values";
import { formatCount } from "../../text/format";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import {
  ChartTable,
  type ChartTableColumn,
  type ChartTableRow,
  type ChartView,
} from "./ChartTable";
import { ChartTooltip, useChartTooltip, type ChartTooltipRow } from "./ChartTooltip";
import styles from "./LineChart.module.css";
import { ticks } from "./scale";

/** A point of the line: where it is, and what it is called. */
export interface LinePoint {
  x: number;
  y: number;
  /** The name of the point, in the tooltip and the table view: the blocker of a step. */
  label: string;
}

export interface LineChartProps {
  /** The name of the chart: "Lines freed by the solve order". */
  "aria-label": string;
  /** The points, in the order of x. */
  points: readonly LinePoint[];
  /** The top of the value axis, as the command gives it. */
  yMax: number;
  /** The name of x: "Step". */
  xLabel: string;
  /** The name of y: "Lines freed". */
  yLabel: string;
  /** What the label of a point names, as the header of its column in the table view: "Blocker". */
  labelName: string;
  /** Formats a value of y, for the axis, the tooltip, and the table view alike. */
  formatY: (value: number) => string;
  /** Formats a value of x; a whole number with its thousands separated unless another is given. */
  formatX?: (value: number) => string;
  /** Called with the point that is pressed, and its index. */
  onPointPress?: (point: LinePoint, index: number) => void;
  /** The index of the point the screen has selected; it keeps its marker. */
  selectedIndex?: number | null;
  /** Called with the index of the point the pointer or the keyboard is on, or `null`. */
  onActiveChange?: (index: number | null) => void;
  /** The chart, or its table view. */
  view?: ChartView;
  /**
   * How many rows the table view shows before it scrolls; twelve unless the screen keeps it to
   * fewer, so that a table of its own under the chart keeps its room.
   */
  tableRows?: number;
  /** A first load: a skeleton block as large as the plot. */
  isLoading?: boolean;
  /** A refetch: the chart of before, dimmed. */
  isStale?: boolean;
  /** What shows in the place of the chart when it has no point. */
  emptyState?: ReactNode;
  className?: string | undefined;
}

/** The most ticks past the first on each axis. */
const Y_TICKS = 5;
const X_TICKS = 8;

/** Page Up and Page Down move by this share of the points, and by one point at least. */
const PAGE_SHARE = 10;

/** The index of the point nearest to `x`, in points ordered by x. */
function nearest(points: readonly LinePoint[], x: number): number {
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if ((points[middle]?.x ?? 0) < x) low = middle;
    else high = middle;
  }
  const below = points[low]?.x ?? 0;
  const above = points[high]?.x ?? 0;
  return Math.abs(x - below) <= Math.abs(above - x) ? low : high;
}

/** The size of an element as it is laid out, from the first layout on. */
function useSize<T extends Element>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize((previous) =>
        previous.width === box.width && previous.height === box.height
          ? previous
          : { width: box.width, height: box.height },
      );
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, size] as const;
}

/**
 * A series of points joined by one line, on one value axis from 0 to `yMax`. One stop in the
 * Tab order: the arrow keys move from point to point, Page Up and Page Down by a tenth of them,
 * Home and End to the ends, and Enter presses the point. The point under the pointer or the
 * keyboard shows a marker, a hairline at its x, and its tooltip. See DESIGN.md, "Line chart".
 */
export function LineChart({
  points,
  yMax,
  xLabel,
  yLabel,
  labelName,
  formatY,
  formatX = formatCount,
  onPointPress,
  selectedIndex = null,
  onActiveChange,
  view = "chart",
  tableRows,
  isLoading,
  isStale,
  emptyState,
  className,
  ...props
}: LineChartProps) {
  const name = props["aria-label"];
  const loading = isLoading === true;
  const stale = isStale === true && !loading;

  if (view === "table") {
    return (
      <ChartTable
        aria-label={t("charts.tableName", { name })}
        {...lineChartTable(points, xLabel, labelName, yLabel, formatX, formatY)}
        {...(tableRows === undefined ? {} : { maxRows: tableRows })}
        isLoading={loading}
        isStale={stale}
        className={className}
      />
    );
  }

  if (loading) {
    return (
      <div aria-busy="true" className={cx(styles.chart, className)}>
        <VisuallyHidden>{t("common.loading")}</VisuallyHidden>
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  if (points.length === 0) {
    return <div className={cx(styles.chart, className)}>{emptyState}</div>;
  }

  return (
    <div className={cx(styles.chart, className)} data-stale={stale ? "" : undefined}>
      <Plot
        name={name}
        points={points}
        yMax={yMax}
        xLabel={xLabel}
        yLabel={yLabel}
        labelName={labelName}
        formatX={formatX}
        formatY={formatY}
        onPointPress={onPointPress}
        selectedIndex={selectedIndex}
        onActiveChange={onActiveChange}
      />
    </div>
  );
}

interface PlotProps {
  name: string;
  points: readonly LinePoint[];
  yMax: number;
  xLabel: string;
  yLabel: string;
  labelName: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  onPointPress: ((point: LinePoint, index: number) => void) | undefined;
  selectedIndex: number | null;
  onActiveChange: ((index: number | null) => void) | undefined;
}

function Plot({
  name,
  points,
  yMax,
  xLabel,
  yLabel,
  labelName,
  formatX,
  formatY,
  onPointPress,
  selectedIndex,
  onActiveChange,
}: PlotProps) {
  const [plotRef, size] = useSize<HTMLDivElement>();
  const markerAnchor = useRef<SVGCircleElement>(null);
  const optionId = useId();
  const tooltipId = useId();
  const tip = useChartTooltip<number>();
  const last = points.length - 1;
  const selected =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex <= last ? selectedIndex : null;
  // The point of the keyboard: where it last was, or the selected point, or the first.
  const [cursor, setCursor] = useState<number | null>(null);
  const keyIndex = Math.min(cursor ?? selected ?? 0, last);
  const [isFocused, setFocused] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? (isFocused ? keyIndex : null);

  const first = points[0]?.x ?? 0;
  const end = points[last]?.x ?? 0;
  const top = yMax > 0 ? yMax : 1;
  const { width, height } = size;

  const xAt = (x: number) => (end > first ? ((x - first) / (end - first)) * width : width / 2);
  const yAt = (y: number) => height - (Math.min(Math.max(y, 0), top) / top) * height;

  const path = useMemo(() => {
    if (width <= 0) return "";
    const span = end - first;
    const parts: string[] = [];
    points.forEach((point, index) => {
      const px = span > 0 ? ((point.x - first) / span) * width : width / 2;
      const py = height - (Math.min(Math.max(point.y, 0), top) / top) * height;
      parts.push(`${index === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`);
    });
    return parts.join("");
  }, [points, width, height, first, end, top]);

  const yTicks = ticks(0, top, Y_TICKS);
  const xTicks = ticks(first, end, X_TICKS);

  // The screen hears of the shown point when it changes, and not at each of its own renders.
  const reportActive = useRef(onActiveChange);
  const reported = useRef<number | null>(null);
  useEffect(() => {
    reportActive.current = onActiveChange;
  }, [onActiveChange]);
  useEffect(() => {
    if (reported.current === shown) return;
    reported.current = shown;
    reportActive.current?.(shown);
  }, [shown]);

  // The keyboard's point leads from here on: the pointer leads again when it moves.
  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(last, index));
    setCursor(next);
    setHovered(null);
    tip.focus(next);
  };

  const press = (index: number) => {
    const point = points[index];
    if (point && onPointPress) onPointPress(point, index);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const page = Math.max(1, Math.round(points.length / PAGE_SHARE));
    switch (event.key) {
      case "ArrowRight":
        moveTo(keyIndex + 1);
        break;
      case "ArrowLeft":
        moveTo(keyIndex - 1);
        break;
      case "PageDown":
        moveTo(keyIndex + page);
        break;
      case "PageUp":
        moveTo(keyIndex - page);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(last);
        break;
      case "Enter":
        press(keyIndex);
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

  const pointAt = (event: MouseEvent<SVGSVGElement>): number => {
    const box = event.currentTarget.getBoundingClientRect();
    const share = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
    return nearest(points, first + share * (end - first));
  };

  const markers = new Map<number, { active: boolean; selected: boolean }>();
  if (points.length === 1) markers.set(0, { active: false, selected: false });
  if (selected !== null) markers.set(selected, { active: false, selected: true });
  if (shown !== null) markers.set(shown, { active: true, selected: shown === selected });

  const keyPoint = points[keyIndex];
  const tipPoint = tip.active === null ? undefined : points[tip.active];
  const tooltipRows: ChartTooltipRow[] =
    tipPoint === undefined
      ? []
      : [
          { label: labelName, value: tipPoint.label },
          { label: xLabel, value: formatX(tipPoint.x) },
          { label: yLabel, value: formatY(tipPoint.y), mark: "line" },
        ];

  return (
    <div
      role="listbox"
      aria-label={name}
      // A list box of the page, not one that opens over it: the shortcuts stay on around it.
      data-in-page=""
      aria-activedescendant={`${optionId}-${String(keyIndex)}`}
      tabIndex={0}
      className={styles.box}
      onKeyDown={onKeyDown}
      onFocus={() => {
        setFocused(true);
        tip.focus(keyIndex);
      }}
      onBlur={() => {
        setFocused(false);
        tip.blur();
      }}
    >
      <span
        // A new id at every move, so assistive technology announces the move.
        id={`${optionId}-${String(keyIndex)}`}
        role="option"
        aria-selected={keyIndex === selected}
        aria-posinset={keyIndex + 1}
        aria-setsize={points.length}
        aria-describedby={tip.active === null ? undefined : tooltipId}
        className={styles.option}
      >
        {keyPoint === undefined
          ? null
          : t("charts.point", {
              label: keyPoint.label,
              xLabel,
              x: formatX(keyPoint.x),
              yLabel,
              y: formatY(keyPoint.y),
            })}
      </span>
      <div aria-hidden="true" className={styles.yName}>
        {yLabel}
      </div>
      <div aria-hidden="true" className={styles.frame}>
        <div className={styles.yAxis}>
          {yTicks.map((value) => (
            <span
              key={value}
              className={styles.yTick}
              style={{ insetBlockStart: `${String(yAt(value))}px` }}
            >
              {formatY(value)}
            </span>
          ))}
        </div>
        <div ref={plotRef} className={styles.plot}>
          <svg
            className={styles.svg}
            width={width}
            height={height}
            viewBox={`0 0 ${String(width)} ${String(height)}`}
            onPointerMove={(event) => {
              const index = pointAt(event);
              setHovered(index);
              tip.hover(index);
            }}
            onPointerLeave={() => {
              setHovered(null);
              tip.leave();
            }}
            onClick={(event) => {
              // A click moves the keyboard to the point it pressed.
              const index = pointAt(event);
              moveTo(index);
              press(index);
            }}
          >
            {yTicks.map((value) => (
              <line
                key={value}
                className={value === 0 ? styles.baseline : styles.grid}
                x1={0}
                x2={width}
                y1={Math.round(yAt(value)) - 0.5}
                y2={Math.round(yAt(value)) - 0.5}
              />
            ))}
            {shown === null ? null : (
              <line
                className={styles.crosshair}
                x1={Math.round(xAt(points[shown]?.x ?? first)) + 0.5}
                x2={Math.round(xAt(points[shown]?.x ?? first)) + 0.5}
                y1={0}
                y2={height}
              />
            )}
            <path data-part="line" className={styles.line} d={path} />
            {[...markers].map(([index, state]) => {
              const point = points[index];
              if (!point) return null;
              return (
                <Marker
                  key={index}
                  cx={xAt(point.x)}
                  cy={yAt(point.y)}
                  active={state.active}
                  selected={state.selected}
                  ref={state.active ? markerAnchor : undefined}
                />
              );
            })}
          </svg>
        </div>
        <div className={styles.xAxis}>
          {xTicks.map((value) => (
            <span
              key={value}
              className={styles.xTick}
              style={{ insetInlineStart: `${String(xAt(value))}px` }}
            >
              {formatX(value)}
            </span>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className={styles.xName}>
        {xLabel}
      </div>
      <ChartTooltip
        id={tooltipId}
        anchor={tip.active === null || tip.active !== shown ? null : () => markerAnchor.current}
        rows={tooltipRows}
      />
    </div>
  );
}

interface MarkerProps {
  cx: number;
  cy: number;
  /** Under the pointer or the keyboard. */
  active: boolean;
  /** The point the screen has selected. */
  selected: boolean;
  ref?: Ref<SVGCircleElement> | undefined;
}

/** The marker of a point: a dot with a ring of the surface around it, so it reads on the line. */
function Marker({ cx, cy, active, selected, ref }: MarkerProps) {
  const diameter = lengthToken("--size-chart-marker") ?? 0;
  const ring = lengthToken("--space-0-5") ?? 0;
  return (
    <circle
      ref={ref}
      data-part="marker"
      data-active={active ? "" : undefined}
      data-selected={selected ? "" : undefined}
      className={styles.marker}
      cx={cx}
      cy={cy}
      // The ring is the stroke, centred on the edge: half of it covers the dot, half lies outside.
      r={diameter / 2 + ring / 2}
      strokeWidth={ring}
    />
  );
}

/** The table view of a line chart: a row per point, in the order of the points. */
export function lineChartTable(
  points: readonly LinePoint[],
  xLabel: string,
  labelName: string,
  yLabel: string,
  formatX: (value: number) => string,
  formatY: (value: number) => string,
): { columns: ChartTableColumn[]; rows: ChartTableRow[] } {
  return {
    columns: [
      { id: "x", header: xLabel, isNumber: true, isRowHeader: true },
      { id: "label", header: labelName },
      { id: "y", header: yLabel, isNumber: true },
    ],
    rows: points.map((point, index) => ({
      key: String(index),
      cells: [formatX(point.x), point.label, formatY(point.y)],
    })),
  };
}
