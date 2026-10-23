import { vi } from "vitest";
import type { FileDragEvent, FileFormat } from "../api/window";

type DragHandler = (event: FileDragEvent) => void;

const handlers = new Set<DragHandler>();
const heldHandlers = new Set<(held: boolean) => void>();

/**
 * What stands in for `ui/src/api/window.ts` in every test: the file dialogs, the file manager,
 * the opening of a saved file, the drag of a file over the window, and a close of the window
 * that waits for a write. The setup file puts it in place, so no test reaches a Tauri plugin. A
 * test says what the dialog returns and reads what was asked for:
 *
 *     windowApi.chooseImportFile.mockResolvedValue("/exports/Holds.xlsx");
 *     expect(windowApi.showInFolder).toHaveBeenCalledWith(path);
 */
export const windowApi = {
  chooseImportFile: vi.fn<() => Promise<string | null>>(),
  chooseFolder: vi.fn<() => Promise<string | null>>(),
  showInFolder: vi.fn<(path: string) => Promise<void>>(),
  chooseSavePath: vi.fn<(defaultName: string, format: FileFormat) => Promise<string | null>>(),
  openSavedFile: vi.fn<(path: string) => Promise<void>>(),
  onFileDrag: vi.fn<(handler: DragHandler) => Promise<() => void>>(),
  onClosingHeld: vi.fn<(change: (held: boolean) => void) => Promise<() => void>>(),
  /** Whether the window runs inside the app. A test is a plain browser unless it says otherwise. */
  inApp: vi.fn<() => boolean>(),
};

/**
 * Puts the stand-in back as a test finds it: cancelled dialogs, a folder that shows, a saved file
 * that opens, no drag.
 */
export function resetWindowApi(): void {
  handlers.clear();
  heldHandlers.clear();
  windowApi.chooseImportFile.mockReset().mockResolvedValue(null);
  windowApi.chooseFolder.mockReset().mockResolvedValue(null);
  windowApi.showInFolder.mockReset().mockResolvedValue(undefined);
  windowApi.chooseSavePath.mockReset().mockResolvedValue(null);
  windowApi.openSavedFile.mockReset().mockResolvedValue(undefined);
  windowApi.inApp.mockReset().mockReturnValue(false);
  windowApi.onFileDrag.mockReset().mockImplementation((handler) => {
    handlers.add(handler);
    return Promise.resolve(() => {
      handlers.delete(handler);
    });
  });
  windowApi.onClosingHeld.mockReset().mockImplementation((handler) => {
    heldHandlers.add(handler);
    return Promise.resolve(() => {
      heldHandlers.delete(handler);
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

/**
 * Plays the events Rust sends about a close of the window: that it waits for a write to finish,
 * and that it could not be carried out after all.
 */
export const closingHeld = {
  send: () => {
    for (const handler of [...heldHandlers]) handler(true);
  },
  resume: () => {
    for (const handler of [...heldHandlers]) handler(false);
  },
  /** How many listeners are attached. */
  listeners: () => heldHandlers.size,
};

resetWindowApi();
