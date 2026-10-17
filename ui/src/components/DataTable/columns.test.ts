import { describe, expect, it } from "vitest";
import { columnWidth, headerWidth, leavingColumns, textChars, type FitColumn } from "./columns";

const widths = { text: 8, mono: 9 };

describe("columnWidth", () => {
  it("gives a column of characters their room and the cell padding on both sides", () => {
    expect(columnWidth({ chars: 10 }, "text", widths, 12)).toEqual({ width: 104, minWidth: 104 });
    expect(columnWidth({ chars: 4 }, "number", widths, 8)).toEqual({ width: 48, minWidth: 48 });
  });

  it("gives a flex column its share as a fraction, and a minimum from its least characters", () => {
    expect(columnWidth({ flex: 1, minChars: 20 }, "text", widths, 12)).toEqual({
      width: "1fr",
      minWidth: 184,
    });
    expect(columnWidth({ flex: 2, minChars: 6 }, "text", widths, 8)).toEqual({
      width: "2fr",
      minWidth: 64,
    });
  });

  it("measures an identifier column in the monospace face", () => {
    expect(columnWidth({ chars: 21 }, "identifier", widths, 12)).toEqual({
      width: 213,
      minWidth: 213,
    });
    expect(columnWidth({ flex: 1, minChars: 10 }, "identifier", widths, 12).minWidth).toBe(114);
  });

  it("rounds a part of a pixel up, so the last character is never cut", () => {
    expect(columnWidth({ chars: 10 }, "text", { text: 7.21, mono: 7.8 }, 12).width).toBe(97);
    expect(columnWidth({ chars: 21 }, "identifier", { text: 7.21, mono: 7.8 }, 12).width).toBe(188);
  });
});

describe("textChars", () => {
  it("counts a figure in full and any other character as a letter, which is narrower", () => {
    expect(textChars("2026")).toBe(4);
    expect(textChars("Holds")).toBeCloseTo(4.25);
    expect(textChars("7 Oct 2026")).toBeCloseTo(5 + 5 * 0.85);
    expect(textChars("")).toBe(0);
  });
});

describe("headerWidth", () => {
  it("is the room the header text needs, with the cell padding on both sides", () => {
    // Five letters: 4.25 figures of 8 px, and 12 px at each side.
    expect(headerWidth("Holds", false, widths, 12, 20)).toBe(58);
  });

  it("adds the room of the arrow to a header that can be sorted", () => {
    expect(headerWidth("Holds", true, widths, 12, 20)).toBe(78);
  });
});

describe("leavingColumns", () => {
  // A table of five columns of 100 px: the first names the row, two may leave, one may not.
  const table: FitColumn[] = [
    { id: "line", least: 100, stays: true },
    { id: "holds", least: 100, stays: false },
    { id: "types", least: 100, priority: 1, stays: false },
    { id: "sizes", least: 100, priority: 3, stays: false },
    { id: "stress", least: 100, priority: 2, stays: false },
  ];
  const leaving = (width: number, columns = table, kept = 0) => [
    ...leavingColumns(columns, width, kept),
  ];

  it("lets every column stay where they all fit", () => {
    expect(leaving(500)).toEqual([]);
    expect(leaving(800)).toEqual([]);
  });

  it("takes the highest priority out first, then the next, until the rest fit", () => {
    expect(leaving(499)).toEqual(["sizes"]);
    expect(leaving(400)).toEqual(["sizes"]);
    expect(leaving(399)).toEqual(["sizes", "stress"]);
    expect(leaving(300)).toEqual(["sizes", "stress"]);
    expect(leaving(299)).toEqual(["sizes", "stress", "types"]);
  });

  it("never takes out a column without a priority, nor one that stays: the table scrolls then", () => {
    expect(leaving(120)).toEqual(["sizes", "stress", "types"]);
    const sorted = table.map((column) =>
      column.id === "sizes" ? { ...column, stays: true } : column,
    );
    expect(leaving(399, sorted)).toEqual(["stress", "types"]);
  });

  it("takes the later of two columns of the same priority first", () => {
    const same = table.map((column) =>
      column.id === "stress" ? { ...column, priority: 3 } : column,
    );
    expect(leaving(499, same)).toEqual(["stress"]);
  });

  it("counts the room that is kept besides, such as the row actions", () => {
    expect(leaving(500, table, 50)).toEqual(["sizes"]);
  });

  it("keeps the last column that takes a share of the width, whatever its priority", () => {
    const shared = table.map((column) =>
      column.id === "types" || column.id === "stress" ? { ...column, takesShare: true } : column,
    );
    // Of the two that take a share, the one of the higher priority may leave; the other stays.
    expect(leaving(299, shared)).toEqual(["sizes", "stress"]);
    expect(leaving(120, shared)).toEqual(["sizes", "stress"]);
  });

  it("lets every column stay while the width is not known", () => {
    expect(leaving(0)).toEqual([]);
    expect(leaving(Number.NaN)).toEqual([]);
  });
});
