import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
import { scrollTable, tableViewport } from "../../test/viewport";
import { Button } from "../Button/Button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type LeavingColumn,
} from "./DataTable";

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

/** What a test may change of the table: anything, and the columns with what names those that leave. */
type TableOptions = Partial<Omit<DataTableProps<Line>, "columns" | "leftOutText">> &
  (
    | { columns?: readonly DataTableColumn<Line>[]; leftOutText?: undefined }
    | {
        columns: readonly LeavingColumn<Line>[];
        leftOutText: (headers: readonly string[]) => string;
      }
  );

function table({ columns: shown = columns, leftOutText, ...props }: TableOptions = {}) {
  const fitting =
    leftOutText === undefined
      ? { columns: shown as readonly DataTableColumn<Line>[] }
      : { columns: shown, leftOutText };
  return (
    <DataTable
      aria-label="Lines on hold"
      rows={lines}
      rowKey={(line) => line.id}
      {...props}
      {...fitting}
    />
  );
}

// A test that watches the console, an element's size, or a global puts none of them back
// itself: it may fail before it gets there, and the next test would start with what it left.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * jsdom observes no sizes. This stand-in for `ResizeObserver` keeps what was asked to be
 * watched and what would be told, so a test can look and can tell it by hand.
 */
function observeSizes() {
  const observers: { callback: ResizeObserverCallback; targets: Set<Element> }[] = [];
  class Sizes implements ResizeObserver {
    private readonly targets = new Set<Element>();
    constructor(callback: ResizeObserverCallback) {
      observers.push({ callback, targets: this.targets });
    }
    readonly observe = (target: Element) => {
      this.targets.add(target);
    };
    readonly unobserve = (target: Element) => {
      this.targets.delete(target);
    };
    readonly disconnect = () => {
      this.targets.clear();
    };
  }
  vi.stubGlobal("ResizeObserver", Sizes);
  return {
    isWatched: (element: Element) => observers.some(({ targets }) => targets.has(element)),
    /** Tells every observer that what it watches has another size. */
    resize: () => {
      const all = [...observers];
      const observer = new Sizes(() => undefined);
      act(() => {
        for (const { callback } of all) callback([{} as ResizeObserverEntry], observer);
      });
    },
  };
}

