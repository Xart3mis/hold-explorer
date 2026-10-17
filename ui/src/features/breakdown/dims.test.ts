import { describe, expect, it } from "vitest";
import type { Dim } from "../../bindings/Dim";
import { breakdownDims, dimOfId, DEFAULT_DIM } from "./dims";

describe("breakdownDims", () => {
  it("offers the dimensions in the order of the spec, then the extra columns of the export", () => {
    expect(breakdownDims([], ["Area", "Work pack"])).toEqual<Dim[]>([
      "Discipline",
      "HoldType",
      "Role",
      "Name",
      "BlockerType",
      "Blocker",
      "Remark",
      "ModelSize",
      "StressCalc",
      { Custom: "Area" },
      { Custom: "Work pack" },
    ]);
  });

  it("leaves out a dimension whose field the snapshot has no value in", () => {
    expect(breakdownDims(["Role", "Name", "ModelSize", "StressCalc"], [])).toEqual<Dim[]>([
      "Discipline",
      "HoldType",
      "BlockerType",
      "Blocker",
      "Remark",
    ]);
  });

  it("leaves out the blocker and its type with the remark they are derived from", () => {
    expect(breakdownDims(["Remark"], [])).not.toContain("Blocker");
    expect(breakdownDims(["Remark"], [])).not.toContain("BlockerType");
    expect(breakdownDims(["Remark"], [])).not.toContain("Remark");
  });

  it("groups by discipline unless the address says otherwise", () => {
    expect(DEFAULT_DIM).toBe("Discipline");
  });
});

describe("dimOfId", () => {
  it("reads the id of every dimension the page offers, a custom one included", () => {
    for (const dim of breakdownDims([], ["Area"])) {
      expect(dimOfId(typeof dim === "string" ? dim : `Custom:${dim.Custom}`)).toEqual(dim);
    }
  });

  it("reads nothing from an id the page does not offer", () => {
    expect(dimOfId("LineId")).toBeNull();
    expect(dimOfId("Nonsense")).toBeNull();
    expect(dimOfId("Custom:")).toBeNull();
    expect(dimOfId(null)).toBeNull();
  });
});
