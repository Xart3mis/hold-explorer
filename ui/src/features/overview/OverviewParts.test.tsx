import { act, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultFilters, useFilters, type Filters } from "../../app/filters/state";
import { destinationPages } from "../../app/router";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { openStart } from "../../test/fixtures";
import type { Handlers } from "../../test/ipc";
import { group, lineRow, overviewView } from "../../test/overview";
import { SLOW } from "../../test/slow";
import { OverviewPage } from "./OverviewPage";

const text = en.overview;

type Answer = NonNullable<Handlers["overview"]>;

/** The filters as a page inside the shell reads them: what the tests set them through. */
const probe: { filters?: ReturnType<typeof useFilters> } = {};

function Probe() {
  const filters = useFilters();
  useEffect(() => {
    probe.filters = filters;
  });
  return null;
}

/** The Overview with the test's own answer to `overview`, a spy. */
function renderOverview(answer: Answer = () => overviewView()) {
  delete probe.filters;
  const overview = vi.fn(answer);
  const app = renderApp({
    start: openStart(),
    path: "/overview",
    pages: {
      ...destinationPages,
      overview: (
        <>
          <OverviewPage />
          <Probe />
        </>
      ),
    },
    handlers: { overview },
  });
  return { ...app, overview };
}

/** The figures and the groups of the page, once they are read. */
async function content(): Promise<HTMLElement> {
  await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
  const found = await waitFor(() =>
    must(document.querySelector<HTMLElement>("[data-part='overview']"), "the content of the page"),
  );
  await waitFor(() => {
    expect(found).not.toHaveAttribute("aria-busy");
  });
  return found;
}

/** Sets the filters of the open workspace, as a control of the filter bar does. */
function set(filters: Partial<Filters>): void {
  act(() => {
    must(probe.filters, "the filters of the page").set({ ...defaultFilters, ...filters });
  });
}

/** The bar rows of a group, each as the text it shows. */
function barRows(name: string): string[] {
  const bars = screen.getByRole("list", { name });
  return [...bars.querySelectorAll("[data-part='bar-row']")].map((row) =>
    row.textContent.replace(/\s+/g, " ").trim(),
  );
}

/** The lengths of the bars of a group, in the order of its rows. */
function barLengths(name: string): string[] {
  const bars = screen.getByRole("list", { name });
  return [...bars.querySelectorAll<HTMLElement>("[data-part='bar']")].map(
    (bar) => bar.style.inlineSize,
  );
}

/** The section of the page a level-2 heading names. */
function section(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name });
  return must(heading.closest<HTMLElement>("section"), `the section ${name}`);
}

const STALE = "903 holds open for 90 days or more";

