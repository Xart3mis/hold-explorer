import type { Status } from "../../bindings/Status";
import { FILE_COLUMNS, type ExportScreen } from "./requests";

/** The remembered columns and rows of a screen. */
export interface ExportChoice {
  /** The column ids to write; empty writes every column the screen has. */
  columns: string[];
  /** Every row the filters keep, the rows the table has loaded, or the rows selected. */
  rows: "all" | "loaded" | "selected";
  /** The status of the filters, or one that replaces it for the export only. */
  status: Status | "filters";
}

/** What an export writes when nothing was chosen: every column and every row, as filtered. */
export const DEFAULT_CHOICE: Readonly<ExportChoice> = {
  columns: [],
  rows: "all",
  status: "filters",
};

/** The default choice, as a value of its own the caller may change. */
function fresh(): ExportChoice {
  return { ...DEFAULT_CHOICE, columns: [] };
}

const ROWS: readonly ExportChoice["rows"][] = ["all", "loaded", "selected"];
const STATUSES: readonly ExportChoice["status"][] = ["filters", "Open", "Released", "All"];

/** Where the choice of a screen is kept on this computer. */
function storageKey(screen: ExportScreen): string {
  return `hx.export.${screen}`;
}

function isOneOf<Value extends string>(options: readonly Value[], value: unknown): value is Value {
  return options.some((option) => option === value);
}

/**
 * The choice as stored, each part that reads as one taken and every other part the default. The
 * columns the screen no longer has are dropped, and the others put in table order.
 */
function parse(screen: ExportScreen, stored: unknown): ExportChoice {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return fresh();
  }
  const { columns, rows, status } = stored as Partial<Record<keyof ExportChoice, unknown>>;
  const named = new Set(
    Array.isArray(columns) ? columns.filter((id) => typeof id === "string") : [],
  );
  return {
    columns: FILE_COLUMNS[screen].filter((id) => named.has(id)),
    rows: isOneOf(ROWS, rows) ? rows : DEFAULT_CHOICE.rows,
    status: isOneOf(STATUSES, status) ? status : DEFAULT_CHOICE.status,
  };
}

/**
 * The remembered columns and rows of a screen; the defaults when none was saved, or when it
 * cannot be read: storage that refuses, or a text that is not a choice.
 */
export function readChoice(screen: ExportScreen): ExportChoice {
  try {
    const stored = window.localStorage.getItem(storageKey(screen));
    return stored === null ? fresh() : parse(screen, JSON.parse(stored));
  } catch {
    return fresh();
  }
}

/** Remembers the columns and rows of a screen. Storage that refuses keeps nothing, and says nothing. */
export function writeChoice(screen: ExportScreen, choice: ExportChoice): void {
  try {
    window.localStorage.setItem(storageKey(screen), JSON.stringify(choice));
  } catch {
    // Not remembered: the next export of the screen takes the defaults.
  }
}
