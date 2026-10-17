import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCount } from "../../text/format";
import { expectAccessible } from "../../test/axe";
import { Heatmap, type HeatmapProps } from "./Heatmap";
import { step } from "./scale";

afterEach(() => {
  vi.useRealTimers();
});

const rows = [
  { key: "civil", label: "Civil" },
  { key: "piping", label: "Piping" },
];
const cols = [
  { key: "design", label: "Design" },
  { key: "vendor", label: "Vendor data for the compressor skid, revision C" },
];
// Two real rows and Other; two real columns and Other.
const cells = [
  [12, 0, 3],
  [70, 5, 1],
  [2, 9, 40],
];

function heatmap(props: Partial<HeatmapProps> = {}) {
  return (
    <Heatmap
      aria-label="Holds by discipline and hold type"
      rows={rows}
      cols={cols}
      cells={cells}
      max={70}
      otherRow="Other"
      otherCol="Other"
      rowsLabel="Discipline"
      colsLabel="Hold type"
      valueLabel="Holds"
      formatCell={formatCount}
      {...props}
    />
  );
}

/** The cells of the grid, row by row, as the user reaches them. */
function gridCells(): HTMLElement[][] {
  return screen
    .getAllByRole("row")
    .map((row) => within(row).queryAllByRole("gridcell"))
    .filter((row) => row.length > 0);
}

function cell(row: number, col: number): HTMLElement {
  const found = gridCells()[row]?.[col];
  if (!found) throw new Error(`No cell at ${String(row)}, ${String(col)}`);
  return found;
}

