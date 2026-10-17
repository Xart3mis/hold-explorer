import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { durationToken, lengthToken } from "../../design/token-values";
import styles from "./ChartTooltip.module.css";

/** One fact of a mark: its label and its value. */
export interface ChartTooltipRow {
  label: string;
  value: string;
  /**
   * The key of the mark, before the value: the step of a heatmap cell (0 for an empty cell), or
   * `"line"` for a point of a line.
   */
  mark?: number | "line";
}

export interface ChartTooltipProps {
  /** The id the mark it describes refers to with `aria-describedby`. */
  id: string;
  /**
   * Finds the mark it names, when it is placed. Nothing shows without one. A function, because
   * the mark is an element of the chart that is only known once the chart is on the page.
   */
  anchor: (() => Element | null) | null;
  rows: readonly ChartTooltipRow[];
}

interface Place {
  top: number;
  left: number;
}

/**
 * Where a tooltip of this size stands for its mark: `--space-1` under it, above it where there
 * is no room below, inside the page. `null` when the mark is scrolled out of the window, which
 * takes its tooltip with it.
 */
function placeBeside(mark: Element, tip: Element): Place | null {
  const gap = lengthToken("--space-1") ?? 0;
  const box = mark.getBoundingClientRect();
  if (box.bottom < 0 || box.top > window.innerHeight) return null;
  const size = tip.getBoundingClientRect();
  const roomBelow = window.innerHeight - box.bottom - gap;
  const top = size.height <= roomBelow ? box.bottom + gap : box.top - gap - size.height;
  const centered = box.left + box.width / 2 - size.width / 2;
  // The width of the page without its scrollbar, which the tooltip must not cover either.
  const room = document.documentElement.clientWidth;
  return { top: Math.max(0, top), left: Math.max(0, Math.min(centered, room - size.width)) };
}

/**
 * The tooltip of a chart: one row per fact of the mark the pointer or the keyboard is on. It
 * stands under the mark, above it where there is no room below, inside the window, and never
 * over the mark. It takes no pointer and no focus. The chart decides when it shows, with
 * `useChartTooltip`.
 */
export function ChartTooltip({ id, anchor, rows }: ChartTooltipProps) {
  const own = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  // Counts the scrolls and resizes while it shows: the mark moves in the window, so it does too.
  const [moves, setMoves] = useState(0);

  useEffect(() => {
    if (!anchor) return;
    const onMove = () => {
      setMoves((count) => count + 1);
    };
    window.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [anchor]);

  useLayoutEffect(() => {
    const tip = own.current;
    const element = anchor?.() ?? null;
    const next = element && tip ? placeBeside(element, tip) : null;
    // The rows are new at every render of the chart; only a new place is worth a render.
    setPlace((previous) =>
      previous === next ||
      (previous !== null &&
        next !== null &&
        previous.top === next.top &&
        previous.left === next.left)
        ? previous
        : next,
    );
  }, [anchor, rows, moves]);

  if (!anchor) return null;
  return createPortal(
    <div
      ref={own}
      id={id}
      role="tooltip"
      className={styles.tooltip}
      data-placed={place === null ? undefined : ""}
      style={place === null ? undefined : { top: place.top, left: place.left }}
    >
      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          <span className={styles.label}>{row.label}</span>
          <span className={styles.value}>
            {row.mark === undefined ? null : (
              <span
                aria-hidden="true"
                className={row.mark === "line" ? styles.lineKey : styles.swatch}
                data-step={row.mark === "line" ? undefined : row.mark}
              />
            )}
            {row.value}
          </span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** What a chart tells its tooltip, and which mark the tooltip is about. */
export interface ChartTooltipState<Key> {
  /** The mark whose tooltip shows, or `null`. */
  active: Key | null;
  /** The keyboard is on this mark: its tooltip shows at once. */
  focus: (key: Key) => void;
  /** The focus left the chart. */
  blur: () => void;
  /** The pointer is on this mark: its tooltip shows after the tooltip delay, then follows it. */
  hover: (key: Key) => void;
  /** The pointer left the chart. */
  leave: () => void;
  /** Escape: the tooltip goes until the next move. */
  dismiss: () => void;
}

/**
 * When a chart's tooltip shows, as DESIGN.md says: at once on keyboard focus; under the pointer
 * after `--delay-tooltip`, and then from mark to mark without waiting again until the pointer
 * leaves the chart; gone on Escape until the next move, and when the focus and the pointer have
 * both left.
 */
export function useChartTooltip<Key extends string | number>(): ChartTooltipState<Key> {
  const [focused, setFocused] = useState<Key | null>(null);
  const [hovered, setHovered] = useState<Key | null>(null);
  const [pointerShown, setPointerShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const focus = useCallback((key: Key) => {
    setFocused(key);
    setDismissed(false);
  }, []);
  const blur = useCallback(() => {
    setFocused(null);
  }, []);
  const hover = useCallback(
    (key: Key) => {
      setHovered(key);
      setDismissed(false);
      if (pointerShown || timer.current !== null) return;
      timer.current = setTimeout(
        () => {
          timer.current = null;
          setPointerShown(true);
        },
        durationToken("--delay-tooltip") ?? 0,
      );
    },
    [pointerShown],
  );
  const leave = useCallback(() => {
    stopTimer();
    setHovered(null);
    setPointerShown(false);
  }, [stopTimer]);
  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const active = dismissed ? null : hovered !== null && pointerShown ? hovered : focused;

  // Escape closes a tooltip that the pointer opened while the focus is somewhere else.
  useEffect(() => {
    if (active === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [active]);

  return { active, focus, blur, hover, leave, dismiss };
}
