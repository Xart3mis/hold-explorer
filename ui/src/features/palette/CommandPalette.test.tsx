import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import { keys } from "../../api/keys";
import type { Density } from "../../bindings/Density";
import type { SearchResults } from "../../bindings/SearchResults";
import type { Settings } from "../../bindings/Settings";
import type { Theme } from "../../bindings/Theme";
import type { ViewRef } from "../../bindings/ViewRef";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import { applyDensity } from "../../design/density";
import { applyTheme } from "../../design/theme";
import en from "../../locales/en.json";
import { must, renderApp, type RenderAppOptions } from "../../test/app";
import { expectAccessible } from "../../test/axe";
import { renderAt } from "../../test/export";
import { openStart, opened, otherWorkspace, workspace } from "../../test/fixtures";
import { searchResults } from "../../test/search";
import { SLOW } from "../../test/slow";
import { savedView } from "../../test/views";
import { windowApi } from "../../test/window";

const words = en.palette;
const groups = words.group;
const root = document.documentElement;

afterEach(() => {
  applyTheme("Dark");
  root.removeAttribute("data-theme");
  applyDensity("Comfortable");
  root.removeAttribute("data-density");
});

const settings = (changes: Partial<Settings> = {}): Settings => ({
  theme: "Dark",
  density: "Comfortable",
  author_name: "",
  workspace_dir: null,
  last_workspace: null,
  ...changes,
});

/** The palette, once it is open. */
const palette = () => screen.findByRole("dialog", { name: words.name });

/** The field of the palette. */
const field = async () => within(await palette()).getByRole("textbox");

/** The list of the palette. */
const list = async () => within(await palette()).getByRole("listbox", { name: words.items });

/** The headings of the groups the palette shows, in order. */
async function headings(): Promise<string[]> {
  return within(await list())
    .queryAllByRole("group")
    .map((group) => group.getAttribute("aria-label") ?? labelOf(group));
}

function labelOf(group: HTMLElement): string {
  const id = group.getAttribute("aria-labelledby");
  return id === null ? "" : (document.getElementById(id)?.textContent ?? "");
}

/** The names of the items of one group. */
async function itemsOf(heading: string): Promise<string[]> {
  const group = within(await list())
    .queryAllByRole("group")
    .find((held) => labelOf(held) === heading);
  return group === undefined
    ? []
    : within(group)
        .getAllByRole("option")
        .map((option) => shownText(option.querySelector("[slot='label']")));
}

/** The text of an element as it is read: what is hidden from assistive technology left out. */
function shownText(element: Element | null): string {
  if (element === null) return "";
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll("[aria-hidden='true']")) hidden.remove();
  return copy.textContent;
}

/** The line that says that nothing matches, in the list. */
const nothingFor = async (query: string) =>
  within(await list()).findByText(`No command matches “${query}”`);

/** The search field of the top bar, once the app has loaded. */
const searchField = () => screen.findByRole("combobox", { name: en.search.label });

const pathname = (router: ReturnType<typeof renderApp>["router"]) => router.state.location.pathname;

function renderPalette(path = "/overview", options: RenderAppOptions = {}) {
  return renderApp({ start: openStart(), path, ...options });
}

/** Opens the palette with Ctrl+K and types `text` into it. */
async function openAndType(user: ReturnType<typeof renderApp>["user"], text = "") {
  await searchField();
  await user.keyboard("{Control>}k{/Control}");
  const input = await field();
  await waitFor(() => {
    expect(input).toHaveFocus();
  });
  if (text !== "") await user.keyboard(text);
  return input;
}

/** Chooses the item of this name with the keyboard: it is narrowed to, then Enter. */
async function choose(user: ReturnType<typeof renderApp>["user"], label: string) {
  await openAndType(user, label);
  const option = await within(await list()).findByRole("option", { name: new RegExp(label) });
  // The first item is highlighted as text is typed; the arrow keys reach the one asked for.
  for (let step = 0; step < 30 && option.getAttribute("data-focused") === null; step += 1) {
    await user.keyboard("{ArrowDown}");
  }
  await user.keyboard("{Enter}");
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: words.name })).toBeNull();
  });
}

