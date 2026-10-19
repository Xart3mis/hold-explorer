import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { fileName as lastPart } from "../../api/files";
import { chooseSavePath, openSavedFile, showInFolder, type FileFormat } from "../../api/window";
import { useShell } from "../../app/shell/context";
import { useShownView } from "../../app/view";
import type { CommandError } from "../../bindings/CommandError";
import type { CopyFormat } from "../../bindings/CopyFormat";
import type { ExportPhase } from "../../bindings/ExportPhase";
import type { ExportRequest } from "../../bindings/ExportRequest";
import type { SaveFormat } from "../../bindings/SaveFormat";
import type { ViewRef } from "../../bindings/ViewRef";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import { useToast } from "../../components";
import { toDateInput } from "../../text/format";
import { t } from "../../text/i18n";
import { fileName } from "./fileName";

/** The extension of the file each format saves, which the save command checks the path for. */
export function extensionOf(format: SaveFormat): FileFormat {
  switch (format.kind) {
    case "Excel":
    case "Workbook":
      return "xlsx";
    case "Csv":
      return "csv";
    case "Report":
      return "pdf";
    case "ChartPng":
      return "png";
    case "ChartSvg":
      return "svg";
  }
}

/** The failure of an export when no workspace is open: there is no view to send. */
function noWorkspace(): CommandError {
  return { kind: "NoWorkspace", message: t("export.noWorkspace") };
}

/** The view an open workspace shows, as a text that names it; empty without a workspace. */
function viewName(open: WorkspaceOpen | null | undefined): string {
  return open === undefined || open === null ? "" : `${open.workspace.id}:${String(open.selected)}`;
}

/** A failure, with the view on screen when it came: it is shown while that view stays. */
interface Failure {
  problem: CommandError;
  view: string;
}

/** How many exports of the session have had a result, to order the results of two hooks. */
let results = 0;

/**
 * The failure of the last export, which stands only while the view it came in stays on screen:
 * a switch of workspace or snapshot drops it, so a notice never offers to send an export again
 * for a view that is gone. `fail` keeps a failure for the view on screen at the moment it came;
 * `succeed` puts it away; both mark the moment of the result in `settled`, which orders the
 * results of a page's save and copy. `clear` puts the failure away without a result.
 */
function useFailure() {
  const shown = viewName(useShell().start.open);
  // The view on screen, for an answer that comes after the render that sent the command.
  const latest = useRef(shown);
  useEffect(() => {
    latest.current = shown;
  }, [shown]);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [settled, setSettled] = useState(0);
  const fail = useCallback((problem: CommandError) => {
    results += 1;
    setSettled(results);
    setFailure({ problem, view: latest.current });
  }, []);
  const succeed = useCallback(() => {
    results += 1;
    setSettled(results);
    setFailure(null);
  }, []);
  const clear = useCallback(() => {
    setFailure(null);
  }, []);
  const problem = failure !== null && failure.view === shown ? failure.problem : null;
  return { problem, settled, fail, succeed, clear };
}

/** Which control of the notice started the export that runs: another try, or another name. */
export type NoticeAction = "retry" | "choose";

/** One save: what is written, to which path, for which view. */
interface Attempt {
  format: SaveFormat;
  request: ExportRequest;
  /** The name the dialog offers. */
  defaultName: string;
  view: ViewRef;
  path: string;
}

export interface SaveExport {
  /**
   * Saves: asks for the path, runs `export_save`, then shows the notice that it is saved. Returns
   * when done. `view` is the view part of the file name the dialog offers (`fileView`). A
   * cancelled dialog changes nothing and says nothing. Does nothing while an export runs.
   */
  save: (format: SaveFormat, request: ExportRequest, view: string) => Promise<void>;
  /** From the press until the file is saved or has failed, the dialog included. */
  isRunning: boolean;
  /** The phase of the save that runs, once the command has said it; `null` otherwise. */
  phase: ExportPhase | null;
  /**
   * Why the last save failed; `null` once the next one has a result, after `dismiss`, and once
   * another workspace or snapshot is on screen.
   */
  problem: CommandError | null;
  /** When the last save had a result, in the order of the session's exports; 0 before one. */
  settled: number;
  /** The control of the notice that started the save that runs, which shows the spinner. */
  pendingAction: NoticeAction | null;
  /** Saves the failed export again, to the same path. */
  retry: () => Promise<void>;
  /** Opens the save dialog again for the failed export, and saves it under the name chosen. */
  chooseAnother: () => Promise<void>;
  /** Puts the problem away. */
  dismiss: () => void;
}