describe("the parts of the Overview after its groups", () => {
  it("shows the holds by role as bars, after the discipline and the hold type", async () => {
    renderOverview();
    await content();
    expect(barRows(text.byRole)).toEqual([
      "Lead 2,610 1,204 lines",
      "Checker 1,632 802 lines",
      "Designer 800 402 lines",
    ]);
    expect(barLengths(text.byRole)).toEqual(["100%", "62.5%", "30.7%"]);
    const titles = screen.getAllByRole("heading", { level: 2 }).map((title) => title.textContent);
    expect(titles).toEqual([
      text.byDiscipline,
      text.byHoldType,
      text.byRole,
      text.topBlockers,
      text.topLines,
      text.attention,
    ]);
    // The group of roles can be read as a table, as the other two can.
    expect(screen.getByRole("checkbox", { name: text.showRoleAsTable })).not.toBeChecked();
  });

  it("lists the top blockers and the top lines with their holds, as the command sends them", async () => {
    renderOverview();
    await content();
    expect(barRows(text.topBlockers)).toEqual([
      "Piping / PR-1042 96",
      "Civil / DWG-220 74",
      "Process / P&ID-7 51",
    ]);
    expect(barLengths(text.topBlockers)).toEqual(["100%", "77.1%", "53.1%"]);
    expect(barRows(text.topLines)).toEqual(["L-1001 4", "L-1187 3", "L-2040 1"]);
    expect(barLengths(text.topLines)).toEqual(["100%", "75%", "25%"]);
    // A line ID is an identifier, written as one.
    const lines = screen.getByRole("list", { name: text.topLines });
    for (const label of lines.querySelectorAll("[data-part='bar-label']")) {
      expect(label).toHaveAttribute("data-identifier");
    }
    // Each row opens what it names: it is a plain button, not a filter that is on or off.
    for (const name of [text.topBlockers, text.topLines]) {
      const rows = within(screen.getByRole("list", { name })).getAllByRole("button");
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row).not.toHaveAttribute("aria-pressed");
    }
  });

  it("says so in one line where a top list has no row", async () => {
    renderOverview(() => overviewView({ top_blockers: [], top_lines: [] }));
    await content();
    expect(within(section(text.topBlockers)).getByText(text.noOpenHolds)).toBeInTheDocument();
    expect(within(section(text.topLines)).getByText(text.noOpenHolds)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: text.topBlockers })).not.toBeInTheDocument();
  });

  it("names the stale holds with a warning tag and its icon, as a control", async () => {
    renderOverview();
    await content();
    const list = screen.getByRole("list", { name: text.attention });
    const entry = within(list).getByRole("button", { name: `${text.staleTag} ${STALE}` });
    const tag = must(entry.querySelector("[data-part='tag']"), "the tag of the entry");
    expect(tag).toHaveAttribute("data-tone", "warning");
    expect(tag).toHaveTextContent(text.staleTag);
    expect(tag.querySelector("svg")).not.toBeNull();
  });

  it("writes one stale hold in the singular, and the days the command gives", async () => {
    renderOverview(() => overviewView({ stale: { holds: 1, days: 120 } }));
    await content();
    const list = screen.getByRole("list", { name: text.attention });
    expect(
      within(list).getByRole("button", {
        name: `${text.staleTag} 1 hold open for 120 days or more`,
      }),
    ).toBeInTheDocument();
  });

  it("says in one quiet line that no hold is stale, with no tag and nothing to press", async () => {
    renderOverview(() => overviewView({ stale: { holds: 0, days: 90 } }));
    await content();
    const attention = section(text.attention);
    expect(within(attention).getByText("No hold has been open for 90 days or more.")).toBeVisible();
    expect(within(attention).queryByRole("button")).not.toBeInTheDocument();
    expect(attention.querySelector("[data-part='tag']")).toBeNull();
  });

  it("says that none the filters keep is stale when filters are set", async () => {
    renderOverview(() => overviewView({ stale: { holds: 0, days: 90 } }));
    await content();
    set({ text: "PR-1042" });
    const attention = section(text.attention);
    expect(
      await within(attention).findByText(
        "None of the holds the filters keep has been open for 90 days or more.",
      ),
    ).toBeVisible();
  });

  it("shows blocks in the shape of the new parts on a first load, and nothing to press", async () => {
    renderOverview(() => new Promise(() => undefined));
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
    for (const name of [text.byRole, text.topBlockers, text.topLines]) {
      expect(await screen.findByRole("list", { name })).toHaveAttribute("aria-busy", "true");
    }
    const attention = section(text.attention);
    expect(attention.querySelector("[data-part='skeleton']")).not.toBeNull();
    expect(within(attention).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the Overview names what it shows after the status", () => {
  it("calls the single-hold lines lines with one hold once a filter is set", async () => {
    renderOverview();
    await content();
    const figures = () => screen.getByRole("group", { name: text.figures });
    expect(within(figures()).getByRole("button", { name: /^Single-hold lines / })).toBeVisible();
    set({
      fields: [{ dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false }],
    });
    expect(
      await within(figures()).findByRole("button", { name: /^Lines with one hold / }),
    ).toBeVisible();
    expect(within(figures()).queryByText(text.singleHoldLines)).not.toBeInTheDocument();
    set({});
    expect(
      await within(figures()).findByRole("button", { name: /^Single-hold lines / }),
    ).toBeVisible();
  });

  it("names the group of roles after the status, and never calls a released hold open", async () => {
    renderOverview();
    await content();
    set({ status: "Released" });
    expect(await screen.findByRole("list", { name: text.releasedByRole })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: text.releasedShowRoleAsTable }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: text.releasedFigures })).getByRole("button", {
        name: /^Lines with one hold /,
      }),
    ).toBeVisible();
    set({ status: "All" });
    expect(await screen.findByRole("list", { name: text.allByRole })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: text.allShowRoleAsTable })).toBeInTheDocument();
    // The two lists of the most holds are the same words under every status.
    expect(screen.getByRole("heading", { level: 2, name: text.topBlockers })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: text.topLines })).toBeInTheDocument();
  });
});

describe("the new parts of the Overview and the accessibility checker", () => {
  it("has no violation with stale holds, without, and with empty top lists", SLOW, async () => {
    const some = renderOverview();
    await content();
    await expectAccessible(some.container, { page: true });
    some.unmount();

    const none = renderOverview(() =>
      overviewView({
        stale: { holds: 0, days: 90 },
        top_blockers: [],
        top_lines: [lineRow("L-1001", 2, null)],
        by_role: [group("Lead", 2, 1)],
      }),
    );
    await content();
    await expectAccessible(none.container, { page: true });
  });
});
