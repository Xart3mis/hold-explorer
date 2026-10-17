// What a header of the Lines destination asks for when it is pressed, in each of its two modes,
// and which header the sort of the page marks: one table for each mode, read both ways.
import type { HoldSort } from "../../bindings/HoldSort";
import type { LineSort } from "../../bindings/LineSort";
import type { DataTableSort } from "../../components";

type Direction = DataTableSort["direction"];

/** A sortable column: the sort it asks for, and the direction that sort is in as it comes. */
export interface SortEntry<Sort> {
  column: string;
  sort: Sort;
  /** The direction of the sort without `reverse`. A first press of the header asks for it. */
  natural: Direction;
}

/**
 * The sortable columns of the lines, in the order of the table. A count, an age, or a size comes
 * largest first, as the command sorts it; a name comes from A. `Easiest` is no column's: it
 * belongs to its preset.
 */
export const LINE_SORTS: readonly SortEntry<LineSort>[] = [
  { column: "line", sort: "LineId", natural: "ascending" },
  { column: "holds", sort: "HoldsDesc", natural: "descending" },
  { column: "disciplines", sort: "Disciplines", natural: "descending" },
  { column: "blockers", sort: "Blockers", natural: "descending" },
  { column: "oldest", sort: "OldestFirst", natural: "descending" },
  { column: "modelSize", sort: "ModelSize", natural: "descending" },
  { column: "ldtSize", sort: "LdtSize", natural: "descending" },
  { column: "stressCalc", sort: "StressCalc", natural: "ascending" },
];

/**
 * The sortable columns of the holds. `days` is the age of an open hold and the duration of a
 * released one, which is what `OldestFirst` sorts by; its header says which. The order of the
 * file is no column's: it is the order the holds have without a sort.
 */
export const HOLD_SORTS: readonly SortEntry<HoldSort>[] = [
  { column: "line", sort: "LineId", natural: "ascending" },
  { column: "discipline", sort: "Discipline", natural: "ascending" },
  { column: "holdType", sort: "HoldType", natural: "ascending" },
  { column: "blocker", sort: "Blocker", natural: "ascending" },
  { column: "name", sort: "Name", natural: "ascending" },
  { column: "days", sort: "OldestFirst", natural: "descending" },
];

/** What a sort is sent as: the sort, and whether it is turned round. */
export interface SortChoice<Sort> {
  sort: Sort;
  reverse: boolean;
}

function sortOf<Sort>(
  table: readonly SortEntry<Sort>[],
  column: string,
  direction: Direction,
): SortChoice<Sort> | null {
  const entry = table.find((candidate) => candidate.column === column);
  return entry === undefined ? null : { sort: entry.sort, reverse: direction !== entry.natural };
}

function tableSort<Sort>(
  table: readonly SortEntry<Sort>[],
  sort: Sort,
  reverse: boolean,
): DataTableSort | undefined {
  const entry = table.find((candidate) => candidate.sort === sort);
  if (entry === undefined) return undefined;
  const turned = entry.natural === "ascending" ? "descending" : "ascending";
  return { column: entry.column, direction: reverse ? turned : entry.natural };
}

/** The sort of the lines a column asks for in a direction; `null` for a column without one. */
export function lineSortOf(column: string, direction: Direction): SortChoice<LineSort> | null {
  return sortOf(LINE_SORTS, column, direction);
}

/** The column and direction a sort of the lines marks; none for a sort that is no column's. */
export function lineTableSort(sort: LineSort, reverse: boolean): DataTableSort | undefined {
  return tableSort(LINE_SORTS, sort, reverse);
}

/** The sort of the holds a column asks for in a direction; `null` for a column without one. */
export function holdSortOf(column: string, direction: Direction): SortChoice<HoldSort> | null {
  return sortOf(HOLD_SORTS, column, direction);
}

/** The column and direction a sort of the holds marks; none for a sort that is no column's. */
export function holdTableSort(sort: HoldSort, reverse: boolean): DataTableSort | undefined {
  return tableSort(HOLD_SORTS, sort, reverse);
}

/**
 * The sort a pressed header of a table asks for, by that table's sorts (`LINE_SORTS` or
 * `HOLD_SORTS`). A header that is not the sorted one asks for its column's own order, whatever the
 * table suggests: the most holds, the oldest age, the largest size first. The sorted header,
 * pressed again, turns its order round.
 */
export function pressedSort<Sort>(
  table: readonly SortEntry<Sort>[],
  current: DataTableSort | undefined,
  column: string,
): DataTableSort {
  if (current?.column === column) {
    return {
      column,
      direction: current.direction === "ascending" ? "descending" : "ascending",
    };
  }
  const natural = table.find((entry) => entry.column === column)?.natural ?? "ascending";
  return { column, direction: natural };
}