describe("opening and closing", () => {
  it("opens on Ctrl+K from a text field, with its field focused and empty", async () => {
    const { user } = renderPalette();
    await user.click(await searchField());
    await user.keyboard("ab");
    await user.keyboard("{Control>}k{/Control}");
    const input = await field();
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", words.placeholder);
  });

  it("shows Actions and Destinations with no text, each item with its shortcut", async () => {
    const { user } = renderPalette();
    await openAndType(user);
    expect(await headings()).toEqual([groups.actions, groups.destinations]);
    expect(await itemsOf(groups.actions)).toContain(words.import);
    const lines = within(await list()).getByRole("option", { name: /^Lines/ });
    expect(lines).toHaveAttribute("aria-keyshortcuts", "Control+3");
    const keysShown = [...lines.querySelectorAll("kbd kbd")].map((key) => key.textContent);
    expect(keysShown).toEqual(["Ctrl", "3"]);
  });

  it("closes on Escape and gives the focus back where it was", async () => {
    const { user } = renderPalette();
    const search = await searchField();
    await user.click(search);
    await user.keyboard("{Control>}k{/Control}");
    await field();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: words.name })).toBeNull();
    });
    await waitFor(() => {
      expect(search).toHaveFocus();
    });
  });

  it("closes on a second Ctrl+K and gives the focus back where it was", async () => {
    const { user } = renderPalette();
    const import_ = await screen.findByRole("button", { name: en.shell.import });
    act(() => {
      import_.focus();
    });
    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("li");
    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: words.name })).toBeNull();
    });
    await waitFor(() => {
      expect(import_).toHaveFocus();
    });
  });

  it("keeps the other shortcuts from the page while it is open", async () => {
    const { user, router } = renderPalette();
    await openAndType(user);
    await user.keyboard("{Control>}3{/Control}");
    expect(pathname(router)).toBe("/overview");
    expect(await palette()).toBeInTheDocument();
  });

  it("opens without a workspace, on the welcome page", async () => {
    const { user } = renderApp({
      start: openStart({ open: null }),
      path: "/welcome",
    });
    await screen.findByRole("heading", { name: en.workspaces.title });
    await user.keyboard("{Control>}k{/Control}");
    expect(await headings()).toEqual([groups.actions, groups.destinations]);
    expect(await itemsOf(groups.destinations)).toEqual([en.destinations.name.settings]);
  });

  it("passes the accessibility checker", SLOW, async () => {
    const { user } = renderPalette();
    await openAndType(user);
    await expectAccessible();
    await user.keyboard("57");
    await within(await list()).findByRole("option", { name: /78B04-573-00004-PR-004/ });
    await expectAccessible();
  });
});

describe("narrowing", () => {
  it("narrows the items by the words typed, in their groups", async () => {
    const { user } = renderPalette("/overview", {
      start: openStart({ open: opened({ views: [savedView({ id: 4, name: "Civil lines" })] }) }),
      handlers: { search: ({ query }: { query: string }) => ({ query, groups: [] }) },
    });
    await openAndType(user, "lin");
    await waitFor(async () => {
      expect(await headings()).toEqual([groups.destinations, groups.views]);
    });
    expect(await itemsOf(groups.destinations)).toEqual([en.destinations.name.lines]);
    expect(await itemsOf(groups.views)).toEqual(["Civil lines"]);
  });

  it("says that no command matches when nothing does", async () => {
    const { user } = renderPalette("/overview", {
      handlers: { search: ({ query }: { query: string }) => ({ query, groups: [] }) },
    });
    await openAndType(user, "zzqq");
    expect(await nothingFor("zzqq")).toBeVisible();
  });
});

describe("lines", () => {
  it("lists the line IDs the search finds, from 2 characters, and no other kind", async () => {
    const sent: string[] = [];
    const { user } = renderPalette("/overview", {
      handlers: {
        search: ({ query }: { view: ViewRef; query: string }): SearchResults => {
          sent.push(query);
          return searchResults(query);
        },
      },
    });
    await openAndType(user, "5");
    expect(await headings()).not.toContain(groups.lines);
    await user.keyboard("73");
    await within(await list()).findByRole("option", { name: /78B04-573-00004-PR-004/ });
    expect(await itemsOf(groups.lines)).toEqual([
      "78B04-573-00004-PR-004",
      "78B02-573-00195-PR-006",
    ]);
    expect(within(await list()).queryByRole("option", { name: /Tanaka/ })).toBeNull();
    expect(sent.at(-1)).toBe("573");
  });

  it("opens a line as the search field does", async () => {
    const { user, router } = renderPalette();
    await choose(user, "78B04-573-00004-PR-004");
    await waitFor(() => {
      expect(pathname(router)).toBe("/lines");
    });
    expect(router.state.location.search).toContain("line=78B04-573-00004-PR-004");
  });

  it("widens the status for a line whose holds are all released", async () => {
    const { user, router } = renderPalette();
    await choose(user, "78B02-573-00195-PR-006");
    await waitFor(() => {
      expect(router.state.location.search).toContain("line=78B02-573-00195-PR-006");
    });
    const filters = queryClient.getQueryData<Filters>(keys.workspaceFilters(workspace().id));
    expect(filters?.status).toBe("All");
  });
});

