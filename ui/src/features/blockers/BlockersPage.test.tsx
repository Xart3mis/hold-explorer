import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { keys } from "../../api/keys";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { SolveView } from "../../bindings/SolveView";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { manySteps, solveView } from "../../test/blockers";
import { openStart, opened, otherWorkspace, workspace } from "../../test/fixtures";
import { selectOlderSnapshot } from "../../test/flow";
import { commandFailure, type Handlers } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { scrollTable, tableViewport } from "../../test/viewport";
import { formatCount } from "../../text/format";

const text = en.blockers;
const VIEW = { workspace_id: workspace().id, snapshot_id: 2 };

type SolveAnswer = NonNullable<Handlers["solve_order"]>;

interface Options {
  path?: string;
  solveOrder?: SolveAnswer;
  handlers?: Handlers;
  filters?: Filters;
}

/** The app on Blockers, with the test's own answer to `solve_order`, a spy. */
function renderBlockers({
  path = "/blockers",
  solveOrder = () => solveView(),
  handlers = {},
  filters,
}: Options = {}) {
  const solveSpy = vi.fn(solveOrder);
  const app = renderApp({
    start: openStart(),
    path,
    handlers: { solve_order: solveSpy, ...handlers },
  });
  // The filters of the workspace, as the filter bar would have left them.
  if (filters !== undefined)
    queryClient.setQueryData(keys.workspaceFilters(workspace().id), filters);
  return { ...app, solveOrder: solveSpy };
}

function specWith(part: Partial<FilterSpec>): FilterSpec {
  return { ...openHoldsFilter(), ...part };
}

/** A catalog text with its values put in, as the interface writes them. */
function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{\{(\w+)(?:, number)?\}\}/g, (_, name: string) => {
    const value = values[name];
    return typeof value === "number" ? formatCount(value) : (value ?? "");
  });
}

/** The table of the steps, once it is there. */
async function stepTable(): Promise<HTMLElement> {
  return screen.findByRole("grid", { name: text.table });
}

/** The row of a step, named by its step. */
async function stepRow(table: HTMLElement, step: number): Promise<HTMLElement> {
  const header = await within(table).findByRole("rowheader", { name: String(step) });
  return must(header.closest<HTMLElement>('[role="row"]'), `the row of step ${String(step)}`);
}

/** The curve, once it has its points. */
async function curve(): Promise<HTMLElement> {
  return screen.findByRole("listbox", { name: text.curve });
}

/** The line under the curve that says how far the solve order has come at a point. */
function caption(freed: number, total: number, steps: number): string {
  return fill(steps === 1 ? text.freed_one : text.freed_other, {
    freed,
    total,
    count: steps,
  });
}

