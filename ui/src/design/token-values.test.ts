import { afterEach, describe, expect, it } from "vitest";
import { durationToken, lengthToken } from "./token-values";

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute("style");
});

describe("durationToken", () => {
  it("reads milliseconds and seconds", () => {
    root.style.setProperty("--timeout-toast", "8000ms");
    root.style.setProperty("--delay-tooltip", "0.5s");
    expect(durationToken("--timeout-toast")).toBe(8000);
    expect(durationToken("--delay-tooltip")).toBe(500);
  });

  it("is null while the token is not defined, or is not a duration", () => {
    expect(durationToken("--timeout-toast")).toBeNull();
    root.style.setProperty("--timeout-toast", "soon");
    expect(durationToken("--timeout-toast")).toBeNull();
  });
});

describe("lengthToken", () => {
  it("reads pixels", () => {
    root.style.setProperty("--space-1", "4px");
    expect(lengthToken("--space-1")).toBe(4);
  });

  it("is null while the token is not defined, or is not in pixels", () => {
    expect(lengthToken("--space-1")).toBeNull();
    root.style.setProperty("--space-1", "0.25rem");
    expect(lengthToken("--space-1")).toBeNull();
  });
});
