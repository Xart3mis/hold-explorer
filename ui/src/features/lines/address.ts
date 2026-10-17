// The state of the Lines destination as its address holds it, so that it can be opened again as
// it was, and a saved view can keep it later:
//
//   /lines?rows=holds&sort=<sort>&reverse=1&single=1&mismatch=1
//
// A part that is missing is the default: the lines, with the All preset. A part that cannot be
// read is the default as well, and no error. The row selected for the detail panel is in the
// address too, as `line=<id>` or `hold=<position>`, and every other part is kept as it is.
import type { HoldSort } from "../../bindings/HoldSort";
import type { LineQuery } from "../../bindings/LineQuery";
import type { LineSort } from "../../bindings/LineSort";

/** Whether the page shows a row per line or a row per hold. */
export type LinesMode = "lines" | "holds";

/** What the page shows: the lines with their query, or the holds with their order. */
export type LinesState =
  { rows: "lines"; query: LineQuery } | { rows: "holds"; sort: HoldSort; reverse: boolean };

export const LINES_PATH = "/lines";

const LINE_SORTS: readonly LineSort[] = [
  "HoldsDesc",
  "Easiest",
  "OldestFirst",
  "LineId",
  "Blockers",
  "Disciplines",
  "ModelSize",
  "LdtSize",
  "StressCalc",
];

const HOLD_SORTS: readonly HoldSort[] = [
  "FileOrder",
  "OldestFirst",
  "LineId",
  "Discipline",
  "HoldType",
  "Blocker",
  "Name",
];

/** The lines, most holds first: the All preset. */
export const DEFAULT_LINES_STATE: LinesState = {
  rows: "lines",
  query: { sort: "HoldsDesc", reverse: false, single_hold_only: false, size_mismatch_only: false },
};

/** The holds in the order of the file. */
export const DEFAULT_HOLDS_STATE: LinesState = { rows: "holds", sort: "FileOrder", reverse: false };

/** The parts of the address this page writes. Every other part is kept. */
const OWN = ["rows", "sort", "reverse", "single", "mismatch"] as const;

/** The parts that name the selected row, one for each mode. */
const SELECTED: Record<LinesMode, string> = { lines: "line", holds: "hold" };

/** The parts of a search text, or of an address that has one. */
function partsOf(search: string): URLSearchParams {
  const at = search.indexOf("?");
  return new URLSearchParams(at === -1 ? search : search.slice(at + 1));
}

function oneOf<Value extends string>(list: readonly Value[], value: string | null): Value | null {
  return list.find((candidate) => candidate === value) ?? null;
}

const isOn = (parts: URLSearchParams, key: string) => parts.get(key) === "1";

/** The state an address holds; each part it cannot read is the default. */
export function parseLinesAddress(search: string): LinesState {
  const parts = partsOf(search);
  const reverse = isOn(parts, "reverse");
  if (parts.get("rows") === "holds") {
    return { rows: "holds", sort: oneOf(HOLD_SORTS, parts.get("sort")) ?? "FileOrder", reverse };
  }
  return {
    rows: "lines",
    query: {
      sort: oneOf(LINE_SORTS, parts.get("sort")) ?? "HoldsDesc",
      reverse,
      single_hold_only: isOn(parts, "single"),
      size_mismatch_only: isOn(parts, "mismatch"),
    },
  };
}

/**
 * The address of a state: the parts that differ from the default, in a fixed order, then every
 * part of `keep` (a search text or an address) that is not this page's own.
 */
export function linesAddress(state: LinesState, keep = ""): string {
  const parts = new URLSearchParams();
  if (state.rows === "holds") {
    parts.set("rows", "holds");
    if (state.sort !== "FileOrder") parts.set("sort", state.sort);
    if (state.reverse) parts.set("reverse", "1");
  } else {
    const { query } = state;
    if (query.sort !== "HoldsDesc") parts.set("sort", query.sort);
    if (query.reverse) parts.set("reverse", "1");
    if (query.single_hold_only) parts.set("single", "1");
    if (query.size_mismatch_only) parts.set("mismatch", "1");
  }
  for (const [key, value] of partsOf(keep)) {
    if (!OWN.some((own) => own === key)) parts.append(key, value);
  }
  const search = parts.toString();
  return search === "" ? LINES_PATH : `${LINES_PATH}?${search}`;
}

/**
 * The key of the row an address selects in a mode: the line ID in the lines, the position of the
 * hold in the holds. `null` when it selects none, or a position that is no number.
 */
export function selectionOf(search: string, mode: LinesMode): string | null {
  const value = partsOf(search).get(SELECTED[mode]);
  if (value === null || value === "") return null;
  if (mode === "holds" && !/^\d+$/.test(value)) return null;
  return value;
}

/**
 * The search text with a row of a mode selected: its key is written, the selection of the other
 * mode is taken out, and every other part stays as it was.
 */
export function withSelection(search: string, mode: LinesMode, key: string): string {
  const parts = partsOf(search);
  parts.delete(SELECTED[mode === "lines" ? "holds" : "lines"]);
  parts.set(SELECTED[mode], key);
  return `?${parts.toString()}`;
}
