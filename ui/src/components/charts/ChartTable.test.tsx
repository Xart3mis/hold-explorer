import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
import { tableViewport } from "../../test/viewport";
import { ChartTable, ChartViewToggle, type ChartTableRow } from "./ChartTable";

describe("ChartTable", () => {
  it("is a read-only table of the rows it is given", () => {
    render(
      <ChartTable
        aria-label="Holds by discipline, table"
        columns={[
          { id: "discipline", header: "Discipline", isRowHeader: true },
          { id: "holds", header: "Holds", isNumber: true },
        ]}
        rows={[
          { key: "civil", cells: ["Civil", "1,515"], values: ["Civil", 1515] },
          { key: "piping", cells: ["Piping", "1,285"], values: ["Piping", 1285] },
        ]}
      />,
    );
    const table = screen.getByRole("grid", { name: "Holds by discipline, table" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Civil1,515");
    expect(rows[2]).toHaveTextContent("Piping1,285");
    const piping = rows[2];
    if (!piping) throw new Error("The table has no second row");
    expect(within(piping).getByRole("rowheader")).toHaveTextContent("Piping");
    expect(rows[1]).not.toHaveAttribute("aria-selected");
  });
});

describe("ChartTable's sort", () => {
  const COLUMNS = [
    { id: "discipline", header: "Discipline", isRowHeader: true },
    { id: "holds", header: "Holds", isNumber: true },
    { id: "lines", header: "Lines", isNumber: true },
  ];
  const ROWS: ChartTableRow[] = [
    { key: "civil", cells: ["Civil", "1,515", "9"], values: ["Civil", 1515, 9] },
    { key: "piping", cells: ["Piping", "1,285", "40"], values: ["Piping", 1285, 40] },
    { key: "blank", cells: ["No value", "—", "2"], values: [null, null, 2] },
    {
      key: "others",
      cells: ["All others", "9,999", "1,000"],
      values: ["All others", 9999, 1000],
      isFolded: true,
    },
    { key: "electrical", cells: ["Electrical", "300", "12"], values: ["Electrical", 300, 12] },
  ];

  function sortTable() {
    render(<ChartTable aria-label="Holds by discipline, table" columns={COLUMNS} rows={ROWS} />);
    return screen.getByRole("grid", { name: "Holds by discipline, table" });
  }

  /** The keys of the rows in the order they are drawn, by the text of their first cell. */
  function order(table: HTMLElement): string[] {
    return within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getByRole("rowheader").textContent);
  }

  it("lets every column be sorted, and starts in the order of the chart, unmarked", () => {
    const table = sortTable();
    for (const header of within(table).getAllByRole("columnheader")) {
      expect(header).toHaveAttribute("aria-sort", "none");
      expect(header.querySelector("[data-mark]")).toHaveAttribute("data-mark", "rest");
    }
    expect(order(table)).toEqual(["Civil", "Piping", "No value", "All others", "Electrical"]);
  });

  it("sorts by a pressed header, the most first for a number, and turns round on a second press", async () => {
    const user = userEvent.setup();
    const table = sortTable();
    const holds = within(table).getByRole("columnheader", { name: "Holds" });
    await user.click(holds);
    expect(holds).toHaveAttribute("aria-sort", "descending");
    // The row without a value, and then the folded row, stay last in both directions.
    expect(order(table)).toEqual(["Civil", "Piping", "Electrical", "No value", "All others"]);
    await user.click(holds);
    expect(holds).toHaveAttribute("aria-sort", "ascending");
    expect(order(table)).toEqual(["Electrical", "Piping", "Civil", "No value", "All others"]);
    const name = within(table).getByRole("columnheader", { name: "Discipline" });
    await user.click(name);
    expect(name).toHaveAttribute("aria-sort", "ascending");
    expect(holds).toHaveAttribute("aria-sort", "none");
    expect(order(table)).toEqual(["Civil", "Electrical", "Piping", "No value", "All others"]);
    await user.click(name);
    expect(order(table)).toEqual(["Piping", "Electrical", "Civil", "No value", "All others"]);
    await user.click(within(table).getByRole("columnheader", { name: "Lines" }));
    expect(order(table)).toEqual(["Piping", "Electrical", "Civil", "No value", "All others"]);
    await expectAccessible();
  });
});

describe("ChartTable's sort across renders", () => {
  /** The columns and rows of a chart built anew at every render, as a heatmap's may be. */
  function Chart({ tick, header = "Holds" }: { tick: number; header?: string }) {
    const columns = [
      { id: "discipline", header: "Discipline", isRowHeader: true },
      { id: "holds", header, isNumber: true },
    ];
    const rows: ChartTableRow[] = [
      { key: "civil", cells: ["Civil", "12"], values: ["Civil", 12] },
      { key: "piping", cells: ["Piping", "70"], values: ["Piping", 70] },
    ];
    return (
      <div data-tick={tick}>
        <ChartTable aria-label="Holds, table" columns={columns} rows={rows} />
      </div>
    );
  }

  const names = () =>
    within(screen.getByRole("grid", { name: "Holds, table" }))
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent);

  it("keeps its sort when it is handed equal columns and rows anew, and drops it for others", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Chart tick={0} />);
    await user.click(screen.getByRole("columnheader", { name: "Holds" }));
    expect(names()).toEqual(["Piping", "Civil"]);
    rerender(<Chart tick={1} />);
    expect(screen.getByRole("columnheader", { name: "Holds" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(names()).toEqual(["Piping", "Civil"]);
    // Other columns are another table: it starts again in the order of the chart.
    rerender(<Chart tick={2} header="Lines" />);
    expect(screen.getByRole("columnheader", { name: "Lines" })).toHaveAttribute(
      "aria-sort",
      "none",
    );
    expect(names()).toEqual(["Civil", "Piping"]);
  });
});

describe("ChartTable's renders", () => {
  it("builds no row again for a render that hands it the same columns and rows", SLOW, () => {
    // Rows that count how often the table reads them: a table that builds its rows reads the key
    // of every one, and one that declares its columns from the rows reads every row's cells.
    let reads = 0;
    const rows: ChartTableRow[] = Array.from({ length: 3000 }, (_, index) => {
      const key = `step-${String(index)}`;
      const cells = [String(index + 1), `Blocker ${String(index + 1)}`];
      const values = [index + 1, `Blocker ${String(index + 1)}`];
      return {
        values,
        get key() {
          reads += 1;
          return key;
        },
        get cells() {
          reads += 1;
          return cells;
        },
      };
    });
    const columns = [
      { id: "step", header: "Step", isNumber: true, isRowHeader: true },
      { id: "blocker", header: "Blocker" },
    ];
    function Page({ tick }: { tick: number }) {
      return (
        <div data-tick={tick}>
          <ChartTable aria-label="Steps, table" columns={columns} rows={rows} />
        </div>
      );
    }
    const { rerender } = render(<Page tick={0} />);
    expect(screen.getByRole("grid", { name: "Steps, table" })).toBeInTheDocument();
    reads = 0;
    rerender(<Page tick={1} />);
    expect(reads).toBe(0);
  });
});

describe("ChartTable with long headers", () => {
  tableViewport({ width: 1024, height: 400 });
  const REMARK = "Hold for vendor data of the pump skid, see the latest datasheet revision";

  function longTable() {
    return (
      <ChartTable
        aria-label="Holds by discipline and remark, table"
        columns={[
          { id: "row", header: "Discipline", isRowHeader: true },
          { id: "col-0", header: REMARK, isNumber: true },
          { id: "col-1", header: "Client", isNumber: true },
        ]}
        rows={[{ key: "piping", cells: ["Piping", "12", "4"], values: ["Piping", 12, 4] }]}
      />
    );
  }

  it("cuts a long header, and keeps its whole text as the name of its column", () => {
    render(longTable());
    const header = screen.getByRole("columnheader", { name: REMARK });
    // The stand-in widths of a test: 7 px for a character, 12 px padding. The header makes room
    // for 24 characters of it, not for the whole of it, and, as every header of a table view can
    // be sorted, for its sort mark (20 px: the icon and its gap).
    expect(header.parentElement).toHaveStyle({ width: `${String(192 + 20)}px` });
    expect(screen.getByRole("columnheader", { name: "Client" }).parentElement).toHaveStyle({
      width: `${String(60 + 20)}px`,
    });
  });

  it("shows the whole text of a cut header when the keyboard is on it, and Escape hides it", async () => {
    const user = userEvent.setup();
    render(longTable());
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowUp}");
    const header = screen.getByRole("columnheader", { name: REMARK });
    expect(header).toHaveFocus();
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(`Column${REMARK}`);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    // A header that is whole has no tooltip.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("columnheader", { name: "Client" })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await expectAccessible();
  });
});

