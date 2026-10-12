import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { beforeAll, describe, expect, it, vi } from "vitest";
import en from "../locales/en.json";
import { fileName, IMPORT_EXTENSIONS } from "./files";

// Every other test gets the stand-in of ui/src/test/window.ts; this one tests the module itself.
let real: typeof import("./window");
beforeAll(async () => {
  real = await vi.importActual<typeof import("./window")>("./window");
});

interface Call {
  command: string;
  payload: unknown;
}

/** Answers the plugin commands and keeps what was asked. Events are passed on to listeners. */
function plugins(answers: Record<string, (payload: unknown) => unknown>): Call[] {
  const calls: Call[] = [];
  mockWindows("main");
  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      const answer = answers[command];
      if (answer === undefined) throw new Error(`The test has no answer for ${command}.`);
      return answer(payload);
    },
    { shouldMockEvents: true },
  );
  return calls;
}

describe("the files an import takes", () => {
  it("are the eight spreadsheet and text formats", () => {
    expect(IMPORT_EXTENSIONS).toEqual(["xlsx", "xlsm", "xlsb", "xls", "ods", "csv", "tsv", "txt"]);
  });

  it("names a file by the last part of its path, on Windows and on Linux", () => {
    expect(fileName("/home/ada/exports/Holds_2026-10-07.xlsx")).toBe("Holds_2026-10-07.xlsx");
    expect(fileName("C:\\Exports\\Holds 2026-10-07.xlsx")).toBe("Holds 2026-10-07.xlsx");
    expect(fileName("Holds.csv")).toBe("Holds.csv");
  });
});

describe("chooseImportFile", () => {
  it("opens the file dialog for one file, filtered to the formats an import takes", async () => {
    const calls = plugins({ "plugin:dialog|open": () => "/exports/Holds.xlsx" });
    await expect(real.chooseImportFile()).resolves.toBe("/exports/Holds.xlsx");
    expect(calls).toEqual([
      {
        command: "plugin:dialog|open",
        payload: {
          options: {
            multiple: false,
            directory: false,
            filters: [{ name: en.import.fileFilter, extensions: [...IMPORT_EXTENSIONS] }],
          },
        },
      },
    ]);
  });

  it("gives null when the dialog is cancelled", async () => {
    plugins({ "plugin:dialog|open": () => null });
    await expect(real.chooseImportFile()).resolves.toBeNull();
  });
});

describe("inApp", () => {
  it("is false in a plain browser and under the mocked commands of a test", () => {
    expect(real.inApp()).toBe(false);
    plugins({});
    expect(real.inApp()).toBe(false);
  });

  it("is true where the Tauri runtime has marked the window", () => {
    vi.stubGlobal("isTauri", true);
    try {
      expect(real.inApp()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("showInFolder", () => {
  it("asks the file manager to show the path", async () => {
    const calls = plugins({ "plugin:opener|reveal_item_in_dir": () => null });
    await real.showInFolder("/data/workspaces/a.holdx-ws");
    expect(calls).toEqual([
      {
        command: "plugin:opener|reveal_item_in_dir",
        payload: { paths: ["/data/workspaces/a.holdx-ws"] },
      },
    ]);
  });
});

describe("onFileDrag", () => {
  it("reduces the window's drag events to enter, leave, and drop with paths", async () => {
    plugins({});
    const seen: unknown[] = [];
    const stop = await real.onFileDrag((event) => seen.push(event));

    await emit("tauri://drag-enter", { paths: ["/exports/a.xlsx"], position: { x: 1, y: 2 } });
    await emit("tauri://drag-over", { position: { x: 3, y: 4 } });
    await emit("tauri://drag-leave", null);
    await emit("tauri://drag-drop", { paths: ["/exports/a.xlsx"], position: { x: 5, y: 6 } });

    expect(seen).toEqual([
      { type: "enter", paths: ["/exports/a.xlsx"] },
      { type: "leave" },
      { type: "drop", paths: ["/exports/a.xlsx"] },
    ]);

    stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await emit("tauri://drag-enter", { paths: ["/exports/b.xlsx"], position: { x: 1, y: 2 } });
    expect(seen).toHaveLength(3);
  });
});
