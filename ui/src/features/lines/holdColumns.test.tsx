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
