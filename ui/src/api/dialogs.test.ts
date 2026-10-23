import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import en from "../locales/en.json";
import { answerDialogsFor, chooseFolder, chooseImportFile, chooseSavePath } from "./dialogs";
import { IMPORT_EXTENSIONS } from "./files";

interface Call {
  command: string;
  payload: unknown;
}

/** Answers every command with `answer` and keeps what was asked. */
function commands(answer: unknown): Call[] {
  const calls: Call[] = [];
  mockWindows("main");
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    return answer;
  });
  return calls;
}

afterEach(() => {
  answerDialogsFor({ e2e: false });
});

describe("the dialogs of a build that is not the e2e build", () => {
  it("are the system's dialogs, through the dialog plugin", async () => {
    answerDialogsFor({ e2e: false });
    const calls = commands("/exports/Holds.xlsx");
    await chooseImportFile();
    await chooseFolder();
    await chooseSavePath("Lines.csv", "csv");
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
      { command: "plugin:dialog|open", payload: { options: { multiple: false, directory: true } } },
      {
        command: "plugin:dialog|save",
        payload: {
          options: {
            defaultPath: "Lines.csv",
            filters: [{ name: en.export.fileFilter.csv, extensions: ["csv"] }],
          },
        },
      },
    ]);
  });
});

describe("the dialogs of the e2e build", () => {
  it("are answered by the substitute commands when the start says start.e2e", async () => {
    answerDialogsFor({ e2e: true });
    const calls = commands("/tmp/run/Holds.xlsx");
    await expect(chooseImportFile()).resolves.toBe("/tmp/run/Holds.xlsx");
    await expect(chooseFolder()).resolves.toBe("/tmp/run/Holds.xlsx");
    await expect(chooseSavePath("HoldExplorer_Lines.xlsx", "xlsx")).resolves.toBe(
      "/tmp/run/Holds.xlsx",
    );
    expect(calls).toEqual([
      { command: "e2e_open_path", payload: {} },
      { command: "e2e_open_path", payload: {} },
      { command: "e2e_save_path", payload: { suggested: "HoldExplorer_Lines.xlsx" } },
    ]);
  });

  it("gives null as a cancelled dialog does when the substitute has no path", async () => {
    answerDialogsFor({ e2e: true });
    commands(null);
    await expect(chooseImportFile()).resolves.toBeNull();
    await expect(chooseSavePath("Lines.csv", "csv")).resolves.toBeNull();
  });

  it("goes back to the system's dialogs when a later start says otherwise", async () => {
    answerDialogsFor({ e2e: true });
    answerDialogsFor({ e2e: false });
    const calls = commands(null);
    await chooseImportFile();
    expect(calls.map((call) => call.command)).toEqual(["plugin:dialog|open"]);
  });
});
