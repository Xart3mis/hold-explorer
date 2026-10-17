// The size of the window, as DESIGN.md names it ("Adapting to the window"), and the form of the
// sidebar the user chose. The shell marks the root element with both, as it marks the theme and
// the density, and a stylesheet that adapts reads the marks and writes no media query of its own.
import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { lengthToken } from "../../design/token-values";

/** Small below `--layout-breakpoint-wide`, medium below `--layout-breakpoint-roomy`, large from there. */
export type WindowSize = "small" | "medium" | "large";

function onResize(changed: () => void): () => void {
  window.addEventListener("resize", changed);
  return () => {
    window.removeEventListener("resize", changed);
  };
}

/** The two breakpoints in pixels, read from their tokens once; `null` while they cannot be read. */
let breakpoints: { wide: number; roomy: number } | null = null;
function readBreakpoints(): { wide: number; roomy: number } | null {
  if (breakpoints !== null) return breakpoints;
  const wide = lengthToken("--layout-breakpoint-wide");
  const roomy = lengthToken("--layout-breakpoint-roomy");
  if (wide === null || roomy === null) return null;
  breakpoints = { wide, roomy };
  return breakpoints;
}

/** The size of the window of a width, by the breakpoints of DESIGN.md. */
export function windowSizeOf(width: number): WindowSize {
  const known = readBreakpoints();
  // A build that cannot read its tokens keeps the layout it was designed for first.
  if (known === null) return "large";
  if (width < known.wide) return "small";
  return width < known.roomy ? "medium" : "large";
}

/** The size of the window, again whenever the window is resized. */
export function useWindowSize(): WindowSize {
  return useSyncExternalStore(onResize, () => windowSizeOf(window.innerWidth));
}

/** Marks the root element with the size of the window while the shell is there. */
export function useWindowMark(size: WindowSize): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-window", size);
    return () => {
      root.removeAttribute("data-window");
    };
  }, [size]);
}

/** The sidebar with its labels, or collapsed to a rail of icons. */
export type SidebarForm = "full" | "rail";

/** Where the form of the sidebar is kept for the next start, on this computer. */
export const SIDEBAR_STORAGE_KEY = "hold-explorer.sidebar";

function rememberedForm(): SidebarForm {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "rail" ? "rail" : "full";
  } catch {
    return "full";
  }
}

/**
 * The form of the sidebar, as the user chose it last, and the way to change it. Storage that
 * refuses is done without: the choice then lasts as long as the app runs.
 */
export function useSidebarForm(): [SidebarForm, (form: SidebarForm) => void] {
  const [form, setForm] = useState(rememberedForm);
  const change = useCallback((next: SidebarForm) => {
    setForm(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next);
    } catch {
      // Kept for this run only.
    }
  }, []);
  return [form, change];
}
