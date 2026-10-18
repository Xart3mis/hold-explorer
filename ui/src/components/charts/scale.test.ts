import { describe, expect, it } from "vitest";
import { step, ticks } from "./scale";

describe("step", () => {
  it("gives an empty value no step, so it is never the lightest one", () => {
    expect(step(0, 70, 7)).toBe(0);
    expect(step(-3, 70, 7)).toBe(0);
  });

  it("cuts the domain into equal parts, each with its upper bound", () => {
    // Seven parts of 70: (0, 10], (10, 20], ... (60, 70].
    expect(step(1, 70, 7)).toBe(1);
    expect(step(10, 70, 7)).toBe(1);
    expect(step(11, 70, 7)).toBe(2);
    expect(step(20, 70, 7)).toBe(2);
    expect(step(60, 70, 7)).toBe(6);
    expect(step(61, 70, 7)).toBe(7);
    expect(step(70, 70, 7)).toBe(7);
  });

  it("puts a value just past a boundary in the next step, whatever the domain", () => {
    expect(step(10 / 7, 10, 7)).toBe(1);
    expect(step(10 / 7 + 0.001, 10, 7)).toBe(2);
    expect(step(1, 1, 7)).toBe(7);
    expect(step(1, 1515, 7)).toBe(1);
  });

  it("keeps a value above the domain on the last step", () => {
    expect(step(80, 70, 7)).toBe(7);
    expect(step(3, 0, 7)).toBe(7);
  });
});

describe("ticks", () => {
  it("places ticks at clean values from the start of the range", () => {
    expect(ticks(0, 1515, 5)).toEqual([0, 500, 1000, 1500]);
    expect(ticks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticks(0, 3, 5)).toEqual([0, 1, 2, 3]);
  });

  it("starts at the first clean value inside a range that does not start at 0", () => {
    expect(ticks(1, 2400, 6)).toEqual([500, 1000, 1500, 2000]);
  });

  it("gives an empty range its one value", () => {
    expect(ticks(0, 0, 5)).toEqual([0]);
    expect(ticks(4, 4, 5)).toEqual([4]);
  });
});
