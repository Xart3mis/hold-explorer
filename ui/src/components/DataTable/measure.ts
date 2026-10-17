// What the table has to know in pixels. Its rows are placed by script, which cannot read a
// stylesheet: the width of a character of each typeface and the heights of the density come from
// here, and both are measured or read from the tokens, never written down.
import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { densityToken, lengthToken, rootDensity, type Density } from "../../design/token-values";
import styles from "./DataTable.module.css";

export interface CharWidths {
  text: number;
  mono: number;
}

/**
 * Stand-in widths, for where nothing is laid out and so nothing can be measured: a test, or the
 * moment before the stylesheet is there. They are close to the two typefaces at the size of the
 * table, and no screen depends on them: a table that is on screen has been measured.
 */
export const STAND_IN_CHAR_WIDTHS: CharWidths = { text: 7, mono: 8 };

/** How many zeros are measured at once, so that a part of a pixel is not lost to rounding. */
const SAMPLE = 64;

let current: CharWidths = STAND_IN_CHAR_WIDTHS;
let probe: HTMLElement | null = null;
let stopWatching: (() => void) | null = null;
const listeners = new Set<() => void>();

function face(name: keyof CharWidths, className: string | undefined): HTMLElement {
  const sample = document.createElement("span");
  sample.setAttribute("data-face", name);
  if (className !== undefined) sample.className = className;
  sample.textContent = "0".repeat(SAMPLE);
  return sample;
}

function widthOf(name: keyof CharWidths): number {
  const sample = probe?.querySelector(`[data-face="${name}"]`);
  const width = sample ? sample.getBoundingClientRect().width / SAMPLE : 0;
  return width > 0 ? width : STAND_IN_CHAR_WIDTHS[name];
}

function measure(): void {
  // A late `fonts.ready` may come after the last table went: there is nothing to measure then,
  // and what was measured stays for the next table.
  if (probe === null) return;
  const next = { text: widthOf("text"), mono: widthOf("mono") };
  if (next.text === current.text && next.mono === current.mono) return;
  current = next;
  for (const listener of listeners) listener();
}

/** Puts the measured text into the document and measures it whenever its size may have changed. */
function watch(): () => void {
  const element = document.createElement("div");
  element.setAttribute("data-part", "char-probe");
  element.setAttribute("aria-hidden", "true");
  if (styles.probe !== undefined) element.className = styles.probe;
  const samples = [face("text", styles.probeText), face("mono", styles.probeMono)];
  element.append(...samples);
  document.body.append(element);
  probe = element;

  // A font that arrives, a root size or a zoom that changes: each resizes the text.
  const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  for (const sample of samples) sizes?.observe(sample);
  // `document.fonts` is absent where nothing is drawn.
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  fonts?.addEventListener("loadingdone", measure);
  void fonts?.ready.then(measure);

  return () => {
    sizes?.disconnect();
    fonts?.removeEventListener("loadingdone", measure);
    element.remove();
    probe = null;
    // What was measured is kept: the next table starts with it and measures again.
  };
}

/**
 * Follows the measurement for as long as something uses it. The first to come puts the measured
 * text into the document and measures at once.
 */
function follow(listener: () => void): () => void {
  listeners.add(listener);
  if (stopWatching === null) {
    stopWatching = watch();
    measure();
  }
  // What is measured may be newer than what the follower was rendered with: another table of
  // the same page may have measured a moment ago.
  listener();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  };
}

/** The width of the digit zero in the table face and in the monospace face, measured once the fonts are ready, and again when they change. */
export function useCharWidths(): CharWidths {
  const [widths, setWidths] = useState(current);
  // In a layout effect, so the first table of a session is measured, and laid out again with
  // what was measured, before anything is painted: no frame shows the stand-in widths.
  useLayoutEffect(() => {
    return follow(() => {
      setWidths(current);
    });
  }, []);
  return widths;
}

function subscribeDensity(listener: () => void): () => void {
  const changes = new MutationObserver(listener);
  changes.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-density"],
  });
  return () => {
    changes.disconnect();
  };
}

/** The lengths the layout of a table is made of, in pixels. */
export interface TableMetrics {
  rowHeight: number;
  headerHeight: number;
  /** The padding of a cell at each side. */
  paddingX: number;
  /** The room of the arrow in a sorted header: the icon and the gap before it. */
  arrow: number;
}

/**
 * The heights and the padding of the density in effect: the table's own when it has one, the
 * density of the app otherwise, also after it changes. A token that cannot be read counts as
 * nothing, which only a production build without its stylesheet can meet.
 */
export function useTableMetrics(own?: Density): TableMetrics {
  const app = useSyncExternalStore(subscribeDensity, rootDensity);
  const density = own ?? app;
  return useMemo(
    () => ({
      rowHeight: densityToken("--density-row-height", density) ?? 0,
      headerHeight: densityToken("--density-header-height", density) ?? 0,
      paddingX: densityToken("--density-cell-padding-x", density) ?? 0,
      arrow: (lengthToken("--size-icon") ?? 0) + (lengthToken("--space-1") ?? 0),
    }),
    [density],
  );
}