/** The element around the grid, which carries what the stylesheet is told. */
function tableRoot(): HTMLElement {
  const root = screen.getByRole("grid").parentElement;
  if (!root) throw new Error("The grid has no parent.");
  return root;
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

  it("gives its row count as the description of the grid, and is no live region", () => {
    // A read-only table that is all there: its rows change with the page, whose own status
    // says so; a table of its own would only add a second announcement.
    const { rerender } = render(table());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("grid")).toHaveAccessibleDescription("4 rows");

    rerender(table({ rows: lines.slice(0, 1) }));
    expect(screen.getByRole("grid")).toHaveAccessibleDescription("1 row");
    expect(screen.queryByRole("status")).toBeNull();
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
    expect(oldest.querySelector('[data-mark="sorted"] svg')).not.toBeNull();
    expect(holds).toHaveAttribute("aria-sort", "none");
    // A header that can be sorted shows its muted mark at rest, not the mark of the sorted one.
    expect(holds.querySelector('[data-mark="sorted"]')).toBeNull();
    expect(holds.querySelector('[data-mark="rest"] svg')).not.toBeNull();
    const line = screen.getByRole("columnheader", { name: "Line ID" });
    expect(line).not.toHaveAttribute("aria-sort");
    expect(line.querySelector("svg")).toBeNull();

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
    expect(grid).toHaveAccessibleDescription(en.table.loading);
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
    expect(screen.getByRole("grid")).toHaveAccessibleDescription("0 rows");
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
    // Two sentences, read as two: the count, then what is on its way.
    expect(status).toHaveTextContent(`4 of 3612 lines. ${en.table.loadingMore}`);
    expect(screen.getByRole("grid")).toHaveAccessibleDescription(
      `4 of 3612 lines. ${en.table.loadingMore}`,
    );

    rerender(table({ totalRows: 3612, countText }));
    expect(status).not.toHaveTextContent(en.table.loadingMore);
  });

  it("counts the rows it was given where the total is not known", () => {
    const onLoadMore = () => undefined;
    const { rerender } = render(table({ onLoadMore }));
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "5");
    expect(screen.getByRole("status")).toHaveTextContent("4 rows");
    // The line that is only heard reads as two sentences as well.
    rerender(table({ onLoadMore, isLoadingMore: true }));
    expect(screen.getByRole("status").textContent).toBe(`4 rows. ${en.table.loadingMore}`);
  });

  it("shows its count line under every result but an empty one, and announces it always", () => {
    const countText = (shown: number, total: number) =>
      `${String(shown)} of ${String(total)} lines`;
    const hidden = (element: HTMLElement) => getComputedStyle(element).position === "absolute";
    const { rerender } = render(table({ totalRows: 4, countText }));
    // Every row is there: the table still says how many there are.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("4 of 4 lines");
    expect(screen.getByRole("grid")).toHaveAccessibleDescription("4 of 4 lines");
    expect(hidden(status)).toBe(false);

    rerender(table({ totalRows: 3612, countText }));
    expect(screen.getByRole("status")).toHaveTextContent("4 of 3612 lines");
    expect(hidden(screen.getByRole("status"))).toBe(false);

    // No row: the empty state says so, and no count line stands under it; it is still heard.
    rerender(table({ rows: [], totalRows: 0, countText, emptyState: <p>No line matches.</p> }));
    expect(screen.getByText("No line matches.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 of 0 lines");
    expect(hidden(screen.getByRole("status"))).toBe(true);
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
    "returns to its top when the caller says the rows are another result, also one that starts with the same row",
    SLOW,
    () => {
      const onLoadMore = vi.fn();
      const page = many.slice(0, 200);
      const { rerender } = render(table({ rows: page, onLoadMore, resultKey: "all" }));
      const grid = screen.getByRole("grid");
      scrollTable(grid, 190 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(1);

      // Another filter that keeps the same first row and as many rows: nothing of the rows says
      // that they are another result. The key does.
      rerender(table({ rows: [...page], onLoadMore, resultKey: "civil" }));
      expect(grid.scrollTop).toBe(0);
      // A browser tells of a scroll that a script made; jsdom has to be told.
      scrollTable(grid, 0);
      expect(screen.getByRole("rowheader", { name: lineId(1) })).toBeInTheDocument();
      // The end of the other result is another end: coming to it asks again.
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      scrollTable(grid, 190 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    },
  );

  it("takes no scroll on the way back to its top for the end of the other result", SLOW, () => {
    const onLoadMore = vi.fn();
    const page = many.slice(0, 200);
    const { rerender } = render(table({ rows: page, onLoadMore, resultKey: "all" }));
    const grid = screen.getByRole("grid");
    scrollTable(grid, 190 * ROW);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(table({ rows: [...page], onLoadMore, resultKey: "civil" }));
    expect(grid.scrollTop).toBe(0);
    // The component library may scroll back toward the old place before the browser reports
    // the scroll to the top; that is not the user coming to the end.
    scrollTable(grid, 190 * ROW);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    // Once the top is reported, the end of the other result is an end again.
    scrollTable(grid, 0);
    scrollTable(grid, 190 * ROW);
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it(
    "does not stay on its way back to the top: a late placement leaves the end an end",
    SLOW,
    async () => {
      const onLoadMore = vi.fn();
      const page = many.slice(0, 200);
      const { rerender } = render(table({ rows: page, onLoadMore, resultKey: "all" }));
      const grid = screen.getByRole("grid");
      scrollTable(grid, 190 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      rerender(table({ rows: [...page], onLoadMore, resultKey: "civil" }));
      // The library places the table again, later than the frame of the return, and the scroll to
      // the top is never reported.
      await new Promise((resolve) => setTimeout(resolve, 100));
      scrollTable(grid, 190 * ROW);
      // After a few frames the table counts where it is again.
      await waitFor(() => {
        expect(onLoadMore).toHaveBeenCalledTimes(2);
      });
    },
  );

  it(
    "counts where it is again as soon as the user scrolls on the way back to its top",
    SLOW,
    () => {
      const onLoadMore = vi.fn();
      const page = many.slice(0, 200);
      const { rerender } = render(table({ rows: page, onLoadMore, resultKey: "all" }));
      const grid = screen.getByRole("grid");
      scrollTable(grid, 190 * ROW);
      rerender(table({ rows: [...page], onLoadMore, resultKey: "civil" }));
      fireEvent.wheel(grid, { deltaY: 400 });
      scrollTable(grid, 190 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    },
  );

  it("asks for more again under another result whose end is in view where the last one's was", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(table({ onLoadMore, resultKey: "all" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(table({ rows: [...lines], onLoadMore, resultKey: "all" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(table({ rows: [...lines], onLoadMore, resultKey: "civil" }));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it(
    "stays where it is while the result is the same: with more rows, with one row fewer, with another first row",
    SLOW,
    () => {
      const { rerender } = render(table({ rows: many.slice(0, 200), resultKey: "all" }));
      const grid = screen.getByRole("grid");
      scrollTable(grid, 100 * ROW);

      rerender(table({ rows: many.slice(0, 400), resultKey: "all" }));
      expect(grid.scrollTop).toBe(100 * ROW);
      // The same result read again, in which a row is gone, and then its first row.
      rerender(table({ rows: many.slice(0, 399), resultKey: "all" }));
      expect(grid.scrollTop).toBe(100 * ROW);
      rerender(table({ rows: many.slice(1, 399), resultKey: "all" }));
      expect(grid.scrollTop).toBe(100 * ROW);
    },
  );

  it("never takes its rows for another result without a key that says so", SLOW, () => {
    const { rerender } = render(table({ rows: many.slice(0, 200) }));
    const grid = screen.getByRole("grid");
    scrollTable(grid, 100 * ROW);
    rerender(table({ rows: many.slice(1000, 1200) }));
    expect(grid.scrollTop).toBe(100 * ROW);
  });

  it(
    "asks for no rows when it is as tall as its rows, and says in development why not",
    SLOW,
    () => {
      const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const onLoadMore = vi.fn();
      const all = { maxRows: Number.POSITIVE_INFINITY };
      const { rerender } = render(table({ onLoadMore, height: all }));
      rerender(table({ rows: many.slice(0, 200), onLoadMore, height: all }));
      scrollTable(screen.getByRole("grid"), 190 * ROW);
      // Its end is always in view: every page would ask for the next.
      expect(onLoadMore).not.toHaveBeenCalled();
      // Said once for this table, however often it looks for its end.
      expect(said).toHaveBeenCalledTimes(1);
      expect(said.mock.calls[0]?.[0]).toMatch(/onLoadMore.*height/s);
    },
  );

  it("lets nothing between a pinned cell and the scroller clip: the header and the body show what overflows", () => {
    render(table());
    const groups = within(screen.getByRole("grid")).getAllByRole("rowgroup");
    expect(groups).toHaveLength(2);
    // A box that clips would be what the pinned column sticks to, and it does not scroll.
    for (const group of groups) expect(group.parentElement).toHaveStyle({ overflow: "visible" });
  });

  it("is as tall as its header and its skeleton rows on a first load, and as its header alone without a row", () => {
    const { rerender } = render(table({ rows: [], isLoading: true, skeletonRows: 5 }));
    const grid = screen.getByRole("grid");
    // The box the library sizes to what the table holds; the grid scrolls it.
    const content = () => grid.firstElementChild;
    const body = () => within(grid).getAllByRole("rowgroup")[1]?.parentElement;
    // The header and five rows of 36 px, whatever the height of the scroller is.
    expect(content()).toHaveStyle({ height: "216px" });
    expect(body()).toHaveStyle({ height: "180px" });

    rerender(table({ rows: [], emptyState: <p>No holds match these filters.</p> }));
    expect(content()).toHaveStyle({ height: "36px" });
    expect(body()).toHaveStyle({ height: "0px" });
  });

  it("runs its rows the width of the table also where no column takes a share", () => {
    const fixed = columns.map((column) =>
      "flex" in column.size ? { ...column, size: { chars: 16 } } : column,
    );
    render(table({ columns: fixed }));
    // The columns need 192, 74, 80, and 136 px of 1024.
    expect(screen.getByRole("columnheader", { name: "First blocker" }).parentElement).toHaveStyle({
      width: "136px",
    });
    const [head, body] = within(screen.getByRole("grid")).getAllByRole("rowgroup");
    expect(head?.parentElement).toHaveStyle({ width: "1024px" });
    expect(body?.parentElement).toHaveStyle({ width: "1024px" });
    expect(dataRow(0).parentElement).toHaveStyle({ width: "1024px" });
  });

  it("keeps a focused row clear of the pinned column at the width the layout gave it", () => {
    // The column that names the row takes a share here, as on Overview: it is far wider than
    // the least it declares.
    const shared: DataTableColumn<Line>[] = [
      {
        id: "blocker",
        header: "First blocker",
        isRowHeader: true,
        size: { flex: 1, minChars: 16 },
        cell: (line) => line.blocker,
      },
      {
        id: "holds",
        header: "Holds",
        kind: "number",
        size: { chars: 6 },
        cell: (line) => line.holds,
      },
    ];
    const { rerender } = render(table({ columns: shared }));
    const pinned = screen.getByRole("columnheader", { name: "First blocker" }).parentElement;
    expect(pinned).toHaveStyle({ width: "958px" });
    // A browser tells the table when its scroller has been sized; here its next render does.
    rerender(table({ columns: shared }));
    const root = tableRoot();
    expect(root.style.getPropertyValue("--table-pinned-width")).toBe("958px");
  });

  it("makes room for a sideways scrollbar, so it takes nothing from the last row", () => {
    // The scroller is 15 px taller than what it shows: a scrollbar lies along its lower edge.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400 + ROW + 15);
    const across = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1400);
    const { rerender } = render(table());
    expect(tableRoot().style.getPropertyValue("--table-scrollbar-size")).toBe("15px");
    // A table that does not scroll sideways has no such scrollbar, whatever its height is.
    across.mockReturnValue(1024);
    rerender(table());
    expect(tableRoot().style.getPropertyValue("--table-scrollbar-size")).toBe("0px");
  });

  it("follows the pinned column when the layout gives it another width and nothing else is resized", () => {
    const sizes = observeSizes();
    const { rerender } = render(table());
    rerender(table());
    const box = screen.getByRole("columnheader", { name: "Line ID" }).parentElement;
    if (!box) throw new Error("The pinned header has no box around it.");
    expect(tableRoot().style.getPropertyValue("--table-pinned-width")).toBe("192px");
    // The table watches the box the layout sizes for the pinned column, besides its scroller.
    expect(sizes.isWatched(box)).toBe(true);

    // The pinned column grows and the column that takes a share gives the room: neither the
    // scroller nor what it holds has another size, and the table has not rendered.
    box.style.width = "240px";
    sizes.resize();
    expect(tableRoot().style.getPropertyValue("--table-pinned-width")).toBe("240px");
  });

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
      const rowKey = vi.fn((line: Line) => line.id);
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
              // And a function for the key of a row that is a new one each time as well.
              rowKey={(line) => rowKey(line)}
            />
          </section>
        );
      }
      const { rerender } = render(<Page title="Lines" />);
      const visible = dataRows().length;
      expect(visible).toBeLessThan(100);
      // Five thousand rows were given, and only the rows in the document asked for a cell.
      expect(cell.mock.calls.length).toBeLessThanOrEqual(visible);
      // Every row was built once, which asks for its key once.
      expect(rowKey).toHaveBeenCalledTimes(many.length);

      cell.mockClear();
      rowKey.mockClear();
      rerender(<Page title="Lines on hold" />);
      expect(screen.getByRole("region", { name: "Lines on hold" })).toBeInTheDocument();
      expect(cell).not.toHaveBeenCalled();
      // No row was built again: a rebuild would ask every one of them for its key.
      expect(rowKey).not.toHaveBeenCalled();

      rerender(<Page title="Lines on hold" inline />);
      expect(cell.mock.calls.length).toBeLessThanOrEqual(visible);
      expect(rowKey).not.toHaveBeenCalled();
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

/**
 * The columns of the test, where Oldest and then Holds may leave a narrow table. The first
 * blocker takes the share of the width that is left.
 */
const leaving: LeavingColumn<Line>[] = columns.map((column) =>
  column.id === "oldest"
    ? { ...column, priority: 2 }
    : column.id === "holds"
      ? { ...column, priority: 1 }
      : column,
);

const leftOutText = (headers: readonly string[]) =>
  `Not shown at this width: ${headers.join(", ")}.`;

function headers(): string[] {
  return screen.getAllByRole("columnheader").map((header) => header.textContent);
}

describe("DataTable narrower than its columns, whose columns may leave", () => {
  // The stand-in widths of a test: Line ID 192 px, Holds 74, Oldest 80, First blocker at least
  // 136, which is 482 together.
  const size = { width: 420, height: 400 };
  tableViewport(size);
  afterEach(() => {
    size.width = 420;
  });

  it("takes out the column of the highest priority first, and names it under the table", () => {
    render(table({ columns: leaving, leftOutText }));
    expect(headers()).toEqual(["Line ID", "Holds", "First blocker"]);
    const note = screen.getByText("Not shown at this width: Oldest.");
    // It describes the table, and is no live region: a resize is not news.
    expect(screen.getByRole("grid").getAttribute("aria-describedby")).toContain(note.id);
    expect(note).not.toHaveAttribute("role");
    expect(within(dataRow(0)).queryByText(lines[0]?.oldest ?? "")).not.toBeInTheDocument();
  });

  it("takes out the next one where the table is narrower still, and gives both back with room", () => {
    const sizes = observeSizes();
    size.width = 400;
    const { rerender } = render(table({ columns: leaving, leftOutText }));
    expect(headers()).toEqual(["Line ID", "First blocker"]);
    expect(screen.getByText("Not shown at this width: Holds, Oldest.")).toBeInTheDocument();

    size.width = 600;
    act(() => {
      sizes.resize();
    });
    rerender(table({ columns: leaving, leftOutText }));
    expect(headers()).toEqual(["Line ID", "Holds", "Oldest", "First blocker"]);
    expect(screen.queryByText(/Not shown at this width/)).not.toBeInTheDocument();
  });

  it("keeps the column the rows are sorted by, and scrolls sideways when the rest do not fit", () => {
    size.width = 400;
    render(
      table({
        columns: leaving,
        leftOutText,
        sort: { column: "holds", direction: "descending" },
      }),
    );
    expect(headers()).toEqual(["Line ID", "Holds", "First blocker"]);
    expect(screen.getByText("Not shown at this width: Oldest.")).toBeInTheDocument();
  });

  it("keeps the last column that takes a share, so the rows reach the edge of the table", () => {
    size.width = 300;
    const shared = leaving.map((column) =>
      column.id === "blocker" ? { ...column, priority: 3 } : column,
    );
    render(table({ columns: shared, leftOutText }));
    expect(headers()).toEqual(["Line ID", "First blocker"]);
    expect(screen.getByText("Not shown at this width: Holds, Oldest.")).toBeInTheDocument();
  });

  it("keeps every column of a table that gives none a priority", () => {
    render(table());
    expect(headers()).toEqual(["Line ID", "Holds", "Oldest", "First blocker"]);
    expect(screen.queryByText(/Not shown at this width/)).not.toBeInTheDocument();
  });

  it("gives the focus of a cell that leaves to the cell that names its row", SLOW, async () => {
    const sizes = observeSizes();
    size.width = 600;
    const user = userEvent.setup();
    const { rerender } = render(table({ columns: leaving, leftOutText }));
    await user.tab();
    // The row, its name, Holds, Oldest.
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    const oldest = within(dataRow(0)).getByText(lines[0]?.oldest ?? "");
    expect(oldest.closest("[role='gridcell']")).toHaveFocus();

    size.width = 420;
    act(() => {
      sizes.resize();
    });
    rerender(table({ columns: leaving, leftOutText }));
    expect(headers()).not.toContain("Oldest");
    await waitFor(() => {
      expect(within(dataRow(0)).getByRole("rowheader")).toHaveFocus();
    });
  });
});

describe("DataTable's sortable headers", () => {
  const mark = (header: HTMLElement) => header.querySelector<HTMLElement>("[data-mark]");
  const glyph = (header: HTMLElement) => mark(header)?.querySelector("svg")?.getAttribute("class");

  it("show at rest a two-way mark, and only the sorted one an arrow that says its order", () => {
    render(table({ sort: { column: "oldest", direction: "ascending" } }));
    const holds = screen.getByRole("columnheader", { name: "Holds" });
    const oldest = screen.getByRole("columnheader", { name: "Oldest" });
    expect(mark(holds)).toHaveAttribute("data-mark", "rest");
    expect(glyph(holds)).toContain("lucide-chevrons-up-down");
    expect(mark(holds)).not.toHaveAttribute("data-direction");
    expect(mark(oldest)).toHaveAttribute("data-mark", "sorted");
    expect(mark(oldest)).toHaveAttribute("data-direction", "ascending");
    expect(glyph(oldest)).toContain("lucide-arrow-up");
    expect(oldest).toHaveAttribute("aria-sort", "ascending");
    // A header that cannot be sorted has no mark.
    expect(mark(screen.getByRole("columnheader", { name: "Line ID" }))).toBeNull();
    expect(mark(screen.getByRole("columnheader", { name: "First blocker" }))).toBeNull();
  });

  it("shows no mark while the rows are loading", () => {
    render(table({ isLoading: true }));
    expect(document.querySelector("[data-mark]")).toBeNull();
  });

  it("answers the pointer and the keyboard as a button does", SLOW, async () => {
    const user = userEvent.setup();
    render(table({ onSortChange: vi.fn() }));
    const holds = screen.getByRole("columnheader", { name: "Holds" });
    await user.hover(holds);
    expect(holds).toHaveAttribute("data-hovered");
    await user.unhover(holds);
    expect(holds).not.toHaveAttribute("data-hovered");

    // From the first row, along it, and up to its header row.
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowUp}");
    expect(holds).toHaveFocus();
    expect(holds).toHaveAttribute("data-focus-visible");
  });

  it("are drawn by state: a muted mark at rest, a stronger one on hover and focus, the sorted one heavier", () => {
    const stylesheet = readFileSync(join(import.meta.dirname, "DataTable.module.css"), "utf8");
    const rule = (selector: string) =>
      new RegExp(`(^|\\n)${selector.replace(/[.[\]:="]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(
        stylesheet,
      )?.[2] ?? "";
    expect(rule(".mark")).toMatch(/color:\s*var\(--color-text-muted\);/);
    expect(
      rule(
        ".column[data-hovered] .mark,\n.column[data-pressed] .mark,\n.column[data-focus-visible] .mark",
      ),
    ).toMatch(/color:\s*var\(--color-text-secondary\);/);
    expect(rule('.column .mark[data-mark="sorted"]')).toMatch(
      /color:\s*var\(--color-text-primary\);/,
    );
    // Not by ink alone: the label of the sorted header is heavier.
    expect(
      rule('.column[aria-sort="ascending"] .label,\n.column[aria-sort="descending"] .label'),
    ).toMatch(/font-weight:\s*var\(--font-weight-semibold\);/);
    expect(rule(".column[data-allows-sorting][data-hovered]")).toMatch(
      /background-color:\s*var\(--color-surface-hover\);/,
    );
    expect(rule(".column[data-allows-sorting][data-pressed]")).toMatch(
      /background-color:\s*var\(--color-surface-pressed\);/,
    );
  });
});

describe("DataTable in a container of a fractional width", () => {
  it("takes a whole number of pixels, so its columns never overflow by a fraction", () => {
    // The library lays the columns out in the scroller's width rounded to a whole pixel. Given
    // 1648.8 pixels, it would lay out 1634 in a scroller of 1633.8 and draw a sideways
    // scrollbar for nothing. A layout cannot be measured here, so the rule is read.
    const stylesheet = readFileSync(join(import.meta.dirname, "DataTable.module.css"), "utf8");
    const root = /\.root\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? "";
    expect(root).toMatch(/inline-size:\s*round\(down,\s*100%,\s*var\(--size-pixel\)\);/);
  });
});

describe("DataTable taller than the window", () => {
  // No window is this tall.
  tableViewport({ width: 1024, height: 5000 });

  it(
    "asks for no rows where it fills a container without a height: its end is always in view",
    SLOW,
    () => {
      const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const onLoadMore = vi.fn();
      // A table that fills its container and is taller than the window is not kept to a
      // height: it has grown with its rows.
      render(table({ rows: many.slice(0, 200), onLoadMore, height: "fill" }));
      expect(onLoadMore).not.toHaveBeenCalled();
      expect(said).toHaveBeenCalledTimes(1);
    },
  );

  it(
    "still asks for rows where it is kept to a number of rows, however short the window is",
    SLOW,
    () => {
      const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const onLoadMore = vi.fn();
      // Twenty rows are taller than a short or a zoomed window, and still a height that is kept.
      render(table({ rows: many.slice(0, 200), onLoadMore, height: { maxRows: 20 } }));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      expect(said).not.toHaveBeenCalled();
    },
  );
});

describe("DataTable in a scroller that grows", () => {
  const size = { width: 1024, height: 100 };
  tableViewport(size);
  afterEach(() => {
    size.height = 100;
  });

  it("looks for the end of its rows again when it is resized", () => {
    const sizes = observeSizes();
    const onLoadMore = vi.fn();
    render(table({ rows: many.slice(0, 20), onLoadMore }));
    // Twenty rows end 756 px down, and two heights of 100 px do not reach them.
    expect(onLoadMore).not.toHaveBeenCalled();

    size.height = 400;
    sizes.resize();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable's pinned column", () => {
  it("reaches a hairline past its edge with a strip that changes fill with the cell", () => {
    // A shadow would jump to the new fill while the cell fades to it, and a shadow may not be
    // animated: the strip is an element that carries the row's fill and its transition.
    const stylesheet = readFileSync(join(import.meta.dirname, "DataTable.module.css"), "utf8");
    const rule = (selector: string) =>
      new RegExp(`(^|\\n)${selector.replace(/[.[\]:]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(
        stylesheet,
      )?.[2] ?? "";
    const cell = rule(".cell[data-pinned]");
    expect(cell).toMatch(
      /transition:\s*background-color var\(--duration-fast\) var\(--ease-out\);/,
    );
    expect(cell).not.toMatch(/box-shadow/);
    const strip = rule(".cell[data-pinned]::before");
    expect(strip).toMatch(/inset-inline-start:\s*calc\(-1 \* var\(--border-width-thin\)\);/);
    expect(strip).toMatch(/inline-size:\s*var\(--border-width-thin\);/);
    expect(strip).toMatch(/background-color:\s*var\(--row-fill\);/);
    expect(strip).toMatch(
      /transition:\s*background-color var\(--duration-fast\) var\(--ease-out\);/,
    );
  });
});
