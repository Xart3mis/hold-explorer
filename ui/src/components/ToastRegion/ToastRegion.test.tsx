import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  document.documentElement.style.setProperty("--timeout-toast", "8000ms");
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.style.removeProperty("--timeout-toast");
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
    show({ message: "Workspace renamed.", action: { label: "Undo", onAction: () => undefined } });
    expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveFocus();
  });

  it("calls the action of a toast once and then removes the toast", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    setup();
    show({ message: "Snapshot deleted.", action: { label: "Undo", onAction } });

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
    show({ message: "Snapshot deleted.", action: { label: "Undo", onAction: older } });
    show({ message: "Workspace renamed.", action: { label: "Undo", onAction: newest } });

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
    show({ message: "Snapshot deleted.", action: { label: "Undo", onAction } });

    await user.click(screen.getByRole("textbox", { name: "Workspace name" }));
    await user.keyboard("{Control>}z{/Control}");
    expect(onAction).not.toHaveBeenCalled();

    show({ message: "Snapshot imported." });
    await user.tab();
    await user.keyboard("{Control>}z{/Control}");
    expect(onAction).not.toHaveBeenCalled();
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
    show({ message: "Snapshot deleted.", action: { label: "Undo", onAction: () => undefined } });
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
    show({ message: "Snapshot deleted.", action: { label: "Undo", onAction: () => undefined } });
    show({ message: "Snapshot imported.", tone: "success" });
    await expectAccessible();
  });
});
