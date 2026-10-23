import { QueryClientProvider } from "@tanstack/react-query";
import type { ErrorKind } from "../../bindings/ErrorKind";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArgsOf } from "../../api/commands";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import { ShellContext, type Shell } from "../../app/shell/context";
import type { AppStart } from "../../bindings/AppStart";
import type { CopyFormat } from "../../bindings/CopyFormat";
import type { ExportRequest } from "../../bindings/ExportRequest";
import type { SaveFormat } from "../../bindings/SaveFormat";
import { ToastRegion } from "../../components/ToastRegion/ToastRegion";
import en from "../../locales/en.json";
import { expectNoAxeViolations } from "../../test/axe";
import { openStart, opened } from "../../test/fixtures";
import { commandFailure, mockCommands, type Handlers } from "../../test/ipc";
import { windowApi } from "../../test/window";
import { ExportNotice } from "./ExportNotice";
import { useCopyExport, useSaveExport } from "./run";
import { exportText } from "./text";

const REQUEST: ExportRequest = {
  screen: { kind: "Blockers" },
  columns: [],
  rows: { kind: "Keys", keys: ["b1", "b2", "b3"] },
  spec: {
    status: "Open",
    fields: [],
    text: "",
    age_bands: [],
    created: { from: null, to: null },
    released: { from: null, to: null },
    size_mismatch: null,
  },
  text: exportText(),
  filters: [],
};
const EXCEL: SaveFormat = { kind: "Excel" };
const NAME = "HoldExplorer_Unit 573 piping_Blockers_2026-10-07.xlsx";
const PATH = `/home/ada/exports/${NAME}`;
const VIEW = { workspace_id: "a1b2c3d4e5f60718", snapshot_id: 2 };
const IN_USE =
  "Hold Explorer could not save Lines.xlsx: another program has it open. Close the file or choose another name.";

const report = vi.fn<Shell["report"]>();

function Harness({ copyFormat = { kind: "Table" } as CopyFormat, copyRequest = REQUEST }) {
  const saving = useSaveExport();
  const copying = useCopyExport();
  return (
    <>
      <p>{saving.isRunning ? "Saving" : "Not saving"}</p>
      <p>{copying.isRunning ? "Copying" : "Not copying"}</p>
      <button type="button" onClick={() => void saving.save(EXCEL, REQUEST, "Blockers")}>
        Save
      </button>
      <button type="button" onClick={() => void copying.copy(copyFormat, copyRequest)}>
        Copy
      </button>
      <ExportNotice run={saving} />
      <ExportNotice run={copying} />
    </>
  );
}

