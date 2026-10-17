// The one list the sidebar, the router, and the shortcuts are built from. It is also the only
// place that says which destinations are built: making one real is changing its `available`
// flag here and giving it a page in `destinationPages` of router.tsx. The Soon tag in the sidebar
// and the coming soon screen go away with it.

export type DestinationId =
  | "overview"
  | "breakdown"
  | "lines"
  | "blockers"
  | "history"
  | "people"
  | "follow-up"
  | "rules"
  | "settings";

export interface Destination {
  id: DestinationId;
  /** The address of the destination. */
  path: string;
  /** The shortcut that opens it, as `Ctrl+1`: modifiers, then the key, joined by `+`. */
  shortcut?: string;
  /** Whether the destination is built. One that is not opens its coming soon screen. */
  available: boolean;
  /** `data`: what the snapshot in view holds. `setup`: set apart at the bottom of the sidebar. */
  group: "data" | "setup";
}

/** The nine destinations, in sidebar order. Their names are in the text catalog, by id. */
export const destinations: readonly Destination[] = [
  { id: "overview", path: "/overview", shortcut: "Ctrl+1", available: true, group: "data" },
  { id: "breakdown", path: "/breakdown", shortcut: "Ctrl+2", available: true, group: "data" },
  { id: "lines", path: "/lines", shortcut: "Ctrl+3", available: true, group: "data" },
  { id: "blockers", path: "/blockers", shortcut: "Ctrl+4", available: false, group: "data" },
  { id: "history", path: "/history", shortcut: "Ctrl+5", available: false, group: "data" },
  { id: "people", path: "/people", shortcut: "Ctrl+6", available: false, group: "data" },
  { id: "follow-up", path: "/follow-up", shortcut: "Ctrl+7", available: false, group: "data" },
  { id: "rules", path: "/rules", available: false, group: "setup" },
  { id: "settings", path: "/settings", shortcut: "Ctrl+,", available: true, group: "setup" },
];

/**
 * Whether a destination shows what a workspace holds. Such a destination has nothing to show
 * while no workspace is open; Settings is the one that does not depend on a workspace.
 */
export function needsWorkspace(id: DestinationId): boolean {
  return id !== "settings";
}

/** The address a user without a workspace is sent to, and where the workspaces are listed. */
export const WELCOME_PATH = "/welcome";
/** The address of the first destination: where an opened workspace lands. */
export const OVERVIEW_PATH = "/overview";
/** The address of the import flow. */
export const IMPORT_PATH = "/import";
