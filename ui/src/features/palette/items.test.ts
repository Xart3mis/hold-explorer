import { describe, expect, it, vi } from "vitest";
import { destinations } from "../../app/destinations";
import en from "../../locales/en.json";
import { opened, otherWorkspace, workspace } from "../../test/fixtures";
import { savedView } from "../../test/views";
import { narrow, paletteItems, type PaletteActions, type PaletteContext } from "./items";

const words = en.palette;

function actions(overrides: Partial<PaletteActions> = {}): PaletteActions {
  return {
    openDestination: vi.fn(),
    startImport: vi.fn(),
    exportView: null,
    clearFilters: vi.fn(),
    setTheme: vi.fn(),
    setDensity: vi.fn(),
    saveView: null,
    applyView: vi.fn(),
    selectSnapshot: vi.fn(),
    openWorkspace: vi.fn(),
    ...overrides,
  };
}

/** A data screen of a workspace with two snapshots, the newest in view, and a saved view. */
function dataScreen(overrides: Partial<PaletteContext> = {}): PaletteContext {
  return {
    destinations,
    open: opened({ views: [savedView({ id: 4, name: "Piping lines" })] }),
    workspaces: [otherWorkspace, workspace()],
    theme: "Dark",
    density: "Comfortable",
    isBusy: false,
    isSettingsWaiting: false,
    hasFilters: true,
    actions: actions({ exportView: vi.fn(), saveView: vi.fn() }),
    ...overrides,
  };
}

const ids = (context: PaletteContext) => paletteItems(context).map((item) => item.id);

