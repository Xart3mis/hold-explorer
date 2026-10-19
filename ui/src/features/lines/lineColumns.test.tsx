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

/** The ids of the columns of the lines that may leave a narrow table, the first to leave first. */
function leaving() {
  return lineColumns(20, [])
    .filter((column) => column.priority !== undefined)
    .sort((one, other) => (other.priority ?? 0) - (one.priority ?? 0))
    .map((column) => column.id);
}

describe("lineColumns", () => {
  it("lets only the columns the line panel shows leave a narrow table, the sizes first", () => {
    // Each of these is in the panel of the line: the sizes, the warning on the LDT size, and the
    // stress calc as facts; the hold types and the disciplines on its holds; the blockers listed.
    expect(leaving()).toEqual([
      "sizes",
      "stressCalc",
      "ldtSize",
      "modelSize",
      "holdTypes",
      "blockers",
      "disciplines",
    ]);
  });

  it("writes the line ID in the monospace, and no other column of the lines", () => {
    const columns = lineColumns(20, []);
    expect(columns.find((column) => column.id === "line")?.kind).toBe("identifier");
    expect(columns.filter((column) => column.kind === "identifier")).toHaveLength(1);
    expect(columns.find((column) => column.id === "holds")?.allowsSorting).toBe(true);
  });

  it("lets every column be sorted", () => {
    const columns = lineColumns(20, []);
    expect(columns.map((column) => column.id)).toHaveLength(10);
    for (const column of columns)
      expect([column.id, column.allowsSorting]).toEqual([column.id, true]);
  });

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
