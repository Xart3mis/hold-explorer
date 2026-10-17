import { describe, expect, it } from "vitest";
import type { LineQuery } from "../../bindings/LineQuery";
import { PRESETS, presetOf, presetQuery, presetsFor, narrowingPreset } from "./presets";

const query = (overrides: Partial<LineQuery> = {}): LineQuery => ({
  sort: "HoldsDesc",
  single_hold_only: false,
  size_mismatch_only: false,
  reverse: false,
  ...overrides,
});

describe("the presets of Lines", () => {
  it("are these five, in this order, each with its query", () => {
    expect(PRESETS.map(({ id }) => id)).toEqual(["all", "single", "easiest", "oldest", "mismatch"]);
    expect(presetQuery("all")).toEqual(query());
    expect(presetQuery("single")).toEqual(query({ single_hold_only: true }));
    expect(presetQuery("easiest")).toEqual(query({ sort: "Easiest" }));
    expect(presetQuery("oldest")).toEqual(query({ sort: "OldestFirst" }));
    expect(presetQuery("mismatch")).toEqual(query({ size_mismatch_only: true }));
  });

  it("says which preset a query is, and none for any other query", () => {
    for (const { id } of PRESETS) expect(presetOf(presetQuery(id))).toBe(id);
    // Sorted by a header, or a preset turned round: no preset.
    expect(presetOf(query({ sort: "LineId" }))).toBeNull();
    expect(presetOf(query({ reverse: true }))).toBeNull();
    expect(presetOf(query({ sort: "OldestFirst", reverse: true }))).toBeNull();
    expect(presetOf(query({ single_hold_only: true, sort: "LineId" }))).toBeNull();
    expect(presetOf(query({ single_hold_only: true, size_mismatch_only: true }))).toBeNull();
    expect(presetOf(query({ sort: "Easiest", size_mismatch_only: true }))).toBeNull();
  });

  it("leaves out Size mismatch when the snapshot lacks a size", () => {
    const all = ["all", "single", "easiest", "oldest", "mismatch"];
    expect(presetsFor([]).map(({ id }) => id)).toEqual(all);
    expect(presetsFor(["StressCalc", "Released"]).map(({ id }) => id)).toEqual(all);
    const without = ["all", "single", "easiest", "oldest"];
    expect(presetsFor(["ModelSize"]).map(({ id }) => id)).toEqual(without);
    expect(presetsFor(["LdtSize"]).map(({ id }) => id)).toEqual(without);
    expect(presetsFor(["ModelSize", "LdtSize", "StressCalc"]).map(({ id }) => id)).toEqual(without);
  });

  it("names the preset that keeps lines out, for a query that keeps some out", () => {
    expect(narrowingPreset(query())).toBeNull();
    expect(narrowingPreset(query({ sort: "Easiest" }))).toBeNull();
    expect(narrowingPreset(query({ single_hold_only: true }))).toBe("single");
    expect(narrowingPreset(query({ single_hold_only: true, sort: "LineId" }))).toBe("single");
    expect(narrowingPreset(query({ size_mismatch_only: true, reverse: true }))).toBe("mismatch");
  });
});