describe("each group runs what its own control does", () => {
  it("a destination opens", async () => {
    const { user, router } = renderPalette();
    await choose(user, en.destinations.name.blockers);
    await waitFor(() => {
      expect(pathname(router)).toBe("/blockers");
    });
  });

  it("a theme and a density are applied and saved", SLOW, async () => {
    const setTheme = vi.fn(({ theme }: { theme: Theme }) => settings({ theme }));
    const setDensity = vi.fn(({ density }: { density: Density }) => settings({ density }));
    const { user } = renderPalette("/overview", {
      handlers: { settings_set_theme: setTheme, settings_set_density: setDensity },
    });
    await choose(user, "Theme: Light");
    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith({ theme: "Light" });
    });
    await waitFor(() => {
      expect(root).toHaveAttribute("data-theme", "light");
    });
    await choose(user, "Density: Compact");
    await waitFor(() => {
      expect(setDensity).toHaveBeenCalledWith({ density: "Compact" });
    });
  });

  it("Import starts an import", async () => {
    const { user } = renderPalette();
    await choose(user, words.import);
    await waitFor(() => {
      expect(windowApi.chooseImportFile).toHaveBeenCalledTimes(1);
    });
  });

  it("Export this view saves as Ctrl+E does, and only where Ctrl+E works", SLOW, async () => {
    const { user, saves } = renderAt("/overview");
    await screen.findByRole("button", { name: en.export.menu.label });
    await choose(user, words.export);
    await waitFor(() => {
      expect(windowApi.chooseSavePath).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(saves).toHaveLength(1);
    });
  });

  it("offers no export on Settings", async () => {
    const { user } = renderPalette("/settings");
    await openAndType(user);
    expect(await itemsOf(groups.actions)).not.toContain(words.export);
    expect(await itemsOf(groups.actions)).not.toContain(words.saveView);
  });

  it("Clear all filters clears them", async () => {
    const { user } = renderPalette();
    const set: Filters = { ...defaultFilters, text: "573" };
    act(() => {
      queryClient.setQueryData(keys.workspaceFilters(workspace().id), set);
    });
    await choose(user, words.clearFilters);
    await waitFor(() => {
      expect(queryClient.getQueryData<Filters>(keys.workspaceFilters(workspace().id))?.text).toBe(
        "",
      );
    });
  });

  it("Save view opens the popover of the filter bar, and its closing returns to Save view", async () => {
    const { user } = renderPalette("/lines");
    await screen.findByRole("button", { name: en.views.save });
    await choose(user, words.saveView);
    const popover = await screen.findByRole("dialog", { name: en.views.saveTitle });
    const name = within(popover).getByRole("textbox", { name: en.views.name });
    await waitFor(() => {
      expect(name).toHaveFocus();
    });
    expect(screen.getByRole("button", { name: en.views.save, hidden: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Closed by a press outside, it gives the focus back to its trigger, as when it was pressed.
    await user.click(document.body);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: en.views.save })).toHaveFocus();
    });
  });

  it("a saved view applies", async () => {
    const view = savedView({ id: 4, name: "Civil lines", address: "/blockers" });
    const { user, router } = renderPalette("/overview", {
      start: openStart({ open: opened({ views: [view] }) }),
    });
    await choose(user, "Civil lines");
    await waitFor(() => {
      expect(pathname(router)).toBe("/blockers");
    });
  });

  it("a snapshot is selected as the snapshot selector selects it", async () => {
    const select = vi.fn(({ id }: { id: number }) => opened({ selected: id }));
    const { user } = renderPalette("/lines", { handlers: { snapshot_select: select } });
    await openAndType(user, "snapshot");
    expect(await itemsOf(groups.snapshots)).toHaveLength(1);
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ id: 1 });
    });
  });

  it("a workspace opens as the switcher opens it", async () => {
    const open = vi.fn((): WorkspaceOpen =>
      opened({ workspace: otherWorkspace, snapshots: [], selected: null }),
    );
    const { user } = renderPalette("/overview", { handlers: { workspace_open: open } });
    await choose(user, otherWorkspace.name);
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({ id: otherWorkspace.id });
    });
  });
});

