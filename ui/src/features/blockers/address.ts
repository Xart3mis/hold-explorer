// The address of the Blockers destination:
//
//   /blockers?blocker=<key>
//
// The page shows the solve order of the holds the filters keep, which the filter bar holds, so
// the address has one part of its own: the blocker that is selected, by its key
// (`<discipline>|<item>`), written as the detail panel writes a selection (ui/src/app/selection.ts).
// Every other part is kept as it is.
import { searchWithSelection, selectionOf } from "../../app/selection";

export const BLOCKERS_PATH = "/blockers";

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
