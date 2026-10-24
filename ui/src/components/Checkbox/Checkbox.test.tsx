import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("takes its label as its accessible name", () => {
    render(<Checkbox>Include my notes</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "Include my notes" })).not.toBeChecked();
  });

  it("is reached by Tab and toggled by Space", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox onChange={onChange}>Include my notes</Checkbox>);
    const box = screen.getByRole("checkbox", { name: "Include my notes" });

    await user.tab();
    expect(box).toHaveFocus();
    await user.keyboard(" ");
    expect(box).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(true);
    await user.keyboard(" ");
    expect(box).not.toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("is toggled by a click anywhere on its row", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox onChange={onChange}>Include my notes</Checkbox>);
    await user.click(screen.getByText("Include my notes"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("when disabled, is not toggled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Checkbox isDisabled onChange={onChange}>
        Include my notes
      </Checkbox>,
    );
    const box = screen.getByRole("checkbox", { name: "Include my notes" });
    expect(box).toBeDisabled();
    await user.tab();
    expect(box).not.toHaveFocus();
    await user.click(screen.getByText("Include my notes"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the mixed state", () => {
    render(<Checkbox isIndeterminate>All columns</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "All columns" })).toBePartiallyChecked();
  });

  it("is marked invalid when in error", () => {
    render(<Checkbox isInvalid>Confirm the date</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "Confirm the date" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows what is wrong under it and links the message as its description", () => {
    render(
      <Checkbox errorMessage="Confirm the date, or enter another one.">Confirm the date</Checkbox>,
    );
    const box = screen.getByRole("checkbox", { name: "Confirm the date" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Confirm the date, or enter another one.");
  });

  it("has no accessibility violation in any state", async () => {
    const { container } = render(
      <>
        <Checkbox>Unchecked</Checkbox>
        <Checkbox defaultSelected>Checked</Checkbox>
        <Checkbox isIndeterminate>Mixed</Checkbox>
        <Checkbox isDisabled>Disabled</Checkbox>
        <Checkbox isDisabled defaultSelected>
          Disabled and checked
        </Checkbox>
        <Checkbox isInvalid>In error</Checkbox>
        <Checkbox errorMessage="Confirm the date, or enter another one.">With a message</Checkbox>
      </>,
    );
    await expectNoAxeViolations(container);
  });
});
