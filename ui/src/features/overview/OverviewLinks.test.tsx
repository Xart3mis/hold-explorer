import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { keys } from "../../api/keys";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import en from "../../locales/en.json";
import { must, renderApp } from "../../test/app";
import { openStart, workspace } from "../../test/fixtures";
import { overviewView } from "../../test/overview";
import { SLOW } from "../../test/slow";
import { selectedBlocker } from "../blockers/address";
import { parseLinesAddress, selectionOf } from "../lines/address";

const text = en.overview;

/** The filters of the workspace the tests open, as every data screen reads them. */
function filters(): Filters | undefined {
  return queryClient.getQueryData<Filters>(keys.workspaceFilters(workspace().id));
}

/** Sets the filters of the workspace the tests open, as the filter bar does. */
function setFilters(change: Partial<Filters>): void {
  act(() => {
    queryClient.setQueryData<Filters>(keys.workspaceFilters(workspace().id), {
      ...defaultFilters,
      ...change,
    });
  });
}

const CIVIL = {
  dim: "Discipline",
  values: [{ key: "Civil", label: "Civil" }],
  negate: false,
} as const;

/** Goes back to the Overview by the sidebar. */
async function backToOverview(user: Awaited<ReturnType<typeof overview>>["user"]) {
  await user.click(
    within(screen.getByRole("navigation", { name: en.destinations.label })).getByRole("link", {
      name: en.destinations.name.overview,
    }),
  );
  await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
  await waitFor(() => {
    expect(document.querySelector("[data-part='overview']")).not.toHaveAttribute("aria-busy");
  });
}

/** The Overview of the workspace the tests open, once its figures are read. */
async function overview() {
  const app = renderApp({ start: openStart(), path: "/overview" });
  await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
  await waitFor(() => {
    expect(document.querySelector("[data-part='overview']")).not.toHaveAttribute("aria-busy");
  });
  return app;
}

