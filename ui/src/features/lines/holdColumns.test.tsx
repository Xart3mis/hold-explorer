import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import { holdRef } from "../../test/lines";
import { holdColumns } from "./holdColumns";

/** What the cell of a column shows for a hold. */
function cellOf(id: string, item: ReturnType<typeof holdRef>) {
  const column = holdColumns(20, [], "Open").find((entry) => entry.id === id);
  if (column === undefined) throw new Error(`no column ${id}`);
  return column.cell(item);
}

describe("holdColumns", () => {
  it("lets only the columns the hold panel shows leave a narrow table, and keeps the age", () => {
    for (const status of ["Open", "Released", "All"] as const) {
      const columns = holdColumns(20, [], status);
      const leaving = columns
        .filter((column) => column.priority !== undefined)
        .sort((one, other) => (other.priority ?? 0) - (one.priority ?? 0))
        .map((column) => column.id);
      // Each of these is a fact of the hold in its panel.
      expect(leaving).toEqual([
        "role",
        "created",
        "name",
        "blockerType",
        ...(status === "Open" ? [] : ["releasedOn"]),
        "holdType",
        "discipline",
        "blocker",
      ]);
      // The line, the remark, the status, and the days always stay.
      const staying = columns.filter((column) => column.priority === undefined).map((c) => c.id);
      expect(staying).toEqual(["line", "remark", ...(status === "All" ? ["status"] : []), "days"]);
    }
  });

  it("lets every column be sorted, in all three statuses", () => {
    for (const status of ["Open", "Released", "All"] as const) {
      for (const column of holdColumns(20, [], status)) {
        expect([status, column.id, column.allowsSorting]).toEqual([status, column.id, true]);
      }
    }
  });

  it("writes the blocker in the face of the body, and the line ID in the monospace", () => {
    const columns = holdColumns(20, [], "Open");
    expect(columns.find((column) => column.id === "blocker")?.kind).toBeUndefined();
    expect(columns.find((column) => column.id === "line")?.kind).toBe("identifier");
  });

  it("writes a blank name, role, or hold type as the table's mark for no value", () => {
    // The export's blank spelling is `—`; the table says "no value" in one way in every column.
    const blank = holdRef(0, { name: "—", role: " ", hold_type: "—" });
    expect(cellOf("name", blank)).toBe(en.common.noValue);
    expect(cellOf("role", blank)).toBe(en.common.noValue);
    expect(cellOf("holdType", blank)).toBe(en.common.noValue);
  });

  it("writes the blocker of a blank remark as the table's mark for no value", () => {
    const item = holdRef(0);
    const blank = { ...item, row: { ...item.row, blocker: { kind: "Other", item: "—" } } };
    expect(cellOf("blocker", blank)).toBe(en.common.noValue);
    expect(cellOf("blocker", item)).toBe("577-PK-400");
  });

  it("writes a given name, role, and hold type as they are", () => {
    const given = holdRef(0);
    expect(cellOf("name", given)).toBe("A. Haddad");
    expect(cellOf("role", given)).toBe("Lead engineer");
    expect(cellOf("holdType", given)).toBe("Vendor data");
  });
});
