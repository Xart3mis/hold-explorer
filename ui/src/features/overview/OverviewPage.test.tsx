import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { keys } from "../../api/keys";
import { formatDateTime } from "../../app/format";
import { queryClient } from "../../app/query";
import type { AppStart } from "../../bindings/AppStart";
import type { OverviewView } from "../../bindings/OverviewView";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { opened, openStart, otherWorkspace, snapshot, workspace } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { group, overviewView } from "../../test/overview";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";

const text = en.overview;
const OLDER = "2026-09-30T14:05:00";
const NEWEST = "2026-10-07T08:00:00";

/** What the description of the page says for a snapshot of more than one hold. */
function description(takenAt: string, holds: string): string {
  return text.description_other
    .replace("{{date}}", formatDateTime(takenAt))
    .replace("{{count, number}}", holds);
}

/** The page, once its title is there. */
async function page(): Promise<HTMLElement> {
  const title = await screen.findByRole("heading", {
    level: 1,
    name: en.destinations.name.overview,
  });
  return must(title.closest<HTMLElement>("[data-part='page']"), "the page around its title");
}

/** The page, once the overview has been read: its numbers are there and nothing is loading. */
async function loaded(): Promise<HTMLElement> {
  const main = await page();
  await waitFor(() => {
    expect(
      must(main.querySelector("[data-part='overview']"), "the content of the page"),
    ).not.toHaveAttribute("aria-busy");
  });
  return main;
}

/** The cell of the stat tile group that carries the label. */
function tile(label: string): HTMLElement {
  const figures = screen.getByRole("group", { name: text.figures });
  return must(within(figures).getByText(label).parentElement, `the tile ${label}`);
}

/** The bar rows of a group, each as the text it shows: label, holds, lines. */
function barRows(name: string): string[] {
  const bars = screen.getByRole("group", { name });
  return [...bars.querySelectorAll("[data-part='bar-row']")].map((row) =>
    row.textContent.replace(/\s+/g, " ").trim(),
  );
}

/** The lengths of the bars of a group, in the order of its rows. */
function barLengths(name: string): string[] {
  const bars = screen.getByRole("group", { name });
  return [...bars.querySelectorAll<HTMLElement>("[data-part='bar']")].map(
    (bar) => bar.style.inlineSize,
  );
}

/** The rows of the table of a group, each as the texts of its cells. */
function tableRows(name: string): string[][] {
  const grid = screen.getByRole("grid", { name });
  return within(grid)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      [...within(row).getAllByRole("rowheader"), ...within(row).getAllByRole("gridcell")].map(
        (cell) => cell.textContent,
      ),
    );
}

/** The switch of a group: it is described by the title of its group. */
function tableSwitch(title: string): HTMLElement {
  return screen.getByRole("checkbox", { name: text.showAsTable, description: title });
}

const DISCIPLINE_ROWS = [
  "Civil 1,515 612 lines",
  "Piping 1,285 540 lines",
  "Process 846 398 lines",
  "Instrumentation 512 301 lines",
  "Structural 377 190 lines",
  "Electrical 266 140 lines",
  "Unspecified 241 166 lines",
];