describe("the Overview leads to Lines", () => {
  it("opens Lines with a Discipline chip when the Civil bar is pressed", SLOW, async () => {
    const { user, router } = await overview();
    const bars = screen.getByRole("list", { name: text.byDiscipline });
    await user.click(within(bars).getByRole("button", { name: /^Civil / }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: en.destinations.name.lines }),
    ).toBeInTheDocument();
    const bar = screen.getByRole("group", { name: en.filters.bar });
    expect(within(bar).getByRole("button", { name: "Discipline Civil" })).toBeInTheDocument();
  });

  it("replaces the entry of the field a bar belongs to", SLOW, async () => {
    const { user, router } = await overview();
    const types = screen.getByRole("list", { name: text.byHoldType });
    await user.click(within(types).getByRole("button", { name: /^Vendor data / }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    await user.click(
      within(screen.getByRole("navigation", { name: en.destinations.label })).getByRole("link", {
        name: en.destinations.name.overview,
      }),
    );
    // In the active filter, the bar says so.
    const again = await screen.findByRole("list", { name: text.byHoldType });
    expect(within(again).getByRole("button", { name: /^Vendor data / })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(again).getByRole("button", { name: /^Client decision / }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    const bar = await screen.findByRole("group", { name: en.filters.bar });
    expect(
      await within(bar).findByRole("button", { name: "Hold type Client decision" }),
    ).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /Vendor data/ })).not.toBeInTheDocument();
  });

  it("opens the All and the Single hold presets from the two tiles of lines", SLOW, async () => {
    const { user, router } = await overview();
    const figures = screen.getByRole("group", { name: text.figures });
    await user.click(within(figures).getByRole("button", { name: /^Lines on hold / }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    expect(router.state.location.search).toBe("");
    const presets = await screen.findByRole("radiogroup", { name: en.lines.presets.label });
    expect(within(presets).getByRole("radio", { name: en.lines.presets.all })).toBeChecked();

    await user.click(
      within(screen.getByRole("navigation", { name: en.destinations.label })).getByRole("link", {
        name: en.destinations.name.overview,
      }),
    );
    const again = await screen.findByRole("group", { name: text.figures });
    await user.click(await within(again).findByRole("button", { name: /^Single-hold lines / }));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?single=1");
    });
    const marked = await screen.findByRole("radiogroup", { name: en.lines.presets.label });
    expect(within(marked).getByRole("radio", { name: en.lines.presets.single })).toBeChecked();
  });

  it("reaches each bar and the two tiles by the keyboard, and only those", SLOW, async () => {
    const { user, router } = await overview();
    const figures = screen.getByRole("group", { name: text.figures });
    const tiles = within(figures).getAllByRole("button");
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      expect.stringMatching(/^Lines on hold/),
      expect.stringMatching(/^Single-hold lines/),
    ]);
    // The tile of the holds and the one of the age have no screen behind them yet.
    expect(within(figures).getByText(text.openHolds).closest("button")).toBeNull();
    expect(within(figures).getByText(text.medianAge).closest("button")).toBeNull();
    // Tab from the title of the page walks the bar, the two tiles, and then every bar of each
    // group after its switch; the figures without a screen are not stops.
    const disciplineBars = within(
      screen.getByRole("list", { name: text.byDiscipline }),
    ).getAllByRole("button");
    expect(disciplineBars).toHaveLength(overviewView().by_discipline.length);
    const bars = [
      ...disciplineBars,
      ...within(screen.getByRole("list", { name: text.byHoldType })).getAllByRole("button"),
    ];
    const reached: Element[] = [];
    screen.getByRole("heading", { level: 1, name: en.destinations.name.overview }).focus();
    // Enough presses to pass every stop of the page once: the bar, the tiles, the switches, the bars.
    for (let presses = 0; presses < bars.length + 12; presses += 1) {
      await user.tab();
      if (document.activeElement !== null) reached.push(document.activeElement);
    }
    const at = (element: Element) => reached.indexOf(element);
    expect(at(must(tiles[0]))).toBeGreaterThan(-1);
    expect(at(must(tiles[1]))).toBe(at(must(tiles[0])) + 1);
    for (const bar of bars) expect(at(bar)).toBeGreaterThan(at(must(tiles[1])));
    expect(
      reached.some(
        (element) => figures.contains(element) && !tiles.includes(element as HTMLElement),
      ),
    ).toBe(false);

    // Enter on a tile reached by Tab opens Lines.
    screen.getByRole("heading", { level: 1, name: en.destinations.name.overview }).focus();
    for (let presses = 0; presses < 40 && document.activeElement !== tiles[0]; presses += 1) {
      await user.tab();
    }
    expect(tiles[0]).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    // Space on a bar reached by Tab filters by it and opens Lines.
    await act(() => router.navigate("/overview"));
    const list = await screen.findByRole("list", { name: text.byDiscipline });
    const civil = await within(list).findByRole("button", { name: /^Civil / });
    for (let presses = 0; presses < 40 && document.activeElement !== civil; presses += 1) {
      await user.tab();
    }
    expect(civil).toHaveFocus();
    await user.keyboard(" ");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    expect(
      await within(await screen.findByRole("group", { name: en.filters.bar })).findByRole(
        "button",
        { name: "Discipline Civil" },
      ),
    ).toBeInTheDocument();
  });
});

