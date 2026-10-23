// Everything that talks to Tauri other than commands: the file dialogs, the file manager, the
// files dragged over the window, a close of the window that waits for a write, and the opening
// of a file the app saved. Screens import from
// here and never from `@tauri-apps/*`.
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { t, type MessageKey } from "../text/i18n";
import { api } from "./commands";
import { IMPORT_EXTENSIONS } from "./files";

/**
 * Asks for one file to import, offering the formats an import reads. Resolves with its path, or
 * with `null` when the dialog was cancelled.
 */
export function chooseImportFile(): Promise<string | null> {
  return open({
    multiple: false,
    directory: false,
    filters: [{ name: t("import.fileFilter"), extensions: [...IMPORT_EXTENSIONS] }],
  });
}

/**
 * Asks for a folder to keep the workspaces in. Resolves with its path, or with `null` when the
 * dialog was cancelled.
 */
export function chooseFolder(): Promise<string | null> {
  return open({ multiple: false, directory: true });
}

/** The kinds of file an export saves, each offered alone in the save dialog. */
export type FileFormat = "xlsx" | "csv" | "pdf" | "png" | "svg";

/** The name of each kind of file in the filter of the save dialog. */
const FORMAT_NAMES: Record<FileFormat, MessageKey> = {
  xlsx: "export.fileFilter.xlsx",
  csv: "export.fileFilter.csv",
  pdf: "export.fileFilter.pdf",
  png: "export.fileFilter.png",
  svg: "export.fileFilter.svg",
};

/**
 * Asks where to save, offering one format, with `defaultName` as the name the dialog proposes.
 * Resolves with the path, or `null` when cancelled. The path is the one chosen, as it is: the
 * save command refuses a name that does not end in the extension of its format.
 */
export function chooseSavePath(defaultName: string, format: FileFormat): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: t(FORMAT_NAMES[format]), extensions: [format] }],
  });
}

/**
 * Opens a file the app saved in this session with the system's program. Rejects with the kind
 * `NotWritten` for any other file, and `Open` when the system could not open it.
 */
export async function openSavedFile(path: string): Promise<void> {
  await api.exportOpen(path);
}

/**
 * Whether the window runs inside the app, where the Tauri runtime marks it. In a plain browser,
 * as on the development page or in a test, there is no file dialog and no window to drop on.
 */
export function inApp(): boolean {
  return (globalThis as { isTauri?: unknown }).isTauri === true;
}

/** Shows a file or a folder in the file manager of the system, selected in its folder. */
export async function showInFolder(path: string): Promise<void> {
  await revealItemInDir(path);
}

/** What happens to files dragged over the window: they arrive, they leave, or they are dropped. */
export type FileDragEvent =
  { type: "enter"; paths: string[] } | { type: "leave" } | { type: "drop"; paths: string[] };

/**
 * Hears the files dragged over the window, with their full paths. Resolves with the function that
 * stops listening. Where the pointer is while it moves is left out: the whole window is the target.
 */
export async function onFileDrag(handler: (event: FileDragEvent) => void): Promise<() => void> {
  const stop = await getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === "enter" || payload.type === "drop") {
      handler({ type: payload.type, paths: payload.paths });
    } else if (payload.type === "leave") {
      handler({ type: "leave" });
    }
  });
  return stop;
}

/** The event Rust sends when a close of the window waits for a write to finish. */
const CLOSING_HELD = "closing-held";

/**
 * Hears that the window was asked to close while a file is being saved: Rust holds the close
 * back and closes the window itself once the saving has finished. Resolves with the function
 * that stops listening.
 */
export async function onClosingHeld(handler: () => void): Promise<() => void> {
  return listen(CLOSING_HELD, () => {
    handler();
  });
}
