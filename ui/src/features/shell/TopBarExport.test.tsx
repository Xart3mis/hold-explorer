import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { exportButton, itemNames, openMenu, renderAt } from "../../test/export";
import { openStart, opened, workspace } from "../../test/fixtures";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";

const menu = en.export.menu;

/** The top bar: the first header of the document, before the main area and its page header. */
const topBar = () => must(document.querySelector<HTMLElement>("header"), "the top bar");
/** A button of the top bar, once the bar is built. */
const inTopBar = (name: string | RegExp) =>
  waitFor(() => within(topBar()).getByRole("button", { name }));
const pageHeader = () =>
  must(document.querySelector<HTMLElement>("main header"), "the page header");

const WITHOUT_SNAPSHOT = openStart({
  open: opened({
    workspace: workspace({ snapshot_count: 0, latest_taken_at: null }),
    snapshots: [],
    selected: null,
  }),
});

describe("the Export menu sits in the top bar", () => {
  it.each(["/overview", "/lines", "/breakdown", "/blockers"])(
    "on %s: in the top bar and not in the page header",
    async (path) => {
      const { user } = renderAt(path);
      const button = await exportButton();
      expect(topBar()).toContainElement(button);
      expect(within(pageHeader()).queryByRole("button", { name: menu.label })).toBeNull();
      expect(screen.getAllByRole("button", { name: menu.label })).toHaveLength(1);
      expect(itemNames(await openMenu(user)).length).toBeGreaterThan(3);
    },
  );

  it("is a secondary button of the height of Import, with Import last", async () => {
    renderAt("/lines");
    const button = await exportButton();
    expect(button).toHaveAttribute("data-variant", "secondary");
    const buttons = within(topBar()).getAllByRole("button");
    expect(buttons.at(-1)).toHaveAccessibleName(en.shell.import);
    expect(buttons.at(-2)).toBe(button);
  });

  it("is reached after the snapshot selector and before Import by Tab", SLOW, async () => {
    const { user } = renderAt("/overview");
    const selector = await screen.findByRole("button", { name: /Snapshot/ });
    await exportButton();
    act(() => {
      selector.focus();
    });
    await user.tab();
    expect(screen.getByRole("button", { name: menu.label })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: en.shell.import })).toHaveFocus();
  });

  it("saves with Ctrl+E as before", SLOW, async () => {
    const { user, saves } = renderAt("/overview");
    await exportButton();
    await user.keyboard("{Control>}e{/Control}");
    await waitFor(() => {
      expect(windowApi.chooseSavePath).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(saves).toHaveLength(1);
    });
  });
});

describe("where there is nothing to export", () => {
  it.each(["/settings", "/history", "/people", "/import"])(
    "%s shows the button unavailable, saying where export is",
    async (path) => {
      const { user } = renderApp({ path, start: openStart() });
      const button = await inTopBar(menu.label);
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toHaveAttribute("aria-busy");
      expect(button).toHaveAccessibleDescription(menu.notHere);
      expect(menu.notHere).toBe("Open Overview, Breakdown, Lines, or Blockers to export");
      await user.click(button);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    },
  );

  it("with no workspace open it still stands beside Import", async () => {
    renderApp({ path: "/workspaces" });
    const button = await inTopBar(menu.label);
    const bar = topBar();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(menu.notHere);
    expect(within(bar).queryByRole("button", { name: /Snapshot/ })).toBeNull();
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.at(-2)).toBe(button);
    expect(buttons.at(-1)).toHaveAccessibleName(en.shell.import);
  });

  it.each(["/overview", "/lines", "/breakdown", "/blockers"])(
    "%s without a snapshot says to import one",
    async (path) => {
      renderApp({ path, start: WITHOUT_SNAPSHOT, handlers: { overview: () => null } });
      const button = await inTopBar(menu.label);
      await waitFor(() => {
        expect(button).toHaveAccessibleDescription(menu.noSnapshot);
      });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(within(pageHeader()).queryByRole("button", { name: menu.label })).toBeNull();
    },
  );
});

describe("moving between screens", () => {
  it("swaps the menu without a flash of the unavailable button", SLOW, async () => {
    const { user } = renderAt("/lines");
    await exportButton();
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.textContent?.includes(menu.notHere) === true) seen.push(menu.notHere);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    await user.click(screen.getByRole("link", { name: en.destinations.name.blockers }));
    await screen.findByRole("heading", { name: en.destinations.name.blockers });
    await exportButton();
    expect(screen.getAllByRole("button", { name: menu.label })).toHaveLength(1);
    observer.disconnect();
    expect(seen).toEqual([]);
  });

  it("restores the unavailable button on leaving a data screen", SLOW, async () => {
    const { user } = renderAt("/lines");
    await exportButton();
    await user.click(screen.getByRole("link", { name: en.destinations.name.settings }));
    await screen.findByRole("heading", { name: en.destinations.name.settings });
    const button = within(topBar()).getByRole("button", { name: menu.label });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(menu.notHere);
    expect(screen.getAllByRole("button", { name: menu.label })).toHaveLength(1);
  });
});

describe("accessibility of the top bar", () => {
  it.each(["light", "dark"])(
    "has no violation on a data screen in the %s theme",
    SLOW,
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      try {
        renderAt("/overview");
        await exportButton();
        await expectAccessible(document.body, { page: true });
      } finally {
        delete document.documentElement.dataset.theme;
      }
    },
  );

  it.each(["light", "dark"])(
    "has no violation with the button unavailable in the %s theme",
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      try {
        renderApp({ path: "/settings", start: openStart() });
        await inTopBar(menu.label);
        await expectAccessible(document.body, { page: true });
      } finally {
        delete document.documentElement.dataset.theme;
      }
    },
  );
});
