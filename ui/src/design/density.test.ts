import { afterEach, describe, expect, it, vi } from "vitest";
import { applyDensity, applyStoredDensity, DENSITY_STORAGE_KEY } from "./density";

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute("data-density");
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("applyDensity", () => {
  it("sets the attribute for Comfortable and for Compact", () => {
    applyDensity("Compact");
    expect(root).toHaveAttribute("data-density", "compact");
    applyDensity("Comfortable");
    expect(root).toHaveAttribute("data-density", "comfortable");
  });

  it("keeps the density for the next start", () => {
    applyDensity("Compact");
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe("Compact");
  });

  it("still applies the density when the storage refuses", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    applyDensity("Compact");
    expect(root).toHaveAttribute("data-density", "compact");
  });
});

describe("applyStoredDensity", () => {
  it("applies the density that was applied last", () => {
    localStorage.setItem(DENSITY_STORAGE_KEY, "Compact");
    applyStoredDensity();
    expect(root).toHaveAttribute("data-density", "compact");
  });

  it("leaves the default when nothing, or something that is no density, is stored", () => {
    applyStoredDensity();
    expect(root).not.toHaveAttribute("data-density");
    localStorage.setItem(DENSITY_STORAGE_KEY, "Tiny");
    applyStoredDensity();
    expect(root).not.toHaveAttribute("data-density");
  });

  it("leaves the default when the storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    applyStoredDensity();
    expect(root).not.toHaveAttribute("data-density");
  });
});
