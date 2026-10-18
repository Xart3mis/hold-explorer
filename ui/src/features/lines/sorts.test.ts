import { describe, expect, it } from "vitest";
import type { HoldSort } from "../../bindings/HoldSort";
import type { LineSort } from "../../bindings/LineSort";
import {
  HOLD_SORTS,
  holdSortOf,
  holdTableSort,
  LINE_SORTS,
  lineSortOf,
  lineTableSort,
  pressedSort,
} from "./sorts";

/** Every sortable column of each mode, the sort it asks for, and the direction that sort is in. */
const lineColumns: [string, LineSort, "ascending" | "descending"][] = [
  ["line", "LineId", "ascending"],
  ["holds", "HoldsDesc", "descending"],
  ["disciplines", "Disciplines", "descending"],
  ["holdTypes", "HoldTypes", "descending"],
  ["blockers", "Blockers", "descending"],
  ["oldest", "OldestFirst", "descending"],
  ["modelSize", "ModelSize", "descending"],
  ["ldtSize", "LdtSize", "descending"],
  ["stressCalc", "StressCalc", "ascending"],
  ["sizes", "SizeMismatch", "descending"],
];

const holdColumns: [string, HoldSort, "ascending" | "descending"][] = [
  ["line", "LineId", "ascending"],
  ["discipline", "Discipline", "ascending"],
  ["holdType", "HoldType", "ascending"],
  ["remark", "Remark", "ascending"],
  ["blocker", "Blocker", "ascending"],
  ["blockerType", "BlockerType", "ascending"],
  ["name", "Name", "ascending"],
  ["role", "Role", "ascending"],
  ["created", "Created", "ascending"],
  ["status", "Status", "ascending"],
  ["releasedOn", "ReleaseDate", "ascending"],
  ["days", "OldestFirst", "descending"],
];

const opposite = { ascending: "descending", descending: "ascending" } as const;

describe("the sorts of the Lines destination", () => {
  it("lists exactly these sortable columns", () => {
    expect(LINE_SORTS.map((entry) => entry.column)).toEqual(lineColumns.map(([column]) => column));
    expect(HOLD_SORTS.map((entry) => entry.column)).toEqual(holdColumns.map(([column]) => column));
  });

  it.each(lineColumns)(
    "Lines: %s asks for %s, %s as it comes, and back",
    (column, sort, direction) => {
      expect(lineSortOf(column, direction)).toEqual({ sort, reverse: false });
      expect(lineSortOf(column, opposite[direction])).toEqual({ sort, reverse: true });
      expect(lineTableSort(sort, false)).toEqual({ column, direction });
      expect(lineTableSort(sort, true)).toEqual({ column, direction: opposite[direction] });
    },
  );

  it.each(holdColumns)(
    "Holds: %s asks for %s, %s as it comes, and back",
    (column, sort, direction) => {
      expect(holdSortOf(column, direction)).toEqual({ sort, reverse: false });
      expect(holdSortOf(column, opposite[direction])).toEqual({ sort, reverse: true });
      expect(holdTableSort(sort, false)).toEqual({ column, direction });
      expect(holdTableSort(sort, true)).toEqual({ column, direction: opposite[direction] });
    },
  );

  it("marks no column for a sort that belongs to no column", () => {
    // Easiest belongs to its preset only; the order of the file is no column's.
    expect(lineTableSort("Easiest", false)).toBeUndefined();
    expect(lineTableSort("Easiest", true)).toBeUndefined();
    expect(holdTableSort("FileOrder", false)).toBeUndefined();
    expect(holdTableSort("FileOrder", true)).toBeUndefined();
  });

  it("asks for nothing for a column that cannot be sorted", () => {
    for (const column of ["mismatch", "unknown"]) {
      expect(lineSortOf(column, "ascending")).toBeNull();
    }
    for (const column of ["unknown"]) {
      expect(holdSortOf(column, "ascending")).toBeNull();
    }
  });

  it.each(lineColumns)("Lines: pressing %s twice sends %s, then its reverse", (column, sort) => {
    const first = pressedSort(LINE_SORTS, undefined, column);
    expect(lineSortOf(first.column, first.direction)).toEqual({ sort, reverse: false });
    expect(lineTableSort(sort, false)).toEqual(first);
    const second = pressedSort(LINE_SORTS, first, column);
    expect(lineSortOf(second.column, second.direction)).toEqual({ sort, reverse: true });
    expect(lineTableSort(sort, true)).toEqual(second);
  });

  it.each(holdColumns)("Holds: pressing %s twice sends %s, then its reverse", (column, sort) => {
    const first = pressedSort(HOLD_SORTS, undefined, column);
    expect(holdSortOf(first.column, first.direction)).toEqual({ sort, reverse: false });
    expect(holdTableSort(sort, false)).toEqual(first);
    const second = pressedSort(HOLD_SORTS, first, column);
    expect(holdSortOf(second.column, second.direction)).toEqual({ sort, reverse: true });
    expect(holdTableSort(sort, true)).toEqual(second);
  });

  it("asks for a column's own order on a first press, and reverses it on the next", () => {
    // The order is the one of the table the header belongs to.
    expect(pressedSort(LINE_SORTS, undefined, "line")).toEqual({
      column: "line",
      direction: "ascending",
    });
    expect(pressedSort(HOLD_SORTS, undefined, "holds")).toEqual({
      column: "holds",
      direction: "ascending",
    });
    // A descending column comes descending, whatever the table suggests.
    expect(pressedSort(LINE_SORTS, undefined, "holds")).toEqual({
      column: "holds",
      direction: "descending",
    });
    expect(pressedSort(LINE_SORTS, { column: "line", direction: "ascending" }, "oldest")).toEqual({
      column: "oldest",
      direction: "descending",
    });
    expect(pressedSort(LINE_SORTS, undefined, "line")).toEqual({
      column: "line",
      direction: "ascending",
    });
    // The sorted column, pressed again, turns round, and again.
    expect(
      pressedSort(LINE_SORTS, { column: "oldest", direction: "descending" }, "oldest"),
    ).toEqual({
      column: "oldest",
      direction: "ascending",
    });
    expect(pressedSort(LINE_SORTS, { column: "oldest", direction: "ascending" }, "oldest")).toEqual(
      {
        column: "oldest",
        direction: "descending",
      },
    );
    expect(pressedSort(HOLD_SORTS, undefined, "name")).toEqual({
      column: "name",
      direction: "ascending",
    });
    expect(pressedSort(HOLD_SORTS, undefined, "days")).toEqual({
      column: "days",
      direction: "descending",
    });
  });
});