/**
 * Saving an export to a file the user chooses. After a save, a toast says "Saved <file name>"
 * and offers "Open file" and "Show in folder"; a failure is the `problem`, which the page shows
 * in an `ExportNotice` under its header, and which the next result replaces.
 */
export function useSaveExport(): SaveExport {
  const { start, report } = useShell();
  const view = useShownView();
  const toast = useToast();
  const [isRunning, setRunning] = useState(false);
  const [phase, setPhase] = useState<ExportPhase | null>(null);
  const { problem, settled, fail, succeed, clear } = useFailure();
  const [pendingAction, setPendingAction] = useState<NoticeAction | null>(null);
  // Set at once, so a second press in the same moment starts nothing.
  const running = useRef(false);
  // The save the notice is about, for another try or another name. It is used only while the
  // notice stands, so never for a view that is gone.
  const failed = useRef<Attempt | null>(null);

  const open = start.open;
  const snapshot = open?.snapshots.find((info) => info.id === open.selected);
  const workspace = open?.workspace.name ?? "";
  const date = snapshot === undefined ? "" : toDateInput(snapshot.taken_at);

  const announce = useCallback(
    (path: string) => {
      const fail = (title: string) => (error: unknown) => {
        report({ title, error: asCommandError(error) });
      };
      toast.show({
        message: t("export.saved", { name: lastPart(path) }),
        tone: "success",
        action: {
          label: t("export.openFile"),
          onAction: () => {
            openSavedFile(path).catch(fail(t("export.openFailed")));
          },
        },
        secondaryAction: {
          label: t("common.showInFolder"),
          onAction: () => {
            showInFolder(path).catch(fail(t("export.showFailed")));
          },
        },
      });
    },
    [report, toast],
  );

  /** Runs `work` as the one export of this hook, started from `from`. */
  const exclusive = useCallback(async (from: NoticeAction | null, work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setRunning(true);
    setPendingAction(from);
    try {
      await work();
    } finally {
      running.current = false;
      setRunning(false);
      setPhase(null);
      setPendingAction(null);
    }
  }, []);

  const write = useCallback(
    async (attempt: Attempt) => {
      try {
        await api.exportSave(attempt.request, attempt.format, attempt.path, attempt.view, setPhase);
        failed.current = null;
        succeed();
        announce(attempt.path);
      } catch (error) {
        failed.current = attempt;
        fail(asCommandError(error));
      }
    },
    [announce, succeed, fail],
  );

  /**
   * Asks for a path for `attempt`; a cancelled dialog leaves everything as it was. A dialog that
   * fails is said in the notice, with its message (kind `Dialog`), and offers nothing to try
   * again: the export is started again from the menu.
   */
  const chooseAndWrite = useCallback(
    async (attempt: Omit<Attempt, "path">) => {
      let path: string | null;
      try {
        path = await chooseSavePath(attempt.defaultName, extensionOf(attempt.format));
      } catch (error) {
        failed.current = null;
        fail({ ...asCommandError(error), kind: "Dialog" });
        return;
      }
      if (path === null) return;
      await write({ ...attempt, path });
    },
    [write, fail],
  );

  const save = useCallback(
    (format: SaveFormat, request: ExportRequest, name: string) =>
      exclusive(null, async () => {
        if (view === null) {
          // No workspace is open; or an action on the workspace runs, during which the menu
          // waits and nothing is sent.
          if (start.open === null) {
            failed.current = null;
            fail(noWorkspace());
          }
          return;
        }
        const defaultName = fileName(workspace, name, date, extensionOf(format));
        await chooseAndWrite({ format, request, defaultName, view });
      }),
    [exclusive, chooseAndWrite, fail, view, start.open, workspace, date],
  );

  const retry = useCallback(
    () =>
      exclusive("retry", async () => {
        if (failed.current !== null && problem !== null) await write(failed.current);
      }),
    [exclusive, write, problem],
  );

  const chooseAnother = useCallback(
    () =>
      exclusive("choose", async () => {
        if (failed.current !== null && problem !== null) await chooseAndWrite(failed.current);
      }),
    [exclusive, chooseAndWrite, problem],
  );

  const dismiss = useCallback(() => {
    failed.current = null;
    clear();
  }, [clear]);

  return {
    save,
    isRunning,
    phase,
    problem,
    settled,
    pendingAction,
    retry,
    chooseAnother,
    dismiss,
  };
}

