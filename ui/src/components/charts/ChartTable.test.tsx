import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectAccessible } from "../../test/axe";
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
    expect(rows[1]).not.toHaveAttribute("aria-selected");
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
