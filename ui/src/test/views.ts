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

/**
 * The saved-view commands as the Rust side answers them, for the workspace `open()` names: a list
 * in memory that starts with that workspace's views, names trimmed and checked (1 to 80
 * characters, unique without regard to case), at most 100 views, addresses of a data screen
 * without a selection, ids never given twice. Each answers the whole list.
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
    if (shown?.workspace.id !== workspace) {
      throw commandFailure("WorkspaceNotFound", "That workspace is not the one that is open.");
    }
    if (held !== null) {
      lists.set(held, list);
      nexts.set(held, next);
    }
    held = workspace;
    list = lists.get(workspace) ?? [...shown.views];
    next = nexts.get(workspace) ?? Math.max(0, ...list.map((view) => view.id)) + 1;
  };
  const named = (name: string, except: number | null): string => {
    const trimmed = name.trim();
    const length = Array.from(trimmed).length;
    if (length < 1 || length > 80) {
      throw commandFailure(
        "ViewName",
        `A saved view needs a name of 1 to 80 characters, and this one has ${String(length)}.`,
      );
    }
    const taken = list.find(
      (view) => view.id !== except && view.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken !== undefined) {
      throw commandFailure("ViewNameTaken", `A saved view named "${taken.name}" already exists.`);
    }
    return trimmed;
  };
  const find = (id: number): SavedView => {
    const found = list.find((view) => view.id === id);
    if (found === undefined) throw commandFailure("ViewNotFound", "That saved view is not there.");
    return found;
  };
  const checkAddress = (address: string) => {
    const [path = "", query = ""] = address.split("?", 2);
    const keys = new URLSearchParams(query);
    const selects =
      keys.has("line") ||
      keys.has("hold") ||
      keys.has("blocker") ||
      (path === "/breakdown" && keys.has("open"));
    if (!DATA_PATHS.includes(path) || selects) {
      throw commandFailure("ViewAddress", `The address "${address}" cannot be saved as a view.`);
    }
  };

  return {
    save_view: ({ workspace, name, address, filters }) => {
      check(workspace);
      if (list.length >= 100) throw commandFailure("TooManyViews", "At most 100 saved views.");
      const kept = named(name, null);
      checkAddress(address);
      list = [...list, { id: next, name: kept, address, filters }];
      next += 1;
      return list;
    },
    rename_view: ({ workspace, id, name }) => {
      check(workspace);
      find(id);
      const kept = named(name, id);
      list = list.map((view) => (view.id === id ? { ...view, name: kept } : view));
      return list;
    },
    delete_view: ({ workspace, id }) => {
      check(workspace);
      find(id);
      list = list.filter((view) => view.id !== id);
      return list;
    },
    restore_view: ({ workspace, view, index }) => {
      check(workspace);
      const kept = named(view.name, null);
      const at = Math.min(index, list.length);
      list = [...list.slice(0, at), { ...view, name: kept }, ...list.slice(at)];
      return list;
    },
    move_view: ({ workspace, id, index }) => {
      check(workspace);
      const moving = find(id);
      const rest = list.filter((view) => view.id !== id);
      const at = Math.min(index, rest.length);
      list = [...rest.slice(0, at), moving, ...rest.slice(at)];
      return list;
    },
  };
}
