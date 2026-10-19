import type { Density } from "../bindings/Density";

/** Where the last applied density setting is kept, so the next start can paint in it at once. */
export const DENSITY_STORAGE_KEY = "hold-explorer.density";

const DENSITIES: readonly Density[] = ["Comfortable", "Compact"];

/** Keeps the setting for the next start. Storage that refuses is done without. */
function remember(density: Density): void {
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // The settings file is where the density is saved; this copy only spares a roomy first frame.
  }
}

function remembered(): Density | null {
  try {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return DENSITIES.find((density) => density === stored) ?? null;
  } catch {
    return null;
  }
}

/**
 * Applies the density as `data-density="comfortable"` or `data-density="compact"` on the root
 * element. The setting is also kept for `applyStoredDensity`.
 */
export function applyDensity(density: Density): void {
  remember(density);
  document.documentElement.setAttribute(
    "data-density",
    density === "Compact" ? "compact" : "comfortable",
  );
}

/**
 * Applies the density that was applied last, before anything renders, so a user of the compact
 * density does not see a comfortable frame at start. The saved settings arrive a moment later
 * with the application start and confirm or correct it. Nothing stored, or something that is not
 * a density, leaves the comfortable default.
 */
export function applyStoredDensity(): void {
  const density = remembered();
  if (density) applyDensity(density);
}
