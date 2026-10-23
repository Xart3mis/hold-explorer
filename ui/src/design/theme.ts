import type { Theme } from "../bindings/Theme";
import { remember, remembered } from "./stored";

const LIGHT_SCHEME = "(prefers-color-scheme: light)";

/** Where the last applied theme setting is kept, so the next start can paint in it at once. */
export const THEME_STORAGE_KEY = "hold-explorer.theme";

const THEMES: readonly Theme[] = ["Dark", "Light", "System"];

/** Removes the listener on the operating system's color scheme, while System is applied. */
let stopFollowing: (() => void) | null = null;

function show(light: boolean): void {
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
}

/**
 * Applies the theme as `data-theme="dark"` or `data-theme="light"` on the root element.
 * System is resolved to one of the two before it is applied, and follows the operating system
 * while the app runs. Dark is the default, so it is also what System means where the operating
 * system cannot be asked. The setting is also kept for `applyStoredTheme`.
 */
export function applyTheme(theme: Theme): void {
  stopFollowing?.();
  stopFollowing = null;
  remember(THEME_STORAGE_KEY, theme);

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

/**
 * Applies the theme that was applied last, before anything renders, so a user of the light theme
 * does not see a dark frame at start. The saved settings arrive a moment later with the
 * application start and confirm or correct it. Nothing stored, or something that is not a
 * theme, leaves the dark default.
 */
export function applyStoredTheme(): void {
  const theme = remembered(THEME_STORAGE_KEY, THEMES);
  if (theme) applyTheme(theme);
}