describe("BlockersPage", () => {
  it("asks for the solve order of the open holds, and shows each step in the table", async () => {
    const { solveOrder } = renderBlockers();
    const table = await stepTable();
    const second = await stepRow(table, 2);
    expect(solveOrder).toHaveBeenCalledWith({ spec: specWith({}), view: VIEW });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      text.column.step,
      text.column.blocker,
      text.column.kind,
      text.column.discipline,
      text.column.holds,
      text.column.gain,
      text.column.cumulative,
    ]);
    expect(
      within(second)
        .getAllByRole("gridcell")
        .map((cell) => cell.textContent),
    ).toEqual(["Process / 577-PR-400", "PR", "Process", "300", "200", "1,200"]);
    const first = await stepRow(table, 1);
    expect(within(first).getByText("1,204")).toBeInTheDocument();
    expect(within(first).getAllByText("1,000")).toHaveLength(2);
    // A blocker item is in the body face, as a word or a tag (DESIGN.md, the Identifier Rule).
    const blocker = must(within(second).getAllByRole("gridcell")[0], "the blocker cell");
    expect(blocker).not.toHaveAttribute("data-kind", "identifier");
    expect(screen.getByText(fill(text.count_other, { count: 4 }))).toBeVisible();
  });

  it("asks again with the filters of the bar", async () => {
    const filters: Filters = {
      ...defaultFilters,
      fields: [{ dim: "Discipline", values: [{ key: "Piping", label: "Piping" }], negate: false }],
    };
    const { solveOrder } = renderBlockers({ filters });
    await stepTable();
    await waitFor(() => {
      expect(solveOrder).toHaveBeenLastCalledWith({
        spec: specWith({
          fields: [{ dim: "Discipline", values: ["Piping"], negate: false }],
        }),
        view: VIEW,
      });
    });
  });

  it("draws a point of the curve for each step: the lines freed by it and the steps before", async () => {
    const { user } = renderBlockers();
    const chart = await curve();
    const option = within(chart).getByRole("option");
    expect(option).toHaveAttribute("aria-setsize", "4");
    expect(option).toHaveAttribute("aria-posinset", "1");
    // The table view of the curve holds the same numbers as its points.
    await user.click(screen.getByRole("button", { name: en.charts.tableView }));
    const view = await screen.findByRole("grid", {
      name: fill(en.charts.tableName, { name: text.curve }),
    });
    const rows = [...view.querySelectorAll('[role="row"][data-key]')].map((row) =>
      [...row.querySelectorAll('[role="rowheader"], [role="gridcell"]')].map(
        (cell) => cell.textContent,
      ),
    );
    expect(rows).toEqual(
      solveView().rows.map((row) => [String(row.step), row.label, formatCount(row.cumulative)]),
    );
    expect(
      within(view)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([text.axisX, text.column.blocker, text.axisY]);
  });

  it("says how many lines the solve order frees at the point in focus, and at its end otherwise", async () => {
    const { user } = renderBlockers();
    const chart = await curve();
    expect(screen.getByText(caption(1262, 1262, 4))).toBeVisible();
    chart.focus();
    expect(await screen.findByText(caption(1000, 1262, 1))).toBeVisible();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText(caption(1200, 1262, 2))).toBeVisible();
  });

  it("names the lines a step frees apart from the lines freed so far", async () => {
    const { user } = renderBlockers();
    const table = await stepTable();
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toContain("Freed by this step");
    expect(headers).toContain("Freed so far");
    expect(headers).not.toContain("Lines freed");
    // The curve's value is the lines freed so far, named so on its axis and in its table view.
    expect(within(await curve()).getAllByText("Freed so far").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: en.charts.tableView }));
    const view = await screen.findByRole("grid", {
      name: fill(en.charts.tableName, { name: text.curve }),
    });
    expect(
      within(view)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Step", "Blocker", "Freed so far"]);
  });

  it(
    "says where the solve order ends again once the point in focus has gone with its curve",
    SLOW,
    async () => {
      const none: SolveView = { rows: [], lines_on_hold: 0, steps_to_most: 0 };
      const { user } = renderBlockers({
        solveOrder: ({ spec }) => (spec.text === "" ? solveView() : none),
      });
      const chart = await curve();
      chart.focus();
      await user.keyboard("{ArrowRight}");
      expect(await screen.findByText(caption(1200, 1262, 2))).toBeVisible();
      // A filter that keeps nothing takes the curve away while a point is in focus.
      act(() => {
        queryClient.setQueryData(keys.workspaceFilters(workspace().id), {
          ...defaultFilters,
          text: "no such line",
        });
      });
      await screen.findByRole("heading", { level: 2, name: text.noneTitle });
      act(() => {
        queryClient.setQueryData(keys.workspaceFilters(workspace().id), defaultFilters);
      });
      await curve();
      expect(await screen.findByText(caption(1262, 1262, 4))).toBeVisible();
    },
  );

  it(
    "keeps saying where the point in focus is when the solve order is read again",
    SLOW,
    async () => {
      let reads = 0;
      const { user } = renderBlockers({
        solveOrder: () => {
          reads += 1;
          // The second answer is another one: the same steps, more lines on hold.
          return reads === 1 ? solveView() : { ...solveView(), lines_on_hold: 1300 };
        },
      });
      const chart = await curve();
      chart.focus();
      await user.keyboard("{ArrowRight}");
      expect(await screen.findByText(caption(1200, 1262, 2))).toBeVisible();
      // Read again, as after an action, with the point still in focus.
      await act(() => queryClient.invalidateQueries({ queryKey: keys.snapshots }));
      expect(await screen.findByText(caption(1200, 1300, 2))).toBeVisible();
      expect(within(chart).getByRole("option")).toHaveAttribute("aria-posinset", "2");
    },
  );

  it("selects the blocker of a step pressed in the table, and marks its point", SLOW, async () => {
    const { user, router } = renderBlockers({ path: "/blockers?view=3" });
    const table = await stepTable();
    await user.click(await stepRow(table, 2));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?view=3&blocker=Process%7C577-PR-400");
    });
    expect(await stepRow(table, 2)).toHaveAttribute("aria-selected", "true");
    expect(await stepRow(table, 1)).toHaveAttribute("aria-selected", "false");
    // The curve starts on the selected point, and says it is selected.
    const option = within(await curve()).getByRole("option");
    expect(option).toHaveAttribute("aria-posinset", "2");
    expect(option).toHaveAttribute("aria-selected", "true");
    // The blocker opens in the panel, and the focus stays on the row that was pressed.
    expect(
      await screen.findByRole("complementary", { name: "Process / 577-PR-400" }),
    ).toBeInTheDocument();
    expect(await stepRow(table, 2)).toHaveFocus();
  });

  it(
    "opens a step's blocker on Enter with the focus on its heading, and Escape gives it back",
    SLOW,
    async () => {
      const { user, router } = renderBlockers();
      const table = await stepTable();
      const row = await stepRow(table, 3);
      act(() => {
        row.focus();
      });
      await user.keyboard("{Enter}");
      const region = await screen.findByRole("complementary", { name: "Piping / 577-PK-400" });
      await waitFor(() => {
        expect(
          within(region).getByRole("heading", { level: 2, name: "Piping / 577-PK-400" }),
        ).toHaveFocus();
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      });
      expect(router.state.location.search).toBe("");
      expect(await stepRow(table, 3)).toHaveFocus();
    },
  );

  it(
    "closes the panel on Escape on the table, and gives the focus to the row that opened it",
    SLOW,
    async () => {
      const { user } = renderBlockers();
      const table = await stepTable();
      await user.click(await stepRow(table, 2));
      await screen.findByRole("complementary", { name: "Process / 577-PR-400" });
      // The focus moves to another row without choosing it; Escape takes it back to the opener.
      await user.keyboard("{ArrowDown}");
      expect(await stepRow(table, 3)).toHaveFocus();
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      });
      expect(await stepRow(table, 2)).toHaveFocus();
    },
  );

  it(
    "gives the focus back to a step pressed while the focus was outside the table",
    SLOW,
    async () => {
      const { user } = renderBlockers();
      const table = await stepTable();
      await stepRow(table, 1);
      act(() => {
        screen.getByRole("button", { name: en.filterChip.add }).focus();
      });
      await user.click(await stepRow(table, 4));
      await screen.findByRole("complementary", { name: "Piping / Client" });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      });
      expect(await stepRow(table, 4)).toHaveFocus();
    },
  );

  it("takes the focus to the heading on Enter on the step that is open already", SLOW, async () => {
    const { user } = renderBlockers({ path: "/blockers?blocker=Process%7C577-PR-400" });
    const region = await screen.findByRole("complementary", { name: "Process / 577-PR-400" });
    const row = await stepRow(await stepTable(), 2);
    act(() => {
      row.focus();
    });
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(within(region).getByRole("heading", { level: 2 })).toHaveFocus();
    });
  });

  it(
    "gives the focus back to the curve when its point opened the panel, and closes on Escape there",
    SLOW,
    async () => {
      const { user, router } = renderBlockers();
      const chart = await curve();
      act(() => {
        chart.focus();
      });
      await user.keyboard("{End}{ArrowLeft}{Enter}");
      const region = await screen.findByRole("complementary", { name: "Piping / 577-PK-400" });
      await waitFor(() => {
        expect(within(region).getByRole("heading", { level: 2 })).toHaveFocus();
      });
      await user.click(within(region).getByRole("button", { name: en.detail.closePanel }));
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      });
      expect(chart).toHaveFocus();
      // Escape on the curve closes a panel it opened, as Escape on the table does.
      await user.keyboard("{Enter}");
      await screen.findByRole("complementary", { name: "Piping / 577-PK-400" });
      act(() => {
        chart.focus();
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(router.state.location.search).toBe("");
      });
      expect(chart).toHaveFocus();
    },
  );

  it(
    "shows in the panel the type, the discipline, and the holds a narrow table leaves out",
    SLOW,
    async () => {
      const { user } = renderBlockers();
      const table = await stepTable();
      await user.click(await stepRow(table, 2));
      const region = await screen.findByRole("complementary", { name: "Process / 577-PR-400" });
      const facts = await within(region).findByRole("list", { name: en.detail.blockerFacts });
      // The type, the discipline, and the holds: what the priorities of the columns let leave.
      expect(within(region).getByText("PK")).toBeInTheDocument();
      expect(within(facts).getByText(en.detail.fact.discipline)).toBeInTheDocument();
      expect(within(facts).getByText(en.detail.fact.holds)).toBeInTheDocument();
    },
  );

  it("selects the blocker of a point pressed on the curve, and marks its row", SLOW, async () => {
    const { user, router } = renderBlockers();
    const chart = await curve();
    chart.focus();
    await user.keyboard("{End}{ArrowLeft}{Enter}");
    await waitFor(() => {
      expect(router.state.location.search).toBe("?blocker=Piping%7C577-PK-400");
    });
    expect(await stepRow(await stepTable(), 3)).toHaveAttribute("aria-selected", "true");
    expect(within(chart).getByRole("option")).toHaveAttribute("aria-selected", "true");
  });

  it("marks the step of the blocker its address names", async () => {
    renderBlockers({ path: "/blockers?blocker=Piping%7CClient" });
    expect(await stepRow(await stepTable(), 4)).toHaveAttribute("aria-selected", "true");
    expect(within(await curve()).getByRole("option")).toHaveAttribute("aria-posinset", "4");
  });

  it(
    "keeps the selected blocker for another snapshot, and drops it for another workspace",
    SLOW,
    async () => {
      const { user, router } = renderBlockers({
        path: "/blockers?blocker=Piping%7CClient",
        handlers: {
          snapshot_select: ({ id }) => opened({ selected: id }),
          workspace_open: () => opened({ workspace: otherWorkspace }),
        },
      });
      expect(await stepRow(await stepTable(), 4)).toHaveAttribute("aria-selected", "true");
      // Another snapshot: a blocker is named by its text, so it stays selected there.
      await selectOlderSnapshot(user);
      await waitFor(() => {
        expect(router.state.location.search).toBe("?blocker=Piping%7CClient");
        expect(screen.queryByText(en.snapshots.toNewest)).toBeInTheDocument();
      });
      expect(await stepRow(await stepTable(), 4)).toHaveAttribute("aria-selected", "true");
      // Another workspace: nothing of this one is selected there.
      await user.click(
        await screen.findByRole("button", {
          name: `${en.workspaces.switcher} ${workspace().name}`,
        }),
      );
      const workspaces = await screen.findByRole("menu", { name: en.workspaces.switcher });
      await user.click(within(workspaces).getByRole("menuitem", { name: otherWorkspace.name }));
      await waitFor(() => {
        expect(router.state.location.search).toBe("");
      });
    },
  );

  it(
    "returns the steps and the table view of the curve to their tops for another snapshot",
    SLOW,
    async () => {
      const { user } = renderBlockers({
        handlers: { snapshot_select: ({ id }) => opened({ selected: id }) },
      });
      const table = await stepTable();
      await stepRow(table, 1);
      scrollTable(table, 3 * 36);
      await user.click(screen.getByRole("button", { name: en.charts.tableView }));
      const view = await screen.findByRole("grid", {
        name: fill(en.charts.tableName, { name: text.curve }),
      });
      scrollTable(view, 2 * 36);
      await selectOlderSnapshot(user);
      await waitFor(() => {
        expect(table.scrollTop).toBe(0);
        expect(view.scrollTop).toBe(0);
      });
    },
  );

  describe("without steps", () => {
    it("leads to an import in a workspace without snapshots", async () => {
      const start = openStart({ open: opened({ snapshots: [], selected: null }) });
      const solveOrder = vi.fn(() => solveView());
      renderApp({ start, path: "/blockers", handlers: { solve_order: solveOrder } });
      const title = await screen.findByRole("heading", { level: 2, name: text.emptyTitle });
      expect(
        within(must(title.parentElement)).getByRole("button", { name: text.emptyAction }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(solveOrder).not.toHaveBeenCalled();
    });

    it("offers to clear the filters that keep no hold", async () => {
      const none: SolveView = { rows: [], lines_on_hold: 0, steps_to_most: 0 };
      const { user, solveOrder } = renderBlockers({
        solveOrder: ({ spec }) => (spec.fields.length === 0 ? solveView() : none),
        filters: {
          ...defaultFilters,
          fields: [{ dim: "Role", values: [{ key: "Checker", label: "Checker" }], negate: false }],
        },
      });
      const title = await screen.findByRole("heading", { level: 2, name: text.noneTitle });
      // One empty state says it; the curve has nothing to draw.
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      await user.click(
        within(must(title.parentElement)).getByRole("button", { name: text.noneAction }),
      );
      await stepRow(await stepTable(), 1);
      expect(solveOrder).toHaveBeenLastCalledWith(expect.objectContaining({ spec: specWith({}) }));
    });

    it("says when the snapshot has no open hold that blockers rank open holds, and offers an import", async () => {
      // The Rust side ranks the open holds among those the filters keep: with no open hold, the
      // status Open and the status All both give nothing to rank.
      const { solveOrder } = renderBlockers({
        solveOrder: () => ({ rows: [], lines_on_hold: 0, steps_to_most: 0 }),
      });
      const title = await screen.findByRole("heading", { level: 2, name: text.noOpenTitle });
      const state = must(title.parentElement);
      expect(state).toHaveTextContent(text.noOpenText);
      expect(within(state).getByRole("button", { name: text.noOpenAction })).toBeInTheDocument();
      expect(within(state).queryByRole("button", { name: text.releasedAction })).toBeNull();
      expect(solveOrder).toHaveBeenLastCalledWith(expect.objectContaining({ spec: specWith({}) }));
    });

    it("says under the status Released that blockers rank open holds, and offers them", async () => {
      const { user, solveOrder } = renderBlockers({
        solveOrder: ({ spec }) =>
          spec.status === "Released"
            ? { rows: [], lines_on_hold: 0, steps_to_most: 0 }
            : solveView(),
        filters: { ...defaultFilters, status: "Released" },
      });
      const title = await screen.findByRole("heading", { level: 2, name: text.releasedTitle });
      expect(must(title.parentElement)).toHaveTextContent(text.releasedText);
      await user.click(
        within(must(title.parentElement)).getByRole("button", { name: text.releasedAction }),
      );
      await stepRow(await stepTable(), 1);
      expect(solveOrder).toHaveBeenLastCalledWith(
        expect.objectContaining({ spec: specWith({ status: "Open" }) }),
      );
    });
  });

  describe("with a long tail", () => {
    it(
      "draws the steps that free most lines, at least ten, and all of them on request",
      SLOW,
      async () => {
        const { user } = renderBlockers({ solveOrder: () => manySteps(40, 12) });
        const chart = await curve();
        expect(within(chart).getByRole("option")).toHaveAttribute("aria-setsize", "12");
        const all = screen.getByRole("button", { name: fill(text.showAll_other, { count: 40 }) });
        await user.click(all);
        expect(within(chart).getByRole("option")).toHaveAttribute("aria-setsize", "40");
        await user.click(
          screen.getByRole("button", { name: fill(text.showHead_other, { count: 12 }) }),
        );
        expect(within(chart).getByRole("option")).toHaveAttribute("aria-setsize", "12");
        // The steps table and the table view hold every step either way.
        expect(screen.getByText(fill(text.count_other, { count: 40 }))).toBeVisible();
        await user.click(screen.getByRole("button", { name: en.charts.tableView }));
        const view = await screen.findByRole("grid", {
          name: fill(en.charts.tableName, { name: text.curve }),
        });
        expect(within(view).getAllByRole("row")).toHaveLength(41);
        expect(
          screen.queryByRole("button", { name: fill(text.showAll_other, { count: 40 }) }),
        ).not.toBeInTheDocument();
      },
    );

    it("draws ten steps at least, and the steps up to one selected past them", SLOW, async () => {
      const { user } = renderBlockers({ solveOrder: () => manySteps(40, 3) });
      const chart = await curve();
      expect(within(chart).getByRole("option")).toHaveAttribute("aria-setsize", "10");
      await user.click(await stepRow(await stepTable(), 30));
      await waitFor(() => {
        expect(within(chart).getByRole("option")).toHaveAttribute("aria-setsize", "30");
      });
      expect(within(chart).getByRole("option")).toHaveAttribute("aria-posinset", "30");
    });

    it("draws every step of a solve order shorter than ten, with no button", async () => {
      renderBlockers();
      const chart = await curve();
      expect(within(chart).getByRole("option")).toHaveAttribute("aria-setsize", "4");
      expect(screen.queryByRole("button", { name: /^Show all/ })).not.toBeInTheDocument();
    });
  });

  describe("with many steps, in a window of the table", () => {
    tableViewport({ width: 1280, height: 400 });

    function countLine(): HTMLElement {
      return must(document.querySelector<HTMLElement>("[data-part='steps'] p[role='status']"));
    }
    const loaded = () =>
      Number(/^([\d,]+) of/.exec(countLine().textContent)?.[1]?.replace(/,/g, ""));

    it(
      "hands the steps to the table 200 at a time as it is scrolled, up to 5,000, and says how to reach the others",
      { timeout: SLOW.timeout * 2 },
      async () => {
        renderBlockers({ solveOrder: () => manySteps(5300, 100) });
        const table = await stepTable();
        await waitFor(() => {
          expect(countLine()).toHaveTextContent("200 of 5,300 steps");
        });
        while (loaded() < 5000) {
          const before = loaded();
          scrollTable(table, before * 36);
          await waitFor(() => {
            expect(loaded()).toBeGreaterThan(before);
          });
        }
        expect(countLine()).toHaveTextContent(
          "5,000 of 5,300 steps are shown. Narrow the filters to reach the others.",
        );
        scrollTable(table, 0);
        scrollTable(table, 5000 * 36);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(loaded()).toBe(5000);
      },
    );

    it("hands over a step selected past those shown, with the steps before it", SLOW, async () => {
      renderBlockers({
        path: "/blockers?blocker=Piping%7CItem%20450",
        solveOrder: () => manySteps(5300, 100),
      });
      const table = await stepTable();
      await waitFor(() => {
        expect(countLine()).toHaveTextContent("600 of 5,300 steps");
      });
      // The table brought the step into view; jsdom tells the rows of the scroll it made.
      await waitFor(() => {
        expect(table.scrollTop).toBeGreaterThan(400 * 36);
      });
      scrollTable(table, table.scrollTop);
      expect(await stepRow(table, 450)).toHaveAttribute("aria-selected", "true");
    });

    it("starts again at 200 steps for another result", SLOW, async () => {
      renderBlockers({ solveOrder: () => manySteps(5300, 100) });
      const table = await stepTable();
      await waitFor(() => {
        expect(loaded()).toBe(200);
      });
      scrollTable(table, 200 * 36);
      await waitFor(() => {
        expect(loaded()).toBe(400);
      });
      act(() => {
        queryClient.setQueryData(keys.workspaceFilters(workspace().id), {
          ...defaultFilters,
          status: "All",
        });
      });
      await waitFor(() => {
        expect(loaded()).toBe(200);
      });
    });
  });

  it("shows an error with a retry when the solve order cannot be read", async () => {
    let fail = true;
    const { user } = renderBlockers({
      solveOrder: () => {
        if (fail) throw commandFailure("Io", "The workspace file could not be read.");
        return solveView();
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text.error);
    expect(alert).toHaveTextContent("The workspace file could not be read.");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    await stepRow(await stepTable(), 1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is opened by Ctrl+4, has no Soon tag, and passes the accessibility check", SLOW, async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
    const nav = screen.getByRole("navigation", { name: en.destinations.label });
    const item = within(nav).getByRole("link", { name: en.destinations.name.blockers });
    expect(item).not.toHaveTextContent(en.destinations.soon);
    await user.keyboard("{Control>}4{/Control}");
    expect(router.state.location.pathname).toBe("/blockers");
    expect(
      await screen.findByRole("heading", { level: 1, name: en.destinations.name.blockers }),
    ).toBeInTheDocument();
    const table = await stepTable();
    await user.click(await stepRow(table, 2));
    await curve();
    await expectAccessible(document.body, { page: true });
    // And with the table view of the curve.
    await user.click(screen.getByRole("button", { name: en.charts.tableView }));
    await screen.findByRole("grid", { name: fill(en.charts.tableName, { name: text.curve }) });
    await expectAccessible(document.body, { page: true });
  });
});
