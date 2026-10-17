// The state of the Breakdown destination as its address holds it, so that it can be opened again
// as it was, and a saved view can keep it later:
//
//   /breakdown?mode=list&by=<dimId>&open=<key>,<key>
//
// `by` is the dimension the holds are grouped by (`dimId`), and `open` the groups that are
// expanded, each key written with its own escapes so that a key may hold a comma, and none
// written when no group is open. A part that is missing or cannot be read is the default, and no
// error. The line selected for the detail panel is in the address too, as `line=<id>`, and every
// other part is kept as it is.
import { dimId } from "../../app/filters/dims";
import type { Dim } from "../../bindings/Dim";
import { DEFAULT_DIM, dimOfId } from "./dims";

/** How the groups are shown. The matrix of two dimensions comes with its own task. */
export type BreakdownMode = "list";

export interface BreakdownState {
  mode: BreakdownMode;
  /** The dimension the holds are grouped by. */
  by: Dim;
  /** The keys of the groups that are expanded, in the order they were opened. */
  open: readonly string[];
}

export const BREAKDOWN_PATH = "/breakdown";

/** The groups by discipline, none of them open. */
export const DEFAULT_BREAKDOWN_STATE: BreakdownState = { mode: "list", by: DEFAULT_DIM, open: [] };

/** The parts of the address this page writes. Every other part is kept. */
const OWN = ["mode", "by", "open"] as const;

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

/** The state an address holds; each part it cannot read is the default. */
export function parseBreakdownAddress(search: string): BreakdownState {
  const parts = partsOf(search);
  const by = dimOfId(parts.get("by"));
  if (by === null) return DEFAULT_BREAKDOWN_STATE;
  return { mode: "list", by, open: openOf(parts.get("open")) };
}

/**
 * The address of a state: its mode, its dimension, and its open groups, then every part of `keep`
 * (a search text or an address) that is not this page's own.
 */
export function breakdownAddress(state: BreakdownState, keep = ""): string {
  const parts = new URLSearchParams();
  parts.set("mode", state.mode);
  parts.set("by", dimId(state.by));
  if (state.open.length > 0) parts.set("open", state.open.map(encodeURIComponent).join(","));
  for (const [key, value] of partsOf(keep)) {
    if (!OWN.some((own) => own === key)) parts.append(key, value);
  }
  return `${BREAKDOWN_PATH}?${parts.toString()}`;
}
