import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { destinations, type DestinationId } from "../../app/destinations";
import { destinationPages } from "../../app/router";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { openStart } from "../../test/fixtures";
import { SLOW } from "../../test/slow";

const notBuilt = [
  "breakdown",
  "lines",
  "blockers",
  "history",
  "people",
  "follow-up",
  "rules",
] as const;
const names = en.destinations.name;

describe("ComingSoon", () => {
  it("covers exactly the destinations the list marks as not built", () => {
    expect(destinations.filter((d) => !d.available).map((d) => d.id)).toEqual([...notBuilt]);
  });

  it.each(notBuilt)(
    "%s shows its own heading and description, and leads to Overview",
    SLOW,
    async (id) => {
      const { user, router } = renderApp({ start: openStart(), path: `/${id}` });
      expect(await screen.findByRole("heading", { level: 1, name: names[id] })).toBeInTheDocument();
      const main = screen.getByRole("main");
      // The status is the title of the empty state; the description says what the destination will show.
      expect(
        within(main).getByRole("heading", { level: 2, name: en.comingSoon.title }),
      ).toBeInTheDocument();
      expect(within(main).getByText(en.comingSoon.description[id])).toBeInTheDocument();
      // One action, and nothing else to press on the page.
      const buttons = within(main).getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAccessibleName(en.comingSoon.action);
      // The shell works as everywhere else.
      expect(screen.getByRole("navigation", { name: en.destinations.label })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: en.shell.import })).toBeInTheDocument();
      // No breadcrumb: a destination has no ancestor.
      expect(
        screen.queryByRole("navigation", { name: en.breadcrumb.label }),
      ).not.toBeInTheDocument();

      await user.click(must(buttons[0], "the action of the page"));
      expect(router.state.location.pathname).toBe("/overview");
      expect(
        await screen.findByRole("heading", { level: 1, name: names.overview }),
      ).toBeInTheDocument();
    },
  );

  it("has seven different descriptions, each of one or two sentences", () => {
    const texts = notBuilt.map((id) => en.comingSoon.description[id]);
    expect(new Set(texts).size).toBe(7);
    for (const text of texts) {
      const sentences = text.split(/(?<=\.)\s+/);
      expect(sentences.length).toBeGreaterThanOrEqual(1);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });

  it("names no date, no version number, and no plan, and does not apologize", () => {
    const texts = [
      en.comingSoon.title,
      en.comingSoon.action,
      ...Object.values(en.comingSoon.description),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/sorry|unfortunately|soon|milestone|M1|roadmap|stay tuned|—|!/i);
    }
  });

  it.each(notBuilt)("%s has no illustration, progress bar, or form", async (id) => {
    renderApp({ start: openStart(), path: `/${id}` });
    await screen.findByRole("heading", { level: 1, name: names[id] });
    const main = screen.getByRole("main");
    expect(main.querySelector("img, svg, [role='progressbar'], input, form")).toBeNull();
  });

  it.each(notBuilt)("%s has no accessibility violation", SLOW, async (id) => {
    renderApp({ start: openStart(), path: `/${id}` });
    await screen.findByRole("heading", { level: 1, name: names[id] });
    await expectAccessible(document.body, { page: true });
  });

  it("is reached and left by the keyboard alone", SLOW, async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    const nav = await screen.findByRole("navigation", { name: en.destinations.label });
    await user.keyboard("{Control>}4{/Control}");
    expect(router.state.location.pathname).toBe("/blockers");
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: names.blockers })).toHaveFocus();
    });
    await user.tab();
    expect(screen.getByRole("button", { name: en.comingSoon.action })).toHaveFocus();
    await user.keyboard(" ");
    expect(router.state.location.pathname).toBe("/overview");
    expect(within(nav).getByRole("link", { name: names.overview })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("gives way to the real page, and the sidebar tag goes, when a copy of the list marks a destination as built", async () => {
    const copy = destinations.map((destination) =>
      destination.id === "lines" ? { ...destination, available: true } : destination,
    );
    renderApp({
      start: openStart(),
      path: "/lines",
      destinations: copy,
      pages: { ...destinationPages, lines: <p>The real Lines page</p> },
    });
    expect(await screen.findByText("The real Lines page")).toBeInTheDocument();
    expect(screen.queryByText(en.comingSoon.title)).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: en.destinations.label });
    expect(within(nav).getByRole("link", { name: names.lines })).toBeInTheDocument();
    expect(within(nav).getAllByText(en.destinations.soon)).toHaveLength(6);
    // The others are untouched.
    expect(
      within(nav).getByRole("link", { name: `${names.blockers} ${en.destinations.soon}` }),
    ).toBeInTheDocument();
  });

  it("refuses a list that marks a destination as built without giving it a page", () => {
    const copy = destinations.map((destination) =>
      destination.id === ("people" satisfies DestinationId)
        ? { ...destination, available: true }
        : destination,
    );
    expect(() => renderApp({ start: openStart(), path: "/people", destinations: copy })).toThrow(
      /people/,
    );
  });
});
