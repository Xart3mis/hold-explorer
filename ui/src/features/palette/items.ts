// What the command palette offers (decision 8 of the plan; DESIGN.md, "Command palette"): the
// app's own actions and destinations, the saved views, the snapshots, and the workspaces, built
// here from the state of the app, and the line IDs the search command finds, built by the palette
// from its answer. Narrowing the fixed items by their labels is presentation: the palette matches
// nothing against the data of a snapshot.
import type { LucideIcon } from "lucide-react";
import { destinationIcons } from "../../app/destinationIcons";
import { needsWorkspace, type Destination } from "../../app/destinations";
import type { Density } from "../../bindings/Density";
import type { SavedView } from "../../bindings/SavedView";
import type { SearchHit } from "../../bindings/SearchHit";
import type { Theme } from "../../bindings/Theme";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../../bindings/WorkspaceView";
import { formatDateTime } from "../../text/format";
import { t, type MessageKey } from "../../text/i18n";
import { EXPORT_SHORTCUT, IMPORT_SHORTCUT } from "../shell/shortcuts";

/** The groups of the palette, in the order it shows them. */
export const PALETTE_GROUPS = [
  "actions",
  "destinations",
  "views",
  "snapshots",
  "workspaces",
  "lines",
] as const;

export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  label: string;
  /** Words matched besides the label, as "dark" for Theme: Dark. */
  keywords?: readonly string[];
  shortcut?: string;
  run: () => void;
  /** What the item shows after its label, quietly: the holds of a snapshot. */
  detail?: string;
  /** A tag after the label, as the sidebar has one: "Soon". */
  tag?: string;
  /** The icon before the label: a destination's, as in the sidebar. */
  icon?: LucideIcon;
  /** The result a line item was built from: its matched parts, its holds, whether it is released. */
  hit?: SearchHit;
}

/** What the items run. Each does what the control of its own does. */
export interface PaletteActions {
  /** Opens a destination as its sidebar item or its shortcut does. */
  openDestination: (path: string) => void;
  startImport: () => void;
  /** Runs the shown screen's `Ctrl+E` item; `null` where `Ctrl+E` does nothing. */
  exportView: (() => void) | null;
  clearFilters: () => void;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
  /** Opens the Save view popover of the filter bar; `null` where the page has none. */
  saveView: (() => void) | null;
  applyView: (view: SavedView) => void;
  selectSnapshot: (id: number) => void;
  openWorkspace: (id: string) => void;
}

/** The state of the app the fixed items are built from. */
export interface PaletteContext {
  destinations: readonly Destination[];
  /** The open workspace, with its snapshots and saved views; `null` without one. */
  open: WorkspaceOpen | null;
  /** Every readable workspace of the folder in use. */
  workspaces: readonly WorkspaceView[];
  theme: Theme;
  density: Density;
  /** An action on the workspace runs or waits its turn. */
  isBusy: boolean;
  /** The workspaces folder changes: the other settings wait, as the Settings page says. */
  isSettingsWaiting: boolean;
  /** The filters of the workspace are not the default ones. */
  hasFilters: boolean;
  actions: PaletteActions;
}

const THEMES: readonly Theme[] = ["Dark", "Light", "System"];
const DENSITIES: readonly Density[] = ["Comfortable", "Compact"];

const THEME_KEYS: Record<Theme, MessageKey> = {
  Dark: "settings.themeDark",
  Light: "settings.themeLight",
  System: "settings.themeSystem",
};

const DENSITY_KEYS: Record<Density, MessageKey> = {
  Comfortable: "settings.densityComfortable",
  Compact: "settings.densityCompact",
};

/** The words of a catalog entry that lists keywords, separated by spaces. */
function keywordsOf(key: MessageKey): string[] {
  return t(key)
    .split(/\s+/)
    .filter((word) => word !== "");
}

