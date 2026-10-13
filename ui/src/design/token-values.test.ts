import { afterEach, describe, expect, it, vi } from "vitest";
import { densityToken, durationToken, lengthToken, rootDensity } from "./token-values";

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute("style");
  root.removeAttribute("data-density");
  root.removeAttribute("data-theme");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("durationToken", () => {
  it("reads the tokens of DESIGN.md from the stylesheet, in milliseconds", () => {
    expect(durationToken("--delay-tooltip")).toBe(500);
    expect(durationToken("--timeout-toast")).toBe(8000);
    expect(durationToken("--duration-fast")).toBe(150);
  });

  it("reads seconds as well", () => {
    root.style.setProperty("--test-seconds", "0.5s");
    expect(durationToken("--test-seconds")).toBe(500);
  });

  it("fails loudly in development when the token is not defined, and says how to fix it", () => {
    expect(() => durationToken("--test-missing")).toThrow(
      /--test-missing.*not defined.*tokens\.css/s,
    );
  });

  it("fails loudly in development when the token is not a duration", () => {
    root.style.setProperty("--test-soon", "soon");
    expect(() => durationToken("--test-soon")).toThrow(/--test-soon.*"soon".*duration/s);
  });

  it("is null in a production build when the token cannot be read, so the caller can do without", () => {
    vi.stubEnv("DEV", false);
    expect(durationToken("--test-missing")).toBeNull();
  });
});

describe("lengthToken", () => {
  it("reads the tokens of DESIGN.md from the stylesheet, in pixels", () => {
    expect(lengthToken("--space-1")).toBe(4);
    expect(lengthToken("--space-6")).toBe(24);
  });

  it("fails loudly in development when the token is not in pixels", () => {
    expect(() => lengthToken("--font-size-sm")).toThrow(/--font-size-sm.*pixels/s);
    expect(() => lengthToken("--test-missing")).toThrow(/--test-missing/);
  });
});

describe("reading a token", () => {
  it("asks the stylesheet once for each token", () => {
    const computed = vi.spyOn(window, "getComputedStyle");
    root.style.setProperty("--test-once", "40px");
    expect(lengthToken("--test-once")).toBe(40);
    expect(lengthToken("--test-once")).toBe(40);
    expect(lengthToken("--test-once")).toBe(40);
    expect(computed).toHaveBeenCalledTimes(1);
  });

  it("reads again when the density or the theme changes, because a value can differ by either", () => {
    expect(lengthToken("--density-row-height")).toBe(36);
    root.setAttribute("data-density", "compact");
    expect(lengthToken("--density-row-height")).toBe(28);
    root.setAttribute("data-density", "comfortable");
    expect(lengthToken("--density-row-height")).toBe(36);

    root.style.setProperty("--test-themed", "8px");
    expect(lengthToken("--test-themed")).toBe(8);
    root.style.setProperty("--test-themed", "16px");
    expect(lengthToken("--test-themed")).toBe(8);
    root.setAttribute("data-theme", "light");
    expect(lengthToken("--test-themed")).toBe(16);
  });

  it("does not remember that a token was missing", () => {
    expect(() => lengthToken("--test-late")).toThrow();
    root.style.setProperty("--test-late", "12px");
    expect(lengthToken("--test-late")).toBe(12);
  });
});

describe("densityToken", () => {
  it("reads a density token at the density asked for, whatever the density of the app", () => {
    expect(densityToken("--density-row-height", "comfortable")).toBe(36);
    expect(densityToken("--density-row-height", "compact")).toBe(28);
    expect(densityToken("--density-cell-padding-x", "compact")).toBe(8);
    root.setAttribute("data-density", "compact");
    expect(densityToken("--density-row-height", "comfortable")).toBe(36);
    expect(densityToken("--density-header-height", "compact")).toBe(28);
  });

  it("leaves nothing in the document, and asks the stylesheet once for each value", () => {
    const before = document.documentElement.childElementCount;
    const computed = vi.spyOn(window, "getComputedStyle");
    expect(densityToken("--density-control-height", "compact")).toBe(28);
    expect(densityToken("--density-control-height", "compact")).toBe(28);
    expect(computed).toHaveBeenCalledTimes(1);
    expect(document.documentElement.childElementCount).toBe(before);
  });

  it("fails loudly in development when the token is not defined", () => {
    expect(() => densityToken("--density-test-missing", "compact")).toThrow(
      /--density-test-missing.*not defined/s,
    );
  });
});

describe("rootDensity", () => {
  it("is the density attribute of the root element, and comfortable without it", () => {
    expect(rootDensity()).toBe("comfortable");
    root.setAttribute("data-density", "compact");
    expect(rootDensity()).toBe("compact");
    root.setAttribute("data-density", "comfortable");
    expect(rootDensity()).toBe("comfortable");
  });
});
