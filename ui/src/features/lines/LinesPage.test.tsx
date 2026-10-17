import { act, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { defaultFilters, useFilters, type Filters } from "../../app/filters/state";
import { destinationPages } from "../../app/router";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { LinePage } from "../../bindings/LinePage";
import type { Status } from "../../bindings/Status";
import en from "../../locales/en.json";
import { held } from "../../test/actions";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { filterOptions } from "../../test/filters";
import { openStart, opened, workspace } from "../../test/fixtures";
import { commandFailure, type Handlers } from "../../test/ipc";
import { holdRef, holdsView, linePage, lineId, lineRow } from "../../test/lines";
import { SLOW } from "../../test/slow";
import { scrollTable, tableViewport } from "../../test/viewport";
import { LinesPage, MAX_LOADED_ROWS } from "./LinesPage";

const text = en.lines;
const column = text.column;
const VIEW = { workspace_id: workspace().id, snapshot_id: 2 };
const ALL = {
  sort: "HoldsDesc",
  single_hold_only: false,
  size_mismatch_only: false,
  reverse: false,
};

type LinesAnswer = NonNullable<Handlers["lines"]>;
type HoldsAnswer = NonNullable<Handlers["holds"]>;

/** The filters as a page inside the shell reads them: what the tests set them through. */
const probe: { filters?: ReturnType<typeof useFilters> } = {};

function Probe() {
  const filters = useFilters();
  useEffect(() => {
    probe.filters = filters;
  });
  return null;
}

interface Options {
  path?: string;
  lines?: LinesAnswer;
  holds?: HoldsAnswer;
  handlers?: Handlers;
}

/** Lines, with the test's own answers to `lines` and `holds`, both spies. */
function renderLines({
  path = "/lines",
  lines = () => linePage(),
  holds = () => holdsView(),
  handlers = {},
}: Options = {}) {
  delete probe.filters;
  const linesSpy = vi.fn(lines);
  const holdsSpy = vi.fn(holds);
  const app = renderApp({
    start: openStart(),
    path,
    pages: {
      ...destinationPages,
      lines: (
        <>
          <LinesPage />
          <Probe />
        </>
      ),
    },
    handlers: { lines: linesSpy, holds: holdsSpy, ...handlers },
  });
  return { ...app, lines: linesSpy, holds: holdsSpy };
}

/** Sets the filters of the open workspace, as a control of the filter bar does. */
function set(filters: Partial<Filters>): void {
  act(() => {
    must(probe.filters, "the filters of the page").set({ ...defaultFilters, ...filters });
  });
}

const civil: Partial<Filters> = {
  fields: [{ dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false }],
};

function specWith(part: Partial<FilterSpec>): FilterSpec {
  return { ...openHoldsFilter(), ...part };
}

/** The table of the page, once it shows rows. */
async function grid(name = text.linesTable): Promise<HTMLElement> {
  return screen.findByRole("grid", { name });
}

/** The box of the table, which says whether its rows are those of before. */
function tableBox(): HTMLElement {
  return must(
    document.querySelector<HTMLElement>("[data-part='lines-table'] > [data-height]"),
    "the table",
  );
}

function headers(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);
}

function presets(): HTMLElement {
  return screen.getByRole("radiogroup", { name: text.presets.label });
}

function preset(name: string): HTMLElement {
  return within(presets()).getByRole("radio", { name });
}

function countLine(): HTMLElement {
  return must(document.querySelector<HTMLElement>("[data-part='lines-table'] p[role='status']"));
}

