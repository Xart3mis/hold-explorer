// The state of the Breakdown destination as its address holds it, so that it can be opened again
// as it was, and a saved view can keep it later:
//
//   /breakdown?mode=list&by=<dimId>&open=<key>,<key>
//   /breakdown?mode=matrix&rows=<dimId>&cols=<dimId>
//
// In the list, `by` is the dimension the holds are grouped by (`dimId`), and `open` the groups
// that are expanded, each key written with its own escapes so that a key may hold a comma, and
// none written when no group is open. In the matrix, `rows` and `cols` are its two dimensions,
// never the same one. The parts of the mode that does not show are kept too, after the parts of
// the one that shows, when they are not the default, so that switching back finds them as they
// were. A part that is missing or cannot be read is the default, and no error. The line selected
// for the detail panel is in the address too, as `line=<id>`, and every other part is kept as it
// is.
import { dimId, isSameDim } from "../../app/filters/dims";
import type { Dim } from "../../bindings/Dim";
import { DEFAULT_COLS, DEFAULT_DIM, DEFAULT_ROWS, dimOfId } from "./dims";

/** How the groups are shown: a list of the groups of one dimension, or a matrix of two. */
export type BreakdownMode = "list" | "matrix";

export interface BreakdownState {
  mode: BreakdownMode;
  /** The dimension the list groups the holds by. */
  by: Dim;
  /** The keys of the groups of the list that are expanded, in the order they were opened. */
  open: readonly string[];
  /** The dimension of the rows of the matrix. */
  rows: Dim;
  /** The dimension of the columns of the matrix; never the one of the rows. */
  cols: Dim;
}

export const BREAKDOWN_PATH = "/breakdown";

/** The groups by discipline, none of them open; the matrix is disciplines by hold type. */
export const DEFAULT_BREAKDOWN_STATE: BreakdownState = {
  mode: "list",
  by: DEFAULT_DIM,
  open: [],
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
};

/** The parts of the address this page writes. Every other part is kept. */
const OWN = ["mode", "by", "open", "rows", "cols"] as const;

/** The parts of a search text, or of an address that has one. */
function partsOf(search: string): URLSearchParams {
  const at = search.indexOf("?");
  return new URLSearchParams(at === -1 ? search : search.slice(at + 1));
}

/** The keys of the open groups as `open` holds them; a key that cannot be read is left out. */
function openOf(value: string | null): string[] {
  if (value === null) return [];
  const keys: string[] = [];
  for (const part of value.split(",")) {
    try {
      keys.push(decodeURIComponent(part));
    } catch {
      // A key written by hand that is no escape: nothing to open.
    }
  }
  return keys;
}

/**
 * The two dimensions of a matrix as an address names them: the columns give way when they are
 * the rows, for the default columns, or the default rows when those are the rows.
 */
function matrixOf(rowsId: string | null, colsId: string | null): { rows: Dim; cols: Dim } {
  const rows = dimOfId(rowsId) ?? DEFAULT_ROWS;
  const asked = dimOfId(colsId);
  const cols = [asked, DEFAULT_COLS, DEFAULT_ROWS].find(
    (dim): dim is Dim => dim !== null && !isSameDim(dim, rows),
  );
  return { rows, cols: cols ?? DEFAULT_COLS };
}

/** The state an address holds; each part it cannot read is the default. */
export function parseBreakdownAddress(search: string): BreakdownState {
  const parts = partsOf(search);
  const mode: BreakdownMode = parts.get("mode") === "matrix" ? "matrix" : "list";
  // A missing `by` is the default dimension, which the address leaves out while the matrix shows,
  // and the open groups are its groups; a `by` that cannot be read has none open.
  const byId = parts.get("by");
  const by = byId === null ? DEFAULT_DIM : dimOfId(byId);
  const list =
    by === null ? { by: DEFAULT_DIM, open: [] } : { by, open: openOf(parts.get("open")) };
  return { mode, ...list, ...matrixOf(parts.get("rows"), parts.get("cols")) };
}

/** The parts of the list, `by` and `open`; `all` writes `by` also when it is the default. */
function listParts(state: BreakdownState, parts: URLSearchParams, all: boolean): void {
  if (all || !isSameDim(state.by, DEFAULT_DIM)) parts.set("by", dimId(state.by));
  if (state.open.length > 0) parts.set("open", state.open.map(encodeURIComponent).join(","));
}

/** The parts of the matrix, `rows` and `cols`; `all` writes them also when they are the default. */
function matrixParts(state: BreakdownState, parts: URLSearchParams, all: boolean): void {
  if (all || !isSameDim(state.rows, DEFAULT_ROWS) || !isSameDim(state.cols, DEFAULT_COLS)) {
    parts.set("rows", dimId(state.rows));
    parts.set("cols", dimId(state.cols));
  }
}

/**
 * The address of a state: its mode and the parts of that mode, then the parts of the other mode
 * that are not the default, then every part of `keep` (a search text or an address) that is not
 * this page's own.
 */
export function breakdownAddress(state: BreakdownState, keep = ""): string {
  const parts = new URLSearchParams();
  parts.set("mode", state.mode);
  if (state.mode === "list") {
    listParts(state, parts, true);
    matrixParts(state, parts, false);
  } else {
    matrixParts(state, parts, true);
    listParts(state, parts, false);
  }
  for (const [key, value] of partsOf(keep)) {
    if (!OWN.some((own) => own === key)) parts.append(key, value);
  }
  return `${BREAKDOWN_PATH}?${parts.toString()}`;
}
