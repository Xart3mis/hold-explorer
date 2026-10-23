// Everything that talks to Tauri other than commands: the file dialogs (opened by dialogs.ts), the
// file manager, the files dragged over the window, a close of the window that waits for a write,
// and the opening of a file the app saved. Screens import from here and never from `@tauri-apps/*`.
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "./commands";

export { chooseFolder, chooseImportFile, chooseSavePath, type FileFormat } from "./dialogs";

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

/** The event Rust sends when a close it held back could not be carried out after all. */
const CLOSING_RESUMED = "closing-resumed";

/**
 * Hears whether the window waits to close: `true` when it was asked to close while a file is
 * being saved, and Rust closes it itself once the saving has finished; `false` when that close
 * could not be carried out, and the window stays open. Resolves with the function that stops
 * listening.
 */
export async function onClosingHeld(change: (held: boolean) => void): Promise<() => void> {
  const stops = await Promise.all([
    listen(CLOSING_HELD, () => {
      change(true);
    }),
    listen(CLOSING_RESUMED, () => {
      change(false);
    }),
  ]);
  return () => {
    for (const stop of stops) stop();
  };
}
