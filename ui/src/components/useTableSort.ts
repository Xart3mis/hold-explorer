// Sorting the rows of a table the screen holds whole, by the value a column says it sorts by.
// Paged tables (Lines, hold rows) are sorted by Rust; this sorts only rows that are all here, by
// values a command returned, which is presentation: it never sends a request.
import { useMemo } from "react";
import { compareText } from "../text/format";
import type { DataTableSort } from "./DataTable/DataTable";

type Direction = DataTableSort["direction"];

/** The value a row is ordered by in a column; `null` for a row without one. */
export type SortValue = string | number | null;

/** What sorting needs to know of a column: its id, and what it sorts by, if anything. */
export interface SortableColumn<Item> {
  id: string;
  /** The value the rows are ordered by when this header is pressed. */
  sortValue?: ((item: Item) => SortValue) | undefined;
  /** The direction of a first press: `descending` for counts and ages, `ascending` for text. */
  sortFirst?: Direction | undefined;
}

function compareValues(one: string | number, other: string | number): number {
  if (typeof one === "number" && typeof other === "number") return one - other;
  return compareText(String(one), String(other));
}

/**
 * The rows ordered by the column `sort` names. Text compares with the collator (base
 * sensitivity, numbers in text as numbers), numbers as numbers; a row without a value stays last
 * in both directions, and so, after it, does a row `staysLast` names (the folded "All others" row
 * of a heatmap); ties keep the order the rows came in. Without a sort, or for a column that sorts
 * nothing, the rows are handed back as they came.
 */
export function sortRows<Item>(
  rows: readonly Item[],
  columns: readonly SortableColumn<Item>[],
  sort: DataTableSort | undefined,
  staysLast?: (item: Item) => boolean,
): readonly Item[] {
  if (sort === undefined) return rows;
  const valueOf = columns.find((column) => column.id === sort.column)?.sortValue;
  if (valueOf === undefined) return rows;
  const sign = sort.direction === "ascending" ? 1 : -1;
  const keyed = rows.map((item, index) => ({
    item,
    index,
    value: valueOf(item),
    last: staysLast?.(item) === true,
  }));
  keyed.sort((one, other) => {
    if (one.last !== other.last) return one.last ? 1 : -1;
    if (one.value === null || other.value === null) {
      if (one.value === other.value) return one.index - other.index;
      return one.value === null ? 1 : -1;
    }
    return sign * compareValues(one.value, other.value) || one.index - other.index;
  });
  return keyed.map((entry) => entry.item);
}

/**
 * Sorts rows held whole by the column a header asks for (see `sortRows`). The sorted rows are
 * worked out again only when the rows, the columns, or the sort change, so a table handed them
 * builds no row again at a render that changes none of them.
 */
export function useTableSort<Item>(
  rows: readonly Item[],
  columns: readonly SortableColumn<Item>[],
  sort: DataTableSort | undefined,
  staysLast?: (item: Item) => boolean,
): readonly Item[] {
  const column = sort?.column;
  const direction = sort?.direction;
  return useMemo(
    () =>
      sortRows(
        rows,
        columns,
        column === undefined || direction === undefined ? undefined : { column, direction },
        staysLast,
      ),
    [rows, columns, column, direction, staysLast],
  );
}

/**
 * The sort a pressed header asks for: its column's first direction (`sortFirst`, ascending when
 * it says none), or the other one when it is the sorted header.
 */
export function nextSort<Item>(
  columns: readonly SortableColumn<Item>[],
  current: DataTableSort | undefined,
  column: string,
): DataTableSort {
  if (current?.column === column) {
    return { column, direction: current.direction === "ascending" ? "descending" : "ascending" };
  }
  const first = columns.find((entry) => entry.id === column)?.sortFirst ?? "ascending";
  return { column, direction: first };
}

const SORT = "sort";
const DIR = "dir";

/** The parts of an address a sort is written in. A page that writes one counts them its own. */
export const SORT_PARTS = [SORT, DIR] as const;

/** Writes a sort into the parts of an address as `sort=<column>&dir=<asc|desc>`; none, nothing. */
export function sortAddress(parts: URLSearchParams, sort: DataTableSort | undefined): void {
  if (sort === undefined) return;
  parts.set(SORT, sort.column);
  parts.set(DIR, sort.direction === "ascending" ? "asc" : "desc");
}

/**
 * The sort the parts of an address name, when its column is one of `columns` and its direction
 * one of the two; anything else is no sort.
 */
export function sortOfAddress(
  parts: URLSearchParams,
  columns: readonly string[],
): DataTableSort | undefined {
  const column = parts.get(SORT);
  const dir = parts.get(DIR);
  if (column === null || !columns.includes(column)) return undefined;
  if (dir === "asc") return { column, direction: "ascending" };
  if (dir === "desc") return { column, direction: "descending" };
  return undefined;
}
