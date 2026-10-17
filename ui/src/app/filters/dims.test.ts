import { describe, expect, it } from "vitest";
import type { Dim } from "../../bindings/Dim";
import en from "../../locales/en.json";
import { dimId, dimName, isSameDim } from "./dims";

const DIMS: readonly Dim[] = [
  "Discipline",
  "HoldType",
  "Role",
  "Name",
  "BlockerType",
  "Blocker",
  "Remark",
  "LineId",
  "ModelSize",
  "StressCalc",
];

describe("dimId", () => {
  it("is the name of a dimension the export has, and the header of a custom one after a prefix", () => {
    expect(dimId("Discipline")).toBe("Discipline");
    expect(dimId("HoldType")).toBe("HoldType");
    expect(dimId({ Custom: "Area" })).toBe("Custom:Area");
  });

  it("tells every dimension from every other, a custom one named like a built-in one included", () => {
    const ids = [...DIMS, { Custom: "Discipline" }, { Custom: "Area" }].map(dimId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("dimName", () => {
  it("is the name the interface already has for the field, where the export has one", () => {
    expect(dimName("Discipline")).toBe(en.import.field.Discipline);
    expect(dimName("HoldType")).toBe(en.import.field.HoldType);
    expect(dimName("Role")).toBe(en.import.field.Role);
    expect(dimName("Name")).toBe(en.import.field.Name);
    expect(dimName("Remark")).toBe(en.import.field.Remark);
    expect(dimName("LineId")).toBe(en.import.field.LineId);
    expect(dimName("ModelSize")).toBe(en.import.field.ModelSize);
    expect(dimName("StressCalc")).toBe(en.import.field.StressCalc);
  });

  it("names the two dimensions the blocker rules derive", () => {
    expect(dimName("BlockerType")).toBe(en.filters.dim.BlockerType);
    expect(dimName("Blocker")).toBe(en.filters.dim.Blocker);
  });

  it("is the header of a custom dimension, as the file wrote it", () => {
    expect(dimName({ Custom: "Area" })).toBe("Area");
    expect(dimName({ Custom: "unit no." })).toBe("unit no.");
  });

  it("has a name for every dimension", () => {
    for (const dim of DIMS) expect(dimName(dim)).not.toBe("");
  });
});

describe("isSameDim", () => {
  it("compares two dimensions by what they are", () => {
    expect(isSameDim("Role", "Role")).toBe(true);
    expect(isSameDim("Role", "Name")).toBe(false);
    expect(isSameDim({ Custom: "Area" }, { Custom: "Area" })).toBe(true);
    expect(isSameDim({ Custom: "Area" }, { Custom: "Unit" })).toBe(false);
    expect(isSameDim({ Custom: "Role" }, "Role")).toBe(false);
  });
});