describe("the Overview with a snapshot", () => {
  it("asks for the open holds with the complete default filter", async () => {
    const overview = vi.fn(() => overviewView());
    renderApp({ start: openStart(), path: "/overview", handlers: { overview } });
    await loaded();
    expect(overview).toHaveBeenCalledTimes(1);
    expect(overview).toHaveBeenCalledWith({ spec: openHoldsFilter() });
  });

  it("names the snapshot in view under its title, and has no breadcrumb and no page action", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    const main = await page();
    await loaded();
    expect(within(main).getByText(description(NEWEST, "9,300"))).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: en.breadcrumb.label })).not.toBeInTheDocument();
    const header = must(main.querySelector("header"), "the page header");
    expect(within(header).queryByRole("button")).not.toBeInTheDocument();
    expect(document.title).toBe(
      en.app.documentTitle.replace("{{page}}", en.destinations.name.overview),
    );
  });

  it("shows the four figures as formatted numbers", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await loaded();
    expect(tile(text.openHolds)).toHaveTextContent(`${text.openHolds} 5,042`);
    expect(tile(text.linesOnHold)).toHaveTextContent(`${text.linesOnHold} 2,208`);
    expect(tile(text.singleHoldLines)).toHaveTextContent(`${text.singleHoldLines} 714`);
    expect(tile(text.medianAge)).toHaveTextContent(`${text.medianAge} 41 d`);
    // Four figures and nothing else: no change since a snapshot before, no fifth tile.
    const figures = screen.getByRole("group", { name: text.figures });
    expect(figures.children).toHaveLength(4);
    expect(figures.querySelector("[data-part='delta']")).toBeNull();
    // A figure opens nothing yet, so it is not a button.
    expect(within(figures).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a dash and the reason when the snapshot gives no median age", async () => {
    const view = overviewView();
    renderApp({
      start: openStart(),
      path: "/overview",
      handlers: {
        overview: () => ({ ...view, summary: { ...view.summary, median_age_days: null } }),
      },
    });
    await loaded();
    const age = tile(text.medianAge);
    expect(age).toHaveTextContent(
      `${text.medianAge} ${en.common.noValue} ${text.medianAgeMissing}`,
    );
    expect(within(age).getByText(en.common.noValue)).toHaveAttribute("data-missing");
    // The other figures are there as before.
    expect(tile(text.openHolds)).toHaveTextContent("5,042");
  });

  it("shows the bar rows of both groups in the order given, each with its label and both counts", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await loaded();
    expect(barRows(text.byDiscipline)).toEqual(DISCIPLINE_ROWS);
    expect(barRows(text.byHoldType)).toEqual([
      "Vendor data 2,118 1,507 lines",
      "Process data 1,406 1,022 lines",
      "Client decision 911 640 lines",
      "Stress analysis 607 442 lines",
    ]);
    // Each group is headed by its title.
    expect(screen.getByRole("heading", { level: 2, name: text.byDiscipline })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: text.byHoldType })).toBeInTheDocument();
  });

  it("puts the rows in the order of their holds, and keeps the given order where two are equal", async () => {
    renderApp({
      start: openStart(),
      path: "/overview",
      handlers: {
        overview: () =>
          overviewView({
            by_discipline: [
              group("Process", 846, 398),
              group("Structural", 377, 190),
              group("Civil", 1515, 612),
              group("Electrical", 377, 1),
              group("Unspecified", 241, 166, ""),
            ],
          }),
      },
    });
    await loaded();
    expect(barRows(text.byDiscipline)).toEqual([
      "Civil 1,515 612 lines",
      "Process 846 398 lines",
      "Structural 377 190 lines",
      "Electrical 377 1 line",
      "Unspecified 241 166 lines",
    ]);
  });

  it("draws each bar as long as its holds are of the largest count of its group", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await loaded();
    // 1,515 is the largest: 1,285 of it is 84.8 percent, 241 of it is 15.9 percent.
    expect(barLengths(text.byDiscipline)).toEqual([
      "100%",
      "84.8%",
      "55.8%",
      "33.8%",
      "24.9%",
      "17.6%",
      "15.9%",
    ]);
    // The other group is measured against its own largest count, 2,118.
    expect(barLengths(text.byHoldType)).toEqual(["100%", "66.4%", "43%", "28.7%"]);
  });

  it("draws the bars as plain data: one neutral bar a row, and nothing to press", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await loaded();
    const bars = screen.getByRole("group", { name: text.byDiscipline });
    expect(bars.querySelectorAll("[data-part='bar']")).toHaveLength(7);
    expect(bars.querySelector("[data-ordinal]")).toBeNull();
    // Filtering by a bar comes with the filter bar. Until then a row is not a control.
    expect(within(bars).queryByRole("button")).not.toBeInTheDocument();
    expect(bars.querySelector("[tabindex]")).toBeNull();
  });

  it("shows a group as a table with the same rows in the same order", SLOW, async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    await loaded();
    const toTable = tableSwitch(text.byDiscipline);
    expect(toTable).not.toBeChecked();

    await user.click(toTable);
    expect(toTable).toBeChecked();
    expect(tableRows(text.byDiscipline)).toEqual(
      DISCIPLINE_ROWS.map((row) => {
        const [, label = "", holds = "", lines = ""] = /^(.+) (\S+) (\S+) lines$/.exec(row) ?? [];
        return [label, holds, lines];
      }),
    );
    const grid = screen.getByRole("grid", { name: text.byDiscipline });
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([text.columnDiscipline, text.columnHolds, text.columnLines]);
    // Numbers sit in columns: right-aligned, on tabular figures.
    const [, firstRow] = within(grid).getAllByRole("row");
    const cells = within(must(firstRow, "the first row")).getAllByRole("gridcell");
    expect(cells.map((cell) => cell.getAttribute("data-kind"))).toEqual(["number", "number"]);
    // The table stands in for the bars of its group; the other group keeps its bars.
    expect(screen.queryByRole("group", { name: text.byDiscipline })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: text.byHoldType })).toBeInTheDocument();
    expect(tableSwitch(text.byHoldType)).not.toBeChecked();

    // The switch is worked by the keyboard as well, and brings the bars back.
    toTable.focus();
    await user.keyboard(" ");
    expect(toTable).not.toBeChecked();
    expect(barRows(text.byDiscipline)).toEqual(DISCIPLINE_ROWS);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("names the first column of each table after what its group is by", SLOW, async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    await loaded();
    await user.click(tableSwitch(text.byHoldType));
    const grid = screen.getByRole("grid", { name: text.byHoldType });
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([text.columnHoldType, text.columnHolds, text.columnLines]);
    expect(tableRows(text.byHoldType)[0]).toEqual(["Vendor data", "2,118", "1,507"]);
  });

  it("says so in place of the bars when the snapshot has no open hold", async () => {
    const view = overviewView();
    renderApp({
      start: openStart(),
      path: "/overview",
      handlers: {
        overview: () => ({
          ...view,
          summary: {
            holds: 0,
            lines: 0,
            single_hold_lines: 0,
            median_age_days: null,
            median_duration_days: 18,
          },
          by_discipline: [],
          by_hold_type: [],
        }),
      },
    });
    await loaded();
    expect(tile(text.openHolds)).toHaveTextContent(`${text.openHolds} 0`);
    expect(screen.getAllByText(text.noOpenHolds)).toHaveLength(2);
    // There are no rows to show as a table.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("refers to nothing the page does not show yet", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    const main = await page();
    await loaded();
    expect(main.textContent).not.toMatch(
      /previous|trend|blocker|attention|top lines|soon|not available/i,
    );
    expect(Object.values(text).join(" ")).not.toMatch(
      /previous|trend|blocker|attention|top lines|soon|not available/i,
    );
  });
});

