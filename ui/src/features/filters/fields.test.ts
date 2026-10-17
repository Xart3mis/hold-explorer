import { describe, expect, it } from "vitest";
import { filterOptions } from "../../test/filters";
import { fieldId, fieldName } from "./chips";
import { pickerFields } from "./fields";

const ids = (...args: Parameters<typeof pickerFields>) => pickerFields(...args).map(fieldId);

/** Every field a complete export offers, in the order the picker lists them. */
const ALL = [
  "dim:Discipline",
  "dim:HoldType",
  "dim:Role",
  "dim:Name",
  "dim:BlockerType",
  "dim:Blocker",
  "dim:Remark",
  "dim:LineId",
  "ageBands",
  "created",
  "released",
  "dim:ModelSize",
  "dim:StressCalc",
  "sizeMismatch",
  "text",
];

describe("pickerFields", () => {
  it("lists the fields in a fixed order", () => {
    expect(ids(filterOptions())).toEqual(ALL);
  });

  it("names them as their chips do", () => {
    expect(pickerFields(filterOptions()).map(fieldName)).toEqual([
      "Discipline",
      "Hold type",
      "Role",
      "Raised by",
      "Blocker type",
      "Blocker",
      "Hold remark",
      "Line ID",
      "Age",
      "Creation date",
      "Release date",
      "Model size",
      "Stress calculation",
      "Model and LDT sizes",
      "Text",
    ]);
  });

  it("leaves out the size, the stress calculation, the size mismatch, and the release date of a snapshot that lacks them", () => {
    const listed = ids(
      filterOptions({
        absent: ["Released", "ReleaseRemark", "ReleaseDate", "ModelSize", "LdtSize", "StressCalc"],
      }),
    );
    expect(listed).toEqual(
      ALL.filter(
        (id) => !["dim:ModelSize", "dim:StressCalc", "sizeMismatch", "released"].includes(id),
      ),
    );
  });

  it("leaves out the release date when no hold is released, and when no hold has a release date", () => {
    expect(ids(filterOptions({ absent: ["Released"] }))).not.toContain("released");
    expect(ids(filterOptions({ absent: ["ReleaseDate"] }))).not.toContain("released");
    expect(ids(filterOptions({ absent: ["ReleaseRemark"] }))).toContain("released");
  });

  it("leaves out the size mismatch when either size is missing, and the model size only with its own column", () => {
    const withoutLdt = ids(filterOptions({ absent: ["LdtSize"] }));
    expect(withoutLdt).not.toContain("sizeMismatch");
    expect(withoutLdt).toContain("dim:ModelSize");
    const withoutModel = ids(filterOptions({ absent: ["ModelSize"] }));
    expect(withoutModel).not.toContain("sizeMismatch");
    expect(withoutModel).not.toContain("dim:ModelSize");
  });

  it("leaves out the role, the name, and the discipline of a snapshot that has none", () => {
    expect(ids(filterOptions({ absent: ["Name", "Role", "Discipline"] }))).toEqual(
      ALL.filter((id) => !["dim:Discipline", "dim:Role", "dim:Name"].includes(id)),
    );
  });

  it("leaves out the creation date, and the age that is counted from it, of a snapshot without creation dates", () => {
    expect(ids(filterOptions({ absent: ["Created"] }))).toEqual(
      ALL.filter((id) => !["created", "ageBands"].includes(id)),
    );
  });

  it("lists the custom columns of the snapshot last, by header", () => {
    const listed = pickerFields(filterOptions({ custom_dims: ["Area", "Contractor"] }));
    expect(listed.map(fieldId)).toEqual([...ALL, "dim:Custom:Area", "dim:Custom:Contractor"]);
    expect(listed.slice(-2).map(fieldName)).toEqual(["Area", "Contractor"]);
  });
});
