import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { ChoiceGroup, type ChoiceGroupProps } from "./ChoiceGroup";

const options = [
  { value: "is", label: "Is" },
  {
    value: "is-not",
    label: "Is not",
    description: "Keeps every hold that has none of the values.",
  },
  { value: "any", label: "Any" },
];

function Held({
  onChange,
  ...props
}: Partial<ChoiceGroupProps> & { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("is");
  return (
    <ChoiceGroup
      label="Discipline"
      options={options}
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("ChoiceGroup", () => {
  it("is a named group of radios, of which the chosen one is checked", () => {
    render(<Held />);
    const group = screen.getByRole("radiogroup", { name: "Discipline" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: "Is" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Is not" })).not.toBeChecked();
  });

  it("describes an option by its description, which is not part of its name", () => {
    render(<Held />);
    expect(screen.getByRole("radio", { name: "Is not" })).toHaveAccessibleDescription(
      "Keeps every hold that has none of the values.",
    );
  });

  it("is one stop for Tab, on the chosen option, and moves the choice with the arrow keys", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Held onChange={onChange} />
        <button type="button">After</button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole("radio", { name: "Is" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Is not" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Is not" })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith("is-not");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Any" })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith("any");

    await user.keyboard("{ArrowUp}");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Is" })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith("is");
    expect(onChange).toHaveBeenCalledTimes(4);

    // The whole group was one stop.
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("is chosen by a click anywhere on the row of an option", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Held onChange={onChange} />);
    await user.click(screen.getByText("Is not"));
    expect(onChange).toHaveBeenCalledWith("is-not");
    expect(screen.getByRole("radio", { name: "Is not" })).toBeChecked();
  });

  it("shows the choice it is given", () => {
    render(
      <ChoiceGroup label="Discipline" options={options} value="any" onChange={() => undefined} />,
    );
    expect(screen.getByRole("radio", { name: "Any" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Is" })).not.toBeChecked();
  });

  it("stands in a row when asked to", () => {
    const { rerender } = render(<Held />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-orientation", "vertical");
    rerender(<Held orientation="horizontal" />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-orientation", "horizontal");
  });

  it("when disabled, takes no focus and changes nothing", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Held isDisabled onChange={onChange} />);
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    await user.tab();
    expect(document.body).toHaveFocus();
    await user.click(screen.getByText("Is not"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Is" })).toBeChecked();
  });

  it("has no accessibility violation, enabled and disabled", async () => {
    const { container, rerender } = render(<Held />);
    await expectAccessible(container);
    rerender(<Held isDisabled orientation="horizontal" />);
    await expectAccessible(container);
  });
});
