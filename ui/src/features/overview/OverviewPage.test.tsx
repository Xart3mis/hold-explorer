import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, type Mock } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import type { AppStart } from "../../bindings/AppStart";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { OverviewView } from "../../bindings/OverviewView";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp, type RenderAppOptions } from "../../test/app";
import { opened, openStart, otherWorkspace, snapshot, workspace } from "../../test/fixtures";
import { commandFailure, type Handlers } from "../../test/ipc";
import { group, overviewView } from "../../test/overview";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";
import { formatDateTime } from "../../text/format";

const text = en.overview;
const OLDER = "2026-09-30T14:05:00";
const NEWEST = "2026-10-07T08:00:00";

type Answer = NonNullable<Handlers["overview"]>;

/**
 * What the page asks with: the complete default filter, and the view it shows, which is the
 * workspace the tests open with this snapshot selected, or with none.
 */
function asked(snapshotId: number | null) {
  return {
    spec: openHoldsFilter(),
    view: { workspace_id: workspace().id, snapshot_id: snapshotId },
  };
}

/**
 * Renders the app on the Overview with the test's own answer to the `overview` command. The
 * answer is a spy, so a test sees that the page asked, and what it asked with: the default
 * answer of `renderApp` is never what a test of this page reads.
 */
function renderOverview(
  answer: Answer = () => overviewView(),
  options: Omit<RenderAppOptions, "path"> = {},
) {
  const overview = vi.fn(answer);
  const app = renderApp({
    start: openStart(),
    ...options,
    path: "/overview",
    handlers: { ...options.handlers, overview },
  });
  return { ...app, overview };
}

/** The key the page keeps a reading under: the one a snapshot query has for this view and filter. */
function keyOf(workspaceId: string, snapshotId: number, spec: FilterSpec) {
  return keys.snapshot({ workspace_id: workspaceId, snapshot_id: snapshotId }, "overview", [spec]);
}

/** What the page says under its title once the numbers of a snapshot of several holds are there. */
function description(takenAt: string, holds: string, open: string): string {
  return text.description_other
    .replace("{{date}}", formatDateTime(takenAt))
    .replace("{{count, number}}", holds)
    .replace("{{open, number}}", open);
}

/** What it says before they are: the snapshot, and no number. */
function snapshotOnly(takenAt: string): string {
  return text.descriptionSnapshot.replace("{{date}}", formatDateTime(takenAt));
}

/** The page, once its title is there. */
async function page(): Promise<HTMLElement> {
  const title = await screen.findByRole("heading", {
    level: 1,
    name: en.destinations.name.overview,
  });
  return must(title.closest<HTMLElement>("[data-part='page']"), "the page around its title");
}

/** The figures and the groups of the page. */
function content(main: HTMLElement): HTMLElement {
  return must(main.querySelector<HTMLElement>("[data-part='overview']"), "the content of the page");
}

/** The line the page keeps for assistive technology: what it is doing, or nothing. */
function status(main: HTMLElement): HTMLElement {
  return must(main.querySelector<HTMLElement>(":scope > [role='status']"), "the status line");
}

/**
 * The page, once the overview has been read: its numbers are there and nothing is being read.
 * Every reading so far was asked for with the complete default filter.
 */
async function loaded(overview: Mock<Answer>): Promise<HTMLElement> {
  const main = await page();
  await waitFor(() => {
    expect(content(main)).not.toHaveAttribute("aria-busy");
  });
  expect(overview).toHaveBeenCalled();
  for (const [args] of overview.mock.calls) expect(args.spec).toEqual(openHoldsFilter());
  return main;
}

/** The cell of the stat tile group that carries the label. */
function tile(label: string): HTMLElement {
  const figures = screen.getByRole("group", { name: text.figures });
  return must(
    within(figures).getByText(label).closest<HTMLElement>("[data-part='stat-tile']"),
    `the tile ${label}`,
  );
}

/** The bar rows of a group, each as the text it shows: label, holds, lines. */
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

/** The switches of the two groups: each is named with its group. */
const disciplineSwitch = () => screen.getByRole("checkbox", { name: text.showDisciplineAsTable });
const holdTypeSwitch = () => screen.getByRole("checkbox", { name: text.showHoldTypeAsTable });

