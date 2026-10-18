// The address of the Blockers destination:
//
//   /blockers?blocker=<key>&sort=<column>&dir=<asc|desc>
//
// The page shows the solve order of the holds the filters keep, which the filter bar holds, so
// the address has two parts of its own: the blocker that is selected, by its key
// (`<discipline>|<item>`), written as the detail panel writes a selection (ui/src/app/selection.ts),
// and the sort of the table of the steps, none written while they are in the solve order. Every
// other part is kept as it is.
import { searchWithSelection, selectionOf } from "../../app/selection";
import { SORT_PARTS, sortAddress, sortOfAddress, type DataTableSort } from "../../components";

export const BLOCKERS_PATH = "/blockers";

/** The columns of the steps a sort may name. */
export const STEP_SORT_COLUMNS = [
  "step",
  "blocker",
  "kind",
  "discipline",
  "holds",
  "gain",
  "cumulative",
] as const;

/** The parts of a search text, or of an address that has one. */
function partsOf(search: string): URLSearchParams {
  const at = search.indexOf("?");
  return new URLSearchParams(at === -1 ? search : search.slice(at + 1));
}

/** The address of Blockers with this blocker selected, or with none. */
export function blockersAddress(blocker: string | null = null): string {
  const search = searchWithSelection(
    "",
    blocker === null ? null : { kind: "blocker", key: blocker },
  );
  return `${BLOCKERS_PATH}${search}`;
}

/** The key of the blocker an address or a search text selects; `null` when it selects none. */
export function selectedBlocker(search: string): string | null {
  const selection = selectionOf(search);
  return selection?.kind === "blocker" ? selection.key : null;
}

/** The sort of the steps a search text names; none for the solve order, or one it cannot read. */
export function stepSort(search: string): DataTableSort | undefined {
  return sortOfAddress(partsOf(search), STEP_SORT_COLUMNS);
}

/** The search text with the steps sorted so, or in the solve order; every other part is kept. */
export function searchWithStepSort(search: string, sort: DataTableSort | undefined): string {
  const parts = partsOf(search);
  for (const part of SORT_PARTS) parts.delete(part);
  sortAddress(parts, sort);
  const text = parts.toString();
  return text === "" ? "" : `?${text}`;
}