describe("the lists of the Overview lead to what they name", () => {
  it(
    "opens Lines with a Role chip when a role bar is pressed, in place of the role before",
    SLOW,
    async () => {
      const { user, router } = await overview();
      await user.click(
        within(screen.getByRole("list", { name: text.byRole })).getByRole("button", {
          name: /^Checker /,
        }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      expect(router.state.location.search).toBe("");
      const bar = await screen.findByRole("group", { name: en.filters.bar });
      expect(within(bar).getByRole("button", { name: "Role Checker" })).toBeInTheDocument();

      await backToOverview(user);
      const roles = screen.getByRole("list", { name: text.byRole });
      expect(within(roles).getByRole("button", { name: /^Checker / })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await user.click(within(roles).getByRole("button", { name: /^Lead / }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      const roleEntries = filters()?.fields.filter((entry) => entry.dim === "Role") ?? [];
      expect(roleEntries).toEqual([
        { dim: "Role", values: [{ key: "Lead", label: "Lead" }], negate: false },
      ]);
    },
  );

  it(
    "opens Blockers with the blocker of a top blocker selected, and keeps the filters",
    SLOW,
    async () => {
      const { user, router } = await overview();
      setFilters({ fields: [CIVIL] });
      await user.click(
        within(screen.getByRole("list", { name: text.topBlockers })).getByRole("button", {
          name: /^Civil \/ DWG-220 /,
        }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/blockers");
      });
      expect(selectedBlocker(router.state.location.search)).toBe("Civil|DWG-220");
      expect(
        await screen.findByRole("heading", { level: 1, name: en.destinations.name.blockers }),
      ).toBeInTheDocument();
      // The blocker is selected, not filtered by: the filters are as they were.
      expect(filters()?.fields).toEqual([CIVIL]);
    },
  );

  it("opens Lines with a top line selected in the panel", SLOW, async () => {
    const { user, router } = await overview();
    await user.click(
      within(screen.getByRole("list", { name: text.topLines })).getByRole("button", {
        name: /^L-1187 /,
      }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    const { search } = router.state.location;
    expect(selectionOf(search, "lines")).toBe("L-1187");
    expect(parseLinesAddress(search)).toEqual(parseLinesAddress(""));
    expect(await screen.findByRole("complementary", { name: "L-1187" })).toBeInTheDocument();
  });

  it(
    "opens the stale holds in Lines: a row per hold, oldest first, aged 90 days or more",
    SLOW,
    async () => {
      const { user, router } = await overview();
      // A filter set before stays; only the age takes the band of the stale holds.
      await user.click(
        within(screen.getByRole("list", { name: text.byDiscipline })).getByRole("button", {
          name: /^Civil /,
        }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      await backToOverview(user);
      const attention = screen.getByRole("list", { name: text.attention });
      await user.click(
        within(attention).getByRole("button", { name: /903 holds open for 90 days/ }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      expect(parseLinesAddress(router.state.location.search)).toEqual({
        rows: "holds",
        sort: "OldestFirst",
        reverse: false,
      });
      expect(filters()?.ageBands).toEqual([{ min_days: 90, max_days: null }]);
      expect(filters()?.fields).toEqual([
        { dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false },
      ]);
      expect(
        await screen.findByRole("heading", { level: 1, name: en.destinations.name.lines }),
      ).toBeInTheDocument();
    },
  );

  it("reaches the new lists by the keyboard and opens them with Enter", SLOW, async () => {
    const { user, router } = await overview();
    const stale = within(screen.getByRole("list", { name: text.attention })).getByRole("button");
    const firstLine = within(screen.getByRole("list", { name: text.topLines })).getAllByRole(
      "button",
    )[0];
    screen.getByRole("heading", { level: 1, name: en.destinations.name.overview }).focus();
    const reached: Element[] = [];
    for (let presses = 0; presses < 60 && document.activeElement !== stale; presses += 1) {
      await user.tab();
      if (document.activeElement !== null) reached.push(document.activeElement);
    }
    expect(stale).toHaveFocus();
    expect(reached).toContain(must(firstLine, "the first top line"));
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(router.state.location.search).toContain("rows=holds");
    });
  });
});

describe("the stale holds lead to exactly the holds they count", () => {
  it.each(["All", "Released"] as const)(
    "opens only open holds when the status is %s",
    SLOW,
    async (status) => {
      // The command counts open holds only; whatever it answers, the press shows open holds.
      const { user, router } = renderApp({
        start: openStart(),
        path: "/overview",
        handlers: { overview: () => overviewView({ stale: { holds: 12, days: 90 } }) },
      });
      await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
      setFilters({ status, fields: [CIVIL] });
      const attention = await screen.findByRole("list", { name: text.attention });
      await user.click(
        within(attention).getByRole("button", { name: /12 holds open for 90 days/ }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      expect(parseLinesAddress(router.state.location.search)).toEqual({
        rows: "holds",
        sort: "OldestFirst",
        reverse: false,
      });
      expect(filters()?.status).toBe("Open");
      expect(filters()?.ageBands).toEqual([{ min_days: 90, max_days: null }]);
      expect(filters()?.fields).toEqual([CIVIL]);
    },
  );
});