describe("what is offered", () => {
  it("leaves out what waits while an action on the workspace runs", SLOW, async () => {
    let finish: (open: WorkspaceOpen) => void = () => undefined;
    const { user } = renderPalette("/lines", {
      start: openStart({ open: opened({ views: [savedView({ id: 4, name: "Civil lines" })] }) }),
      handlers: {
        snapshot_select: () =>
          new Promise<WorkspaceOpen>((resolve) => {
            finish = resolve;
          }),
      },
    });
    await openAndType(user, "snapshot");
    await within(await list()).findByRole("option", { name: /14:05/ });
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: words.name })).toBeNull();
    });
    await openAndType(user, "civ");
    expect(await headings()).not.toContain(groups.views);
    await user.keyboard("{Escape}");
    await openAndType(user);
    expect(await itemsOf(groups.actions)).not.toContain(words.saveView);
    await user.keyboard("{Backspace}snapshot");
    expect(await headings()).not.toContain(groups.snapshots);
    await user.keyboard("{Escape}");
    act(() => {
      finish(opened({ selected: 1, views: [savedView({ id: 4, name: "Civil lines" })] }));
    });
    await openAndType(user, "civ");
    expect(await itemsOf(groups.views)).toEqual(["Civil lines"]);
  });

  it("in a workspace without a snapshot: no Lines, no saved views", async () => {
    const { user } = renderPalette("/overview", {
      start: openStart({
        open: opened({
          workspace: workspace({ snapshot_count: 0, latest_taken_at: null }),
          snapshots: [],
          selected: null,
          views: [savedView({ id: 4, name: "Civil lines" })],
        }),
      }),
    });
    await screen.findByRole("heading", { name: en.destinations.name.overview });
    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("57");
    expect(await nothingFor("57")).toBeVisible();
    await user.keyboard("{Backspace}{Backspace}civ");
    expect(await nothingFor("civ")).toBeVisible();
  });
});

describe("recent items", () => {
  it("lists the items chosen last, newest first, under Recent with no text", SLOW, async () => {
    const { user } = renderPalette();
    await choose(user, en.destinations.name.blockers);
    await choose(user, en.destinations.name.breakdown);
    await openAndType(user);
    expect(await headings()).toEqual([groups.actions, groups.destinations, groups.recent]);
    expect(await itemsOf(groups.recent)).toEqual([
      en.destinations.name.breakdown,
      en.destinations.name.blockers,
    ]);
  });

  it("keeps five, and a line chosen among them", SLOW, async () => {
    const { user } = renderPalette();
    await choose(user, "78B04-573-00004-PR-004");
    for (const name of ["overview", "breakdown", "blockers", "lines", "settings"] as const) {
      await choose(user, en.destinations.name[name]);
    }
    await openAndType(user);
    expect(await itemsOf(groups.recent)).toEqual([
      en.destinations.name.settings,
      en.destinations.name.lines,
      en.destinations.name.blockers,
      en.destinations.name.breakdown,
      en.destinations.name.overview,
    ]);
    await user.keyboard("{Escape}");
    await choose(user, en.destinations.name.lines);
    await choose(user, "78B04-573-00004-PR-004");
    await openAndType(user);
    expect(must((await itemsOf(groups.recent))[0], "a recent item")).toBe("78B04-573-00004-PR-004");
  });
});

describe("keyboard only", () => {
  it("reaches an item with the arrow keys and runs it with Enter", async () => {
    const { user, router } = renderPalette();
    await openAndType(user, "go");
    await user.keyboard("{Backspace}{Backspace}bl");
    await within(await list()).findByRole("option", { name: /^Blockers/ });
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(pathname(router)).toBe("/blockers");
    });
  });
});
