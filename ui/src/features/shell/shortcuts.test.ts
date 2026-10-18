import { describe, expect, it, vi } from "vitest";
import { destinations } from "../../app/destinations";
import { IN_PAGE_ATTRIBUTE } from "../../components";
import {
  ariaKeyShortcuts,
  formatShortcut,
  handleShortcut,
  IMPORT_SHORTCUT,
  matchesShortcut,
  shortcutBindings,
} from "./shortcuts";

function key(init: KeyboardEventInit, target: Element = document.body): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("matchesShortcut", () => {
  it("matches the key with exactly the modifiers the shortcut names", () => {
    expect(matchesShortcut(key({ key: "1", ctrlKey: true }), "Ctrl+1")).toBe(true);
    expect(matchesShortcut(key({ key: "1" }), "Ctrl+1")).toBe(false);
    expect(matchesShortcut(key({ key: "1", ctrlKey: true, shiftKey: true }), "Ctrl+1")).toBe(false);
    expect(matchesShortcut(key({ key: "1", ctrlKey: true, altKey: true }), "Ctrl+1")).toBe(false);
    expect(matchesShortcut(key({ key: "2", ctrlKey: true }), "Ctrl+1")).toBe(false);
  });

  it("matches a digit by its physical key, whatever character the layout gives it", () => {
    // A French keyboard gives "&" for the key of 1 and "é" for the key of 2, without Shift.
    expect(matchesShortcut(key({ key: "&", code: "Digit1", ctrlKey: true }), "Ctrl+1")).toBe(true);
    expect(matchesShortcut(key({ key: "é", code: "Digit2", ctrlKey: true }), "Ctrl+2")).toBe(true);
    expect(matchesShortcut(key({ key: "é", code: "Digit2", ctrlKey: true }), "Ctrl+1")).toBe(false);
    expect(matchesShortcut(key({ key: "&", code: "Digit1" }), "Ctrl+1")).toBe(false);
    // A key that gives the digit itself still counts, wherever it sits.
    expect(matchesShortcut(key({ key: "1", code: "Numpad1", ctrlKey: true }), "Ctrl+1")).toBe(true);
    // A letter is matched by what it types: Ctrl+I is the key that types I on every layout.
    expect(matchesShortcut(key({ key: "i", code: "KeyU", ctrlKey: true }), "Ctrl+I")).toBe(true);
    expect(matchesShortcut(key({ key: "u", code: "KeyI", ctrlKey: true }), "Ctrl+I")).toBe(false);
  });

  it("does not tell a capital from a small letter", () => {
    expect(matchesShortcut(key({ key: "i", ctrlKey: true }), "Ctrl+I")).toBe(true);
    expect(matchesShortcut(key({ key: "I", ctrlKey: true }), "Ctrl+I")).toBe(true);
  });

  it("matches the comma and a plain key", () => {
    expect(matchesShortcut(key({ key: ",", ctrlKey: true }), "Ctrl+,")).toBe(true);
    expect(matchesShortcut(key({ key: "/" }), "/")).toBe(true);
    expect(matchesShortcut(key({ key: "/", ctrlKey: true }), "/")).toBe(false);
  });
});

describe("shortcutBindings", () => {
  it("binds the shortcut of every destination that has one, and Ctrl+I to an import", () => {
    const open = vi.fn();
    const startImport = vi.fn();
    const bindings = shortcutBindings(destinations, { open, startImport, hasWorkspace: true });
    expect(bindings.map((binding) => binding.shortcut)).toEqual([
      "Ctrl+1",
      "Ctrl+2",
      "Ctrl+3",
      "Ctrl+4",
      "Ctrl+5",
      "Ctrl+6",
      "Ctrl+7",
      "Ctrl+,",
      IMPORT_SHORTCUT,
    ]);
    expect(IMPORT_SHORTCUT).toBe("Ctrl+I");

    bindings[2]?.run();
    expect(open).toHaveBeenCalledWith("/lines");
    bindings[7]?.run();
    expect(open).toHaveBeenCalledWith("/settings");
    bindings[8]?.run();
    expect(startImport).toHaveBeenCalledTimes(1);
  });
});

