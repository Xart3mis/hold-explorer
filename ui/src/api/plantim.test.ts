import { describe, expect, it } from "vitest";
import { exportColumn, OPTIONAL_FIELDS } from "./plantim";

describe("the fields of an export", () => {
  it("names the fields an import may be without: all but the three it cannot be made without", () => {
    expect(OPTIONAL_FIELDS).toEqual([
      "SourceId",
      "Name",
      "Role",
      "Discipline",
      "Created",
      "Released",
      "ReleaseRemark",
      "ReleaseDate",
      "ModelSize",
      "LdtSize",
      "StressCalc",
    ]);
  });

  it("names the column of the export that supplies a field", () => {
    expect(exportColumn("ModelSize")).toBe("model_size");
  });
});