const DISCIPLINE_ROWS = [
  "Civil 1,515 612 lines",
  "Piping 1,285 540 lines",
  "Process 846 398 lines",
  "Instrumentation 512 301 lines",
  "Structural 377 190 lines",
  "Electrical 266 140 lines",
  "Unspecified 241 166 lines",
];

/** Groups in an order other than largest first, two of them with the same count: shown as sent. */
const TIED = [
  group("Process", 846, 398),
  group("Structural", 377, 190),
  group("Civil", 1515, 612),
  group("Electrical", 377, 1),
  group("Unspecified", 241, 166, ""),
];

describe("the Overview with a snapshot", () => {
  it("asks once for the open holds, with the complete default filter", async () => {
    const { overview } = renderOverview();
    await loaded(overview);
    expect(overview).toHaveBeenCalledTimes(1);
    expect(overview).toHaveBeenCalledWith(asked(2));
  });

  it("says under its title how many holds the snapshot has and how many of them are open", async () => {
    const { overview } = renderOverview();
    const main = await loaded(overview);
    // The total and the open holds are the two counts of the snapshot, so the line and the first
    // figure agree.
    expect(must(main.querySelector("header p"), "the line under the title")).toHaveTextContent(
      "The snapshot of 7 Oct 2026, 08:00 has 9,300 holds, 5,042 of them open.",
    );
    expect(description(NEWEST, "9,300", "5,042")).toBe(
      "The snapshot of 7 Oct 2026, 08:00 has 9,300 holds, 5,042 of them open.",
    );
    expect(tile(text.openHolds)).toHaveTextContent("5,042");
    // A destination has no breadcrumb, and the one action of this page is its Export menu.
    expect(screen.queryByRole("navigation", { name: en.breadcrumb.label })).not.toBeInTheDocument();
    const header = must(main.querySelector("header"), "the page header");
    expect(
      within(header)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([en.export.menu.label]);
    expect(document.title).toBe(
      en.app.documentTitle.replace("{{page}}", en.destinations.name.overview),
    );
  });

  it.each([
    { holds: 1, open: 1, says: "has 1 hold, 1 of them open." },
    { holds: 1, open: 0, says: "has 1 hold, 0 of them open." },
    { holds: 9300, open: 0, says: "has 9,300 holds, 0 of them open." },
    { holds: 9300, open: 1, says: "has 9,300 holds, 1 of them open." },
  ])("writes the line for $holds holds of which $open are open", async ({ holds, open, says }) => {
    const { overview } = renderOverview(() =>
      overviewView({ snapshot: snapshot(2, NEWEST, { row_count: holds, open_count: open }) }),
    );
    const main = await loaded(overview);
    expect(must(main.querySelector("header p"), "the line under the title")).toHaveTextContent(
      `The snapshot of ${formatDateTime(NEWEST)} ${says}`,
    );
  });

  it("shows the four figures as formatted numbers", async () => {
    const { overview } = renderOverview();
    await loaded(overview);
    expect(tile(text.openHolds)).toHaveTextContent(`${text.openHolds} 5,042`);
    expect(tile(text.linesOnHold)).toHaveTextContent(`${text.linesOnHold} 2,208`);
    expect(tile(text.singleHoldLines)).toHaveTextContent(`${text.singleHoldLines} 714`);
    expect(tile(text.medianAge)).toHaveTextContent(`${text.medianAge} 41 d`);
    // Four figures and nothing else: no change since a snapshot before, no fifth tile.
    const figures = screen.getByRole("group", { name: text.figures });
    expect(figures.children).toHaveLength(4);
    expect(figures.querySelector("[data-part='delta']")).toBeNull();
    // The two figures of lines open Lines; the other two open nothing yet, so they are no button.
    expect(
      within(figures)
        .getAllByRole("button")
        .map((tile) => tile.textContent),
    ).toEqual([`${text.linesOnHold} 2,208`, `${text.singleHoldLines} 714`]);
  });

  it("shows a dash and the reason when the snapshot gives no median age", async () => {
    const view = overviewView();
    const { overview } = renderOverview(() => ({
      ...view,
      summary: { ...view.summary, median_age_days: null },
    }));
    await loaded(overview);
    const age = tile(text.medianAge);
    expect(age).toHaveTextContent(
      `${text.medianAge} ${en.common.noValue} ${text.medianAgeMissing}`,
    );
    expect(within(age).getByText(en.common.noValue)).toHaveAttribute("data-missing");
    // The other figures are there as before.
    expect(tile(text.openHolds)).toHaveTextContent("5,042");
  });

  it("shows the bar rows of both groups in the order given, each with its label and both counts", async () => {
    const { overview } = renderOverview();
    await loaded(overview);
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

  it("keeps the rows in the order the command sends them, and sorts nothing itself", async () => {
    const { overview } = renderOverview(() => overviewView({ by_discipline: TIED }));
    await loaded(overview);
    expect(barRows(text.byDiscipline)).toEqual([
      "Process 846 398 lines",
      "Structural 377 190 lines",
      "Civil 1,515 612 lines",
      "Electrical 377 1 line",
      "Unspecified 241 166 lines",
    ]);
  });

  it("draws each bar as long as its holds are of the largest count of its group", async () => {
    const { overview } = renderOverview();
    await loaded(overview);
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

  it("draws no bar, and still shows the counts, in a group whose largest count is 0", async () => {
    const { overview } = renderOverview(() =>
      overviewView({ by_discipline: [group("Civil", 0, 0), group("Piping", 0, 0)] }),
    );
    await loaded(overview);
    // Nothing is divided by the largest count when it is 0: the bars have no length.
    expect(barLengths(text.byDiscipline)).toEqual(["0%", "0%"]);
    expect(barRows(text.byDiscipline)).toEqual(["Civil 0 0 lines", "Piping 0 0 lines"]);
    // The other group is drawn as always.
    expect(barLengths(text.byHoldType)).toEqual(["100%", "66.4%", "43%", "28.7%"]);
  });

  it(
    "writes a very large count with its separators, in the figures, the bars, and the table",
    SLOW,
    async () => {
      const view = overviewView();
      const { user, overview } = renderOverview(() => ({
        ...view,
        summary: { ...view.summary, holds: 12345678, lines: 9876543 },
        by_discipline: [group("Piping", 12345678, 9876543), group("Civil", 1234567, 987654)],
      }));
      await loaded(overview);
      expect(tile(text.openHolds)).toHaveTextContent(`${text.openHolds} 12,345,678`);
      expect(tile(text.linesOnHold)).toHaveTextContent(`${text.linesOnHold} 9,876,543`);
      expect(barRows(text.byDiscipline)).toEqual([
        "Piping 12,345,678 9,876,543 lines",
        "Civil 1,234,567 987,654 lines",
      ]);
      expect(barLengths(text.byDiscipline)).toEqual(["100%", "10%"]);
      // A count is one piece of text in its own cell of the row, whatever its length.
      const bars = screen.getByRole("list", { name: text.byDiscipline });
      const [first] = bars.querySelectorAll("[data-part='bar-row']");
      expect([...must(first, "the first row").children].map((part) => part.textContent)).toEqual([
        "Piping",
        "",
        "12,345,678",
        "9,876,543 lines",
      ]);
      await user.click(disciplineSwitch());
      expect(tableRows(text.byDiscipline)).toEqual([
        ["Piping", "12,345,678", "9,876,543"],
        ["Civil", "1,234,567", "987,654"],
      ]);
    },
  );

  it("draws the bars as plain data: one neutral bar a row, each a row that filters by its value", async () => {
    const { overview } = renderOverview();
    await loaded(overview);
    const bars = screen.getByRole("list", { name: text.byDiscipline });
    expect(bars.querySelectorAll("[data-part='bar']")).toHaveLength(7);
    expect(bars.querySelector("[data-ordinal]")).toBeNull();
    // A row is a button that filters by its value and opens Lines; none is in a filter yet.
    const rows = within(bars).getAllByRole("button");
    expect(rows).toHaveLength(7);
    for (const row of rows) expect(row).toHaveAttribute("aria-pressed", "false");
  });

  it("names each switch with its group, and shows the same words on both", async () => {
    const { overview } = renderOverview();
    await loaded(overview);
    // Two controls on one page do not share a name; what is seen is part of each name.
    expect(text.showDisciplineAsTable).not.toBe(text.showHoldTypeAsTable);
    for (const [control, name] of [
      [disciplineSwitch(), text.showDisciplineAsTable],
      [holdTypeSwitch(), text.showHoldTypeAsTable],
    ] as const) {
      expect(control).toHaveAccessibleName(name);
      expect(name).toContain(text.showAsTable);
      expect(must(control.closest("label"), "the label of the switch")).toHaveTextContent(
        text.showAsTable,
      );
      expect(control).not.toBeChecked();
    }
    // The third switch is that of the roles, named as these are.
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it(
    "gives a count column of a group's table the room of its sortable header when that needs more than the counts",
    SLOW,
    async () => {
      const { user, overview } = renderOverview();
      await loaded(overview);
      await user.click(disciplineSwitch());
      const grid = screen.getByRole("grid", { name: text.byDiscipline });
      const width = (name: string) =>
        within(grid).getByRole("columnheader", { name }).parentElement?.style.width;
      // Where nothing is laid out a figure is 7 px wide, the padding 12 px, and the sort mark of a
      // header 20 px. The widest count, "1,515", is four figures and a separator (58 px); a
      // header that can be sorted keeps the room of its mark, so "Holds" and "Lines" decide.
      expect(width(text.columnHolds)).toBe(`${String(54 + 20)}px`);
      expect(width(text.columnLines)).toBe(`${String(54 + 20)}px`);
    },
  );

  it(
    "gives the counts of a group's table the room of its widest count when they need more than the header",
    SLOW,
    async () => {
      const view = overviewView();
      const { user, overview } = renderOverview(() => ({
        ...view,
        by_discipline: [group("Piping", 12345678, 9876543), group("Civil", 1234567, 987654)],
      }));
      await loaded(overview);
      await user.click(disciplineSwitch());
      const grid = screen.getByRole("grid", { name: text.byDiscipline });
      const width = (name: string) =>
        within(grid).getByRole("columnheader", { name }).parentElement?.style.width;
      // "12,345,678": eight figures and two separators at 0.85 of one, 68 px, and the padding.
      expect(width(text.columnHolds)).toBe("92px");
      // "9,876,543": seven figures and two separators, 61 px, and the padding.
      expect(width(text.columnLines)).toBe("85px");
    },
  );

  it(
    "sorts a group's table by any column, and turns it round on a second press",
    SLOW,
    async () => {
      const { user, overview } = renderOverview();
      await loaded(overview);
      await user.click(disciplineSwitch());
      const grid = screen.getByRole("grid", { name: text.byDiscipline });
      const names = () => tableRows(text.byDiscipline).map(([name]) => name);
      // As the command sent them, unmarked, until a header is pressed.
      for (const header of within(grid).getAllByRole("columnheader")) {
        expect(header).toHaveAttribute("aria-sort", "none");
      }
      expect(names()).toEqual([
        "Civil",
        "Piping",
        "Process",
        "Instrumentation",
        "Structural",
        "Electrical",
        "Unspecified",
      ]);
      const discipline = within(grid).getByRole("columnheader", { name: text.columnDiscipline });
      await user.click(discipline);
      expect(discipline).toHaveAttribute("aria-sort", "ascending");
      expect(names()).toEqual([
        "Civil",
        "Electrical",
        "Instrumentation",
        "Piping",
        "Process",
        "Structural",
        "Unspecified",
      ]);
      await user.click(discipline);
      expect(discipline).toHaveAttribute("aria-sort", "descending");
      // "Unspecified" is the blank group: it has no value, and stays last both ways.
      expect(names()).toEqual([
        "Structural",
        "Process",
        "Piping",
        "Instrumentation",
        "Electrical",
        "Civil",
        "Unspecified",
      ]);
      // A count sorts the most first; the lines are not in the order of the holds.
      const lines = within(grid).getByRole("columnheader", { name: text.columnLines });
      await user.click(lines);
      expect(lines).toHaveAttribute("aria-sort", "descending");
      expect(discipline).toHaveAttribute("aria-sort", "none");
      expect(names()).toEqual([
        "Civil",
        "Piping",
        "Process",
        "Instrumentation",
        "Structural",
        "Unspecified",
        "Electrical",
      ]);
      const holds = within(grid).getByRole("columnheader", { name: text.columnHolds });
      await user.click(holds);
      await user.click(holds);
      expect(holds).toHaveAttribute("aria-sort", "ascending");
      expect(names()[0]).toBe("Unspecified");
      // Sorting is presentation: nothing is asked again.
      expect(overview).toHaveBeenCalledTimes(1);
      await expectAccessible(document.body, { page: true });
    },
  );

  it("keeps the blank group of a table last whichever way its names are sorted", SLOW, async () => {
    const view = overviewView();
    const { user, overview } = renderOverview(() => ({
      ...view,
      by_discipline: [group("Piping", 30, 9), group("(blank)", 20, 4, ""), group("Civil", 10, 2)],
    }));
    await loaded(overview);
    await user.click(disciplineSwitch());
    const grid = screen.getByRole("grid", { name: text.byDiscipline });
    const names = () => tableRows(text.byDiscipline).map(([name]) => name);
    const discipline = within(grid).getByRole("columnheader", { name: text.columnDiscipline });
    await user.click(discipline);
    expect(names()).toEqual(["Civil", "Piping", "(blank)"]);
    await user.click(discipline);
    expect(names()).toEqual(["Piping", "Civil", "(blank)"]);
  });

  it("shows a group as a table with the same rows in the same order", SLOW, async () => {
    const { user, overview } = renderOverview();
    await loaded(overview);
    const toTable = disciplineSwitch();

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
    // The table is read, not selected: no row says that it can be.
    for (const row of within(grid).getAllByRole("row")) {
      expect(row).not.toHaveAttribute("aria-selected");
    }
    await user.click(must(firstRow, "the first row"));
    expect(must(firstRow, "the first row")).not.toHaveAttribute("aria-selected");
    // The table stands in for the bars of its group; the other group keeps its bars.
    expect(screen.queryByRole("list", { name: text.byDiscipline })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: text.byHoldType })).toBeInTheDocument();
    expect(holdTypeSwitch()).not.toBeChecked();

    // The switch is worked by the keyboard as well, and brings the bars back.
    toTable.focus();
    await user.keyboard(" ");
    expect(toTable).not.toBeChecked();
    expect(barRows(text.byDiscipline)).toEqual(DISCIPLINE_ROWS);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it(
    "keeps in the table the order the bars have, also where two counts are equal",
    SLOW,
    async () => {
      const { user, overview } = renderOverview(() => overviewView({ by_discipline: TIED }));
      await loaded(overview);
      const bars = barRows(text.byDiscipline).map((row) => row.split(" ")[0]);
      await user.click(disciplineSwitch());
      const table = tableRows(text.byDiscipline);
      expect(table.map(([label]) => label)).toEqual(bars);
      expect(table).toEqual([
        ["Process", "846", "398"],
        ["Structural", "377", "190"],
        ["Civil", "1,515", "612"],
        ["Electrical", "377", "1"],
        ["Unspecified", "241", "166"],
      ]);
    },
  );

  it("names the first column of each table after what its group is by", SLOW, async () => {
    const { user, overview } = renderOverview();
    await loaded(overview);
    await user.click(holdTypeSwitch());
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
    const { overview } = renderOverview(() => ({
      ...view,
      snapshot: snapshot(2, NEWEST, { open_count: 0 }),
      summary: {
        holds: 0,
        lines: 0,
        single_hold_lines: 0,
        median_age_days: null,
        median_duration_days: 18,
      },
      by_discipline: [],
      by_hold_type: [],
      by_role: [],
      top_blockers: [],
      top_lines: [],
      stale: { holds: 0, days: 90, ages_known: true },
    }));
    await loaded(overview);
    expect(tile(text.openHolds)).toHaveTextContent(`${text.openHolds} 0`);
    // The three groups and the two lists of the most holds each say so.
    expect(screen.getAllByText(text.noOpenHolds)).toHaveLength(5);
    // There are no rows to show as a table.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("says nothing to assistive technology once it is read, and is not busy", async () => {
    const { overview } = renderOverview();
    const main = await loaded(overview);
    expect(status(main)).toBeEmptyDOMElement();
    expect(content(main)).not.toHaveAttribute("data-stale");
  });

  it("refers to nothing the page does not show yet", async () => {
    const { overview } = renderOverview();
    const main = await loaded(overview);
    // The blockers, the lines, and what needs attention are shown now; the trend is not yet.
    expect(main.textContent).not.toMatch(/previous|trend|soon|not available/i);
    expect(Object.values(text).join(" ")).not.toMatch(/previous|trend|soon|not available/i);
  });
});

describe("the Overview while it changes", () => {
  it("on a first load shows blocks in the shape of the figures and of the bars", async () => {
    const { overview } = renderOverview(() => new Promise<OverviewView>(() => undefined));
    const main = await page();
    await waitFor(() => {
      expect(status(main)).toHaveTextContent(text.loading);
    });
    expect(content(main)).toHaveAttribute("aria-busy", "true");
    expect(overview).toHaveBeenCalledWith(asked(2));
    // The line that is announced is not inside what is busy, so it is not held back.
    expect(content(main)).not.toContainElement(status(main));
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
      const bars = screen.getByRole("list", { name: title });
      expect(bars).toHaveAttribute("aria-busy", "true");
      const rows = bars.querySelectorAll("[data-part='skeleton-row']");
      expect(rows.length).toBeGreaterThan(2);
      for (const row of rows) {
        expect(row.querySelector("[data-part='skeleton'][data-variant='bar']")).not.toBeNull();
      }
    }
    // Nothing can be switched or pressed while nothing is there, and nothing is said to be wrong.
    // The filter bar above what is loading is not part of it: its controls are there already.
    expect(within(content(main)).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(content(main)).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The snapshot is known before its numbers are: the line names it and gives no number.
    expect(must(main.querySelector("header p"), "the line under the title")).toHaveTextContent(
      snapshotOnly(NEWEST),
    );
    expect(main.querySelector("header")?.textContent).not.toMatch(/9,300|5,042/);
  });

  it("shows why the overview could not be loaded, and loads it on a retry", async () => {
    const message =
      "The workspace file could not be read (it is locked by another program). Close the other program, then try again.";
    const answer = vi
      .fn<Answer>()
      .mockImplementationOnce(() => {
        throw commandFailure("Io", message);
      })
      .mockImplementation(() => overviewView());
    const { user, overview } = renderOverview(answer);
    const main = await page();
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(text.error);
    expect(alert).toHaveTextContent(message);
    expect(must(alert.closest("[data-kind]"), "the error state")).toHaveAttribute(
      "data-kind",
      "Io",
    );
    // The error stands in place of the figures and the bars, and is the one thing that is said.
    expect(screen.queryByRole("group", { name: text.figures })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: text.byDiscipline })).not.toBeInTheDocument();
    expect(status(main)).toBeEmptyDOMElement();
    expect(must(main.querySelector("header p"), "the line under the title")).toHaveTextContent(
      snapshotOnly(NEWEST),
    );
    // A command's own answer is not asked for again by itself.
    expect(overview).toHaveBeenCalledTimes(1);

    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    await loaded(overview);
    expect(overview).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(tile(text.openHolds)).toHaveTextContent("5,042");
  });

  it(
    "reads the overview again for another snapshot, keeps the numbers of before, dimmed and marked as being updated, and says when the new ones are there",
    SLOW,
    async () => {
      const older: OverviewView = overviewView({
        snapshot: snapshot(1, OLDER, { row_count: 9120, open_count: 5127 }),
        is_latest: false,
        summary: {
          holds: 5127,
          lines: 2251,
          single_hold_lines: 730,
          median_age_days: 36,
          median_duration_days: 17,
        },
        by_discipline: [group("Piping", 1420, 577), group("Civil", 1398, 590)],
      });
      let finish: (view: OverviewView) => void = () => undefined;
      const answer = vi
        .fn<Answer>()
        .mockImplementationOnce(() => overviewView())
        .mockImplementationOnce(
          () =>
            new Promise<OverviewView>((resolve) => {
              finish = resolve;
            }),
        );
      const { user, overview, container } = renderOverview(answer, {
        handlers: { snapshot_select: ({ id }) => opened({ selected: id }) },
      });
      const main = await loaded(overview);
      const shown = content(main);
      expect(shown).not.toHaveAttribute("data-stale");
      // The table of one group is open: it stays open through the change.
      await user.click(holdTypeSwitch());

      await user.click(
        screen.getByRole("button", {
          name: en.snapshots.trigger.replace("{{date}}", "7 Oct 2026"),
        }),
      );
      const menu = await screen.findByRole("menu", { name: en.snapshots.menu });
      await user.click(must(within(menu).getAllByRole("menuitemradio")[1], "the older snapshot"));

      // The command is asked again, and what was there stays: no skeleton.
      await waitFor(() => {
        expect(overview).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(shown).toHaveAttribute("data-stale");
      });
      // The numbers on screen belong to the snapshot of before. That is said, not only shown: the
      // content is busy, and a line that is announced says that the overview is being updated.
      expect(shown).toHaveAttribute("aria-busy", "true");
      expect(status(main)).toHaveTextContent(text.updating);
      expect(tile(text.openHolds)).toHaveTextContent("5,042");
      expect(barRows(text.byDiscipline)).toEqual(DISCIPLINE_ROWS);
      expect(main.querySelector("[data-part='skeleton']")).toBeNull();
      // The line under the title still names the snapshot those numbers are of.
      expect(within(main).getByText(description(NEWEST, "9,300", "5,042"))).toBeInTheDocument();
      await expectAccessible(container, { page: true });

      await act(async () => {
        finish(older);
        await Promise.resolve();
      });
      await loaded(overview);
      expect(shown).not.toHaveAttribute("data-stale");
      expect(status(main)).toHaveTextContent(text.updated);
      expect(tile(text.openHolds)).toHaveTextContent("5,127");
      expect(tile(text.medianAge)).toHaveTextContent("36 d");
      expect(barRows(text.byDiscipline)).toEqual([
        "Piping 1,420 577 lines",
        "Civil 1,398 590 lines",
      ]);
      expect(within(main).getByText(description(OLDER, "9,120", "5,127"))).toBeInTheDocument();
      expect(holdTypeSwitch()).toBeChecked();
      expect(screen.getByRole("grid", { name: text.byHoldType })).toBeInTheDocument();
    },
  );

  it("reads the overview again when another workspace is the open one", async () => {
    const start = openStart();
    const { overview } = renderOverview(() => overviewView(), { start });
    await loaded(overview);
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
    await loaded(overview);
  });

  it("does not say that a workspace has no snapshots while its overview is still being read", async () => {
    const none = openStart({
      open: opened({
        workspace: workspace({ snapshot_count: 0, latest_taken_at: null }),
        snapshots: [],
        selected: null,
      }),
    });
    const answer = vi
      .fn<Answer>()
      .mockImplementationOnce(() => null)
      .mockImplementationOnce(() => new Promise<OverviewView>(() => undefined));
    const { overview } = renderOverview(answer, { start: none });
    const main = await page();
    await within(main).findByRole("heading", { level: 2, name: text.emptyTitle });

    // Another workspace is opened, one with snapshots. What was read for the workspace of before
    // is that it has none, and that is not shown for this one.
    act(() => {
      queryClient.setQueryData<AppStart>(keys.start, {
        ...none,
        open: opened({ workspace: otherWorkspace }),
      });
    });
    await waitFor(() => {
      expect(overview).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(status(main)).toHaveTextContent(text.loading);
    });
    expect(
      within(main).queryByRole("heading", { level: 2, name: text.emptyTitle }),
    ).not.toBeInTheDocument();
    expect(content(main)).toHaveAttribute("aria-busy", "true");
    expect(main.querySelectorAll("[data-part='skeleton-row']").length).toBeGreaterThan(2);
  });

  it("keys what it read by the workspace, the snapshot, and the filter", () => {
    const spec = openHoldsFilter();
    const key = keyOf("a1b2c3d4e5f60718", 2, spec);
    expect(key).toContain("a1b2c3d4e5f60718");
    expect(key).toContain(2);
    expect(key).toContainEqual(spec);
    expect(keyOf("a1b2c3d4e5f60718", 1, spec)).not.toEqual(key);
    expect(keyOf("b2c3d4e5f6071829", 2, spec)).not.toEqual(key);
    expect(keyOf("a1b2c3d4e5f60718", 2, { ...spec, status: "Released" })).not.toEqual(key);
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
    const { overview } = renderOverview(() => null, { start: empty() });
    const main = await page();
    expect(
      await within(main).findByRole("heading", { level: 2, name: text.emptyTitle }),
    ).toBeInTheDocument();
    expect(overview).toHaveBeenCalledWith(asked(null));
    expect(within(main).getByText(text.emptyText)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: text.figures })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: text.byDiscipline })).not.toBeInTheDocument();
    // The inert Export button and the one action, no snapshot to name under the title, and
    // nothing being read.
    expect(within(main).getAllByRole("button")).toHaveLength(2);
    expect(within(main).getByRole("button", { name: en.export.menu.label })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(must(main.querySelector("header"), "the page header").querySelector("p")).toBeNull();
    expect(status(main)).toBeEmptyDOMElement();
  });

  it("starts an import from its action", async () => {
    windowApi.chooseImportFile.mockResolvedValue("/exports/Holds.xlsx");
    const { user, router } = renderOverview(() => null, {
      start: empty(),
      handlers: { import_open: () => new Promise(() => undefined) },
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

describe("the Overview of a limited snapshot", () => {
  const limited = snapshot(2, NEWEST, { limited: true });
  const withLimited = () =>
    openStart({ open: opened({ snapshots: [snapshot(1, OLDER, { row_count: 9120 }), limited] }) });

  /** The notice that says the snapshot is limited, when the page has it. */
  function limitedNotice(main: HTMLElement): HTMLElement | null {
    const title = within(main).queryByText(text.limitedTitle);
    return title?.closest<HTMLElement>('[role="status"]') ?? null;
  }

  it("says that the snapshot is limited, and what that means", async () => {
    const { overview } = renderOverview(() => overviewView({ snapshot: limited }), {
      start: withLimited(),
    });
    const main = await loaded(overview);
    const notice = must(limitedNotice(main), "the notice of a limited snapshot");
    expect(notice).toHaveAttribute("data-tone", "info");
    expect(notice).toHaveTextContent(text.limitedText);
    // It says what follows for the numbers under it. Which columns the snapshot lacks is said
    // once, by the filter bar above, and not again here.
    expect(text.limitedText).toMatch(/counts as open/);
    expect(text.limitedText).not.toMatch(/column|hold ID/i);
    // It stands before the figures it is about, and is not part of what is dimmed or busy.
    expect(content(main)).not.toContainElement(notice);
    expect(
      notice.compareDocumentPosition(content(main)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // It is a statement, not an error, and it offers nothing to press.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(notice).queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so before the numbers are there, for the snapshot the shell has selected", async () => {
    renderOverview(() => new Promise<OverviewView>(() => undefined), { start: withLimited() });
    const main = await page();
    await waitFor(() => {
      expect(limitedNotice(main)).not.toBeNull();
    });
  });

  it("says nothing of the kind for a snapshot that is not limited", async () => {
    const { overview } = renderOverview();
    const main = await loaded(overview);
    expect(limitedNotice(main)).toBeNull();
    expect(within(main).queryByText(text.limitedText)).not.toBeInTheDocument();
  });

  it("has no accessibility violation with the notice", SLOW, async () => {
    const { overview, container } = renderOverview(() => overviewView({ snapshot: limited }), {
      start: withLimited(),
    });
    await loaded(overview);
    await expectAccessible(container, { page: true });
  });
});

describe("the Overview and the accessibility checker", () => {
  it(
    "has no violation with the bars, with a table, and with a figure that is missing",
    SLOW,
    async () => {
      const view = overviewView();
      const { user, container, overview } = renderOverview(
        () => ({ ...view, summary: { ...view.summary, median_age_days: null } }),
        { start: openStart({ open: opened({ selected: 1 }) }) },
      );
      await loaded(overview);
      await expectAccessible(container, { page: true });
      await user.click(disciplineSwitch());
      await screen.findByRole("grid", { name: text.byDiscipline });
      await expectAccessible(container, { page: true });
    },
  );

  it("has no violation while it loads, when it failed, and without a snapshot", SLOW, async () => {
    const loading = renderOverview(() => new Promise<OverviewView>(() => undefined));
    await waitFor(async () => {
      expect(status(await page())).toHaveTextContent(text.loading);
    });
    await expectAccessible(loading.container, { page: true });
    loading.unmount();

    const failed = renderOverview(() => {
      throw commandFailure("Io", "The workspace file could not be read. Try again.");
    });
    await screen.findByRole("alert");
    await expectAccessible(failed.container, { page: true });
    failed.unmount();

    const none = renderOverview(() => null, {
      start: openStart({ open: opened({ snapshots: [], selected: null }) }),
    });
    await screen.findByRole("heading", { level: 2, name: text.emptyTitle });
    await expectAccessible(none.container, { page: true });
  });
});
