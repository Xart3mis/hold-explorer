import { act, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
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
import { expectNoAxeViolations } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { filterOptions } from "../../test/filters";
import { openStart, opened, workspace } from "../../test/fixtures";
import { selectOlderSnapshot } from "../../test/flow";
import { commandFailure, type Handlers } from "../../test/ipc";
import { holdRef, holdsView, lineDetail, linePage, lineId, lineRow } from "../../test/lines";
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

function visibleCountLine(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-part='lines-table'] p[role='status']");
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

  describe("in a table too narrow for all of its columns", () => {
    tableViewport({ width: 560, height: 400 });
    const headers = () => screen.getAllByRole("columnheader").map((header) => header.textContent);
    const leftOut = () =>
      must(document.querySelector<HTMLElement>("[data-part='lines-table'] [data-part='left-out']"));

    it("leaves out the lines' columns of least priority, and the panel of a line has their values", async () => {
      renderLines({
        path: `/lines?line=${lineId(0)}`,
        handlers: { line_detail: ({ lineId: id }) => lineDetail(id) },
      });
      await grid();
      // The line, its holds, and its oldest age stay; the sizes and the stress calc leave first.
      await waitFor(() => {
        expect(headers()).not.toContain(column.modelSize);
      });
      expect(headers()).toEqual(expect.arrayContaining([column.line, column.holds, column.oldest]));
      for (const gone of [column.ldtSize, column.stressCalc, column.sizes]) {
        expect(headers()).not.toContain(gone);
        expect(leftOut()).toHaveTextContent(gone);
      }
      expect(leftOut()).toHaveTextContent(/Open a line to read them\.$/);
      // What left is read in the panel of the line.
      const panel = await screen.findByRole("complementary");
      const facts = await within(panel).findByRole("list", { name: en.detail.lineFacts });
      expect(facts).toHaveTextContent(en.detail.fact.modelSize);
      expect(facts).toHaveTextContent(en.detail.fact.stressCalc);
      expect(facts).toHaveTextContent("Required");
    });

    it("keeps the age of the holds in view, and the panel of a hold has what left", async () => {
      renderLines({
        path: "/lines?rows=holds&hold=0",
        handlers: { hold_detail: ({ position }) => holdRef(position) },
      });
      await grid(text.holdsTable);
      await waitFor(() => {
        expect(headers()).not.toContain(column.name);
      });
      expect(headers()).toEqual([column.line, column.remark, column.blocker, column.age]);
      expect(leftOut()).toHaveTextContent(/Open a hold to read them\.$/);
      // The blocker is written in the face of the body in the table, the line ID in the monospace.
      const table = await grid(text.holdsTable);
      const blocker = within(table).getAllByText("577-PK-400")[0];
      expect(blocker?.closest("[role='gridcell']")).toHaveAttribute("data-kind", "text");
      expect(within(table).getAllByRole("rowheader")[0]).toHaveAttribute("data-kind", "identifier");
      const panel = await screen.findByRole("complementary");
      const facts = await within(panel).findByRole("list", { name: en.detail.holdFacts });
      expect(facts).toHaveTextContent(en.detail.fact.name);
      expect(facts).toHaveTextContent("A. Haddad");
      // The blocker is written in the face of the body there as well.
      expect(within(facts).getByText("577-PK-400")).not.toHaveAttribute("data-kind");
    });
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
    await within(table).findByRole("columnheader", { name: column.oldest });
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
    await within(table).findByRole("columnheader", { name: column.name });
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
    await screen.findByRole("radiogroup", { name: text.presets.label });
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
    expect(preset(text.presets.single)).toBeChecked();
    // Its lines were read above and are kept: the page shows them under its address.
    await waitFor(() => {
      expect(router.state.location.search).toBe("?single=1");
    });
    // Sorted by a header, no preset is marked; Tab reaches the first, and Enter chooses it.
    await user.click(within(await grid()).getByRole("columnheader", { name: column.line }));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?sort=LineId&single=1");
    });
    for (const radio of within(presets()).getAllByRole("radio")) expect(radio).not.toBeChecked();
    preset(text.presets.all).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });
    expect(preset(text.presets.all)).toBeChecked();
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

  it("shows no column and no preset that may not be there before the options of the snapshot are read", async () => {
    const options = held<ReturnType<typeof filterOptions>>();
    renderLines({ handlers: { filter_options: options.handler } });
    const table = await grid();
    // The rows may be there; the columns wait for what the snapshot lacks.
    await waitFor(() => {
      expect(options.waiting.length).toBeGreaterThan(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tableBox()).toHaveAttribute("aria-busy", "true");
    expect(within(table).queryByRole("columnheader", { name: column.modelSize })).toBeNull();
    expect(within(table).queryByRole("rowheader", { name: lineId(0) })).toBeNull();
    expect(screen.queryByRole("radio", { name: text.presets.mismatch })).toBeNull();
    act(() => {
      for (const waiting of options.waiting) {
        waiting.resolve(filterOptions({ absent: ["ModelSize", "LdtSize", "StressCalc"] }));
      }
    });
    await within(table).findByRole("rowheader", { name: lineId(0) });
    expect(within(table).queryByRole("columnheader", { name: column.modelSize })).toBeNull();
    expect(screen.queryByRole("radio", { name: text.presets.mismatch })).toBeNull();
    expect(within(table).getByRole("columnheader", { name: column.oldest })).toBeInTheDocument();
  });

  it("shows no optional column when the options of the snapshot cannot be read", async () => {
    renderLines({
      handlers: {
        filter_options: () => {
          throw commandFailure("Io", "The workspace file could not be read.");
        },
      },
    });
    const table = await grid();
    await within(table).findByRole("rowheader", { name: lineId(0) });
    // Only what an import cannot be without: the line, the remark, the hold type.
    expect(headers(table)).toEqual([column.line, column.holds, column.holdTypes, column.blockers]);
    expect(screen.queryByRole("radio", { name: text.presets.mismatch })).toBeNull();
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
        .map((radio) => radio.closest("label")?.textContent),
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
      // The empty state says that nothing matches: no count line stands under it.
      expect(visibleCountLine()).toBeNull();
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

    it("says when the snapshot has no open hold at all, and offers all holds", async () => {
      const { user, lines } = renderLines({
        lines: ({ spec }) =>
          spec.status === "Open" ? { total: 0, widest_line_id: 0, rows: [] } : linePage(),
      });
      const title = await screen.findByRole("heading", { level: 2, name: text.noOpenTitle });
      const empty = must(title.parentElement);
      await user.click(within(empty).getByRole("button", { name: text.noOpenAction }));
      await waitFor(() => {
        expect(lines).toHaveBeenLastCalledWith(
          expect.objectContaining({ spec: specWith({ status: "All" }) }),
        );
      });
      expect(must(probe.filters).filters.status).toBe("All");
      expect(await within(await grid()).findByRole("rowheader", { name: lineId(0) })).toBeVisible();
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

  it("leaves the table out after a first load failed, until it has something to show", async () => {
    let fail = true;
    const { user } = renderLines({
      lines: () => {
        if (fail) throw commandFailure("Io", "The workspace file could not be read.");
        return linePage();
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text.errorLines);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    fail = false;
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    expect(await within(await grid()).findByRole("rowheader", { name: lineId(0) })).toBeVisible();
  });

  it(
    "keeps the lines on screen when a reading fails after a visit to the holds",
    SLOW,
    async () => {
      let fail = false;
      const { user } = renderLines({
        lines: () => {
          if (fail) throw commandFailure("Io", "The workspace file could not be read.");
          return linePage();
        },
      });
      await within(await grid()).findByRole("rowheader", { name: lineId(0) });
      await user.click(screen.getByRole("radio", { name: text.modeHolds }));
      await within(await grid(text.holdsTable)).findAllByRole("rowheader");
      await user.click(screen.getByRole("radio", { name: text.modeLines }));
      const table = await grid();
      await within(table).findByRole("rowheader", { name: lineId(1) });

      fail = true;
      set(civil);
      expect(await screen.findByRole("alert")).toHaveTextContent(text.errorLines);
      // The lines that were on screen stay, dimmed: not the holds read before.
      expect(screen.queryByRole("grid", { name: text.holdsTable })).not.toBeInTheDocument();
      const lines = screen.getByRole("grid", { name: text.linesTable });
      expect(within(lines).getByRole("rowheader", { name: lineId(1) })).toBeInTheDocument();
      expect(within(lines).getByRole("columnheader", { name: column.disciplines })).toBeVisible();
      expect(tableBox()).toHaveAttribute("data-stale");
    },
  );

  it(
    "shows the lines of before while the holds are on their way, never holds of an earlier filter",
    SLOW,
    async () => {
      const later = held<ReturnType<typeof holdsView>>();
      let first = true;
      const { user } = renderLines({
        lines: ({ spec }) =>
          spec.fields.length === 0
            ? linePage()
            : { total: 1, widest_line_id: 12, rows: [lineRow("78B09-573-CW")] },
        holds: () => {
          if (first) {
            first = false;
            return holdsView();
          }
          return later.handler();
        },
      });
      await within(await grid()).findByRole("rowheader", { name: lineId(0) });
      await user.click(screen.getByRole("radio", { name: text.modeHolds }));
      await within(await grid(text.holdsTable)).findByRole("rowheader", { name: lineId(2) });
      await user.click(screen.getByRole("radio", { name: text.modeLines }));
      await within(await grid()).findByRole("rowheader", { name: lineId(0) });
      set(civil);
      await within(await grid()).findByRole("rowheader", { name: "78B09-573-CW" });

      await user.click(screen.getByRole("radio", { name: text.modeHolds }));
      await waitFor(() => {
        expect(later.waiting).toHaveLength(1);
      });
      // The lines of the filter in view stay, dimmed, and no hold of the filter of before shows.
      const table = screen.getByRole("grid", { name: text.linesTable });
      expect(within(table).getByRole("rowheader", { name: "78B09-573-CW" })).toBeInTheDocument();
      expect(screen.queryByRole("grid", { name: text.holdsTable })).not.toBeInTheDocument();
      expect(tableBox()).toHaveAttribute("data-stale");
      act(() => {
        later.waiting[0]?.resolve({
          total: 1,
          widest_line_id: 12,
          rows: [holdRef(40, { line_id: "78B09-573-CW", discipline: "Civil" })],
        });
      });
      const holds = await grid(text.holdsTable);
      expect(within(holds).getByRole("rowheader", { name: "78B09-573-CW" })).toBeInTheDocument();
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
    await expectNoAxeViolations(document.body, { page: true });
    await user.click(screen.getByRole("radio", { name: text.modeHolds }));
    await within(await grid(text.holdsTable)).findAllByRole("rowheader");
    await expectNoAxeViolations(document.body, { page: true });
  });
});

/** What the count line says of two selected rows, in the words of the catalog. */
const two = (message: string) => message.replace("{{count, number}}", "2");

/** Ctrl and a press on each row, in turn, as the user adds rows to a selection. */
async function ctrlClick(user: UserEvent, ...rows: HTMLElement[]): Promise<void> {
  await user.keyboard("{Control>}");
  for (const row of rows) await user.click(row);
  await user.keyboard("{/Control}");
}

/** The row of a line or hold, named by the line it is on. */
async function rowOf(table: HTMLElement, name: string): Promise<HTMLElement> {
  return must(
    (await within(table).findByRole("rowheader", { name })).closest<HTMLElement>("[role='row']"),
    `the row of ${name}`,
  );
}

describe("Lines, with several rows selected", () => {
  it(
    "counts the lines selected with Ctrl and a press, and clears them when the filters change",
    SLOW,
    async () => {
      const { user } = renderLines();
      const table = await grid();
      await ctrlClick(user, await rowOf(table, lineId(0)), await rowOf(table, lineId(2)));
      expect(countLine()).toHaveTextContent(two(text.selectedLines_other));
      expect(table).toHaveAttribute("aria-multiselectable", "true");
      set(civil);
      await waitFor(() => {
        expect(countLine()).not.toHaveTextContent(/selected/);
      });
      expect(within(table).queryAllByRole("row", { selected: true })).toHaveLength(0);
    },
  );

  it(
    "counts the holds selected, and clears them for another sort and for the other rows",
    SLOW,
    async () => {
      const { user } = renderLines({ path: "/lines?rows=holds" });
      const table = await grid(text.holdsTable);
      await ctrlClick(user, await rowOf(table, lineId(0)), await rowOf(table, lineId(1)));
      expect(countLine()).toHaveTextContent(two(text.selectedHolds_other));
      await user.click(within(table).getByRole("columnheader", { name: column.name }));
      await waitFor(() => {
        expect(countLine()).not.toHaveTextContent(/selected/);
      });
      await ctrlClick(user, await rowOf(table, lineId(0)), await rowOf(table, lineId(1)));
      expect(countLine()).toHaveTextContent(two(text.selectedHolds_other));
      await user.click(screen.getByRole("radio", { name: text.modeLines }));
      const lines = await grid();
      await rowOf(lines, lineId(0));
      expect(countLine()).not.toHaveTextContent(/selected/);
      // Back to the holds: what was selected there does not come back.
      await user.click(screen.getByRole("radio", { name: text.modeHolds }));
      await rowOf(await grid(text.holdsTable), lineId(0));
      expect(countLine()).not.toHaveTextContent(/selected/);
    },
  );

  it("clears the lines selected for another snapshot", SLOW, async () => {
    const { user } = renderLines({
      handlers: { snapshot_select: ({ id }) => opened({ selected: id }) },
    });
    const table = await grid();
    await ctrlClick(user, await rowOf(table, lineId(0)), await rowOf(table, lineId(1)));
    expect(countLine()).toHaveTextContent(two(text.selectedLines_other));
    await selectOlderSnapshot(user);
    await waitFor(() => {
      expect(screen.queryByText(en.snapshots.toNewest)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(countLine()).not.toHaveTextContent(/selected/);
    });
  });

  it(
    "clears the selection and closes the panel on one Escape, and the row has the focus",
    SLOW,
    async () => {
      const { user, router } = renderLines();
      const table = await grid();
      const first = await rowOf(table, lineId(0));
      await user.click(first);
      await screen.findByRole("complementary");
      await ctrlClick(user, await rowOf(table, lineId(2)));
      expect(countLine()).toHaveTextContent(two(text.selectedLines_other));
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      });
      expect(countLine()).not.toHaveTextContent(/selected/);
      expect(router.state.location.search).toBe("");
      expect(await rowOf(table, lineId(0))).toHaveFocus();
    },
  );

  it("selects the lines that are loaded on Ctrl+A, and no others", SLOW, async () => {
    const { user } = renderLines({
      lines: ({ offset }) => linePage({ total: 450, offset }),
    });
    const table = await grid();
    await rowOf(table, lineId(0));
    act(() => {
      within(table).getAllByRole("row")[1]?.focus();
    });
    await user.keyboard("{Control>}a{/Control}");
    expect(countLine()).toHaveTextContent(
      text.selectedLines_other.replace("{{count, number}}", "200"),
    );
  });
});
