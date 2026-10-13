import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
import { scrollTable, tableViewport } from "../../test/viewport";
import { Button } from "../Button/Button";
import { DataTable, type DataTableColumn } from "./DataTable";

interface Line {
  id: string;
  holds: number;
  oldest: string;
  blocker: string;
}

const lines: Line[] = [
  { id: "78B01-573-4434-FW-001", holds: 13, oldest: "71 d", blocker: "Civil / 577-PR-400" },
  { id: "78B01-573-4386-FW-001", holds: 13, oldest: "71 d", blocker: "Civil / 577-PR-400" },
  { id: "78B01-573-4500-FW-001", holds: 12, oldest: "64 d", blocker: "Piping / FIV/AIV" },
  { id: "78B02-538-CW-2207", holds: 1, oldest: "3 d", blocker: "Tie-in / T104-R220" },
];

const columns: DataTableColumn<Line>[] = [
  {
    id: "id",
    header: "Line ID",
    kind: "identifier",
    isRowHeader: true,
    size: { chars: 21 },
    cell: (line) => line.id,
  },
  {
    id: "holds",
    header: "Holds",
    kind: "number",
    allowsSorting: true,
    size: { chars: 6 },
    cell: (line) => line.holds,
  },
  {
    id: "oldest",
    header: "Oldest",
    kind: "number",
    allowsSorting: true,
    size: { chars: 7 },
    cell: (line) => line.oldest,
  },
  {
    id: "blocker",
    header: "First blocker",
    isSupporting: true,
    size: { flex: 1, minChars: 16 },
    cell: (line) => line.blocker,
  },
];

function table(props: Partial<Parameters<typeof DataTable<Line>>[0]> = {}) {
  return (
    <DataTable
      aria-label="Lines on hold"
      columns={columns}
      rows={lines}
      rowKey={(line) => line.id}
      {...props}
    />
  );
}

function dataRows() {
  return within(screen.getByRole("grid")).getAllByRole("row").slice(1);
}

function dataRow(index: number): HTMLElement {
  const row = dataRows()[index];
  if (!row) throw new Error(`The table has no data row ${String(index)}.`);
  return row;
}