describe("the items offered", () => {
  it("on a data screen: every group, the export and Save view among the actions", () => {
    expect(ids(dataScreen())).toEqual([
      "action:import",
      "action:export",
      "action:clear-filters",
      "action:theme:Light",
      "action:theme:System",
      "action:density:Compact",
      "action:save-view",
      "destination:overview",
      "destination:breakdown",
      "destination:lines",
      "destination:blockers",
      "destination:history",
      "destination:people",
      "destination:follow-up",
      "destination:rules",
      "destination:settings",
      "view:4",
      "snapshot:1",
      `workspace:${otherWorkspace.id}`,
    ]);
  });

  it("names each item, with its shortcut when it has one", () => {
    const items = paletteItems(dataScreen());
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get("action:import")).toMatchObject({ label: words.import, shortcut: "Ctrl+I" });
    expect(byId.get("action:export")).toMatchObject({ label: words.export, shortcut: "Ctrl+E" });
    expect(byId.get("action:clear-filters")?.label).toBe(words.clearFilters);
    expect(byId.get("action:clear-filters")?.shortcut).toBeUndefined();
    expect(byId.get("action:theme:Light")?.label).toBe("Theme: Light");
    expect(byId.get("action:density:Compact")?.label).toBe("Density: Compact");
    expect(byId.get("action:save-view")?.label).toBe(words.saveView);
    expect(byId.get("destination:lines")).toMatchObject({ label: "Lines", shortcut: "Ctrl+3" });
    expect(byId.get("destination:settings")).toMatchObject({ shortcut: "Ctrl+," });
    expect(byId.get("destination:rules")).toMatchObject({ tag: en.destinations.soon });
    expect(byId.get("destination:rules")?.shortcut).toBeUndefined();
    expect(byId.get("view:4")?.label).toBe("Piping lines");
    expect(byId.get("snapshot:1")?.detail).toBe("9,120 holds");
    expect(byId.get(`workspace:${otherWorkspace.id}`)).toMatchObject({
      label: "Tank farm",
      detail: "5 snapshots",
    });
  });

  it("without a workspace: the import, the settings, Settings, and the workspaces to open", () => {
    expect(ids(dataScreen({ open: null, hasFilters: false, actions: actions() }))).toEqual([
      "action:import",
      "action:theme:Light",
      "action:theme:System",
      "action:density:Compact",
      "destination:settings",
      `workspace:${otherWorkspace.id}`,
      `workspace:${workspace().id}`,
    ]);
  });

  it("in a workspace without a snapshot: no filters, views, or snapshots to choose", () => {
    const empty = opened({
      workspace: workspace({ snapshot_count: 0, latest_taken_at: null }),
      snapshots: [],
      selected: null,
      views: [savedView({ id: 4 })],
    });
    const offered = ids(dataScreen({ open: empty, actions: actions({ saveView: vi.fn() }) }));
    expect(offered).not.toContain("action:clear-filters");
    expect(offered).not.toContain("action:save-view");
    expect(offered).not.toContain("view:4");
    expect(offered.filter((id) => id.startsWith("snapshot:"))).toEqual([]);
    expect(offered.filter((id) => id.startsWith("destination:"))).toHaveLength(9);
    expect(offered).toContain(`workspace:${otherWorkspace.id}`);
  });

  it("on Settings: no export and no Save view, which the page does not have", () => {
    const offered = ids(dataScreen({ actions: actions() }));
    expect(offered).not.toContain("action:export");
    expect(offered).not.toContain("action:save-view");
    expect(offered).toContain("action:theme:Light");
  });

  it("leaves the filters out when they are the default ones", () => {
    expect(ids(dataScreen({ hasFilters: false }))).not.toContain("action:clear-filters");
  });

  it("does not offer again the theme and the density that are set", () => {
    const offered = ids(dataScreen({ theme: "System", density: "Compact" }));
    expect(offered).toContain("action:theme:Dark");
    expect(offered).toContain("action:theme:Light");
    expect(offered).not.toContain("action:theme:System");
    expect(offered).toContain("action:density:Comfortable");
    expect(offered).not.toContain("action:density:Compact");
  });

  it("during an action on the workspace: only what can run meanwhile", () => {
    expect(ids(dataScreen({ isBusy: true, actions: actions() }))).toEqual([
      "action:import",
      "action:theme:Light",
      "action:theme:System",
      "action:density:Compact",
      "destination:overview",
      "destination:breakdown",
      "destination:lines",
      "destination:blockers",
      "destination:history",
      "destination:people",
      "destination:follow-up",
      "destination:rules",
      "destination:settings",
    ]);
  });

  it("leaves the theme and the density out while the workspaces folder changes", () => {
    const offered = ids(dataScreen({ isSettingsWaiting: true }));
    expect(offered.filter((id) => id.startsWith("action:theme"))).toEqual([]);
    expect(offered.filter((id) => id.startsWith("action:density"))).toEqual([]);
  });

  it("runs what each item stands for", () => {
    const given = actions({ exportView: vi.fn(), saveView: vi.fn() });
    const items = new Map(
      paletteItems(dataScreen({ actions: given })).map((item) => [item.id, item]),
    );
    const run = (id: string) => {
      items.get(id)?.run();
    };
    run("action:import");
    expect(given.startImport).toHaveBeenCalledTimes(1);
    run("action:export");
    expect(given.exportView).toHaveBeenCalledTimes(1);
    run("action:clear-filters");
    expect(given.clearFilters).toHaveBeenCalledTimes(1);
    run("action:theme:System");
    expect(given.setTheme).toHaveBeenCalledWith("System");
    run("action:density:Compact");
    expect(given.setDensity).toHaveBeenCalledWith("Compact");
    run("action:save-view");
    expect(given.saveView).toHaveBeenCalledTimes(1);
    run("destination:blockers");
    expect(given.openDestination).toHaveBeenCalledWith("/blockers");
    run("view:4");
    expect(given.applyView).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
    run("snapshot:1");
    expect(given.selectSnapshot).toHaveBeenCalledWith(1);
    run(`workspace:${otherWorkspace.id}`);
    expect(given.openWorkspace).toHaveBeenCalledWith(otherWorkspace.id);
  });
});

describe("narrow", () => {
  const items = paletteItems(dataScreen());
  const labels = (query: string) => narrow(items, query).map((item) => item.label);

  it("keeps every item, in order, for no text", () => {
    expect(narrow(items, "")).toEqual(items);
    expect(narrow(items, "   ")).toEqual(items);
  });

  it("keeps the items with a word that starts with what is typed, without regard to case", () => {
    expect(labels("li")).toEqual(["Theme: Light", "Lines", "Piping lines"]);
    expect(labels("LINES")).toEqual(["Lines", "Piping lines"]);
  });

  it("asks every word typed to start a word of the label or of a keyword", () => {
    expect(labels("theme li")).toEqual(["Theme: Light"]);
    expect(labels("clear filt")).toEqual([words.clearFilters]);
    expect(labels("pip lin")).toEqual(["Piping lines"]);
    expect(labels("theme dark")).toEqual([]);
  });

  it("matches a keyword as a word of the label", () => {
    expect(labels("excel")).toEqual([words.export]);
    expect(labels("workspace")).toEqual(["Tank farm"]);
  });

  it("does not match inside a word", () => {
    expect(labels("ines")).toEqual([]);
    expect(labels("xyz")).toEqual([]);
  });
});