/** The harness under a shell whose start is `start`. */
function app(start: AppStart, props: Parameters<typeof Harness>[0]) {
  const shell: Shell = {
    start,
    dragged: null,
    arrivedAt: () => false,
    report,
    notify: vi.fn(),
  };
  return (
    <QueryClientProvider client={queryClient}>
      <ShellContext.Provider value={shell}>
        <ToastRegion>
          <Harness {...props} />
        </ToastRegion>
      </ShellContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * Renders the harness for the view of `openStart`, and returns the user and `show`, which puts
 * another start on screen, as a switch of snapshot or workspace does once it is over.
 */
function setupWith(handlers: Handlers, props: Parameters<typeof Harness>[0] = {}) {
  const start = openStart();
  queryClient.clear();
  queryClient.setQueryData(keys.start, start);
  mockCommands(handlers);
  const view = render(app(start, props));
  const show = (next: AppStart) => {
    queryClient.setQueryData(keys.start, next);
    view.rerender(app(next, props));
  };
  return { user: userEvent.setup(), show };
}

function setup(handlers: Handlers, props: Parameters<typeof Harness>[0] = {}) {
  return setupWith(handlers, props).user;
}

/** The start of `openStart` with its older snapshot in view. */
function olderSnapshot(): AppStart {
  return openStart({ open: opened({ selected: 1 }) });
}

beforeEach(() => {
  report.mockReset();
});

describe("useSaveExport", () => {
  it("does nothing and says nothing when the dialog is cancelled", async () => {
    windowApi.chooseSavePath.mockResolvedValue(null);
    const user = setup({});
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(windowApi.chooseSavePath).toHaveBeenCalledWith(NAME, "xlsx");
    });
    expect(screen.getByText("Not saving")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("saves to the path chosen, then says so in a toast that opens the file or its folder", async () => {
    windowApi.chooseSavePath.mockResolvedValue(PATH);
    let finish: (value: { path: string; rows: number }) => void = () => undefined;
    const sent: ArgsOf<"export_save">[] = [];
    const user = setup({
      export_save: (args) => {
        sent.push(args);
        args.onProgress.onmessage("Reading");
        if (sent.length > 1) return { path: PATH, rows: 3 };
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saving")).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ request: REQUEST, format: EXCEL, path: PATH, view: VIEW });

    finish({ path: PATH, rows: 3 });
    const toast = await screen.findByRole("group", { name: `Saved ${NAME}` });
    expect(screen.getByText("Not saving")).toBeInTheDocument();

    await user.click(within(toast).getByRole("button", { name: en.export.openFile }));
    expect(windowApi.openSavedFile).toHaveBeenCalledWith(PATH);

    await user.click(screen.getByRole("button", { name: "Save" }));
    const again = await screen.findByRole("group", { name: `Saved ${NAME}` });
    await user.click(within(again).getByRole("button", { name: en.common.showInFolder }));
    expect(windowApi.showInFolder).toHaveBeenCalledWith(PATH);
  });

  it("runs the two actions of the toast by keyboard", async () => {
    windowApi.chooseSavePath.mockResolvedValue(PATH);
    const user = setup({ export_save: () => ({ path: PATH, rows: 3 }) });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const toast = await screen.findByRole("group", { name: `Saved ${NAME}` });
    within(toast).getByRole("button", { name: en.export.openFile }).focus();
    await user.keyboard("{Enter}");
    expect(windowApi.openSavedFile).toHaveBeenCalledWith(PATH);

    await user.click(screen.getByRole("button", { name: "Save" }));
    const again = await screen.findByRole("group", { name: `Saved ${NAME}` });
    within(again).getByRole("button", { name: en.export.openFile }).focus();
    await user.tab();
    expect(within(again).getByRole("button", { name: en.common.showInFolder })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(windowApi.showInFolder).toHaveBeenCalledWith(PATH);
  });

  it("reports a file that could not be opened through the shell", async () => {
    windowApi.chooseSavePath.mockResolvedValue(PATH);
    windowApi.openSavedFile.mockRejectedValue(
      commandFailure("Open", "No program opens xlsx files on this computer."),
    );
    const user = setup({ export_save: () => ({ path: PATH, rows: 3 }) });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const toast = await screen.findByRole("group", { name: `Saved ${NAME}` });
    await user.click(within(toast).getByRole("button", { name: en.export.openFile }));
    await waitFor(() => {
      expect(report).toHaveBeenCalledWith({
        title: en.export.openFailed,
        error: { kind: "Open", message: "No program opens xlsx files on this computer." },
      });
    });
  });

  it("shows a file in use in a notice, with another name and another try", async () => {
    windowApi.chooseSavePath.mockResolvedValueOnce(PATH);
    const paths: string[] = [];
    const answers: (() => { path: string; rows: number })[] = [
      () => {
        throw commandFailure("FileInUse", IN_USE);
      },
      () => {
        throw commandFailure("FileInUse", IN_USE);
      },
      () => ({ path: "/home/ada/exports/Other.xlsx", rows: 3 }),
    ];
    const user = setup({
      export_save: ({ path }) => {
        paths.push(path);
        const answer = answers.shift();
        if (answer === undefined) throw new Error("No more answers.");
        return answer();
      },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(en.export.saveFailed);
    expect(notice).toHaveTextContent(IN_USE);

    await user.click(within(notice).getByRole("button", { name: en.common.retry }));
    await waitFor(() => {
      expect(paths).toEqual([PATH, PATH]);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(IN_USE);

    windowApi.chooseSavePath.mockResolvedValueOnce(null);
    await user.click(
      within(screen.getByRole("alert")).getByRole("button", { name: en.export.chooseAnother }),
    );
    await waitFor(() => {
      expect(windowApi.chooseSavePath).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(IN_USE);

    windowApi.chooseSavePath.mockResolvedValueOnce("/home/ada/exports/Other.xlsx");
    await user.click(
      within(screen.getByRole("alert")).getByRole("button", { name: en.export.chooseAnother }),
    );
    expect(await screen.findByRole("group", { name: "Saved Other.xlsx" })).toBeInTheDocument();
    expect(windowApi.chooseSavePath).toHaveBeenLastCalledWith(NAME, "xlsx");
    expect(paths).toEqual([PATH, PATH, "/home/ada/exports/Other.xlsx"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers another name, and no other try, for a name with another extension", async () => {
    windowApi.chooseSavePath.mockResolvedValue("/home/ada/exports/Lines");
    const message =
      "Hold Explorer did not save Lines: this export is saved as a .xlsx file, and the name " +
      "ends otherwise. Save it again with a name that ends in .xlsx.";
    const user = setup({
      export_save: () => {
        throw commandFailure("Extension", message);
      },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(message);
    expect(
      within(notice).getByRole("button", { name: en.export.chooseAnother }),
    ).toBeInTheDocument();
    expect(within(notice).queryByRole("button", { name: en.common.retry })).not.toBeInTheDocument();
  });

  it.each<[ErrorKind, string]>([
    [
      "Folder",
      "Hold Explorer could not save Lines.xlsx: the folder /home/ada/gone does not exist. Choose a folder that exists, or make it, and save again.",
    ],
    [
      "Write",
      "Hold Explorer could not write Lines.xlsx: the disk is full. Free some space, or choose another place.",
    ],
  ])("offers another name, and no other try, for a failure of kind %s", async (kind, message) => {
    windowApi.chooseSavePath.mockResolvedValue(PATH);
    const user = setup({
      export_save: () => {
        throw commandFailure(kind, message);
      },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(message);
    expect(
      within(notice).getByRole("button", { name: en.export.chooseAnother }),
    ).toBeInTheDocument();
    expect(within(notice).queryByRole("button", { name: en.common.retry })).not.toBeInTheDocument();
  });

  it("shows any other failure with its message only, and is dismissed", async () => {
    windowApi.chooseSavePath.mockResolvedValue(PATH);
    const message =
      "Hold Explorer could not make the workbook: a sheet has more rows than Excel holds. Filter the view and save again.";
    const user = setup({
      export_save: () => {
        throw commandFailure("TooManyRows", message);
      },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(message);
    expect(within(notice).queryByRole("button", { name: en.common.retry })).not.toBeInTheDocument();
    expect(
      within(notice).queryByRole("button", { name: en.export.chooseAnother }),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    await user.click(within(notice).getByRole("button", { name: en.common.dismiss }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("a save that fails before or after its command", () => {
  it("says a save dialog that failed, with its message, and leaves no promise rejected", async () => {
    windowApi.chooseSavePath.mockRejectedValue(new Error("The portal did not answer."));
    const rejected = vi.fn();
    window.addEventListener("unhandledrejection", rejected);
    try {
      const user = setup({});
      await user.click(screen.getByRole("button", { name: "Save" }));
      const notice = await screen.findByRole("alert");
      expect(notice).toHaveTextContent(en.export.dialogFailed);
      expect(notice).toHaveTextContent("The portal did not answer.");
      expect(screen.getByText("Not saving")).toBeInTheDocument();
      // Nothing to try again with: the export is started again from the menu.
      expect(within(notice).queryByRole("button", { name: en.common.retry })).toBeNull();
      expect(within(notice).queryByRole("button", { name: en.export.chooseAnother })).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejected).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("unhandledrejection", rejected);
    }
  });

  it("shows an export refused because the view changed with the export's own words, and no retry", async () => {
    windowApi.chooseSavePath.mockResolvedValue(PATH);
    const message =
      "The workspace or snapshot changed while the export was being prepared. Nothing was saved; export again.";
    const user = setup({
      export_save: () => {
        throw commandFailure("ViewChanged", message);
      },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(en.export.saveFailed);
    expect(notice).toHaveTextContent(message);
    expect(within(notice).queryByRole("button", { name: en.common.retry })).toBeNull();
    expect(within(notice).queryByRole("button", { name: en.export.chooseAnother })).toBeNull();
  });

  it("drops the notice of a failure once another snapshot is in view", async () => {
    windowApi.chooseSavePath.mockResolvedValue(PATH);
    const sent: ArgsOf<"export_save">[] = [];
    const { user, show } = setupWith({
      export_save: (args) => {
        sent.push(args);
        throw commandFailure("FileInUse", IN_USE);
      },
      export_copy: () => {
        throw commandFailure("Clipboard", "The clipboard is busy. Copy again.");
      },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(IN_USE);
    act(() => {
      show(olderSnapshot());
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // A save from the new view is sent for it, never for the one of before.
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent[1]?.view).toEqual({ ...VIEW, snapshot_id: 1 });

    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(screen.getAllByRole("alert")).toHaveLength(2);
    });
    act(() => {
      show(openStart());
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("useCopyExport", () => {
  it("copies the view and says how many rows", async () => {
    const sent: ArgsOf<"export_copy">[] = [];
    const user = setup({
      export_copy: (args) => {
        sent.push(args);
        return null;
      },
    });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("group", { name: "Copied 3 rows" })).toBeInTheDocument();
    expect(sent).toEqual([{ request: REQUEST, format: { kind: "Table" }, view: VIEW }]);
  });

  it("says one row in the singular, and the loaded rows by their count", async () => {
    const user = setup(
      { export_copy: () => null },
      { copyRequest: { ...REQUEST, rows: { kind: "First", count: 1 } } },
    );
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("group", { name: "Copied 1 row" })).toBeInTheDocument();
  });

  it("says the table when every row was copied", async () => {
    const user = setup(
      { export_copy: () => null },
      { copyRequest: { ...REQUEST, rows: { kind: "All" } } },
    );
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("group", { name: en.export.copiedTable })).toBeInTheDocument();
  });

  it("says the chart and the line IDs", async () => {
    const user = setup(
      { export_copy: () => null },
      { copyFormat: { kind: "Chart", chart: { kind: "TopBlockers" } } },
    );
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("group", { name: "Copied the chart" })).toBeInTheDocument();
  });

  it("says the line IDs", async () => {
    const user = setup({ export_copy: () => null }, { copyFormat: { kind: "LineIds" } });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("group", { name: en.export.copiedLineIds })).toBeInTheDocument();
  });

  it("shows a failed copy in a notice that tries again", async () => {
    const message = "Hold Explorer could not reach the clipboard. Try again.";
    let fail = true;
    const user = setup({
      export_copy: () => {
        if (fail) throw commandFailure("Clipboard", message);
        return null;
      },
    });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(en.export.copyFailed);
    expect(notice).toHaveTextContent(message);
    fail = false;
    await user.click(within(notice).getByRole("button", { name: en.common.retry }));
    expect(await screen.findByRole("group", { name: "Copied 3 rows" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