describe("DataTable", () => {
  it("renders a grid with its name, its headers, and one row for each item", SLOW, () => {
    render(table());
    expect(screen.getByRole("grid", { name: "Lines on hold" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Line ID",
      "Holds",
      "Oldest",
      "First blocker",
    ]);
    expect(dataRows()).toHaveLength(4);
    expect(screen.getByRole("rowheader", { name: "78B01-573-4434-FW-001" })).toBeInTheDocument();
  });

  it("announces its row count politely, and gives it as the description of the grid", () => {
    const { rerender } = render(table());
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("4 rows");
    expect(screen.getByRole("grid")).toHaveAccessibleDescription("4 rows");

    rerender(table({ rows: lines.slice(0, 1) }));
    expect(status).toHaveTextContent("1 row");
  });

  it("moves the focused row with the arrow keys, Home, and End", SLOW, async () => {
    const user = userEvent.setup();
    render(table());
    const rows = dataRows();

    await user.tab();
    expect(rows[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(rows[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(rows[2]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(rows[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(rows[3]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(rows[0]).toHaveFocus();
  });

  it("is read, not selected, without a selection handler: no row is selectable, hovered, or pressed", async () => {
    const user = userEvent.setup();
    render(table({ selectedKey: "78B01-573-4386-FW-001" }));
    const grid = screen.getByRole("grid");
    const row = dataRow(1);
    // Nothing says that a row can be selected, also not the row whose key is given as selected.
    expect(grid).not.toHaveAttribute("data-selectable");
    for (const each of dataRows()) {
      expect(each).not.toHaveAttribute("aria-selected");
      expect(each).not.toHaveAttribute("data-selected");
    }

    // The pointer changes nothing about a row.
    await user.hover(row);
    expect(row).not.toHaveAttribute("data-hovered");
    await user.pointer({ keys: "[MouseLeft>]", target: row });
    expect(row).not.toHaveAttribute("data-pressed");
    await user.pointer({ keys: "[/MouseLeft]", target: row });
    expect(row).not.toHaveAttribute("aria-selected");
    expect(row).not.toHaveAttribute("data-selected");

    // The keyboard still moves through the rows, and Enter and Space select nothing.
    row.focus();
    await user.keyboard("{ArrowDown}");
    expect(dataRow(2)).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    for (const each of dataRows()) expect(each).not.toHaveAttribute("aria-selected");
  });

  it("says that its rows can be selected when it has a selection handler, and shows the pointer on a row", async () => {
    const user = userEvent.setup();
    render(table({ onSelectionChange: () => undefined }));
    const row = dataRow(1);
    expect(screen.getByRole("grid")).toHaveAttribute("data-selectable");
    expect(row).toHaveAttribute("aria-selected", "false");
    await user.hover(row);
    expect(row).toHaveAttribute("data-hovered");
    await user.pointer({ keys: "[MouseLeft>]", target: row });
    expect(row).toHaveAttribute("data-pressed");
    await user.pointer({ keys: "[/MouseLeft]", target: row });
  });

  it("does not select a row by moving to it; Enter selects", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(table({ onSelectionChange }));

    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(onSelectionChange).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith("78B01-573-4386-FW-001");
  });

  it("selects a row on a click and marks the selected row", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(table({ selectedKey: "78B01-573-4386-FW-001", onSelectionChange }));
    const rows = dataRows();
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(rows[0]).toHaveAttribute("aria-selected", "false");

    await user.click(within(dataRow(2)).getByText("Piping / FIV/AIV"));
    expect(onSelectionChange).toHaveBeenCalledWith("78B01-573-4500-FW-001");
  });

  it(
    "keeps the selected row selected on a second Enter and on a click; only the parent clears it",
    SLOW,
    async () => {
      const onSelectionChange = vi.fn();
      function Lines() {
        const [selected, setSelected] = useState<string | null>(null);
        return (
          <>
            {table({
              selectedKey: selected,
              onSelectionChange: (key) => {
                onSelectionChange(key);
                setSelected(key);
              },
            })}
            <button
              type="button"
              onClick={() => {
                setSelected(null);
              }}
            >
              Close the detail panel
            </button>
          </>
        );
      }
      const user = userEvent.setup();
      render(<Lines />);

      await user.tab();
      await user.keyboard("{ArrowDown}{Enter}");
      expect(dataRow(1)).toHaveAttribute("aria-selected", "true");
      await user.keyboard("{Enter}");
      expect(dataRow(1)).toHaveAttribute("aria-selected", "true");
      await user.keyboard(" ");
      expect(dataRow(1)).toHaveAttribute("aria-selected", "true");
      await user.click(within(dataRow(1)).getByText("Civil / 577-PR-400"));
      expect(dataRow(1)).toHaveAttribute("aria-selected", "true");
      expect(onSelectionChange.mock.calls.every(([key]) => key === "78B01-573-4386-FW-001")).toBe(
        true,
      );

      await user.click(dataRow(2));
      expect(dataRow(2)).toHaveAttribute("aria-selected", "true");
      expect(dataRow(1)).toHaveAttribute("aria-selected", "false");

      await user.click(screen.getByRole("button", { name: "Close the detail panel" }));
      expect(dataRows().map((row) => row.getAttribute("aria-selected"))).toEqual([
        "false",
        "false",
        "false",
        "false",
      ]);
    },
  );

  it("marks the sorted column and asks for a new sort when a sortable header is pressed", async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    render(table({ sort: { column: "oldest", direction: "descending" }, onSortChange }));
    const oldest = screen.getByRole("columnheader", { name: "Oldest" });
    const holds = screen.getByRole("columnheader", { name: "Holds" });
    expect(oldest).toHaveAttribute("aria-sort", "descending");
    expect(oldest.querySelector("svg")).not.toBeNull();
    expect(holds).toHaveAttribute("aria-sort", "none");
    expect(holds.querySelector("svg")).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Line ID" })).not.toHaveAttribute("aria-sort");

    await user.click(holds);
    expect(onSortChange).toHaveBeenCalledWith({ column: "holds", direction: "ascending" });
    await user.click(oldest);
    expect(onSortChange).toHaveBeenLastCalledWith({ column: "oldest", direction: "ascending" });
  });

  it("right-aligns numbers and sets identifiers apart", () => {
    render(table());
    const cells = [
      ...within(dataRow(0)).getAllByRole("rowheader"),
      ...within(dataRow(0)).getAllByRole("gridcell"),
    ];
    expect(cells.map((cell) => cell.getAttribute("data-kind"))).toEqual([
      "identifier",
      "number",
      "number",
      "text",
    ]);
    expect(screen.getByRole("columnheader", { name: "Holds" })).toHaveAttribute(
      "data-kind",
      "number",
    );
    expect(cells[3]).toHaveAttribute("data-supporting");
  });

  it("gives each row its actions, which do not select the row", async () => {
    const onOpen = vi.fn();
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      table({
        onSelectionChange,
        rowActions: (line) => (
          <Button
            variant="quiet"
            onPress={() => {
              onOpen(line.id);
            }}
          >
            Show holds
          </Button>
        ),
      }),
    );
    expect(screen.getByRole("columnheader", { name: en.table.actions })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Show holds" });
    expect(buttons).toHaveLength(4);

    await user.click(within(dataRow(1)).getByRole("button", { name: "Show holds" }));
    expect(onOpen).toHaveBeenCalledWith("78B01-573-4386-FW-001");
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("reaches a row action by the keyboard", SLOW, async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      table({
        rowActions: (line) => (
          <Button
            variant="quiet"
            onPress={() => {
              onOpen(line.id);
            }}
          >
            Show holds
          </Button>
        ),
      }),
    );
    await user.tab();
    await user.keyboard("{ArrowDown}{ArrowLeft}");
    expect(screen.getAllByRole("button", { name: "Show holds" })[1]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("78B01-573-4386-FW-001");
  });

  it("takes a density of its own", () => {
    const { rerender } = render(table());
    const region = screen.getByRole("grid").closest("[data-density]");
    expect(region).toBeNull();

    rerender(table({ density: "compact" }));
    expect(screen.getByRole("grid").closest("[data-density]")).toHaveAttribute(
      "data-density",
      "compact",
    );
  });

  it("on a first load shows skeleton rows and says it is loading", () => {
    render(table({ rows: [], isLoading: true, skeletonRows: 5 }));
    const grid = screen.getByRole("grid", { name: "Lines on hold" });
    expect(grid.closest('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(en.table.loading);
    expect(grid.querySelectorAll('[data-part="skeleton-row"]')).toHaveLength(5);
    expect(grid.querySelectorAll('[data-part="skeleton"]')).toHaveLength(20);
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  });

  it("does not present a placeholder as a row: one line says that the rows are loading", () => {
    render(table({ rows: [], isLoading: true, skeletonRows: 5 }));
    const rows = within(screen.getByRole("grid")).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent(en.table.loading);
    for (const placeholder of document.querySelectorAll('[data-part="skeleton-row"]')) {
      expect(placeholder.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(placeholder).not.toHaveAttribute("role");
      expect(placeholder.querySelector("[tabindex], [role]")).toBeNull();
    }
  });

  it("gives no placeholder the focus: the keyboard finds the table, then leaves it", async () => {
    const user = userEvent.setup();
    render(
      <>
        {table({ rows: [], isLoading: true })}
        <Button>Export</Button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole("grid")).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}{End}{Enter}");
    expect(screen.getByRole("grid")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Export" })).toHaveFocus();
  });

  it("keeps the previous rows, marked stale, during a refetch", () => {
    render(table({ isStale: true }));
    expect(dataRows()).toHaveLength(4);
    expect(screen.getByRole("grid").closest("[data-stale]")).not.toBeNull();
  });

  it("shows the empty state under the header when there is no row", () => {
    render(table({ rows: [], emptyState: <p>No holds match these filters.</p> }));
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    expect(screen.getByText("No holds match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 rows");
  });

  it(
    "has no accessibility violation with rows, with a selection and actions, loading, and empty",
    SLOW,
    async () => {
      const { rerender } = render(table());
      await expectAccessible();
      rerender(
        table({
          selectedKey: "78B02-538-CW-2207",
          onSelectionChange: () => undefined,
          sort: { column: "holds", direction: "ascending" },
          onSortChange: () => undefined,
          rowActions: () => <Button variant="quiet">Show holds</Button>,
        }),
      );
      await expectAccessible();
      rerender(table({ rows: [], isLoading: true }));
      await expectAccessible();
      rerender(table({ rows: [], emptyState: <p>No holds match these filters.</p> }));
      await expectAccessible();
    },
  );
});

/** Five thousand lines, in the order of their numbers. */
const many: Line[] = Array.from({ length: 5000 }, (_, index) => ({
  id: `78B01-573-${String(index + 1).padStart(5, "0")}`,
  holds: (index % 13) + 1,
  oldest: `${String(index % 90)} d`,
  blocker: `Civil / 577-PR-${String(index)}`,
}));

function lineId(number: number): string {
  return `78B01-573-${String(number).padStart(5, "0")}`;
}

/** Where a row starts under the header, at the comfortable density: 36 px for each. */
const ROW = 36;

describe("DataTable in a viewport", () => {
  // Eleven rows fit under the header.
  tableViewport({ width: 1024, height: 400 + ROW });

  it(
    "renders only the rows near the visible part, and later rows once it is scrolled",
    SLOW,
    () => {
      render(table({ rows: many }));
      const grid = screen.getByRole("grid");
      expect(dataRows().length).toBeGreaterThan(10);
      expect(dataRows().length).toBeLessThan(100);
      expect(screen.getByRole("rowheader", { name: lineId(1) })).toBeInTheDocument();
      expect(screen.queryByRole("rowheader", { name: lineId(3000) })).not.toBeInTheDocument();

      scrollTable(grid, 2999 * ROW);
      expect(screen.getByRole("rowheader", { name: lineId(3000) })).toBeInTheDocument();
      expect(screen.queryByRole("rowheader", { name: lineId(1) })).not.toBeInTheDocument();
      expect(dataRows().length).toBeLessThan(100);
      // A row says which row of the table it is, also far from the first.
      expect(
        screen.getByRole("rowheader", { name: lineId(3000) }).closest('[role="row"]'),
      ).toHaveAttribute("aria-rowindex", "3001");
    },
  );

  it("gives the header its shadow once rows are scrolled beneath it", SLOW, () => {
    render(table({ rows: many.slice(0, 200) }));
    const grid = screen.getByRole("grid");
    expect(grid.closest("[data-scrolled]")).toBeNull();
    scrollTable(grid, 3 * ROW);
    expect(grid.closest("[data-scrolled]")).not.toBeNull();
    scrollTable(grid, 0);
    expect(grid.closest("[data-scrolled]")).toBeNull();
  });

  it("says how many rows the whole result has, and reads the count line of the caller", () => {
    const countText = (shown: number, total: number) =>
      `${String(shown)} of ${String(total)} lines`;
    const { rerender } = render(table({ totalRows: 3612, countText }));
    // The header row is a row of the table as well.
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "3613");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("4 of 3612 lines");
    expect(screen.getByRole("grid")).toHaveAccessibleDescription("4 of 3612 lines");
    // The count line is outside the scroller, so it stays while the rows scroll.
    expect(screen.getByRole("grid")).not.toContainElement(status);

    rerender(table({ totalRows: 3612, countText, isLoadingMore: true }));
    expect(status).toHaveTextContent(en.table.loadingMore);
    expect(status).toHaveTextContent("4 of 3612 lines");

    rerender(table({ totalRows: 3612, countText }));
    expect(status).not.toHaveTextContent(en.table.loadingMore);
  });

  it("counts the rows it was given where the total is not known", () => {
    render(table());
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "5");
    expect(screen.getByRole("status")).toHaveTextContent("4 rows");
  });

  it(
    "asks for more rows once when their end comes into view, and again only when there are more",
    SLOW,
    () => {
      const onLoadMore = vi.fn();
      const page = many.slice(0, 200);
      const { rerender } = render(table({ rows: page, onLoadMore }));
      const grid = screen.getByRole("grid");
      // The end is two hundred rows away.
      expect(onLoadMore).not.toHaveBeenCalled();
      scrollTable(grid, 20 * ROW);
      expect(onLoadMore).not.toHaveBeenCalled();

      scrollTable(grid, 190 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      // Staying there asks for nothing more: not a further scroll, not a render, not the same
      // rows handed over again.
      scrollTable(grid, 189 * ROW);
      rerender(table({ rows: page, onLoadMore, isStale: true }));
      rerender(table({ rows: [...page], onLoadMore }));
      expect(onLoadMore).toHaveBeenCalledTimes(1);

      // A page that came short leaves the end in view: now there are more rows, so it asks again.
      rerender(table({ rows: many.slice(0, 203), onLoadMore }));
      expect(onLoadMore).toHaveBeenCalledTimes(2);

      // A full page moves the end away. Coming to it again asks once more.
      rerender(table({ rows: many.slice(0, 400), onLoadMore }));
      expect(onLoadMore).toHaveBeenCalledTimes(2);
      scrollTable(grid, 390 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(3);
      // Leaving the end and coming back is a new arrival.
      scrollTable(grid, 0);
      scrollTable(grid, 390 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(4);
    },
  );

  it("asks at once when the rows it was given end inside the visible part", () => {
    const onLoadMore = vi.fn();
    render(table({ onLoadMore }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it(
    "never asks for more rows without rows, on a first load, or while more are loading",
    SLOW,
    () => {
      const onLoadMore = vi.fn();
      const page = many.slice(0, 200);
      const { rerender } = render(table({ rows: [], onLoadMore }));
      rerender(table({ rows: [], onLoadMore, isLoading: true }));
      expect(onLoadMore).not.toHaveBeenCalled();

      rerender(table({ rows: page, onLoadMore, isLoadingMore: true }));
      scrollTable(screen.getByRole("grid"), 190 * ROW);
      expect(onLoadMore).not.toHaveBeenCalled();
      // The page that was on its way is there and the end is still in view.
      rerender(table({ rows: page, onLoadMore }));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    },
  );

  it(
    "returns to its top when the rows are replaced by others, and stays where it is when more arrive",
    SLOW,
    () => {
      const onLoadMore = vi.fn();
      const { rerender } = render(table({ rows: many.slice(0, 200), onLoadMore }));
      const grid = screen.getByRole("grid");
      scrollTable(grid, 190 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(1);

      rerender(table({ rows: many.slice(0, 400), onLoadMore }));
      expect(grid.scrollTop).toBe(190 * ROW);

      // Another result, as after another filter: its rows start at the top, and its end is
      // another end.
      rerender(table({ rows: many.slice(1000, 1200), onLoadMore }));
      expect(grid.scrollTop).toBe(0);
      // A browser tells of a scroll that a script made; jsdom has to be told.
      scrollTable(grid, 0);
      expect(screen.getByRole("rowheader", { name: lineId(1001) })).toBeInTheDocument();
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      scrollTable(grid, 190 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    },
  );

  it(
    "marks the place of the rows that are loading with a row of skeletons, which is no row to go to",
    SLOW,
    async () => {
      const user = userEvent.setup();
      const page = many.slice(0, 40);
      const { rerender } = render(table({ rows: page }));
      expect(document.querySelector('[data-part="load-more-row"]')).toBeNull();

      rerender(table({ rows: page, isLoadingMore: true }));
      const grid = screen.getByRole("grid");
      const more = grid.querySelector('[data-part="load-more-row"]');
      expect(more).not.toBeNull();
      expect(more?.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(more?.querySelectorAll('[data-part="skeleton"]')).toHaveLength(4);
      expect(more?.querySelector("[tabindex]")).toBeNull();

      await user.tab();
      await user.keyboard("{End}");
      expect(
        screen.getByRole("rowheader", { name: lineId(40) }).closest('[role="row"]'),
      ).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(
        screen.getByRole("rowheader", { name: lineId(40) }).closest('[role="row"]'),
      ).toHaveFocus();
    },
  );

  it("moves the focused row with the arrow keys, Home, End, and Page Down", SLOW, async () => {
    const user = userEvent.setup();
    render(table({ rows: many }));
    const focused = () =>
      within(document.activeElement as HTMLElement).getByRole("rowheader").textContent;

    await user.tab();
    expect(focused()).toBe(lineId(1));
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(focused()).toBe(lineId(3));
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe(lineId(2));
    // A page is what fits in the visible part: eleven rows under the header, twelve with it.
    await user.keyboard("{PageDown}");
    expect(focused()).toBe(lineId(14));
    await user.keyboard("{PageUp}");
    expect(focused()).toBe(lineId(2));
    await user.keyboard("{End}");
    expect(focused()).toBe(lineId(5000));
    expect(document.activeElement).toHaveAttribute("aria-rowindex", "5001");
    await user.keyboard("{Home}");
    expect(focused()).toBe(lineId(1));
  });

  it("keeps the focused row in the document while it is scrolled away", SLOW, async () => {
    const user = userEvent.setup();
    render(table({ rows: many }));
    const grid = screen.getByRole("grid");
    await user.tab();
    await user.keyboard("{ArrowDown}");
    const row = document.activeElement;
    expect(row).toHaveAttribute("aria-rowindex", "3");

    scrollTable(grid, 2999 * ROW);
    expect(screen.getByRole("rowheader", { name: lineId(3000) })).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: lineId(4) })).not.toBeInTheDocument();
    expect(row).toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it(
    "selects with Enter in a table whose rows can be selected, and not in one that is read",
    SLOW,
    async () => {
      const onSelectionChange = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(table({ rows: many, onSelectionChange }));
      await user.tab();
      await user.keyboard("{End}{Enter}");
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      expect(onSelectionChange).toHaveBeenCalledWith(lineId(5000));

      rerender(table({ rows: many }));
      await user.keyboard("{Enter}");
      await user.keyboard(" ");
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      for (const each of dataRows()) expect(each).not.toHaveAttribute("aria-selected");
    },
  );

  it(
    "renders no cell again for a change that is not its own, and never one that is out of view",
    SLOW,
    () => {
      const cell = vi.fn((line: Line) => line.id);
      const [first, ...rest] = columns;
      if (!first) throw new Error("The table has no column.");
      const counted: DataTableColumn<Line>[] = [{ ...first, cell }, ...rest];
      function Page({ title, inline }: { title: string; inline?: boolean }) {
        return (
          <section aria-label={title}>
            <DataTable
              aria-label="Lines on hold"
              // A caller that writes its columns where it renders hands over new ones each time.
              columns={inline === true ? [...counted] : counted}
              rows={many}
              rowKey={(line) => line.id}
            />
          </section>
        );
      }
      const { rerender } = render(<Page title="Lines" />);
      const visible = dataRows().length;
      expect(visible).toBeLessThan(100);
      // Five thousand rows were given, and only the rows in the document asked for a cell.
      expect(cell.mock.calls.length).toBeLessThanOrEqual(visible);

      cell.mockClear();
      rerender(<Page title="Lines on hold" />);
      expect(screen.getByRole("region", { name: "Lines on hold" })).toBeInTheDocument();
      expect(cell).not.toHaveBeenCalled();

      rerender(<Page title="Lines on hold" inline />);
      expect(cell.mock.calls.length).toBeLessThanOrEqual(visible);
    },
  );

  it("gives each column the width it declares, and the rest to the column that takes a share", () => {
    render(table());
    const width = (name: string) =>
      screen.getByRole("columnheader", { name }).parentElement?.style.width;
    // The stand-in widths of a test: 7 px for a character, 8 px in the monospace; 12 px padding.
    expect(width("Line ID")).toBe("192px");
    // "Holds" is a header that can be sorted: its text and the room of the arrow need more than
    // six figures do.
    expect(width("Holds")).toBe("74px");
    expect(width("Oldest")).toBe("80px");
    expect(width("First blocker")).toBe("678px");
  });

  it("follows a declared width that changes, and keeps the focus where it was", SLOW, async () => {
    const user = userEvent.setup();
    const wider = columns.map((column) =>
      column.id === "id" ? { ...column, size: { chars: 30 } } : column,
    );
    const { rerender } = render(table());
    await user.tab();
    await user.keyboard("{ArrowDown}");
    const row = document.activeElement;

    rerender(table({ columns: wider }));
    expect(screen.getByRole("columnheader", { name: "Line ID" }).parentElement).toHaveStyle({
      width: "264px",
    });
    expect(row).toBeInTheDocument();
    expect(row).toHaveFocus();
  });
});

describe("DataTable narrower than its columns", () => {
  tableViewport({ width: 320, height: 400 });

  it("scrolls sideways and keeps the column that names the row in view", () => {
    render(table());
    const grid = screen.getByRole("grid");
    // No column gives way: the one that takes a share keeps the room of its least characters.
    expect(screen.getByRole("columnheader", { name: "First blocker" }).parentElement).toHaveStyle({
      width: "136px",
    });
    const header = screen.getByRole("columnheader", { name: "Line ID" });
    const name = within(dataRow(0)).getByRole("rowheader");
    expect(header).toHaveAttribute("data-pinned");
    expect(name).toHaveAttribute("data-pinned");
    expect(header.parentElement).toHaveStyle({ position: "sticky" });
    expect(name.parentElement).toHaveStyle({ position: "sticky" });
    for (const cell of within(dataRow(0)).getAllByRole("gridcell")) {
      expect(cell).not.toHaveAttribute("data-pinned");
      expect(cell.parentElement).toHaveStyle({ position: "absolute" });
    }

    expect(grid.closest("[data-scrolled-x]")).toBeNull();
    act(() => {
      scrollTable(grid, 0);
      grid.scrollLeft = 40;
      scrollTable(grid, 0);
    });
    expect(grid.closest("[data-scrolled-x]")).not.toBeNull();
  });
});