describe("the Overview while it changes", () => {
  it("on a first load shows blocks in the shape of the figures and of the bars", async () => {
    renderApp({
      start: openStart(),
      path: "/overview",
      handlers: { overview: () => new Promise<OverviewView>(() => undefined) },
    });
    const main = await page();
    expect(await within(main).findByText(text.loading)).toHaveAttribute("role", "status");
    expect(must(main.querySelector("[data-part='overview']"), "the content")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    // The labels of the figures are known; a block stands for each value.
    const figures = screen.getByRole("group", { name: text.figures });
    for (const label of [text.openHolds, text.linesOnHold, text.singleHoldLines, text.medianAge]) {
      expect(
        tile(label).querySelector("[data-part='skeleton'][data-variant='stat']"),
      ).not.toBeNull();
    }
    expect(figures.querySelectorAll("[data-part='skeleton']")).toHaveLength(4);
    // Both groups have their titles and rows of blocks with bars.
    for (const title of [text.byDiscipline, text.byHoldType]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
      const bars = screen.getByRole("group", { name: title });
      expect(bars).toHaveAttribute("aria-busy", "true");
      const rows = bars.querySelectorAll("[data-part='skeleton-row']");
      expect(rows.length).toBeGreaterThan(2);
      for (const row of rows) {
        expect(row.querySelector("[data-part='skeleton'][data-variant='bar']")).not.toBeNull();
      }
    }
    // Nothing can be switched or pressed while nothing is there, and nothing is said to be wrong.
    expect(within(main).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(main).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The snapshot is known before its numbers are.
    expect(within(main).getByText(description(NEWEST, "9,300"))).toBeInTheDocument();
  });

  it("shows why the overview could not be loaded, and loads it on a retry", async () => {
    const message =
      "The workspace file could not be read (it is locked by another program). Close the other program, then try again.";
    const overview = vi
      .fn<() => OverviewView>()
      .mockImplementationOnce(() => {
        throw commandFailure("Io", message);
      })
      .mockImplementation(() => overviewView());
    const { user } = renderApp({ start: openStart(), path: "/overview", handlers: { overview } });
    const main = await page();
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(text.error);
    expect(alert).toHaveTextContent(message);
    expect(must(alert.closest("[data-kind]"), "the error state")).toHaveAttribute(
      "data-kind",
      "Io",
    );
    // The error stands in place of the figures and the bars.
    expect(screen.queryByRole("group", { name: text.figures })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: text.byDiscipline })).not.toBeInTheDocument();
    // A command's own answer is not asked for again by itself.
    expect(overview).toHaveBeenCalledTimes(1);

    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    expect(await screen.findByRole("group", { name: text.figures })).toBeInTheDocument();
    expect(overview).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(tile(text.openHolds)).toHaveTextContent("5,042");
  });

  it(
    "reads the overview again for another snapshot, and keeps the numbers of before, dimmed, meanwhile",
    SLOW,
    async () => {
      const older: OverviewView = overviewView({
        snapshot: snapshot(1, OLDER, { row_count: 9120 }),
        is_latest: false,
        summary: {
          holds: 5127,
          lines: 3650,
          single_hold_lines: 1301,
          median_age_days: 36,
          median_duration_days: 17,
        },
        by_discipline: [group("Piping", 1420, 577), group("Civil", 1398, 590)],
      });
      let finish: (view: OverviewView) => void = () => undefined;
      const overview = vi
        .fn<() => OverviewView | Promise<OverviewView>>()
        .mockImplementationOnce(() => overviewView())
        .mockImplementationOnce(
          () =>
            new Promise<OverviewView>((resolve) => {
              finish = resolve;
            }),
        );
      const { user } = renderApp({
        start: openStart(),
        path: "/overview",
        handlers: { overview, snapshot_select: ({ id }) => opened({ selected: id }) },
      });
      const main = await page();
      await loaded();
      const content = must(main.querySelector("[data-part='overview']"), "the content");
      expect(content).not.toHaveAttribute("data-stale");
      // The table of one group is open: it stays open through the change.
      await user.click(tableSwitch(text.byHoldType));

      await user.click(
        screen.getByRole("button", {
          name: en.snapshots.trigger.replace("{{date}}", "7 Oct 2026"),
        }),
      );
      const menu = await screen.findByRole("menu", { name: en.snapshots.menu });
      await user.click(must(within(menu).getAllByRole("menuitemradio")[1], "the older snapshot"));

      // The command is asked again, and what was there stays, marked as stale: no skeleton.
      await waitFor(() => {
        expect(overview).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(content).toHaveAttribute("data-stale");
      });
      expect(content).not.toHaveAttribute("aria-busy");
      expect(tile(text.openHolds)).toHaveTextContent("5,042");
      expect(barRows(text.byDiscipline)).toEqual(DISCIPLINE_ROWS);
      expect(main.querySelector("[data-part='skeleton']")).toBeNull();
      expect(within(main).getByText(description(NEWEST, "9,300"))).toBeInTheDocument();

      await act(async () => {
        finish(older);
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(content).not.toHaveAttribute("data-stale");
      });
      expect(tile(text.openHolds)).toHaveTextContent("5,127");
      expect(tile(text.medianAge)).toHaveTextContent("36 d");
      expect(barRows(text.byDiscipline)).toEqual([
        "Piping 1,420 577 lines",
        "Civil 1,398 590 lines",
      ]);
      expect(within(main).getByText(description(OLDER, "9,120"))).toBeInTheDocument();
      expect(tableSwitch(text.byHoldType)).toBeChecked();
      expect(screen.getByRole("grid", { name: text.byHoldType })).toBeInTheDocument();
    },
  );

  it("reads the overview again when another workspace is the open one", async () => {
    const overview = vi.fn(() => overviewView());
    const start = openStart();
    renderApp({ start, path: "/overview", handlers: { overview } });
    await loaded();
    expect(overview).toHaveBeenCalledTimes(1);

    // The same snapshot id in another workspace is another snapshot.
    act(() => {
      queryClient.setQueryData<AppStart>(keys.start, {
        ...start,
        open: opened({ workspace: otherWorkspace }),
      });
    });
    await waitFor(() => {
      expect(overview).toHaveBeenCalledTimes(2);
    });
  });

  it("keys what it read by the workspace, the snapshot, and the filter", () => {
    const spec = openHoldsFilter();
    const key = keys.overview("a1b2c3d4e5f60718", 2, spec);
    expect(key).toContain("a1b2c3d4e5f60718");
    expect(key).toContain(2);
    expect(key).toContainEqual(spec);
    expect(keys.overview("a1b2c3d4e5f60718", 1, spec)).not.toEqual(key);
    expect(keys.overview("b2c3d4e5f6071829", 2, spec)).not.toEqual(key);
    expect(keys.overview("a1b2c3d4e5f60718", 2, { ...spec, status: "Released" })).not.toEqual(key);
  });
});

