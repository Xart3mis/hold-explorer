import { vi } from "vitest";
import type { FileDragEvent } from "../api/window";

type DragHandler = (event: FileDragEvent) => void;

const handlers = new Set<DragHandler>();

/**
 * What stands in for `ui/src/api/window.ts` in every test: the file dialog, the file manager, and
 * the drag of a file over the window. The setup file puts it in place, so no test reaches a
 * Tauri plugin. A test says what the dialog returns and reads what was asked for:
 *
 *     windowApi.chooseImportFile.mockResolvedValue("/exports/Holds.xlsx");
 *     expect(windowApi.showInFolder).toHaveBeenCalledWith(path);
 */
export const windowApi = {
  chooseImportFile: vi.fn<() => Promise<string | null>>(),
  showInFolder: vi.fn<(path: string) => Promise<void>>(),
  onFileDrag: vi.fn<(handler: DragHandler) => Promise<() => void>>(),
};

/** Puts the stand-in back as a test finds it: a cancelled dialog, a folder that shows, no drag. */
export function resetWindowApi(): void {
  handlers.clear();
  windowApi.chooseImportFile.mockReset().mockResolvedValue(null);
  windowApi.showInFolder.mockReset().mockResolvedValue(undefined);
  windowApi.onFileDrag.mockReset().mockImplementation((handler) => {
    handlers.add(handler);
    return Promise.resolve(() => {
      handlers.delete(handler);
    });
  });
}

function send(event: FileDragEvent): void {
  for (const handler of [...handlers]) handler(event);
}

/** Plays the drag of files over the window to whoever listens through `onFileDrag`. */
export const fileDrag = {
  enter: (paths: string[]) => {
    send({ type: "enter", paths });
  },
  leave: () => {
    send({ type: "leave" });
  },
  drop: (paths: string[]) => {
    send({ type: "drop", paths });
  },
  /** How many listeners are attached. */
  listeners: () => handlers.size,
};

resetWindowApi();