describe("Heatmap", () => {
  it("names its rows and columns and prints every value that is not zero", () => {
    render(heatmap());
    const grid = screen.getByRole("grid", { name: "Holds by discipline and hold type" });
    const headers = within(grid).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Discipline",
      "Design",
      "Vendor data for the compressor skid, revision C",
      "Other",
    ]);
    expect(
      within(grid)
        .getAllByRole("rowheader")
        .map((header) => header.textContent),
    ).toEqual(["Civil", "Piping", "Other"]);
    expect(cell(1, 0)).toHaveAccessibleName("70");
    expect(cell(0, 0)).toHaveTextContent("12");
  });

  it("colors a cell by the step of its value alone", () => {
    render(heatmap());
    cells.forEach((values, r) => {
      values.forEach((value, c) => {
        expect(cell(r, c)).toHaveAttribute("data-step", String(step(value, 70, 7)));
      });
    });
  });

  it("leaves an empty cell unfilled and without a printed value, and still names it", () => {
    render(heatmap());
    const empty = cell(0, 1);
    expect(empty).toHaveAttribute("data-step", "0");
    expect(empty).toHaveAccessibleName("0");
    // The zero is there for assistive technology only: the empty square is what the eye reads.
    expect(empty.querySelector("[data-part=value]")).toBeNull();
  });

  it("is one stop in the Tab order, and the arrow keys move across rows and columns", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        {heatmap()}
        <button type="button">After</button>
      </>,
    );
    await user.tab();
    await user.tab();
    expect(cell(0, 0)).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(cell(0, 1)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(cell(1, 1)).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(cell(1, 0)).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(cell(0, 0)).toHaveFocus();
    await user.keyboard("{ArrowDown}");

    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    // Back in, the grid gives the focus to the cell the keyboard was last on.
    await user.tab({ shift: true });
    expect(cell(1, 0)).toHaveFocus();
  });

  it("moves into Other like into any row and column, and jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(heatmap());
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(cell(0, 2)).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(cell(2, 2)).toHaveFocus();
    // The edges hold.
    await user.keyboard("{ArrowDown}{ArrowRight}");
    expect(cell(2, 2)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(cell(2, 0)).toHaveFocus();
    await user.keyboard("{End}");
    expect(cell(2, 2)).toHaveFocus();
    await user.keyboard("{Control>}{Home}{/Control}");
    expect(cell(0, 0)).toHaveFocus();
    await user.keyboard("{Control>}{End}{/Control}");
    expect(cell(2, 2)).toHaveFocus();
  });

  it("presses a real cell with Enter or a click, and never a cell of Other", async () => {
    const user = userEvent.setup();
    const onCellPress = vi.fn();
    render(heatmap({ onCellPress }));
    await user.tab();
    await user.keyboard("{ArrowDown}{ArrowRight}{Enter}");
    expect(onCellPress).toHaveBeenCalledWith("piping", "vendor");

    onCellPress.mockClear();
    await user.keyboard("{ArrowRight}{Enter}");
    await user.keyboard("{ArrowDown}{Enter}");
    await user.keyboard("{ArrowLeft}{Enter}");
    await user.click(cell(2, 0));
    await user.click(cell(0, 2));
    expect(onCellPress).not.toHaveBeenCalled();

    await user.click(cell(0, 0));
    expect(onCellPress).toHaveBeenCalledWith("civil", "design");
  });

  it("presses nothing where the screen gives no action", async () => {
    const user = userEvent.setup();
    render(heatmap());
    await user.tab();
    await user.keyboard("{Enter}");
    expect(cell(0, 0)).toHaveFocus();
  });

  it("shows the full labels and the value of a cell in a tooltip at once on focus", async () => {
    const user = userEvent.setup();
    render(heatmap());
    await user.tab();
    await user.keyboard("{ArrowRight}");
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Civil");
    expect(tooltip).toHaveTextContent("Vendor data for the compressor skid, revision C");
    expect(tooltip).toHaveTextContent("Holds");
    expect(tooltip).toHaveTextContent("0");
    expect(cell(0, 1)).toHaveAccessibleDescription(/Vendor data for the compressor skid/);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(cell(0, 1)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Piping");

    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the tooltip under the pointer only after the tooltip delay", () => {
    vi.useFakeTimers();
    render(heatmap());
    fireEvent.pointerEnter(cell(1, 0), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("70");

    // Once it shows, it follows the pointer without waiting again.
    fireEvent.pointerEnter(cell(2, 2), { pointerType: "mouse" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("40");
    fireEvent.pointerLeave(screen.getByRole("grid"), { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("lets the keyboard lead while the pointer rests on another cell", () => {
    vi.useFakeTimers();
    render(heatmap());
    act(() => {
      cell(0, 0).focus();
    });
    fireEvent.pointerEnter(cell(2, 2), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("40");

    fireEvent.keyDown(cell(0, 0), { key: "ArrowDown" });
    expect(cell(1, 0)).toHaveFocus();
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Piping");
    expect(tooltip).toHaveTextContent("70");
    expect(cell(1, 0)).toHaveAttribute("aria-describedby", tooltip.id);
    expect(cell(2, 2)).not.toHaveAttribute("aria-describedby");
  });

  it("shows a legend from the domain it is given", () => {
    render(heatmap({ max: 1515 }));
    const legend = screen.getByRole("group", { name: "Legend" });
    expect(legend).toHaveTextContent("0");
    expect(legend).toHaveTextContent("Fewer");
    expect(legend).toHaveTextContent("More, up to 1,515");
  });

  it("shows the same numbers in its table view", () => {
    render(heatmap({ view: "table" }));
    expect(screen.queryByRole("grid", { name: "Holds by discipline and hold type" })).toBeNull();
    const table = screen.getByRole("grid", { name: "Holds by discipline and hold type, table" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Discipline", "Design", "Vendor data for the compressor skid, revision C", "Other"]);
    const bodyRows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        [...within(row).getAllByRole("rowheader"), ...within(row).getAllByRole("gridcell")].map(
          (part) => part.textContent,
        ),
      );
    expect(bodyRows).toEqual([
      ["Civil", "12", "0", "3"],
      ["Piping", "70", "5", "1"],
      ["Other", "2", "9", "40"],
    ]);
  });

  it("draws one cell and no Other when the command folded nothing", () => {
    render(
      heatmap({
        rows: [{ key: "civil", label: "Civil" }],
        cols: [{ key: "design", label: "Design" }],
        cells: [[4]],
        max: 4,
        otherRow: undefined,
        otherCol: undefined,
      }),
    );
    expect(gridCells()).toHaveLength(1);
    expect(cell(0, 0)).toHaveAttribute("data-step", "7");
    expect(screen.queryByText("Other")).toBeNull();
  });

  it("shows a skeleton on a first load and the empty state of the screen when there is nothing", () => {
    const { rerender } = render(heatmap({ isLoading: true }));
    expect(screen.queryByRole("gridcell")).toBeNull();
    expect(screen.getByText("Loading")).toBeInTheDocument();

    rerender(
      heatmap({
        rows: [],
        cols: [],
        cells: [],
        max: 0,
        otherRow: undefined,
        otherCol: undefined,
        emptyState: <p>No holds match these filters</p>,
      }),
    );
    expect(screen.getByText("No holds match these filters")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("dims the previous grid while it is read again", () => {
    render(heatmap({ isStale: true }));
    expect(screen.getByRole("grid").closest("[data-stale]")).not.toBeNull();
  });

  it("has no accessibility violation, as a chart with a tooltip and as a table", async () => {
    const user = userEvent.setup();
    const { rerender } = render(heatmap({ onCellPress: () => undefined }));
    await user.tab();
    await screen.findByRole("tooltip");
    await expectAccessible();
    rerender(heatmap({ view: "table" }));
    await expectAccessible();
  });
});