describe("Lines", () => {
  it("asks first for the lines with the default query at offset 0, and shows them", async () => {
    const { lines, holds } = renderLines();
    const table = await grid();
    expect(await within(table).findByRole("rowheader", { name: lineId(0) })).toBeInTheDocument();
    expect(lines).toHaveBeenCalledTimes(1);
    expect(lines).toHaveBeenCalledWith({
      spec: openHoldsFilter(),
      query: ALL,
      offset: 0,
      view: VIEW,
    });
    expect(holds).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 1, name: en.destinations.name.lines }),
    ).toBeVisible();
    // The header of each column a full snapshot has, in order.
    expect(headers(table)).toEqual([
      column.line,
      column.holds,
      column.disciplines,
      column.holdTypes,
      column.blockers,
      column.oldest,
      column.modelSize,
      column.ldtSize,
      column.stressCalc,
      column.sizes,
    ]);
    // What a line shows: its counts, its names as a list, its age and sizes, and the warning.
    const second = must(
      within(table)
        .getByRole("rowheader", { name: lineId(1) })
        .closest("[role='row']"),
    );
    expect(second).toHaveTextContent("Piping, Civil");
    expect(second).toHaveTextContent("118 d");
    expect(second).toHaveTextContent('8"');
    expect(second).toHaveTextContent('10"');
    expect(within(second as HTMLElement).getByText(text.sizeMismatch)).toBeInTheDocument();
    const first = must(
      within(table)
        .getByRole("rowheader", { name: lineId(0) })
        .closest("[role='row']"),
    );
    expect(within(first as HTMLElement).queryByText(text.sizeMismatch)).not.toBeInTheDocument();
    // The All preset is marked.
    expect(preset(text.presets.all)).toBeChecked();
  });

  it("says how many lines there are when they are all loaded", async () => {
    renderLines();
    await grid();
    await waitFor(() => {
      expect(countLine()).toHaveTextContent(/^3 lines$/);
    });
  });

  it("shows a skeleton on a first load", async () => {
    const answer = held<LinePage>();
    renderLines({ lines: answer.handler });
    const table = await grid();
    expect(tableBox()).toHaveAttribute("aria-busy", "true");
    expect(within(table).queryByRole("rowheader", { name: lineId(0) })).not.toBeInTheDocument();
    expect(tableBox().querySelector("[data-part='skeleton-row']")).not.toBeNull();
  });

  describe("in a window of the table", () => {
    tableViewport({ width: 1280, height: 400 });

    it("says how many lines there are, and how many are loaded", SLOW, async () => {
      renderLines({ lines: ({ offset }) => linePage({ total: 3612, offset }) });
      await grid();
      await waitFor(() => {
        expect(countLine()).toHaveTextContent("200 of 3,612 lines");
      });
    });

    it("asks for the next page at offset 200", SLOW, async () => {
      const { lines } = renderLines({
        lines: ({ offset }) => linePage({ total: 3612, offset }),
      });
      const table = await grid();
      await waitFor(() => {
        expect(lines).toHaveBeenCalledTimes(1);
      });
      scrollTable(table, 200 * 40);
      await waitFor(() => {
        expect(lines).toHaveBeenCalledTimes(2);
      });
      expect(lines).toHaveBeenLastCalledWith({
        spec: openHoldsFilter(),
        query: ALL,
        offset: 200,
        view: VIEW,
      });
      await waitFor(() => {
        expect(countLine()).toHaveTextContent("400 of 3,612 lines");
      });
    });

    it(
      `loads no more than ${String(MAX_LOADED_ROWS)} holds, and says how to reach the others`,
      { timeout: SLOW.timeout * 2 },
      async () => {
        const { holds } = renderLines({
          path: "/lines?rows=holds",
          holds: ({ query }) => holdsView({ total: 9312, offset: query.offset }),
        });
        const table = await grid(text.holdsTable);
        // Scrolled to the end of what is loaded, again and again: a page more each time.
        const loaded = () =>
          Number(/^([\d,]+) of/.exec(countLine().textContent)?.[1]?.replace(/,/g, ""));
        await waitFor(() => {
          expect(loaded()).toBe(200);
        });
        while (loaded() < MAX_LOADED_ROWS) {
          const before = loaded();
          scrollTable(table, before * 40);
          await waitFor(() => {
            expect(loaded()).toBeGreaterThan(before);
          });
        }
        await waitFor(() => {
          expect(countLine()).toHaveTextContent(
            "5,000 of 9,312 holds are shown. Narrow the filters or reverse the sort to reach the others.",
          );
        });
        expect(holds).toHaveBeenCalledTimes(MAX_LOADED_ROWS / 200);
        // At the end of the 5,000 nothing more is asked for.
        scrollTable(table, 0);
        scrollTable(table, MAX_LOADED_ROWS * 40);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(holds).toHaveBeenCalledTimes(MAX_LOADED_ROWS / 200);
        expect(holds.mock.calls.map(([{ query }]) => query.offset).at(-1)).toBe(4800);
      },
    );
  });

  it(
    "asks for the holds when Holds is pressed, and shows the columns of each status",
    SLOW,
    async () => {
      const { user, holds } = renderLines();
      await grid();
      await user.click(screen.getByRole("radio", { name: text.modeHolds }));
      const table = await grid(text.holdsTable);
      await waitFor(() => {
        expect(holds).toHaveBeenCalledWith({
          spec: openHoldsFilter(),
          query: { sort: "FileOrder", reverse: false, limit: 200, offset: 0 },
          view: VIEW,
        });
      });
      expect(screen.getByRole("radio", { name: text.modeHolds })).toBeChecked();
      // No preset in the holds.
      expect(
        screen.queryByRole("radiogroup", { name: text.presets.label }),
      ).not.toBeInTheDocument();
      const common = [
        column.line,
        column.discipline,
        column.holdType,
        column.remark,
        column.blocker,
        column.blockerType,
        column.name,
        column.role,
        column.created,
      ];
      await waitFor(() => {
        expect(headers(table)).toEqual([...common, column.age]);
      });
      expect(within(table).getAllByRole("rowheader")).toHaveLength(3);

      const expected: Record<Status, string[]> = {
        Open: [...common, column.age],
        Released: [...common, column.releasedOn, column.duration],
        All: [...common, column.status, column.releasedOn, column.days],
      };
      for (const status of ["Released", "All"] as const) {
        set({ status });
        await waitFor(() => {
          expect(holds).toHaveBeenLastCalledWith(
            expect.objectContaining({ spec: specWith({ status }) }),
          );
        });
        await waitFor(() => {
          expect(headers(table)).toEqual(expected[status]);
        });
      }
      // Back to the open holds, which were read first and are kept.
      set({ status: "Open" });
      await waitFor(() => {
        expect(headers(table)).toEqual(expected.Open);
      });
      set({ status: "All" });
      await waitFor(() => {
        expect(headers(table)).toEqual(expected.All);
      });
      // Among all holds each says which it is, and the released one when and for how long.
      // The third hold is released.
      const released = must(
        (await within(table).findByRole("rowheader", { name: lineId(2) })).closest("[role='row']"),
      );
      expect(released).toHaveTextContent(text.statusReleased);
      expect(released).toHaveTextContent("19 Sept 2026");
      expect(released).toHaveTextContent("23 d");
    },
  );

  it("sends the sort of a pressed header, and its reverse on a second press", SLOW, async () => {
    const { user, lines, router } = renderLines();
    const table = await grid();
    await user.click(within(table).getByRole("columnheader", { name: column.oldest }));
    await waitFor(() => {
      expect(lines).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { ...ALL, sort: "OldestFirst" }, offset: 0 }),
      );
    });
    expect(router.state.location.search).toBe("?sort=OldestFirst");
    await waitFor(() => {
      expect(within(table).getByRole("columnheader", { name: column.oldest })).toHaveAttribute(
        "aria-sort",
        "descending",
      );
    });
    await user.click(within(table).getByRole("columnheader", { name: column.oldest }));
    await waitFor(() => {
      expect(lines).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { ...ALL, sort: "OldestFirst", reverse: true } }),
      );
    });
    expect(router.state.location.search).toBe("?sort=OldestFirst&reverse=1");
    // Sorted by a header, the page is no preset.
    for (const radio of within(presets()).getAllByRole("radio")) expect(radio).not.toBeChecked();

    // A name comes from A on its first press.
    await user.click(within(table).getByRole("columnheader", { name: column.line }));
    await waitFor(() => {
      expect(lines).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { ...ALL, sort: "LineId" } }),
      );
    });
  });

  it("sends the sort of a pressed header of the holds", SLOW, async () => {
    const { user, holds } = renderLines({ path: "/lines?rows=holds" });
    const table = await grid(text.holdsTable);
    await user.click(within(table).getByRole("columnheader", { name: column.name }));
    await waitFor(() => {
      expect(holds).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { sort: "Name", reverse: false, limit: 200, offset: 0 } }),
      );
    });
    await user.click(within(table).getByRole("columnheader", { name: column.name }));
    await waitFor(() => {
      expect(holds).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { sort: "Name", reverse: true, limit: 200, offset: 0 } }),
      );
    });
  });

  it("sends the query of a preset that is chosen, and marks it", SLOW, async () => {
    const { user, lines, router } = renderLines();
    await grid();
    const queries = {
      [text.presets.single]: { ...ALL, single_hold_only: true },
      [text.presets.easiest]: { ...ALL, sort: "Easiest" },
      [text.presets.oldest]: { ...ALL, sort: "OldestFirst" },
      [text.presets.mismatch]: { ...ALL, size_mismatch_only: true },
    };
    for (const [name, query] of Object.entries(queries)) {
      await user.click(preset(name));
      await waitFor(() => {
        expect(lines).toHaveBeenLastCalledWith(expect.objectContaining({ query, offset: 0 }));
      });
      expect(preset(name)).toBeChecked();
      expect(within(presets()).getAllByRole("radio", { checked: true })).toHaveLength(1);
    }
    // All again: its lines were read first, and are kept, so they are shown as they are.
    const calls = lines.mock.calls.length;
    await user.click(preset(text.presets.all));
    expect(preset(text.presets.all)).toBeChecked();
    expect(router.state.location.search).toBe("");
    await within(await grid()).findByRole("rowheader", { name: lineId(0) });
    expect(lines).toHaveBeenCalledTimes(calls);
    // The arrow keys move between the presets, and the one reached is chosen.
    preset(text.presets.all).focus();
    await user.keyboard("{ArrowRight}");
    expect(preset(text.presets.single)).toHaveFocus();
  });

  it("sends a new filter, dims the rows of before, and replaces them", SLOW, async () => {
    const answer = held<LinePage>();
    const { lines } = renderLines({ lines: answer.handler });
    await waitFor(() => {
      expect(answer.waiting).toHaveLength(1);
    });
    act(() => {
      answer.waiting[0]?.resolve(linePage());
    });
    const table = await grid();
    await within(table).findByRole("rowheader", { name: lineId(0) });
    expect(tableBox()).not.toHaveAttribute("data-stale");

    set(civil);
    await waitFor(() => {
      expect(answer.waiting).toHaveLength(2);
    });
    expect(lines).toHaveBeenLastCalledWith({
      spec: specWith({ fields: [{ dim: "Discipline", values: ["Civil"], negate: false }] }),
      query: ALL,
      offset: 0,
      view: VIEW,
    });
    // The rows of before stay, dimmed, until the new ones are there.
    expect(within(table).getByRole("rowheader", { name: lineId(0) })).toBeInTheDocument();
    expect(tableBox()).toHaveAttribute("data-stale");
    act(() => {
      answer.waiting[1]?.resolve({
        total: 1,
        widest_line_id: 12,
        rows: [lineRow("78B09-573-CW", { disciplines: ["Civil"] })],
      });
    });
    await within(table).findByRole("rowheader", { name: "78B09-573-CW" });
    expect(within(table).queryByRole("rowheader", { name: lineId(0) })).not.toBeInTheDocument();
    expect(tableBox()).not.toHaveAttribute("data-stale");
  });

  it("leaves out the columns and the preset of what the snapshot lacks", async () => {
    renderLines({
      handlers: {
        filter_options: () => filterOptions({ absent: ["ModelSize", "LdtSize", "StressCalc"] }),
      },
    });
    const table = await grid();
    await waitFor(() => {
      expect(headers(table)).toEqual([
        column.line,
        column.holds,
        column.disciplines,
        column.holdTypes,
        column.blockers,
        column.oldest,
      ]);
    });
    expect(within(table).queryByText(text.sizeMismatch)).not.toBeInTheDocument();
    expect(
      within(presets())
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual([text.presets.all, text.presets.single, text.presets.easiest, text.presets.oldest]);
  });

  describe("without rows", () => {
    it("leads to an import in a workspace without snapshots", async () => {
      const start = openStart({ open: opened({ snapshots: [], selected: null }) });
      const lines = vi.fn(() => linePage());
      renderApp({ start, path: "/lines", handlers: { lines } });
      expect(
        await screen.findByRole("heading", { level: 2, name: text.emptyTitle }),
      ).toBeInTheDocument();
      const empty = must(
        screen.getByRole("heading", { level: 2, name: text.emptyTitle }).parentElement,
      );
      expect(within(empty).getByRole("button", { name: text.emptyAction })).toBeInTheDocument();
      // Nothing to filter and nothing read.
      expect(screen.queryByRole("group", { name: en.filters.bar })).not.toBeInTheDocument();
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
      expect(lines).not.toHaveBeenCalled();
    });

    it("offers to clear the filters that keep no row", async () => {
      const { user } = renderLines({
        lines: ({ spec }) =>
          spec.fields.length === 0 ? linePage() : { total: 0, widest_line_id: 0, rows: [] },
      });
      await grid();
      set(civil);
      expect(
        await screen.findByRole("heading", { level: 2, name: text.noneTitleLines }),
      ).toBeInTheDocument();
      const table = screen.getByRole("grid", { name: text.linesTable });
      await waitFor(() => {
        expect(within(table).queryAllByRole("rowheader")).toHaveLength(0);
      });
      const empty = must(
        screen.getByRole("heading", { level: 2, name: text.noneTitleLines }).parentElement,
      );
      await user.click(within(empty).getByRole("button", { name: text.noneAction }));
      await within(table).findByRole("rowheader", { name: lineId(0) });
      expect(must(probe.filters).isDefault).toBe(true);
    });

    it("says which preset keeps no line, and offers All", async () => {
      const { user, lines } = renderLines({
        path: "/lines?single=1",
        lines: ({ query }) =>
          query.single_hold_only ? { total: 0, widest_line_id: 0, rows: [] } : linePage(),
      });
      const title = text.presetNoneTitle.replace("{{preset}}", text.presets.single);
      expect(await screen.findByRole("heading", { level: 2, name: title })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: text.presetNoneAction }));
      await waitFor(() => {
        expect(lines).toHaveBeenLastCalledWith(expect.objectContaining({ query: ALL }));
      });
      expect(await within(await grid()).findByRole("rowheader", { name: lineId(0) })).toBeVisible();
      expect(preset(text.presets.all)).toBeChecked();
    });

    it("says when the snapshot has no open hold at all", async () => {
      renderLines({ lines: () => ({ total: 0, widest_line_id: 0, rows: [] }) });
      expect(
        await screen.findByRole("heading", { level: 2, name: text.noOpenTitle }),
      ).toBeInTheDocument();
    });
  });

  it(
    "shows an error above the table with a retry, and keeps the rows of before",
    SLOW,
    async () => {
      let fail = false;
      const { user, lines } = renderLines({
        lines: () => {
          if (fail) {
            throw commandFailure(
              "Io",
              "The workspace file could not be read (it is locked by another program). Close the other program, then try again.",
            );
          }
          return linePage();
        },
      });
      const table = await grid();
      await within(table).findByRole("rowheader", { name: lineId(0) });
      fail = true;
      set(civil);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(text.errorLines);
      expect(alert).toHaveTextContent("locked by another program");
      // The rows of before stay, dimmed.
      expect(within(table).getByRole("rowheader", { name: lineId(0) })).toBeInTheDocument();
      expect(tableBox()).toHaveAttribute("data-stale");
      // The error stands above the table.
      expect(alert.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      fail = false;
      const calls = lines.mock.calls.length;
      await user.click(within(alert).getByRole("button", { name: en.common.retry }));
      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
      expect(lines.mock.calls.length).toBe(calls + 1);
      expect(tableBox()).not.toHaveAttribute("data-stale");
    },
  );

  it("writes the selected row into the address and marks it", SLOW, async () => {
    const { user, router } = renderLines({ path: "/lines?sort=LineId&view=3" });
    const table = await grid();
    const row = must(
      (await within(table).findByRole("rowheader", { name: lineId(1) })).closest<HTMLElement>(
        "[role='row']",
      ),
    );
    await user.click(row);
    await waitFor(() => {
      expect(router.state.location.search).toBe(`?sort=LineId&view=3&line=${lineId(1)}`);
    });
    expect(row).toHaveAttribute("aria-selected", "true");
    // A hold is selected by its position, in place of the line.
    await user.click(screen.getByRole("radio", { name: text.modeHolds }));
    const holds = await grid(text.holdsTable);
    // The hold at position 2 is on the third line.
    const hold = must(
      (await within(holds).findByRole("rowheader", { name: lineId(2) })).closest<HTMLElement>(
        "[role='row']",
      ),
    );
    await user.click(hold);
    await waitFor(() => {
      expect(router.state.location.search).toBe("?rows=holds&view=3&hold=2");
    });
  });

  it("marks the hold the address selects once it is loaded", async () => {
    const { holds } = renderLines({
      path: "/lines?rows=holds&hold=17",
      holds: () => ({
        total: 20,
        widest_line_id: 21,
        rows: Array.from({ length: 20 }, (_, position) =>
          holdRef(position, { line_id: `78B01-573-${String(position).padStart(5, "0")}-FW` }),
        ),
      }),
    });
    const table = await grid(text.holdsTable);
    const row = must(
      (await within(table).findByRole("rowheader", { name: "78B01-573-00017-FW" })).closest(
        "[role='row']",
      ),
    );
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(
      within(table)
        .getAllByRole("row")
        .filter((r) => r.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);
    expect(holds).toHaveBeenCalledTimes(1);
  });

  it("is opened by Ctrl+3, has no Soon tag, and passes the accessibility check", SLOW, async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
    const nav = screen.getByRole("navigation", { name: en.destinations.label });
    const item = within(nav).getByRole("link", { name: en.destinations.name.lines });
    expect(item).not.toHaveTextContent(en.destinations.soon);
    await user.keyboard("{Control>}3{/Control}");
    expect(router.state.location.pathname).toBe("/lines");
    expect(
      await screen.findByRole("heading", { level: 1, name: en.destinations.name.lines }),
    ).toBeInTheDocument();
    await within(await grid()).findByRole("rowheader", { name: lineId(0) });
    await expectAccessible(document.body, { page: true });
    await user.click(screen.getByRole("radio", { name: text.modeHolds }));
    await within(await grid(text.holdsTable)).findAllByRole("rowheader");
    await expectAccessible(document.body, { page: true });
  });
});
