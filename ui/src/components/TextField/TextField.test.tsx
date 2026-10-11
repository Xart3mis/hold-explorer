import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("takes its visible label as its accessible name", () => {
    render(<TextField label="Workspace name" />);
    expect(screen.getByRole("textbox", { name: "Workspace name" })).toBeInTheDocument();
    expect(screen.getByText("Workspace name")).toBeVisible();
  });

  it("is reached by Tab and takes typed text", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField label="Workspace name" onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "Workspace name" });

    await user.tab();
    expect(field).toHaveFocus();
    await user.keyboard("Unit 573");
    expect(field).toHaveValue("Unit 573");
    expect(onChange).toHaveBeenLastCalledWith("Unit 573");
  });

  it("links its helper line as its description", () => {
    render(<TextField label="Workspace name" description="Shown in the workspace switcher." />);
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "Shown in the workspace switcher.",
    );
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("in error, is invalid and shows the message in place of the helper line", () => {
    render(
      <TextField
        label="Snapshot date"
        description="The date of the report."
        errorMessage="This is not a date. Enter it as day, month, year, for example 28/02/2026."
        defaultValue="31/02/2026"
      />,
    );
    const field = screen.getByRole("textbox", { name: "Snapshot date" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      "This is not a date. Enter it as day, month, year, for example 28/02/2026.",
    );
    expect(screen.queryByText("The date of the report.")).not.toBeInTheDocument();
  });

  it("when disabled, takes neither focus nor text", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField label="Author name" defaultValue="sico" isDisabled onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "Author name" });
    expect(field).toBeDisabled();

    await user.tab();
    expect(field).not.toHaveFocus();
    await user.type(field, "x");
    expect(field).toHaveValue("sico");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("while loading, stays editable and says that it is loading", async () => {
    const user = userEvent.setup();
    render(<TextField label="Workspace name" isPending />);
    const field = screen.getByRole("textbox", { name: "Workspace name" });
    expect(field).toHaveAccessibleDescription(en.common.loading);
    expect(field.parentElement?.querySelector('[data-part="spinner"]')).not.toBeNull();

    await user.type(field, "Unit");
    expect(field).toHaveValue("Unit");
  });

  it("shows a placeholder as an example, never as the label", () => {
    render(<TextField label="Snapshot date" placeholder="28/02/2026" />);
    expect(screen.getByRole("textbox", { name: "Snapshot date" })).toHaveAttribute(
      "placeholder",
      "28/02/2026",
    );
  });

  it("has no accessibility violation in any state", async () => {
    const { container } = render(
      <>
        <TextField label="Default" />
        <TextField label="With help" description="Shown in the workspace switcher." />
        <TextField label="In error" errorMessage="Enter a name." />
        <TextField label="Disabled" isDisabled defaultValue="sico" />
        <TextField label="Loading" isPending />
      </>,
    );
    await expectAccessible(container);
  });
});
