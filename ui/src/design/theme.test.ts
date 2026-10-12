import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStoredTheme, applyTheme, THEME_STORAGE_KEY } from "./theme";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
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

describe("the stored theme", () => {
  it("is written by applyTheme as the setting, not as what it resolved to", () => {
    mockSystemScheme(true);
    applyTheme("Light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("Light");
    applyTheme("System");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("System");
    applyTheme("Dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("Dark");
  });

  it("puts a stored Light on the root element before anything renders", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "Light");
    expect(document.getElementById("root")).toBeNull();
    applyStoredTheme();
    expect(root).toHaveAttribute("data-theme", "light");
  });

  it("resolves a stored System like any other System", () => {
    mockSystemScheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, "System");
    applyStoredTheme();
    expect(root).toHaveAttribute("data-theme", "light");
  });

  it("leaves the dark default when nothing is stored", () => {
    applyStoredTheme();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("leaves the dark default when what is stored is not a theme", () => {
    for (const stored of ["light", "Sepia", "", "null", '{"theme":"Light"}']) {
      localStorage.setItem(THEME_STORAGE_KEY, stored);
      applyStoredTheme();
      expect(root, stored).not.toHaveAttribute("data-theme");
    }
  });

  it("does without the storage when reading it throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    expect(() => {
      applyStoredTheme();
    }).not.toThrow();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("still applies a theme when writing it throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    expect(() => {
      applyTheme("Light");
    }).not.toThrow();
    expect(root).toHaveAttribute("data-theme", "light");
  });
});