describe("ChartTable with long headers, under the pointer", () => {
  tableViewport({ width: 1024, height: 400 });
  afterEach(() => {
    vi.useRealTimers();
  });
  const REMARK = "Hold for vendor data of the pump skid, see the latest datasheet revision";

  it("shows the whole text of a cut header after the delay, and only while the pointer is on it", () => {
    vi.useFakeTimers();
    render(
      <ChartTable
        aria-label="Holds by remark, table"
        columns={[
          { id: "row", header: "Discipline", isRowHeader: true },
          { id: "col-0", header: REMARK, isNumber: true },
          { id: "col-1", header: "Client", isNumber: true },
        ]}
        rows={[{ key: "piping", cells: ["Piping", "12", "4"], values: ["Piping", 12, 4] }]}
      />,
    );
    const cut = screen.getByRole("columnheader", { name: REMARK });
    fireEvent.pointerOver(cut, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent(REMARK);
    // On a header that is whole, or on a cell, it goes.
    fireEvent.pointerOver(screen.getByRole("columnheader", { name: "Client" }), {
      pointerType: "mouse",
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    // A pointer that only crosses a cut header shows nothing.
    fireEvent.pointerOver(cut, { pointerType: "mouse" });
    fireEvent.pointerOver(screen.getByRole("rowheader", { name: "Piping" }), {
      pointerType: "mouse",
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("ChartViewToggle", () => {
  function Toggle() {
    const [view, setView] = useState<"chart" | "table">("chart");
    return (
      <>
        <ChartViewToggle view={view} onChange={setView} />
        <p>{view}</p>
      </>
    );
  }

  it("turns the table view on and off and keeps the focus", async () => {
    const user = userEvent.setup();
    render(<Toggle />);
    const toggle = screen.getByRole("button", { name: "Table view" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("table")).toBeInTheDocument();
    expect(toggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("chart")).toBeInTheDocument();
    await expectAccessible();
  });
});