describe("the Overview of a workspace without snapshots", () => {
  const empty = () =>
    openStart({
      open: opened({
        workspace: workspace({ snapshot_count: 0, latest_taken_at: null }),
        snapshots: [],
        selected: null,
      }),
    });

  it("says what is absent and what to do, and shows no figure", async () => {
    renderApp({ start: empty(), path: "/overview", handlers: { overview: () => null } });
    const main = await page();
    expect(
      await within(main).findByRole("heading", { level: 2, name: text.emptyTitle }),
    ).toBeInTheDocument();
    expect(within(main).getByText(text.emptyText)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: text.figures })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: text.byDiscipline })).not.toBeInTheDocument();
    // One action, and no snapshot to name under the title.
    expect(within(main).getAllByRole("button")).toHaveLength(1);
    expect(must(main.querySelector("header"), "the page header").querySelector("p")).toBeNull();
  });

  it("starts an import from its action", async () => {
    windowApi.chooseImportFile.mockResolvedValue("/exports/Holds.xlsx");
    const { user, router } = renderApp({
      start: empty(),
      path: "/overview",
      handlers: { overview: () => null, import_open: () => new Promise(() => undefined) },
    });
    const main = await page();
    await user.click(await within(main).findByRole("button", { name: text.emptyAction }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import");
    });
    expect(windowApi.chooseImportFile).toHaveBeenCalledTimes(1);
    expect(router.state.location.state).toMatchObject({
      path: "/exports/Holds.xlsx",
      from: "/overview",
    });
  });
});

