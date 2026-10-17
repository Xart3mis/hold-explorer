import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { Button } from "../Button/Button";
import { Disclosure, DisclosureGroup, DisclosureStatement } from "./Disclosure";

describe("Disclosure", () => {
  it("is a button named by its title that says it is closed, with its detail off the page", () => {
    render(<Disclosure title="12 rows were skipped">The rows</Disclosure>);
    const toggle = screen.getByRole("button", { name: "12 rows were skipped" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The rows")).not.toBeInTheDocument();
  });

  it("takes its count into its name", () => {
    render(
      <Disclosure title="Release dates that cannot be read" count="37 times">
        The examples
      </Disclosure>,
    );
    expect(
      screen.getByRole("button", { name: "Release dates that cannot be read 37 times" }),
    ).toBeInTheDocument();
  });

  it("shows its summary whether it is open or closed", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure
        title="12 rows were skipped"
        summary="A row is left out when its line ID is blank."
      >
        The rows
      </Disclosure>,
    );
    expect(screen.getByText("A row is left out when its line ID is blank.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "12 rows were skipped" }));
    expect(screen.getByText("A row is left out when its line ID is blank.")).toBeVisible();
  });

  it("is reached by Tab, and opens and closes on Enter and on Space", async () => {
    const user = userEvent.setup();
    render(<Disclosure title="12 rows were skipped">The rows</Disclosure>);
    const toggle = screen.getByRole("button", { name: "12 rows were skipped" });

    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The rows")).toBeVisible();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The rows")).not.toBeInTheDocument();

    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The rows")).toBeVisible();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // It keeps the focus through all of it.
    expect(toggle).toHaveFocus();
  });

  it("opens and closes on a click, and says which detail it controls", async () => {
    const user = userEvent.setup();
    render(<Disclosure title="12 rows were skipped">The rows</Disclosure>);
    const toggle = screen.getByRole("button", { name: "12 rows were skipped" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(panel).toHaveTextContent("The rows");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("starts open when it is asked to", () => {
    render(
      <Disclosure title="Open holds" defaultExpanded>
        The holds
      </Disclosure>,
    );
    expect(screen.getByRole("button", { name: "Open holds" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("The holds")).toBeVisible();
  });

  it("makes its title a heading of the level it is given, and no heading otherwise", () => {
    const { rerender } = render(
      <Disclosure title="Column mapping" level={2}>
        The mapping
      </Disclosure>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Column mapping" });
    expect(within(heading).getByRole("button", { name: "Column mapping" })).toBeInTheDocument();

    rerender(<Disclosure title="Column mapping">The mapping</Disclosure>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column mapping" })).toBeInTheDocument();
  });

  it("keeps its action outside the button that opens it", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <Disclosure
        title="Column mapping"
        action={
          <Button variant="quiet" onPress={onPress}>
            Change mapping
          </Button>
        }
      >
        The mapping
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "Column mapping" });
    const action = screen.getByRole("button", { name: "Change mapping" });
    expect(toggle).not.toContainElement(action);
    await user.click(action);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The row first, then its action.
    await user.tab({ shift: true });
    expect(toggle).toHaveFocus();
  });

  it("stands in a group, where a statement takes the place of a row with nothing to open", () => {
    render(
      <DisclosureGroup>
        <DisclosureStatement>No rows were skipped.</DisclosureStatement>
        <Disclosure title="Cells with a spreadsheet error" count="1 time">
          The cells
        </Disclosure>
      </DisclosureGroup>,
    );
    const statement = screen.getByText("No rows were skipped.");
    expect(statement.closest('[data-part="disclosure-group"]')).toContainElement(
      screen.getByRole("button", { name: "Cells with a spreadsheet error 1 time" }),
    );
    // A statement is text: there is one button, the row that opens.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("has no accessibility violation, closed and open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DisclosureGroup>
        <DisclosureStatement>No rows were skipped.</DisclosureStatement>
        <Disclosure
          title="Release dates that cannot be read"
          count="37 times"
          summary="The hold is kept, without a release date."
          level={3}
        >
          The examples
        </Disclosure>
      </DisclosureGroup>,
    );
    await expectAccessible(container);
    await user.click(screen.getByRole("button", { name: /Release dates/ }));
    await expectAccessible(container);
  });
});
