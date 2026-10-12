import { afterEach, describe, expect, it, vi } from "vitest";
import { windowApi } from "../../test/window";
import { connectImportStart, readImportLocation, startImport } from "./start";

let disconnect: (() => void) | null = null;
afterEach(() => {
  disconnect?.();
  disconnect = null;
});

describe("startImport", () => {
  it("rejects, and throws nothing, when no shell is connected", async () => {
    const started = startImport("/exports/Holds.xlsx");
    await expect(started).rejects.toThrow(/before the shell was shown/);
    expect(windowApi.chooseImportFile).not.toHaveBeenCalled();
  });

  it("opens the import page for a path without asking for a file", async () => {
    const open = vi.fn();
    disconnect = connectImportStart(open);
    await startImport("/exports/Holds.xlsx", 2);
    expect(open).toHaveBeenCalledWith({ path: "/exports/Holds.xlsx", others: 2 });
    expect(windowApi.chooseImportFile).not.toHaveBeenCalled();
  });

  it("asks for a file when it is given none, and does nothing when the dialog is cancelled", async () => {
    const open = vi.fn();
    disconnect = connectImportStart(open);
    windowApi.chooseImportFile.mockResolvedValueOnce(null);
    await startImport();
    expect(open).not.toHaveBeenCalled();

    windowApi.chooseImportFile.mockResolvedValueOnce("/exports/Holds.xlsx");
    await startImport();
    expect(open).toHaveBeenCalledWith({ path: "/exports/Holds.xlsx", others: 0 });
  });

  it("opens the import page with the reason when the file dialog fails", async () => {
    const open = vi.fn();
    disconnect = connectImportStart(open);
    windowApi.chooseImportFile.mockRejectedValueOnce("The dialog plugin is not available.");
    await startImport();
    expect(open).toHaveBeenCalledWith({
      others: 0,
      error: { kind: "Dialog", message: "The dialog plugin is not available." },
    });
  });

  it("is disconnected only by the one that connected it", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = connectImportStart(first);
    disconnect = connectImportStart(second);
    offFirst();
    await startImport("/exports/a.xlsx");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe("readImportLocation", () => {
  it("reads what the import page was opened with", () => {
    expect(readImportLocation({ path: "/a.xlsx", from: "/lines", others: 2 }, "/overview")).toEqual(
      {
        path: "/a.xlsx",
        from: "/lines",
        others: 2,
      },
    );
  });

  it("names no file and starts at home for an address that carries nothing", () => {
    expect(readImportLocation(null, "/welcome")).toEqual({ from: "/welcome", others: 0 });
    expect(readImportLocation({ path: 3, from: "", others: -1 }, "/overview")).toEqual({
      from: "/overview",
      others: 0,
    });
  });
});