function actionItems(context: PaletteContext): PaletteItem[] {
  const { open, actions, isBusy, isSettingsWaiting } = context;
  const hasSnapshot = open?.selected != null;
  const items: PaletteItem[] = [
    {
      id: "action:import",
      group: "actions",
      label: t("palette.import"),
      keywords: keywordsOf("palette.keywords.import"),
      shortcut: IMPORT_SHORTCUT,
      run: actions.startImport,
    },
  ];
  const { exportView, saveView } = actions;
  if (exportView !== null) {
    items.push({
      id: "action:export",
      group: "actions",
      label: t("palette.export"),
      keywords: keywordsOf("palette.keywords.export"),
      shortcut: EXPORT_SHORTCUT,
      run: exportView,
    });
  }
  if (hasSnapshot && context.hasFilters && !isBusy) {
    items.push({
      id: "action:clear-filters",
      group: "actions",
      label: t("palette.clearFilters"),
      keywords: keywordsOf("palette.keywords.clearFilters"),
      run: actions.clearFilters,
    });
  }
  if (!isSettingsWaiting) {
    for (const theme of THEMES) {
      if (theme === context.theme) continue;
      const value = t(THEME_KEYS[theme]);
      items.push({
        id: `action:theme:${theme}`,
        group: "actions",
        label: t("palette.theme", { value }),
        keywords: [value, ...keywordsOf("palette.keywords.theme")],
        run: () => {
          actions.setTheme(theme);
        },
      });
    }
    for (const density of DENSITIES) {
      if (density === context.density) continue;
      const value = t(DENSITY_KEYS[density]);
      items.push({
        id: `action:density:${density}`,
        group: "actions",
        label: t("palette.density", { value }),
        keywords: [value, ...keywordsOf("palette.keywords.density")],
        run: () => {
          actions.setDensity(density);
        },
      });
    }
  }
  if (saveView !== null && hasSnapshot && !isBusy) {
    items.push({
      id: "action:save-view",
      group: "actions",
      label: t("palette.saveView"),
      keywords: keywordsOf("palette.keywords.saveView"),
      run: saveView,
    });
  }
  return items;
}

function destinationItems({ destinations, open, actions }: PaletteContext): PaletteItem[] {
  return destinations
    .filter((destination) => open !== null || !needsWorkspace(destination.id))
    .map((destination) => ({
      id: `destination:${destination.id}`,
      group: "destinations",
      label: t(`destinations.name.${destination.id}`),
      icon: destinationIcons[destination.id],
      ...(destination.shortcut === undefined ? {} : { shortcut: destination.shortcut }),
      ...(destination.available ? {} : { tag: t("destinations.soon") }),
      run: () => {
        actions.openDestination(destination.path);
      },
    }));
}

function viewItems({ open, isBusy, actions }: PaletteContext): PaletteItem[] {
  // A saved view shows the snapshot in view; its control waits while an action on the workspace runs.
  if (open?.selected == null || isBusy) return [];
  return open.views.map((view) => ({
    id: `view:${String(view.id)}`,
    group: "views",
    label: view.name,
    keywords: keywordsOf("palette.keywords.view"),
    run: () => {
      actions.applyView(view);
    },
  }));
}

function snapshotItems({ open, isBusy, actions }: PaletteContext): PaletteItem[] {
  if (open === null || isBusy) return [];
  // The command lists the snapshots oldest first; the palette starts with the newest, as the
  // snapshot selector does. The one in view is not offered: choosing it would do nothing.
  return [...open.snapshots]
    .reverse()
    .filter((snapshot) => snapshot.id !== open.selected)
    .map((snapshot) => ({
      id: `snapshot:${String(snapshot.id)}`,
      group: "snapshots",
      label: formatDateTime(snapshot.taken_at),
      keywords: keywordsOf("palette.keywords.snapshot"),
      detail: t(snapshot.limited ? "snapshots.holdsLimited" : "snapshots.holds", {
        count: snapshot.row_count,
      }),
      run: () => {
        actions.selectSnapshot(snapshot.id);
      },
    }));
}

function workspaceItems({ open, workspaces, isBusy, actions }: PaletteContext): PaletteItem[] {
  if (isBusy) return [];
  // The open workspace is not offered, as the switcher does not offer it.
  return workspaces
    .filter((workspace) => workspace.id !== open?.workspace.id)
    .map((workspace) => ({
      id: `workspace:${workspace.id}`,
      group: "workspaces",
      label: workspace.name,
      keywords: keywordsOf("palette.keywords.workspace"),
      detail: t("workspaces.snapshotCount", { count: workspace.snapshot_count }),
      run: () => {
        actions.openWorkspace(workspace.id);
      },
    }));
}

/**
 * The fixed items for the app's state now: what is offered depends on workspace, snapshot,
 * screen, and whether a workspace action runs.
 */
export function paletteItems(context: PaletteContext): PaletteItem[] {
  return [
    ...actionItems(context),
    ...destinationItems(context),
    ...viewItems(context),
    ...snapshotItems(context),
    ...workspaceItems(context),
  ];
}

/** The words of a text, without regard to case: its runs of letters and digits. */
function wordsOf(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/**
 * Narrows fixed items by text: every word of the query is a prefix of a word of the label or
 * a keyword, without regard to case; order kept. Presentation only.
 */
export function narrow(items: readonly PaletteItem[], query: string): PaletteItem[] {
  const wanted = wordsOf(query);
  if (wanted.length === 0) return [...items];
  return items.filter((item) => {
    const words = [item.label, ...(item.keywords ?? [])].flatMap(wordsOf);
    return wanted.every((part) => words.some((word) => word.startsWith(part)));
  });
}
