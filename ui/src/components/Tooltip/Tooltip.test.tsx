import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { Button } from "../Button/Button";
import { Tooltip } from "./Tooltip";

afterEach(() => {
  vi.useRealTimers();
});

describe("Tooltip", () => {
  it("shows under the pointer only after the tooltip delay of DESIGN.md", () => {
    vi.useFakeTimers();
    render(
      <Tooltip text="Import a holds export">
        <Button>Import</Button>
      </Tooltip>,
    );
    const button = screen.getByRole("button", { name: "Import" });
    // The pointer moves, so the tooltip knows a pointer is in use, and then rests on the button.
    fireEvent.pointerMove(document.body, { pointerType: "mouse" });
    fireEvent.pointerEnter(button, { pointerType: "mouse" });

    // --delay-tooltip is 500ms. The component library's own default would be 1500ms.
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Import a holds export");
  });

  it("shows at once on keyboard focus and describes its control", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip text="Import a holds export" shortcut="Ctrl+I">
        <Button>Import</Button>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.tab();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Import a holds export");
    expect(tooltip).toHaveTextContent("Ctrl+I");
    expect(screen.getByRole("button", { name: "Import" })).toHaveAccessibleDescription(
      /Import a holds export/,
    );
  });

  it("goes on Escape, without moving focus, and when focus leaves", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip text="Import a holds export">
          <Button>Import</Button>
        </Tooltip>
        <Button>Export</Button>
      </>,
    );
    await user.tab();
    await screen.findByRole("tooltip");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toHaveFocus();

    await user.tab({ shift: true });
    await user.tab();
    await screen.findByRole("tooltip");
    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("stays away while it is switched off", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Tooltip text="Import a holds export" isDisabled>
        <Button>Import</Button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Import" })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    rerender(
      <Tooltip text="Import a holds export">
        <Button>Import</Button>
      </Tooltip>,
    );
    await user.tab({ shift: true });
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Import a holds export");
  });

  it("never takes focus and holds nothing that can be pressed", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip text="Import a holds export">
        <Button>Import</Button>
      </Tooltip>,
    );
    await user.tab();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.querySelector("button, a, [tabindex]")).toBeNull();
    expect(screen.getByRole("button", { name: "Import" })).toHaveFocus();
  });

  it("has no accessibility violation while it shows", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip text="Import a holds export" shortcut="Ctrl+I">
        <Button>Import</Button>
      </Tooltip>,
    );
    await user.tab();
    await screen.findByRole("tooltip");
    await expectAccessible();
  });
});
