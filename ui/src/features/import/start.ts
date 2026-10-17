// The one way an import starts. The Import button, Ctrl+I, "Open a file" on the welcome page, and
// a file dropped anywhere on the window all call `startImport`.
import { asCommandError } from "../../api/error";
import { chooseImportFile } from "../../api/window";
import type { CommandError } from "../../bindings/CommandError";
import type { ImportDraft } from "../../bindings/ImportDraft";

/** The page that chooses the sheet of a workbook to read. */
export const IMPORT_SHEET_PATH = "/import/sheet";
/** The page that maps the columns of the file, for a file whose required fields are not all covered. */
export const IMPORT_MAPPING_PATH = "/import/mapping";
/** The page that reviews what the import will do. */
export const IMPORT_REVIEW_PATH = "/import/review";

/** The page a file goes to once it is open: the review, or the mapping step when fields are missing. */
export function nextStep(draft: ImportDraft): string {
  return draft.missing_required.length === 0 ? IMPORT_REVIEW_PATH : IMPORT_MAPPING_PATH;
}

/** What the import page is opened with. */
export interface ImportRequest {
  /** The file to read. Absent when the file dialog itself failed; `error` then says why. */
  path?: string;
  /** How many more files were dropped together with this one. They are not imported. */
  others: number;
  /** Why no file could be chosen. */
  error?: CommandError;
}

/** What the import page finds at its address: the request, and where the import was started. */
export interface ImportLocation extends ImportRequest {
  /** The address to return to when the import is cancelled. */
  from: string;
  /**
   * A page of the flow was reached while no file was open, as after a restart of the interface,
   * and led here: the file has to be opened again, and the import page says so.
   */
  reopen?: boolean;
}

type Opener = (request: ImportRequest) => void;

let opener: Opener | null = null;

/** How many imports were started since the app was loaded. */
let started = 0;

/**
 * How many imports were started since the app was loaded. A cancel compares it with what it was
 * when the cancel was pressed: an import started since then is not the one it was pressed for.
 */
export function startedImports(): number {
  return started;
}

/**
 * Tells `startImport` how the import page is opened. The shell calls it with a function that
 * navigates; it returns the function that takes the connection back.
 */
export function connectImportStart(open: Opener): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/**
 * Starts an import. With a path, the import page is opened for that file. Without one, the file
 * dialog is opened first, and a cancelled dialog changes nothing. `others` is how many more files
 * came with a dropped one.
 */
export async function startImport(path?: string, others = 0): Promise<void> {
  if (!opener) {
    throw new Error(
      "startImport was called before the shell was shown, so there is no import page to open. " +
        "Call it from inside the routes of ui/src/app/router.tsx.",
    );
  }
  const open = opener;
  if (path !== undefined) {
    started += 1;
    open({ path, others });
    return;
  }
  let chosen: string | null;
  try {
    chosen = await chooseImportFile();
  } catch (error) {
    open({ others: 0, error: { ...asCommandError(error), kind: "Dialog" } });
    return;
  }
  if (chosen !== null) {
    started += 1;
    open({ path: chosen, others: 0 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads what the import page was opened with from what its address carries. An address that
 * carries nothing, as when it is typed, names no file, and its import was started at `home`.
 */
export function readImportLocation(value: unknown, home: string): ImportLocation {
  if (!isRecord(value)) return { from: home, others: 0 };
  const { path, from, others, error, reopen } = value;
  const request: ImportLocation = {
    from: typeof from === "string" && from !== "" ? from : home,
    others: typeof others === "number" && others > 0 ? others : 0,
  };
  if (typeof path === "string" && path !== "") request.path = path;
  if (reopen === true) request.reopen = true;
  if (isRecord(error) && typeof error.kind === "string" && typeof error.message === "string") {
    request.error = { kind: error.kind, message: error.message };
  }
  return request;
}
