import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextSort, sortAddress, sortOfAddress, sortRows, useTableSort } from "./useTableSort";

interface Row {
  key: string;
  name: string | null;
  count: number | null;
  folded?: boolean;
}

const COLUMNS = [
  { id: "name", sortValue: (row: Row) => row.name },
  { id: "count", sortValue: (row: Row) => row.count, sortFirst: "descending" as const },
  { id: "plain" },
];

const keysOf = (rows: readonly Row[]) => rows.map((row) => row.key);

function row(key: string, name: string | null, count: number | null = 0): Row {
  return { key, name, count };
}

describe("sortRows", () => {
  it("leaves the rows as they come without a sort, or for a column that sorts nothing", () => {
    const rows = [row("b", "B"), row("a", "A")];
    expect(sortRows(rows, COLUMNS, undefined)).toBe(rows);
    expect(sortRows(rows, COLUMNS, { column: "plain", direction: "ascending" })).toBe(rows);
    expect(sortRows(rows, COLUMNS, { column: "gone", direction: "ascending" })).toBe(rows);
  });

  it("compares text with the collator: case, accents, and numbers in text", () => {
    const rows = [
      row("item10", "Item 10"),
      row("eacute", "élan"),
      row("item2", "Item 2"),
      row("upper", "Elan"),
      row("lower", "apple"),
      row("zulu", "Zulu"),
    ];
    const sorted = sortRows(rows, COLUMNS, { column: "name", direction: "ascending" });
    // "élan" and "Elan" are the same at base sensitivity, so they keep the order they came in.
    expect(keysOf(sorted)).toEqual(["lower", "eacute", "upper", "item2", "item10", "zulu"]);
    const reversed = sortRows(rows, COLUMNS, { column: "name", direction: "descending" });
    expect(keysOf(reversed)).toEqual(["zulu", "item10", "item2", "eacute", "upper", "lower"]);
  });

  it("compares numbers as numbers", () => {
    const rows = [
      row("nine", "", 9),
      row("ten", "", 10),
      row("hundred", "", 100),
      row("one", "", 1),
    ];
    expect(keysOf(sortRows(rows, COLUMNS, { column: "count", direction: "ascending" }))).toEqual([
      "one",
      "nine",
      "ten",
      "hundred",
    ]);
    expect(keysOf(sortRows(rows, COLUMNS, { column: "count", direction: "descending" }))).toEqual([
      "hundred",
      "ten",
      "nine",
      "one",
    ]);
  });

  it("keeps a row without a value last in both directions", () => {
    const rows = [row("none", null, null), row("two", "B", 2), row("one", "A", 1)];
    for (const column of ["name", "count"]) {
      for (const direction of ["ascending", "descending"] as const) {
        expect(sortRows(rows, COLUMNS, { column, direction }).at(-1)?.key).toBe("none");
      }
    }
  });

  it("keeps the order the rows came in for ties, in both directions", () => {
    const rows = [row("first", "Same", 3), row("second", "Same", 3), row("third", "Same", 3)];
    for (const direction of ["ascending", "descending"] as const) {
      expect(keysOf(sortRows(rows, COLUMNS, { column: "count", direction }))).toEqual([
        "first",
        "second",
        "third",
      ]);
      expect(keysOf(sortRows(rows, COLUMNS, { column: "name", direction }))).toEqual([
        "first",
        "second",
        "third",
      ]);
    }
  });

  it("keeps a row that stays last there in both directions, after the rows without a value", () => {
    const rows = [
      { ...row("others", "All others", 900), folded: true },
      row("none", null, null),
      row("small", "A", 1),
      row("big", "Z", 50),
    ];
    const last = (item: Row) => item.folded === true;
    for (const direction of ["ascending", "descending"] as const) {
      const sorted = sortRows(rows, COLUMNS, { column: "count", direction }, last);
      expect(keysOf(sorted).slice(-2)).toEqual(["none", "others"]);
    }
  });
});

describe("useTableSort", () => {
  it("hands back the same rows while the rows and the sort are the same", () => {
    const rows = [row("b", "B", 2), row("a", "A", 1)];
    const sort = { column: "name", direction: "ascending" } as const;
    const { result, rerender } = renderHook(() => useTableSort(rows, COLUMNS, sort));
    const first = result.current;
    expect(keysOf(first)).toEqual(["a", "b"]);
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("nextSort", () => {
  it("asks for a column's first direction, ascending unless it says otherwise", () => {
    expect(nextSort(COLUMNS, undefined, "name")).toEqual({
      column: "name",
      direction: "ascending",
    });
    expect(nextSort(COLUMNS, { column: "name", direction: "ascending" }, "count")).toEqual({
      column: "count",
      direction: "descending",
    });
  });

  it("turns the sorted column round", () => {
    expect(nextSort(COLUMNS, { column: "count", direction: "descending" }, "count")).toEqual({
      column: "count",
      direction: "ascending",
    });
    expect(nextSort(COLUMNS, { column: "count", direction: "ascending" }, "count")).toEqual({
      column: "count",
      direction: "descending",
    });
  });
});

describe("the sort in an address", () => {
  it("is read back as it was written", () => {
    for (const sort of [
      { column: "name", direction: "ascending" },
      { column: "count", direction: "descending" },
    ] as const) {
      const parts = new URLSearchParams();
      sortAddress(parts, sort);
      expect(parts.toString()).toBe(
        `sort=${sort.column}&dir=${sort.direction === "ascending" ? "asc" : "desc"}`,
      );
      expect(sortOfAddress(parts, ["name", "count"])).toEqual(sort);
    }
  });

  it("writes nothing for no sort, and reads none from a part it cannot read", () => {
    const parts = new URLSearchParams();
    sortAddress(parts, undefined);
    expect(parts.toString()).toBe("");
    expect(sortOfAddress(new URLSearchParams(""), ["name"])).toBeUndefined();
    expect(sortOfAddress(new URLSearchParams("sort=name"), ["name"])).toBeUndefined();
    expect(sortOfAddress(new URLSearchParams("sort=name&dir=up"), ["name"])).toBeUndefined();
    expect(sortOfAddress(new URLSearchParams("sort=gone&dir=asc"), ["name"])).toBeUndefined();
  });
});
