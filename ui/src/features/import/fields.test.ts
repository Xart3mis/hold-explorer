import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import { columnLabel, fieldLabel, FIELDS, orderFields } from "./fields";

describe("the fields of an import", () => {
  it("are listed in the order the export writes its columns", () => {
    // The mapping page and the column list of the review are written in this order. It is the
    // order of the keys of one object in fields.ts, and this is what pins it.
    expect(FIELDS).toEqual([
      "SourceId",
      "LineId",
      "Name",
      "Role",
      "Remark",
      "HoldType",
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

  it("have each a name in the catalog, and no name twice", () => {
    const names = FIELDS.map(fieldLabel);
    expect(names).toEqual(FIELDS.map((field) => en.import.field[field]));
    expect(new Set(names).size).toBe(FIELDS.length);
    expect(Object.keys(en.import.field).sort()).toEqual([...FIELDS].sort());
  });

  it("put the required ones first, as the engine orders them, then the others in the order of the export", () => {
    const ordered = orderFields(["LineId", "Remark", "HoldType"]);
    expect(ordered.required).toEqual(["LineId", "Remark", "HoldType"]);
    expect(ordered.optional).toEqual([
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
    expect(ordered.all).toEqual([...ordered.required, ...ordered.optional]);
    // The engine's order of the required fields is kept, whatever the order of the export.
    expect(orderFields(["HoldType", "LineId"]).all.slice(0, 2)).toEqual(["HoldType", "LineId"]);
  });

  it("name a column by its header, and one without a header by its position", () => {
    expect(columnLabel(["id", "  line_id  ", ""], 1)).toBe("line_id");
    expect(columnLabel(["id", "line_id", ""], 2)).toBe(
      en.import.mapping.columnNoHeader.replace("{{number}}", "3"),
    );
    expect(columnLabel(["id"], 4)).toBe(
      en.import.mapping.columnNoHeader.replace("{{number}}", "5"),
    );
  });
});
