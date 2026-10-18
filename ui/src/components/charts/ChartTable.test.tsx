import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectAccessible } from "../../test/axe";
import { tableViewport } from "../../test/viewport";
import { ChartTable, ChartViewToggle } from "./ChartTable";

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
          { key: "civil", cells: ["Civil", "1,515"] },
          { key: "piping", cells: ["Piping", "1,285"] },
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
        rows={[{ key: "piping", cells: ["Piping", "12", "4"] }]}
      />
    );
  }

  it("cuts a long header, and keeps its whole text as the name of its column", () => {
    render(longTable());
    const header = screen.getByRole("columnheader", { name: REMARK });
    // The stand-in widths of a test: 7 px for a character, 12 px padding. The header makes room
    // for 24 characters of it, not for the whole of it.
    expect(header.parentElement).toHaveStyle({ width: "192px" });
    expect(screen.getByRole("columnheader", { name: "Client" }).parentElement).toHaveStyle({
      width: "60px",
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
