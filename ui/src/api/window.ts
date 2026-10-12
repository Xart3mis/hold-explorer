// Everything that talks to Tauri other than commands: the file dialog, the file manager, and the
// files dragged over the window. Screens import from here and never from `@tauri-apps/*`.
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { t } from "../app/i18n";
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
