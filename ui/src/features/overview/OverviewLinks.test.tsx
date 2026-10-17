import { screen, waitFor, within } from "@testing-library/react";
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
    const first = must(tiles[0]);
    first.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    router.navigate("/overview").catch(() => undefined);
    const bars = await screen.findByRole("list", { name: text.byDiscipline });
    const civil = within(bars).getByRole("button", { name: /^Civil / });
    civil.focus();
    await user.keyboard(" ");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
  });
});
