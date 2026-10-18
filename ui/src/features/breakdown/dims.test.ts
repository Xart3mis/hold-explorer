import { describe, expect, it } from "vitest";
import { dimNeeds } from "../../api/filter-needs";
import type { Dim } from "../../bindings/Dim";
import type { Field } from "../../bindings/Field";
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

  it("leaves out a dimension as the one table of what each needs says, and nothing else", () => {
    const absent: Field[] = ["Role", "ModelSize", "Remark", "HoldType"];
    for (const dim of breakdownDims([], [])) {
      const lacks = dimNeeds(dim).some((field) => absent.includes(field));
      expect(breakdownDims(absent, []).includes(dim)).toBe(!lacks);
    }
    // The remark is a required column, and the dimensions derived from it need no other.
    expect(breakdownDims(["Remark"], [])).toContain("Blocker");
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
