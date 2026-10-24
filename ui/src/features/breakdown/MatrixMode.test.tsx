import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { keys } from "../../api/keys";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import type { FilterSpec } from "../../bindings/FilterSpec";
import en from "../../locales/en.json";
import { expectNoAxeViolations } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { foldedMatrix } from "../../test/breakdown";
import { openStart, opened, workspace } from "../../test/fixtures";
import { choose, selectOlderSnapshot } from "../../test/flow";
import { commandFailure, type Handlers } from "../../test/ipc";
import { holdsView, lineId } from "../../test/lines";
import { SLOW } from "../../test/slow";
import { scrollTable } from "../../test/viewport";

const text = en.breakdown;
const VIEW = { workspace_id: workspace().id, snapshot_id: 2 };
const DISCIPLINE = en.import.field.Discipline;
const HOLD_TYPE = en.import.field.HoldType;

type MatrixAnswer = NonNullable<Handlers["matrix"]>;

interface Options {
  path?: string;
  matrix?: MatrixAnswer;
  handlers?: Handlers;
  filters?: Filters;
}

/** The app on the matrix of Breakdown, with the test's own answer to `matrix`, a spy. */
function renderMatrix({
  path = "/breakdown?mode=matrix",
  matrix = () => foldedMatrix(),
  handlers = {},
  filters,
}: Options = {}) {
  const matrixSpy = vi.fn(matrix);
  const app = renderApp({
    start: openStart(),
    path,
    handlers: { matrix: matrixSpy, ...handlers },
  });
  if (filters !== undefined)
    queryClient.setQueryData(keys.workspaceFilters(workspace().id), filters);
  return { ...app, matrix: matrixSpy };
}

function specWith(part: Partial<FilterSpec>): FilterSpec {
  return { ...openHoldsFilter(), ...part };
}

function gridName(rows = DISCIPLINE, cols = HOLD_TYPE): string {
  return text.matrix.replace("{{rows}}", rows).replace("{{cols}}", cols);
}

async function findGrid(rows?: string, cols?: string): Promise<HTMLElement> {
  return screen.findByRole("grid", { name: gridName(rows, cols) });
}

/** The cell of a row and a column of the grid, by their labels. */
function cellAt(grid: HTMLElement, row: string, col: string): HTMLElement {
  const headers = within(grid).getAllByRole("columnheader");
  const index = headers.findIndex((header) => header.textContent === col);
  const rowHeader = within(grid).getByRole("rowheader", { name: row });
  const line = must(rowHeader.closest<HTMLElement>("[role='row']"), `the row ${row}`);
  return must(within(line).getAllByRole("gridcell")[index - 1], `the cell of ${row} and ${col}`);
}

function foldedText(count: number, dim: string): string {
  return text.folded_other.replace("{{count, number}}", String(count)).replace("{{dim}}", dim);
}