describe("shortcutBindings without a workspace", () => {
  it("binds only what leads somewhere: Settings and the import", () => {
    const open = vi.fn();
    const startImport = vi.fn();
    const bindings = shortcutBindings(destinations, { open, startImport, hasWorkspace: false });
    expect(bindings.map((binding) => binding.shortcut)).toEqual(["Ctrl+,", IMPORT_SHORTCUT]);
    bindings[0]?.run();
    expect(open).toHaveBeenCalledWith("/settings");
  });
});

describe("handleShortcut", () => {
  const field = document.createElement("input");

  it("runs the binding that matches and keeps the key from the page", () => {
    const run = vi.fn();
    const event = key({ key: "3", ctrlKey: true });
    expect(handleShortcut(event, [{ shortcut: "Ctrl+3", run }])).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a key alone that no binding matches", () => {
    const run = vi.fn();
    const event = key({ key: "3" });
    expect(handleShortcut(event, [{ shortcut: "Ctrl+3", run }])).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not fire a plain key while a text field has focus", () => {
    const run = vi.fn();
    expect(handleShortcut(key({ key: "/" }, field), [{ shortcut: "/", run }])).toBe(false);
    expect(run).not.toHaveBeenCalled();

    const area = document.createElement("textarea");
    expect(handleShortcut(key({ key: "/" }, area), [{ shortcut: "/", run }])).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("fires a shortcut with Ctrl while a text field has focus", () => {
    const run = vi.fn();
    expect(
      handleShortcut(key({ key: "i", ctrlKey: true }, field), [{ shortcut: "Ctrl+I", run }]),
    ).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fires a plain key on a button or the page", () => {
    const run = vi.fn();
    const button = document.createElement("button");
    expect(handleShortcut(key({ key: "/" }, button), [{ shortcut: "/", run }])).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fires beside a list box that stands in the page, as a line chart does", () => {
    const run = vi.fn();
    const chart = document.createElement("div");
    chart.setAttribute("role", "listbox");
    chart.setAttribute(IN_PAGE_ATTRIBUTE, "");
    document.body.append(chart);
    try {
      const event = key({ key: "3", code: "Digit3", ctrlKey: true }, chart);
      expect(handleShortcut(event, [{ shortcut: "Ctrl+3", run }])).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      chart.remove();
    }
  });

  it.each(["menu", "listbox"])("does not fire while a %s is open", (role) => {
    const run = vi.fn();
    const overlay = document.createElement("div");
    overlay.setAttribute("role", role);
    document.body.append(overlay);
    try {
      const event = key({ key: "3", code: "Digit3", ctrlKey: true });
      expect(handleShortcut(event, [{ shortcut: "Ctrl+3", run }])).toBe(false);
      expect(run).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      overlay.remove();
    }
    expect(handleShortcut(key({ key: "3", ctrlKey: true }), [{ shortcut: "Ctrl+3", run }])).toBe(
      true,
    );
  });

  it("ignores a key that is held down and one that something else has handled", () => {
    const run = vi.fn();
    expect(
      handleShortcut(key({ key: "3", ctrlKey: true, repeat: true }), [{ shortcut: "Ctrl+3", run }]),
    ).toBe(false);
    const handled = key({ key: "3", ctrlKey: true });
    handled.preventDefault();
    expect(handleShortcut(handled, [{ shortcut: "Ctrl+3", run }])).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("how a shortcut is written", () => {
  it("is shown with the key names of the text catalog", () => {
    expect(formatShortcut("Ctrl+1")).toBe("Ctrl+1");
    expect(formatShortcut("Ctrl+,")).toBe("Ctrl+,");
    expect(formatShortcut("/")).toBe("/");
  });

  it("is given to assistive technology in the form of aria-keyshortcuts", () => {
    expect(ariaKeyShortcuts("Ctrl+1")).toBe("Control+1");
    expect(ariaKeyShortcuts("Ctrl+I")).toBe("Control+I");
    expect(ariaKeyShortcuts("Ctrl+,")).toBe("Control+,");
  });
});
