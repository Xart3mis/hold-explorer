import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import { must, renderApp } from "../../test/app";
import { openStart } from "../../test/fixtures";
import { SLOW } from "../../test/slow";

const text = en.overview;

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
    const bars = [
      ...within(screen.getByRole("list", { name: text.byDiscipline })).getAllByRole("button"),
      ...within(screen.getByRole("list", { name: text.byHoldType })).getAllByRole("button"),
    ];
    const reached: Element[] = [];
    screen.getByRole("heading", { level: 1, name: en.destinations.name.overview }).focus();
    for (let presses = 0; presses < 40; presses += 1) {
      await user.tab();
      if (document.activeElement !== null) reached.push(document.activeElement);
    }
    const at = (element: Element) => reached.indexOf(element);
    expect(at(must(tiles[0]))).toBeGreaterThan(-1);
    expect(at(must(tiles[1]))).toBe(at(must(tiles[0])) + 1);
    for (const bar of bars.slice(0, 13)) expect(at(bar)).toBeGreaterThan(at(must(tiles[1])));
    expect(
      reached.some(
        (element) => figures.contains(element) && !tiles.includes(element as HTMLElement),
      ),
    ).toBe(false);

    // Enter on a tile reached by Tab opens Lines.
    screen.getByRole("heading", { level: 1, name: en.destinations.name.overview }).focus();
    while (document.activeElement !== tiles[0]) await user.tab();
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
