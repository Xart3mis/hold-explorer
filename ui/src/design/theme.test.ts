import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme } from "./theme";

type Listener = (event: { matches: boolean }) => void;

/** Stands in for the operating system's color scheme; `set` changes it and tells the listeners. */
function mockSystemScheme(prefersLight: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: prefersLight,
    media: "(prefers-color-scheme: light)",
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );
  return {
    listeners,
    set(light: boolean) {
      query.matches = light;
      for (const listener of [...listeners]) listener({ matches: light });
    },
  };
}

const root = document.documentElement;

afterEach(() => {
  applyTheme("Dark");
  root.removeAttribute("data-theme");
  vi.unstubAllGlobals();
});

describe("applyTheme", () => {
  it("sets the attribute for Dark and for Light", () => {
    applyTheme("Dark");
    expect(root).toHaveAttribute("data-theme", "dark");
    applyTheme("Light");
    expect(root).toHaveAttribute("data-theme", "light");
  });

  it("resolves System to what the operating system prefers", () => {
    mockSystemScheme(true);
    applyTheme("System");
    expect(root).toHaveAttribute("data-theme", "light");

    mockSystemScheme(false);
    applyTheme("System");
    expect(root).toHaveAttribute("data-theme", "dark");
  });

  it("follows a change of the operating system while System is set", () => {
    const system = mockSystemScheme(false);
    applyTheme("System");
    expect(root).toHaveAttribute("data-theme", "dark");

    system.set(true);
    expect(root).toHaveAttribute("data-theme", "light");
    system.set(false);
    expect(root).toHaveAttribute("data-theme", "dark");
  });

  it("stops following the operating system once a fixed theme is set", () => {
    const system = mockSystemScheme(false);
    applyTheme("System");
    applyTheme("Dark");
    expect(system.listeners.size).toBe(0);

    system.set(true);
    expect(root).toHaveAttribute("data-theme", "dark");
  });

  it("listens once, however often System is applied", () => {
    const system = mockSystemScheme(true);
    applyTheme("System");
    applyTheme("System");
    expect(system.listeners.size).toBe(1);
  });

  it("never writes a third value, so a stylesheet sees dark or light only", () => {
    mockSystemScheme(true);
    for (const theme of ["Dark", "Light", "System"] as const) {
      applyTheme(theme);
      expect(["dark", "light"]).toContain(root.getAttribute("data-theme"));
    }
  });

  it("falls back to dark where the color scheme cannot be asked", () => {
    vi.stubGlobal("matchMedia", undefined);
    applyTheme("System");
    expect(root).toHaveAttribute("data-theme", "dark");
  });
});
