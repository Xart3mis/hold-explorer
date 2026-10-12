import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
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
  { id: "id", header: "Line ID", kind: "identifier", isRowHeader: true, cell: (line) => line.id },
  { id: "holds", header: "Holds", kind: "number", allowsSorting: true, cell: (line) => line.holds },
  {
    id: "oldest",
    header: "Oldest",
    kind: "number",
    allowsSorting: true,
    cell: (line) => line.oldest,
  },
  { id: "blocker", header: "First blocker", isSupporting: true, cell: (line) => line.blocker },
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
    const cells = [...dataRow(0).children];
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