/** One copy: what is copied, as what, for which view. */
interface CopyAttempt {
  format: CopyFormat;
  request: ExportRequest;
  view: ViewRef;
}

export interface CopyExport {
  /** Copies an export of the view to the clipboard, then says so. Does nothing while one runs. */
  copy: (format: CopyFormat, request: ExportRequest) => Promise<void>;
  isRunning: boolean;
  /**
   * Why the last copy failed; `null` once the next one has a result, after `dismiss`, and once
   * another workspace or snapshot is on screen.
   */
  problem: CommandError | null;
  /** When the last copy had a result, in the order of the session's exports; 0 before one. */
  settled: number;
  /** The control of the notice that started the copy that runs, which shows the spinner. */
  pendingAction: NoticeAction | null;
  /** Copies the failed export again. */
  retry: () => Promise<void>;
  /** Puts the problem away. */
  dismiss: () => void;
}

/**
 * What a copy says it put on the clipboard: the rows it names by their count, when the request
 * names them; otherwise the table, the line IDs, or the chart. The count is that of the keys or of
 * the loaded rows the request carries, never one the interface works out.
 */
function copied(format: CopyFormat, request: ExportRequest): string {
  switch (format.kind) {
    case "Chart":
      return t("export.copiedChart");
    case "LineIds":
      return t("export.copiedLineIds");
    case "Table":
      switch (request.rows.kind) {
        case "Keys":
          return t("export.copiedRows", { count: request.rows.keys.length });
        case "First":
          return t("export.copiedRows", { count: request.rows.count });
        case "All":
          return t("export.copiedTable");
      }
  }
}

/**
 * Copying an export to the clipboard. After a copy, a toast says what was copied ("Copied 3
 * rows", "Copied the chart"); a failure is the `problem`, which the page shows in an
 * `ExportNotice`.
 */
export function useCopyExport(): CopyExport {
  const { start } = useShell();
  const view = useShownView();
  const toast = useToast();
  const [isRunning, setRunning] = useState(false);
  const { problem, settled, fail, succeed, clear } = useFailure();
  const [pendingAction, setPendingAction] = useState<NoticeAction | null>(null);
  const running = useRef(false);
  // The copy the notice is about, used only while the notice stands.
  const failed = useRef<CopyAttempt | null>(null);

  const run = useCallback(
    async (from: NoticeAction | null, attempt: CopyAttempt | null) => {
      if (running.current) return;
      running.current = true;
      setRunning(true);
      setPendingAction(from);
      try {
        if (attempt === null) {
          fail(noWorkspace());
          return;
        }
        await api.exportCopy(attempt.request, attempt.format, attempt.view);
        failed.current = null;
        succeed();
        toast.show({ message: copied(attempt.format, attempt.request), tone: "success" });
      } catch (error) {
        failed.current = attempt;
        fail(asCommandError(error));
      } finally {
        running.current = false;
        setRunning(false);
        setPendingAction(null);
      }
    },
    [toast, succeed, fail],
  );

  const copy = useCallback(
    (format: CopyFormat, request: ExportRequest) => {
      // While an action on the workspace runs the menu waits, and nothing is sent.
      if (view === null && start.open !== null) return Promise.resolve();
      return run(null, view === null ? null : { format, request, view });
    },
    [run, view, start.open],
  );

  const retry = useCallback(
    () =>
      failed.current === null || problem === null
        ? Promise.resolve()
        : run("retry", failed.current),
    [run, problem],
  );

  const dismiss = useCallback(() => {
    failed.current = null;
    clear();
  }, [clear]);

  return { copy, isRunning, problem, settled, pendingAction, retry, dismiss };
}
