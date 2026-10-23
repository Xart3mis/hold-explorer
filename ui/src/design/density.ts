import type { Density } from "../bindings/Density";
import { remember, remembered } from "./stored";

/** Where the last applied density setting is kept, so the next start can paint in it at once. */
export const DENSITY_STORAGE_KEY = "hold-explorer.density";

const DENSITIES: readonly Density[] = ["Comfortable", "Compact"];

/**
 * Applies the density as `data-density="comfortable"` or `data-density="compact"` on the root
 * element. The setting is also kept for `applyStoredDensity`.
 */
export function applyDensity(density: Density): void {
  remember(DENSITY_STORAGE_KEY, density);
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
  const density = remembered(DENSITY_STORAGE_KEY, DENSITIES);
  if (density) applyDensity(density);
}
