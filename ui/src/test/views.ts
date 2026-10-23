import type { FilterSpec } from "../bindings/FilterSpec";
import type { SavedView } from "../bindings/SavedView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import { openHoldsFilter } from "../api/filter";
import { commandFailure, type Handlers } from "./ipc";

/** A saved view for a test: on Lines, with the default filters, unless it says otherwise. */
export function savedView(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: 1,
    name: "Piping lines",
    address: "/lines",
    filters: openHoldsFilter(),
    ...overrides,
  };
}

/** The default filters with the values of one discipline kept. */
export function disciplineFilter(...values: string[]): FilterSpec {
  return {
    ...openHoldsFilter(),
    fields: [{ dim: "Discipline", values, negate: false }],
  };
}

const DATA_PATHS = ["/overview", "/breakdown", "/lines", "/blockers"];
const SELECTION = ["line", "hold", "blocker"];
/** The longest name and the most views, as src-tauri/src/app/views.rs has them. */
const NAME_LIMIT = 80;
const VIEW_LIMIT = 100;

// The refusals in the words of src-tauri/src/app/views.rs.

/** A name that is empty once trimmed, or too long. */
export function nameRefusal(length: number): string {
  return length === 0
    ? "A saved view needs a name of at least one character. Type a name, then save again."
    : `A saved view's name has at most ${String(NAME_LIMIT)} characters, and this one has ${String(length)}. Shorten the name, then save again.`;
}

/** A name another view has, without regard to case. */
export function takenRefusal(name: string): string {
  return `A saved view named "${name}" already exists, and names are compared without regard to case. Choose another name, or delete that view first.`;
}

const NOT_OPEN =
  "That workspace is not the one that is open, so its saved views were not changed. Open the workspace, then try again.";
const NOT_FOUND =
  "That saved view is not in the list. It may have been deleted already; the list shows the views there are.";
const ALREADY_THERE =
  "That saved view is in the list already, so it was not restored. Reload the list; if it keeps happening, report it.";

function addressRefusal(address: string, why: string): string {
  return `The address "${address}" cannot be saved as a view: ${why}. This is a fault of Hold Explorer; report it, and save the view again from the screen.`;
}

/**
 * The saved-view commands as the Rust side answers them (src-tauri/src/app/views.rs), for the
 * workspace `open()` names: a list in memory per workspace that starts with the views it was
 * opened with, the same checks in the same order and in the same words, ids never given twice.
 * Each answers the whole list.
 */
export function viewHandlers(
  open: () => WorkspaceOpen | null,
): Required<
  Pick<Handlers, "save_view" | "rename_view" | "delete_view" | "restore_view" | "move_view">
> {
  // The list of each workspace, from the views it was opened with, and the next id of each.
  const lists = new Map<string, SavedView[]>();
  const nexts = new Map<string, number>();
  let list: SavedView[] = [];
  let next = 1;
  let held: string | null = null;

  /** Takes up the list of the workspace a command names, which must be the open one. */
  const check = (workspace: string) => {
    const shown = open();
    if (shown === null) throw commandFailure("NoWorkspace", "No workspace is open.");
    if (shown.workspace.id !== workspace) throw commandFailure("WorkspaceNotFound", NOT_OPEN);
    if (held !== null) {
      lists.set(held, list);
      nexts.set(held, next);
    }
    held = workspace;
    list = lists.get(workspace) ?? [...shown.views];
    next = nexts.get(workspace) ?? Math.max(0, ...list.map((view) => view.id)) + 1;
  };
  const clean = (name: string): string => {
    const trimmed = name.trim();
    const length = Array.from(trimmed).length;
    if (length === 0 || length > NAME_LIMIT) {
      throw commandFailure("ViewName", nameRefusal(length));
    }
    return trimmed;
  };
  const checkFree = (name: string, except: number | null) => {
    const lower = name.toLowerCase();
    const taken = list.find((view) => view.id !== except && view.name.toLowerCase() === lower);
    if (taken !== undefined) throw commandFailure("ViewNameTaken", takenRefusal(taken.name));
  };
  const checkRoom = () => {
    if (list.length >= VIEW_LIMIT) {
      throw commandFailure(
        "TooManyViews",
        `A workspace holds at most ${String(VIEW_LIMIT)} saved views, and this one holds ${String(list.length)}. Delete a view you no longer use, then save again.`,
      );
    }
  };
  const position = (id: number): number => {
    const at = list.findIndex((view) => view.id === id);
    if (at === -1) throw commandFailure("ViewNotFound", NOT_FOUND);
    return at;
  };
  const checkAddress = (address: string) => {
    if (address.includes("#")) {
      throw commandFailure("ViewAddress", addressRefusal(address, "it has a fragment"));
    }
    const at = address.indexOf("?");
    const path = at === -1 ? address : address.slice(0, at);
    const query = at === -1 ? "" : address.slice(at + 1);
    if (!DATA_PATHS.includes(path)) {
      throw commandFailure(
        "ViewAddress",
        addressRefusal(address, "it is not the address of Overview, Breakdown, Lines, or Blockers"),
      );
    }
    for (const pair of query.split("&")) {
      const [key = ""] = pair.split("=", 1);
      if (key.includes("%")) {
        throw commandFailure(
          "ViewAddress",
          addressRefusal(address, "a name in its query is escaped"),
        );
      }
      if (SELECTION.includes(key) || (path === "/breakdown" && key === "open")) {
        throw commandFailure(
          "ViewAddress",
          addressRefusal(address, `it carries the selection "${key}"`),
        );
      }
    }
  };
  const insert = (view: SavedView, index: number) => {
    const at = Math.min(index, list.length);
    list = [...list.slice(0, at), view, ...list.slice(at)];
  };

  return {
    save_view: ({ workspace, name, address, filters }) => {
      check(workspace);
      const kept = clean(name);
      checkAddress(address);
      checkFree(kept, null);
      checkRoom();
      list = [...list, { id: next, name: kept, address, filters }];
      next += 1;
      return list;
    },
    rename_view: ({ workspace, id, name }) => {
      check(workspace);
      const kept = clean(name);
      const at = position(id);
      checkFree(kept, id);
      list = list.map((view, index) => (index === at ? { ...view, name: kept } : view));
      return list;
    },
    delete_view: ({ workspace, id }) => {
      check(workspace);
      const at = position(id);
      list = list.filter((_, index) => index !== at);
      return list;
    },
    restore_view: ({ workspace, view, index }) => {
      check(workspace);
      const kept = clean(view.name);
      checkAddress(view.address);
      if (view.id < 1 || view.id >= next) throw commandFailure("ViewNotFound", NOT_FOUND);
      if (list.some((other) => other.id === view.id)) {
        throw commandFailure("Internal", ALREADY_THERE);
      }
      checkFree(kept, null);
      checkRoom();
      insert({ ...view, name: kept }, index);
      return list;
    },
    move_view: ({ workspace, id, index }) => {
      check(workspace);
      const moving = list[position(id)];
      if (moving === undefined) throw commandFailure("ViewNotFound", NOT_FOUND);
      list = list.filter((view) => view.id !== id);
      insert(moving, index);
      return list;
    },
  };
}
