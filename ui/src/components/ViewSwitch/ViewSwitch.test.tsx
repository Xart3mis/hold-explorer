import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { ViewSwitch } from "./ViewSwitch";

const views = [
  { id: "lines", label: "Lines" },
  { id: "holds", label: "Holds" },
];

describe("ViewSwitch", () => {
  it("is a named choice of views, the one in view checked", async () => {
    render(<ViewSwitch aria-label="Rows to show" views={views} value="lines" onChange={vi.fn()} />);
    const group = screen.getByRole("radiogroup", { name: "Rows to show" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Lines" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Holds" })).not.toBeChecked();
    await expectNoAxeViolations();
  });

  it("is one stop for Tab; the arrow keys move between the views and choose them", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ViewSwitch aria-label="Rows to show" views={views} value="lines" onChange={onChange} />,
    );
    await user.tab();
    expect(screen.getByRole("radio", { name: "Lines" })).toHaveFocus();
    // The view reached is the view chosen.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Holds" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("holds");
    rerender(
      <ViewSwitch aria-label="Rows to show" views={views} value="holds" onChange={onChange} />,
    );
    expect(screen.getByRole("radio", { name: "Holds" })).toBeChecked();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("lines");
    rerender(
      <ViewSwitch aria-label="Rows to show" views={views} value="lines" onChange={onChange} />,
    );
    // Enter on the view in view chooses nothing new.
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(2);
    // Tab leaves the group: it is one stop.
    await user.tab();
    expect(screen.getByRole("radio", { name: "Holds" })).not.toHaveFocus();
    expect(screen.getByRole("radio", { name: "Lines" })).not.toHaveFocus();
  });

  it("reports a view that is pressed, and nothing for the view in view", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ViewSwitch aria-label="Rows to show" views={views} value="lines" onChange={onChange} />,
    );
    await user.click(screen.getByRole("radio", { name: "Lines" }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Holds" }));
    expect(onChange).toHaveBeenCalledWith("holds");
  });
});