describe("Breakdown, matrix", () => {
  it(
    "asks for disciplines by hold type, and shows the heatmap, its legend, and what was folded",
    SLOW,
    async () => {
      const { matrix } = renderMatrix();
      const grid = await findGrid();
      expect(matrix).toHaveBeenCalledWith({
        spec: specWith({}),
        rowDim: "Discipline",
        colDim: "HoldType",
        view: VIEW,
      });
      expect(
        within(grid)
          .getAllByRole("rowheader")
          .map((header) => header.textContent),
      ).toEqual(["Piping", "Civil", "(blank)", text.other]);
      expect(
        within(grid)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual([DISCIPLINE, "Vendor data", "Client", text.other]);
      expect(cellAt(grid, "Piping", "Vendor data")).toHaveAccessibleName("700");
      expect(screen.getByRole("group", { name: en.charts.legend })).toHaveTextContent("700");
      expect(screen.getByText(foldedText(12, DISCIPLINE))).toBeVisible();
      expect(screen.getByText(foldedText(4, HOLD_TYPE))).toBeVisible();
      expect(screen.getByText(text.pressHint)).toBeVisible();
    },
  );

  it("says nothing was folded when the command folded nothing", SLOW, async () => {
    renderMatrix({ matrix: () => foldedMatrix({ folded: false }) });
    const grid = await findGrid();
    expect(within(grid).queryByRole("rowheader", { name: text.other })).not.toBeInTheDocument();
    expect(screen.queryByText(foldedText(12, DISCIPLINE))).not.toBeInTheDocument();
    // Without a fold, the line that says what a press does names none.
    expect(screen.getByText(text.pressHintUnfolded)).toBeVisible();
    expect(screen.queryByText(text.pressHint)).not.toBeInTheDocument();
  });

  it("names the folded values apart from a real value named Other", SLOW, async () => {
    const matrix = foldedMatrix();
    const real = { key: "Other", label: "Other", holds: 30, lines: 9 };
    renderMatrix({
      matrix: () => ({
        ...matrix,
        cols: [...matrix.cols, real],
        cells: matrix.cells.map((row) => [...row.slice(0, 2), 5, ...row.slice(2)]),
      }),
    });
    const grid = await findGrid();
    expect(text.other).toBe("All others");
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([DISCIPLINE, "Vendor data", "Client", "Other", text.other]);
    expect(screen.getByText(foldedText(4, HOLD_TYPE))).toHaveTextContent(text.other);
  });

  it("swaps the rows and the columns", SLOW, async () => {
    const { user, router, matrix } = renderMatrix();
    await findGrid();
    await user.click(screen.getByRole("button", { name: text.swap }));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?mode=matrix&rows=HoldType&cols=Discipline");
    });
    await waitFor(() => {
      expect(matrix).toHaveBeenLastCalledWith({
        spec: specWith({}),
        rowDim: "HoldType",
        colDim: "Discipline",
        view: VIEW,
      });
    });
    await findGrid(HOLD_TYPE, DISCIPLINE);
  });

  it(
    "never offers for the columns the dimension of the rows, nor the other way",
    SLOW,
    async () => {
      const { user, router, matrix } = renderMatrix();
      await findGrid();
      await user.click(screen.getByRole("button", { name: new RegExp(text.cols) }));
      const list = await screen.findByRole("listbox");
      expect(within(list).getByRole("option", { name: DISCIPLINE })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await user.keyboard("{Escape}");
      await choose(user, new RegExp(text.rows), en.import.field.Role);
      await waitFor(() => {
        expect(router.state.location.search).toBe("?mode=matrix&rows=Role&cols=HoldType");
      });
      await waitFor(() => {
        expect(matrix).toHaveBeenLastCalledWith(
          expect.objectContaining({ rowDim: "Role", colDim: "HoldType" }),
        );
      });
    },
  );

  it(
    "opens the holds of a cell in Lines, filtered by both of its values in place of theirs",
    SLOW,
    async () => {
      const holds = vi.fn(() => holdsView());
      const { user, router } = renderMatrix({
        handlers: { holds },
        filters: {
          ...defaultFilters,
          fields: [
            { dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: true },
            { dim: "Role", values: [{ key: "Checker", label: "Checker" }], negate: false },
          ],
        },
      });
      const grid = await findGrid();
      await user.click(cellAt(grid, "Piping", "Client"));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      expect(router.state.location.search).toBe("?rows=holds");
      await waitFor(() => {
        expect(holds).toHaveBeenLastCalledWith(
          expect.objectContaining({
            spec: specWith({
              fields: [
                { dim: "Discipline", values: ["Piping"], negate: false },
                { dim: "Role", values: ["Checker"], negate: false },
                { dim: "HoldType", values: ["Client"], negate: false },
              ],
            }),
          }),
        );
      });
      const chip = (field: string, value: string) =>
        en.filterChip.is.replace("{{field}}", field).replace("{{value}}", value);
      const bar = must(document.querySelector<HTMLElement>("[data-part='filter-bar']"));
      const shown = [...bar.querySelectorAll("[data-part='filter-chip'] button")].map((button) =>
        button.textContent.trim(),
      );
      expect(shown).toEqual(
        expect.arrayContaining([chip(DISCIPLINE, "Piping"), chip(HOLD_TYPE, "Client")]),
      );
    },
  );

  it("opens a blank value of a cell as the blank value, not as Other", SLOW, async () => {
    const holds = vi.fn(() => holdsView());
    const { user, router } = renderMatrix({ handlers: { holds } });
    const grid = await findGrid();
    await user.click(cellAt(grid, "(blank)", "Vendor data"));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    await waitFor(() => {
      expect(holds).toHaveBeenLastCalledWith(
        expect.objectContaining({
          spec: specWith({
            fields: [
              { dim: "Discipline", values: [""], negate: false },
              { dim: "HoldType", values: ["Vendor data"], negate: false },
            ],
          }),
        }),
      );
    });
  });

  it("opens nothing from a cell of Other, by a click or by Enter", SLOW, async () => {
    const { user, router } = renderMatrix();
    const grid = await findGrid();
    await user.click(cellAt(grid, text.other, "Client"));
    await user.click(cellAt(grid, "Piping", text.other));
    await user.keyboard("{Enter}");
    expect(router.state.location.pathname).toBe("/breakdown");
    // The tooltip of an Other cell does not offer to open it; that of a real cell does.
    expect(screen.getByRole("tooltip")).not.toHaveTextContent(text.cellHint);
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tooltip")).toHaveTextContent(text.cellHint);
  });

  it("returns its table view to its top for another snapshot", SLOW, async () => {
    const { user } = renderMatrix({
      handlers: { snapshot_select: ({ id }) => opened({ selected: id }) },
    });
    await findGrid();
    await user.click(screen.getByRole("button", { name: en.charts.tableView }));
    const table = await screen.findByRole("grid", {
      name: en.charts.tableName.replace("{{name}}", gridName()),
    });
    scrollTable(table, 2 * 36);
    await selectOlderSnapshot(user);
    await waitFor(() => {
      expect(table.scrollTop).toBe(0);
    });
  });

  it("shows the same numbers in its table view, and the chart again", SLOW, async () => {
    const { user } = renderMatrix();
    await findGrid();
    const toggle = screen.getByRole("button", { name: en.charts.tableView });
    await user.click(toggle);
    const table = await screen.findByRole("grid", {
      name: en.charts.tableName.replace("{{name}}", gridName()),
    });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Piping700400104");
    expect(rows[4]).toHaveTextContent(`${text.other}10400`);
    // The folded row and the folded column are marked, as in the heatmap.
    const marked = (row: HTMLElement | undefined) =>
      [...must(row, "a row").querySelectorAll("[role='rowheader'], [role='gridcell']")].map(
        (cell) => cell.querySelector("[data-folded]") !== null,
      );
    expect(marked(rows[1])).toEqual([false, false, false, true]);
    expect(marked(rows[4])).toEqual([true, true, true, true]);
    expect(screen.queryByText(text.pressHint)).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await findGrid();
  });

  it(
    "keeps the list as it was while the matrix shows, and the matrix as it was",
    SLOW,
    async () => {
      const { user, router } = renderMatrix({
        path: "/breakdown?mode=list&by=Role&open=Checker",
      });
      await screen.findByRole("treegrid");
      await user.click(screen.getByRole("radio", { name: text.modeMatrix }));
      await waitFor(() => {
        expect(router.state.location.search).toBe(
          "?mode=matrix&rows=Discipline&cols=HoldType&by=Role&open=Checker",
        );
      });
      await findGrid();
      await user.click(screen.getByRole("button", { name: text.swap }));
      await findGrid(HOLD_TYPE, DISCIPLINE);
      await user.click(screen.getByRole("radio", { name: text.modeList }));
      await waitFor(() => {
        expect(router.state.location.search).toBe(
          "?mode=list&by=Role&open=Checker&rows=HoldType&cols=Discipline",
        );
      });
      await screen.findByRole("treegrid", {
        name: text.table.replace("{{dim}}", en.import.field.Role),
      });
    },
  );

  it("dims the matrix of before while another is read", SLOW, async () => {
    const { user } = renderMatrix({
      matrix: ({ rowDim }) =>
        rowDim === "Discipline" ? foldedMatrix() : new Promise(() => undefined),
    });
    const grid = await findGrid();
    await user.click(screen.getByRole("button", { name: text.swap }));
    await waitFor(() => {
      expect(must(grid.closest("[data-stale]"), "the dimmed heatmap")).toBeInTheDocument();
    });
    // The matrix of before keeps the names it was read for, and offers no press meanwhile.
    expect(grid).toHaveAccessibleName(gridName());
    expect(screen.queryByText(text.pressHint)).not.toBeInTheDocument();
  });

  it("opens nothing from the matrix of other filters while the new one is read", SLOW, async () => {
    const { user, router } = renderMatrix({
      matrix: ({ spec }) =>
        spec.fields.length === 0 ? foldedMatrix() : new Promise(() => undefined),
    });
    const grid = await findGrid();
    act(() => {
      queryClient.setQueryData(keys.workspaceFilters(workspace().id), {
        ...defaultFilters,
        fields: [{ dim: "Role", values: [{ key: "Checker", label: "Checker" }], negate: false }],
      });
    });
    await waitFor(() => {
      expect(must(grid.closest("[data-stale]"), "the dimmed heatmap")).toBeInTheDocument();
    });
    await user.click(cellAt(grid, "Piping", "Client"));
    expect(router.state.location.pathname).toBe("/breakdown");
    expect(screen.queryByText(text.pressHint)).not.toBeInTheDocument();
  });

  it("keeps the open groups of the default dimension across a switch", SLOW, async () => {
    const { user, router } = renderMatrix({
      path: "/breakdown?mode=list&by=Discipline&open=Piping",
    });
    const table = await screen.findByRole("treegrid");
    await within(table).findByRole("rowheader", { name: lineId(0) });
    await user.click(screen.getByRole("radio", { name: text.modeMatrix }));
    await findGrid();
    await user.click(screen.getByRole("radio", { name: text.modeList }));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?mode=list&by=Discipline&open=Piping");
    });
    const again = await screen.findByRole("treegrid");
    await within(again).findByRole("rowheader", { name: lineId(0) });
  });

  it("shows an error with a retry when the matrix cannot be read", SLOW, async () => {
    let fail = true;
    const { user } = renderMatrix({
      matrix: () => {
        if (fail) throw commandFailure("Io", "The workspace file could not be read.");
        return foldedMatrix();
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text.matrixError);
    fail = false;
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    await findGrid();
  });

  it("offers to clear the filters that keep no hold", SLOW, async () => {
    const empty = {
      ...foldedMatrix({ folded: false }),
      rows: [],
      cols: [],
      cells: [],
      max_cell: 0,
    };
    const { user, matrix } = renderMatrix({
      matrix: ({ spec }) => (spec.fields.length === 0 ? foldedMatrix() : empty),
      filters: {
        ...defaultFilters,
        fields: [{ dim: "Role", values: [{ key: "Checker", label: "Checker" }], negate: false }],
      },
    });
    const title = await screen.findByRole("heading", { level: 2, name: text.noneTitle });
    await user.click(
      within(must(title.parentElement)).getByRole("button", { name: text.noneAction }),
    );
    await findGrid();
    expect(matrix).toHaveBeenLastCalledWith(expect.objectContaining({ spec: specWith({}) }));
  });

  it("passes the accessibility check, as a heatmap and as a table", SLOW, async () => {
    const { user } = renderMatrix();
    await findGrid();
    await user.tab();
    await expectNoAxeViolations(document.body, { page: true });
    await user.click(screen.getByRole("button", { name: en.charts.tableView }));
    await screen.findByRole("grid", {
      name: en.charts.tableName.replace("{{name}}", gridName()),
    });
    await expectNoAxeViolations(document.body, { page: true });
  });
});
