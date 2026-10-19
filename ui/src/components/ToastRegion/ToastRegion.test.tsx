import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { ToastRegion, useToast, type ToastApi } from "./ToastRegion";

let toast: ToastApi;

function Capture() {
  const api = useToast();
  useEffect(() => {
    toast = api;
  }, [api]);
  return <input aria-label="Workspace name" />;
}

function setup() {
  render(
    <ToastRegion>
      <Capture />
    </ToastRegion>,
  );
}

function show(...args: Parameters<ToastApi["show"]>) {
  let id = "";
  act(() => {
    id = toast.show(...args);
  });
  return id;
}

// A toast stays for --timeout-toast, which the token stylesheet of the tests gives as 8000ms.
afterEach(() => {
  vi.useRealTimers();
});

describe("ToastRegion", () => {
  it("is a named region whose toasts are announced politely", () => {
    setup();
    const region = screen.getByRole("region", { name: en.toast.region });
    const live = within(region).getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toBeEmptyDOMElement();

    show({ message: "Snapshot of 30 Sep 2026 deleted." });
    expect(live).toHaveTextContent("Snapshot of 30 Sep 2026 deleted.");
  });

  it("never takes focus", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("textbox", { name: "Workspace name" }));
    show({
      message: "Workspace renamed.",
      action: { label: "Undo", onAction: () => undefined, isUndo: true },
    });
    expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveFocus();
  });

  it("calls the action of a toast once and then removes the toast", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    setup();
    show({ message: "Snapshot deleted.", action: { label: "Undo", onAction, isUndo: true } });

    await user.tab();
    await user.tab();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Snapshot deleted.")).not.toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("triggers the action of the newest toast on Ctrl+Z, once", async () => {
    const older = vi.fn();
    const newest = vi.fn();
    const user = userEvent.setup();
    setup();
    show({
      message: "Snapshot deleted.",
      action: { label: "Undo", onAction: older, isUndo: true },
    });
    show({
      message: "Workspace renamed.",
      action: { label: "Undo", onAction: newest, isUndo: true },
    });

    await user.keyboard("{Control>}z{/Control}");
    expect(newest).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
    expect(screen.queryByText("Workspace renamed.")).not.toBeInTheDocument();
    expect(screen.getByText("Snapshot deleted.")).toBeInTheDocument();
  });

  it("leaves Ctrl+Z to a text field that has focus, and to a newest toast without an action", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    setup();
    show({ message: "Snapshot deleted.", action: { label: "Undo", onAction, isUndo: true } });

    await user.click(screen.getByRole("textbox", { name: "Workspace name" }));
    await user.keyboard("{Control>}z{/Control}");
    expect(onAction).not.toHaveBeenCalled();

    show({ message: "Snapshot imported." });
    await user.tab();
    await user.keyboard("{Control>}z{/Control}");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("offers a second action after the first, each reached by Tab and run by Enter, once", async () => {
    const open = vi.fn();
    const reveal = vi.fn();
    const user = userEvent.setup();
    setup();
    const actions = {
      action: { label: "Open file", onAction: open },
      secondaryAction: { label: "Show in folder", onAction: reveal },
    };
    show({ message: "Saved Lines.xlsx", ...actions });

    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Open file" })).toHaveFocus();
    await user.tab();
    const second = screen.getByRole("button", { name: "Show in folder" });
    expect(second).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved Lines.xlsx")).not.toBeInTheDocument();

    show({ message: "Saved Holds.csv", ...actions });
    await user.tab();
    expect(screen.getByRole("button", { name: "Open file" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(open).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Saved Holds.csv")).not.toBeInTheDocument();
  });

  it("leaves Ctrl+Z to undo alone: never the second action, never an action that is no undo", async () => {
    const undo = vi.fn();
    const open = vi.fn();
    const reveal = vi.fn();
    const user = userEvent.setup();
    setup();
    show({ message: "Snapshot deleted.", action: { label: "Undo", onAction: undo, isUndo: true } });
    show({
      message: "Saved Lines.xlsx",
      action: { label: "Open file", onAction: open },
      secondaryAction: { label: "Show in folder", onAction: reveal },
    });

    await user.keyboard("{Control>}z{/Control}");
    expect(open).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
    expect(screen.getByText("Saved Lines.xlsx")).toBeInTheDocument();

    show({
      message: "Workspace renamed.",
      action: { label: "Undo", onAction: undo, isUndo: true },
      secondaryAction: { label: "Show in folder", onAction: reveal },
    });
    await user.keyboard("{Control>}z{/Control}");
    expect(undo).toHaveBeenCalledTimes(1);
    expect(reveal).not.toHaveBeenCalled();
  });

  it("is closed by its close button", async () => {
    const user = userEvent.setup();
    setup();
    show({ message: "Snapshot imported." });
    await user.click(screen.getByRole("button", { name: en.common.dismiss }));
    expect(screen.queryByText("Snapshot imported.")).not.toBeInTheDocument();
  });

  it("is closed by its id", () => {
    setup();
    const id = show({ message: "Snapshot imported." });
    act(() => {
      toast.dismiss(id);
    });
    expect(screen.queryByText("Snapshot imported.")).not.toBeInTheDocument();
  });

  it("stacks at most three, newest last", () => {
    setup();
    for (const message of ["First.", "Second.", "Third.", "Fourth."]) show({ message });
    const live = screen.getByRole("status");
    expect(live.querySelectorAll('[data-part="toast"]')).toHaveLength(3);
    expect(live).not.toHaveTextContent("First.");
    expect(live.lastElementChild).toHaveTextContent("Fourth.");
  });

  it("never drops a toast that carries an undo for a fourth toast", () => {
    setup();
    const undo = { label: "Undo", onAction: () => undefined, isUndo: true };
    show({ message: "Snapshot deleted.", action: undo });
    show({ message: "Snapshot imported." });
    show({ message: "Workspace renamed.", action: undo });
    show({ message: "Mapping saved." });
    const live = screen.getByRole("status");
    // The oldest toast without an action went, not the oldest toast.
    expect(live.querySelectorAll('[data-part="toast"]')).toHaveLength(3);
    expect(live).toHaveTextContent("Snapshot deleted.");
    expect(live).not.toHaveTextContent("Snapshot imported.");
    expect(live).toHaveTextContent("Workspace renamed.");
    expect(live.lastElementChild).toHaveTextContent("Mapping saved.");

    // With an undo on each of three, a fourth drops none of them: the stack is taller for a while.
    show({ message: "Theme changed.", action: undo });
    show({ message: "Density changed.", action: undo });
    expect(live).not.toHaveTextContent("Mapping saved.");
    expect(
      [...live.querySelectorAll('[data-part="toast"]')].map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("Snapshot deleted."),
      expect.stringContaining("Workspace renamed."),
      expect.stringContaining("Theme changed."),
      expect.stringContaining("Density changed."),
    ]);
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(4);
  });

  it("pushes out a toast whose actions are no undo, as it does one without an action", () => {
    setup();
    const undo = { label: "Undo", onAction: () => undefined, isUndo: true };
    const saved = {
      action: { label: "Open file", onAction: () => undefined },
      secondaryAction: { label: "Show in folder", onAction: () => undefined },
    };
    show({ message: "Saved Lines.xlsx", ...saved });
    show({ message: "Snapshot deleted.", action: undo });
    show({ message: "Saved Holds.csv", ...saved });
    show({ message: "Mapping saved." });
    const live = screen.getByRole("status");
    expect(
      [...live.querySelectorAll('[data-part="toast"]')].map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("Snapshot deleted."),
      expect.stringContaining("Saved Holds.csv"),
      expect.stringContaining("Mapping saved."),
    ]);
  });

  it("moves the focus to the next toast when the focused one goes, and to the one before it at the end", async () => {
    const user = userEvent.setup();
    setup();
    show({ message: "First." });
    show({ message: "Second." });
    show({ message: "Third." });
    const toastOf = (message: string) => {
      const found = screen.getByText(message).closest('[data-part="toast"]');
      if (!(found instanceof HTMLElement)) throw new Error(`No toast says ${message}`);
      return found;
    };
    const closeOf = (message: string) =>
      within(toastOf(message)).getByRole("button", { name: en.common.dismiss });

    await user.click(screen.getByRole("textbox", { name: "Workspace name" }));
    await user.tab();
    expect(closeOf("First.")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("First.")).not.toBeInTheDocument();
    // The toast itself has the focus, not a button of it: Enter again closes nothing.
    expect(toastOf("Second.")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Second.")).toBeInTheDocument();
    // It was made focusable for that moment only, and a toast that was not is not.
    expect(toastOf("Third.")).not.toHaveAttribute("tabindex");

    // The last toast goes: the one before it takes the focus.
    await user.tab();
    await user.tab();
    expect(closeOf("Third.")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Third.")).not.toBeInTheDocument();
    expect(toastOf("Second.")).toHaveFocus();

    // Once the focus has left it, a click on its text does not bring the focus back.
    await user.tab();
    expect(closeOf("Second.")).toHaveFocus();
    expect(toastOf("Second.")).not.toHaveAttribute("tabindex");
  });

  it("gives the focus back to where it was before the toasts took it, when the last toast goes", async () => {
    const user = userEvent.setup();
    setup();
    const field = screen.getByRole("textbox", { name: "Workspace name" });
    await user.click(field);
    show({
      message: "Snapshot deleted.",
      action: { label: "Undo", onAction: () => undefined, isUndo: true },
    });
    await user.tab();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Snapshot deleted.")).not.toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it("leaves the focus alone when a toast goes that does not hold it", async () => {
    const user = userEvent.setup();
    setup();
    const field = screen.getByRole("textbox", { name: "Workspace name" });
    await user.click(field);
    const id = show({ message: "Snapshot imported." });
    show({ message: "Mapping saved." });
    act(() => {
      toast.dismiss(id);
    });
    expect(screen.queryByText("Snapshot imported.")).not.toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it("is reached by Tab in the order the toasts appeared, after the page", async () => {
    const user = userEvent.setup();
    setup();
    const undo = { label: "Undo", onAction: () => undefined };
    show({ message: "First.", action: undo });
    show({ message: "Second." });
    show({ message: "Third.", action: undo });
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveFocus();
    // Each stop: the toast it is in, by its message, and the button it is.
    const stops: string[] = [];
    for (let stop = 0; stop < 5; stop += 1) {
      await user.tab();
      const active = document.activeElement;
      const owner = active?.closest('[role="group"]');
      const message = document.getElementById(owner?.getAttribute("aria-labelledby") ?? "");
      stops.push(
        `${message?.textContent ?? ""} ${active?.getAttribute("aria-label") ?? active?.textContent ?? ""}`,
      );
    }
    expect(stops).toEqual([
      "First. Undo",
      `First. ${en.common.dismiss}`,
      `Second. ${en.common.dismiss}`,
      "Third. Undo",
      `Third. ${en.common.dismiss}`,
    ]);
  });

  it("leaves after the toast timeout", () => {
    vi.useFakeTimers();
    setup();
    show({ message: "Snapshot imported." });
    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(screen.getByText("Snapshot imported.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Snapshot imported.")).not.toBeInTheDocument();
  });

  it("pauses its timer while it is hovered or holds focus", () => {
    vi.useFakeTimers();
    setup();
    show({
      message: "Snapshot deleted.",
      action: { label: "Undo", onAction: () => undefined, isUndo: true },
    });
    const item = screen.getByText("Snapshot deleted.").closest('[data-part="toast"]');
    if (!(item instanceof HTMLElement)) throw new Error("The toast was not rendered.");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    fireEvent.pointerEnter(item);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(item).toBeInTheDocument();

    fireEvent.pointerLeave(item);
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(item).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Undo" }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(item).toBeInTheDocument();

    act(() => {
      screen.getByRole("textbox", { name: "Workspace name" }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(item).not.toBeInTheDocument();
  });

  it("refuses to be used outside the region, and says how to fix it", () => {
    function Outside() {
      useToast();
      return null;
    }
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Outside />)).toThrow(/ToastRegion/);
    silence.mockRestore();
  });

  it("has no accessibility violation, empty and with toasts", async () => {
    setup();
    await expectAccessible();
    show({
      message: "Snapshot deleted.",
      action: { label: "Undo", onAction: () => undefined, isUndo: true },
    });
    show({ message: "Snapshot imported.", tone: "success" });
    await expectAccessible();
  });
});