describe("the Overview and the accessibility checker", () => {
  it(
    "has no violation with the bars, with a table, and with a figure that is missing",
    SLOW,
    async () => {
      const view = overviewView();
      const { user, container } = renderApp({
        start: openStart({ open: opened({ selected: 1 }) }),
        path: "/overview",
        handlers: {
          overview: () => ({ ...view, summary: { ...view.summary, median_age_days: null } }),
        },
      });
      await loaded();
      await expectAccessible(container, { page: true });
      await user.click(tableSwitch(text.byDiscipline));
      await screen.findByRole("grid", { name: text.byDiscipline });
      await expectAccessible(container, { page: true });
    },
  );

  it("has no violation while it loads, when it failed, and without a snapshot", SLOW, async () => {
    const loading = renderApp({
      start: openStart(),
      path: "/overview",
      handlers: { overview: () => new Promise<OverviewView>(() => undefined) },
    });
    await screen.findByText(text.loading);
    await expectAccessible(loading.container, { page: true });
    loading.unmount();

    const failed = renderApp({
      start: openStart(),
      path: "/overview",
      handlers: {
        overview: () => {
          throw commandFailure("Io", "The workspace file could not be read. Try again.");
        },
      },
    });
    await screen.findByRole("alert");
    await expectAccessible(failed.container, { page: true });
    failed.unmount();

    const none = renderApp({
      start: openStart({ open: opened({ snapshots: [], selected: null }) }),
      path: "/overview",
      handlers: { overview: () => null },
    });
    await screen.findByRole("heading", { level: 2, name: text.emptyTitle });
    await expectAccessible(none.container, { page: true });
  });
});
