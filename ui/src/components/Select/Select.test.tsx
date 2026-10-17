import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
import { Select } from "./Select";

const options = [
  { id: "discipline", label: "Discipline" },
  { id: "hold-type", label: "Hold type" },
  { id: "role", label: "Role" },
  { id: "blocker-type", label: "Blocker type", isDisabled: true },
];

describe("Select", () => {
  it("names its trigger by the label and shows the chosen value", () => {
    render(<Select label="Group by" options={options} selectedKey="hold-type" />);
    const trigger = screen.getByRole("button", { name: /Group by/ });
    expect(trigger).toHaveTextContent("Hold type");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Group by")).toBeVisible();
  });

  it("shows the placeholder while nothing is chosen", () => {
    render(<Select label="Group by" options={options} placeholder="Choose a field" />);
    expect(screen.getByRole("button", { name: /Group by/ })).toHaveTextContent("Choose a field");
  });

  it(
    "opens with the keyboard, moves with the arrow keys, and chooses with Enter",
    SLOW,
    async () => {
      const onSelectionChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Select
          label="Group by"
          options={options}
          defaultSelectedKey="discipline"
          onSelectionChange={onSelectionChange}
        />,
      );
      const trigger = screen.getByRole("button", { name: /Group by/ });

      await user.tab();
      expect(trigger).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      const list = screen.getByRole("listbox");
      expect(within(list).getAllByRole("option")).toHaveLength(4);
      expect(within(list).getByRole("option", { name: "Discipline" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      expect(onSelectionChange).toHaveBeenCalledWith("hold-type");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(trigger).toHaveTextContent("Hold type");
      // Focus goes back to the trigger once the list has closed, on a later turn of the event loop.
      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
    },
  );

  it("closes on Escape without changing the value", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select
        label="Group by"
        options={options}
        defaultSelectedKey="discipline"
        onSelectionChange={onSelectionChange}
      />,
    );
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Group by/ })).toHaveTextContent("Discipline");
  });

  it("jumps to a match when a letter is typed", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(<Select label="Group by" options={options} onSelectionChange={onSelectionChange} />);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard("r");
    await user.keyboard("{Enter}");
    expect(onSelectionChange).toHaveBeenCalledWith("role");
  });

  it("does not choose a disabled option", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(<Select label="Group by" options={options} onSelectionChange={onSelectionChange} />);
    await user.click(screen.getByRole("button", { name: /Group by/ }));
    const option = screen.getByRole("option", { name: "Blocker type" });
    expect(option).toHaveAttribute("aria-disabled", "true");
    await user.click(option);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("shows the detail of an option beside its label", async () => {
    const user = userEvent.setup();
    render(
      <Select
        label="Line ID"
        options={[{ id: "0", label: "LINE NO", detail: "78B01-573-4434-FW-001" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Line ID/ }));
    expect(screen.getByRole("option", { name: /LINE NO/ })).toHaveTextContent(
      "78B01-573-4434-FW-001",
    );
  });

  it("when disabled, does not open", async () => {
    const user = userEvent.setup();
    render(<Select label="Group by" options={options} isDisabled />);
    const trigger = screen.getByRole("button", { name: /Group by/ });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("when inert, waits for another control: busy, deaf to presses and keys, its look and place kept", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select
        label="Group by"
        options={options}
        defaultSelectedKey="discipline"
        onSelectionChange={onSelectionChange}
        isInert
      />,
    );
    const trigger = screen.getByRole("button", { name: /Group by/ });
    expect(trigger).toHaveAttribute("aria-busy", "true");
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(trigger).toHaveAttribute("data-inert");
    expect(trigger).not.toBeDisabled();
    expect(trigger).not.toHaveAttribute("data-disabled");
    expect(trigger.querySelector('[data-part="spinner"]')).toBeNull();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(trigger).toHaveTextContent("Discipline");
  });

  it("in error, links the message to the trigger", () => {
    render(
      <Select
        label="Line ID"
        options={options}
        errorMessage="Choose the column that holds the line ID."
      />,
    );
    expect(screen.getByRole("button", { name: /Line ID/ })).toHaveAccessibleDescription(
      "Choose the column that holds the line ID.",
    );
  });

  it("while loading, shows the spinner in place of the chevron", () => {
    const { rerender } = render(<Select label="Group by" options={options} />);
    const trigger = screen.getByRole("button", { name: /Group by/ });
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(trigger.querySelector('[data-part="spinner"]')).toBeNull();

    rerender(<Select label="Group by" options={options} isPending />);
    expect(trigger.querySelector("svg")).toBeNull();
    expect(trigger.querySelector('[data-part="spinner"]')).not.toBeNull();
  });

  it("says that it is loading, also when it is in error", () => {
    const { rerender } = render(<Select label="Line ID" options={options} isPending />);
    const trigger = screen.getByRole("button", { name: /Line ID/ });
    expect(trigger).toHaveAccessibleDescription(en.common.loading);

    rerender(
      <Select label="Line ID" options={options} isPending errorMessage="Choose a column." />,
    );
    expect(trigger).toHaveAccessibleDescription(`Choose a column. ${en.common.loading}`);
  });

  it("has no accessibility violation closed, open, disabled, and in error", SLOW, async () => {
    const user = userEvent.setup();
    render(
      <>
        <Select
          label="Group by"
          options={options}
          defaultSelectedKey="role"
          description="Rows are grouped by this field."
        />
        <Select label="Disabled" options={options} isDisabled />
        <Select label="In error" options={options} errorMessage="Choose a field." />
        <Select label="Loading" options={options} isPending />
      </>,
    );
    await expectAccessible();
    await user.click(screen.getByRole("button", { name: /Group by/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await expectAccessible();
  });
});
