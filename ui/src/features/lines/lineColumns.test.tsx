import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import { lineRow } from "../../test/lines";
import { lineColumns } from "./lineColumns";

/** What the cell of a column shows for a line. */
function cellOf(id: string, line: ReturnType<typeof lineRow>) {
  const column = lineColumns(20, []).find((entry) => entry.id === id);
  if (column === undefined) throw new Error(`no column ${id}`);
  return column.cell(line);
}

describe("lineColumns", () => {
  it("leaves a blank hold type out of the list of a line, and writes none as no value", () => {
    // The export's blank spelling is `—`; the table says "no value" in one way in every column.
    expect(cellOf("holdTypes", lineRow("L", { hold_types: ["Vendor data", "—"] }))).toBe(
      "Vendor data",
    );
    expect(cellOf("holdTypes", lineRow("L", { hold_types: ["—"] }))).toBe(en.common.noValue);
    expect(cellOf("holdTypes", lineRow("L", { hold_types: ["Vendor data", "Stress"] }))).toBe(
      "Vendor data, Stress",
    );
  });
});
