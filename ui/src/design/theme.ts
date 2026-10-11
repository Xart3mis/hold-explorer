import type { Theme } from "../bindings/Theme";

const LIGHT_SCHEME = "(prefers-color-scheme: light)";

/** Removes the listener on the operating system's color scheme, while System is applied. */
let stopFollowing: (() => void) | null = null;

function show(light: boolean): void {
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
}

/**
 * Applies the theme as `data-theme="dark"` or `data-theme="light"` on the root element.
 * System is resolved to one of the two before it is applied, and follows the operating system
 * while the app runs. Dark is the default, so it is also what System means where the operating
 * system cannot be asked.
 */
export function applyTheme(theme: Theme): void {
  stopFollowing?.();
  stopFollowing = null;

  if (theme !== "System") {
    show(theme === "Light");
    return;
  }
  if (typeof window.matchMedia !== "function") {
    show(false);
    return;
  }
  const system = window.matchMedia(LIGHT_SCHEME);
  const follow = (event: { matches: boolean }) => {
    show(event.matches);
  };
  system.addEventListener("change", follow);
  stopFollowing = () => {
    system.removeEventListener("change", follow);
  };
  show(system.matches);
}
