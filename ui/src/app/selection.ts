// The row of a data destination whose detail is open, as the address names it: `line=<id>` for a
// line, `hold=<position>` for a hold. One at most is named; every other part of the address is
// left as it is. The detail panel and the pages that open it read and write it through
// `useSelection` (ui/src/features/detail/selection.ts); the action that selects another snapshot
// takes a hold out of it here, because a position means nothing in another snapshot, and the
// actions that open another workspace take out both.

/** What the detail panel shows: a line, a hold by its position in the snapshot, or nothing. */
export type Selection =
  { kind: "line"; lineId: string } | { kind: "hold"; position: number } | null;

const LINE = "line";
const HOLD = "hold";

/** The parts of a search text, or of an address that has one. */
function partsOf(search: string): URLSearchParams {
  const at = search.indexOf("?");
  return new URLSearchParams(at === -1 ? search : search.slice(at + 1));
}

/**
 * The selection a search text names. A line ID that is empty, and a hold position that is not a
 * whole number, name nothing.
 */
export function selectionOf(search: string): Selection {
  const parts = partsOf(search);
  const line = parts.get(LINE);
  if (line !== null && line !== "") return { kind: "line", lineId: line };
  const hold = parts.get(HOLD);
  if (hold !== null && /^\d+$/.test(hold)) return { kind: "hold", position: Number(hold) };
  return null;
}

/** The search text with `next` selected, or with no selection; every other part is kept. */
export function searchWithSelection(search: string, next: Selection): string {
  const parts = partsOf(search);
  parts.delete(LINE);
  parts.delete(HOLD);
  if (next?.kind === "line") parts.set(LINE, next.lineId);
  if (next?.kind === "hold") parts.set(HOLD, String(next.position));
  const text = parts.toString();
  return text === "" ? "" : `?${text}`;
}

/**
 * The search text as it is to be after another snapshot was selected: a hold is no longer
 * selected, since its position names another hold or none there; a line stays selected. `null`
 * when nothing is to change.
 */
export function searchForAnotherSnapshot(search: string): string | null {
  return selectionOf(search)?.kind === "hold" ? searchWithSelection(search, null) : null;
}

/**
 * The search text as it is to be after another workspace was opened, created, or built: nothing
 * is selected, since neither a line nor a position of one workspace names anything in another.
 * `null` when nothing is to change.
 */
export function searchForAnotherWorkspace(search: string): string | null {
  return selectionOf(search) === null ? null : searchWithSelection(search, null);
}
