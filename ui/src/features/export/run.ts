import { useCallback, useRef, useState } from "react";
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
  /** Why the last save failed; `null` once the next one has a result, or after `dismiss`. */
  problem: CommandError | null;
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
  const [problem, setProblem] = useState<CommandError | null>(null);
  const [pendingAction, setPendingAction] = useState<NoticeAction | null>(null);
  // Set at once, so a second press in the same moment starts nothing.
  const running = useRef(false);
  // The save the notice is about, for another try or another name.
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
          isUndo: false,
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
        setProblem(null);
        announce(attempt.path);
      } catch (error) {
        failed.current = attempt;
        setProblem(asCommandError(error));
      }
    },
    [announce],
  );

  /** Asks for a path for `attempt`; a cancelled dialog leaves everything as it was. */
  const chooseAndWrite = useCallback(
    async (attempt: Omit<Attempt, "path">) => {
      const path = await chooseSavePath(attempt.defaultName, extensionOf(attempt.format));
      if (path === null) return;
      await write({ ...attempt, path });
    },
    [write],
  );

  const save = useCallback(
    (format: SaveFormat, request: ExportRequest, viewName: string) =>
      exclusive(null, async () => {
        if (view === null) {
          setProblem(noWorkspace());
          return;
        }
        const defaultName = fileName(workspace, viewName, date, extensionOf(format));
        await chooseAndWrite({ format, request, defaultName, view });
      }),
    [exclusive, chooseAndWrite, view, workspace, date],
  );

  const retry = useCallback(
    () =>
      exclusive("retry", async () => {
        if (failed.current !== null) await write(failed.current);
      }),
    [exclusive, write],
  );

  const chooseAnother = useCallback(
    () =>
      exclusive("choose", async () => {
        if (failed.current !== null) await chooseAndWrite(failed.current);
      }),
    [exclusive, chooseAndWrite],
  );

  const dismiss = useCallback(() => {
    failed.current = null;
    setProblem(null);
  }, []);

  return { save, isRunning, phase, problem, pendingAction, retry, chooseAnother, dismiss };
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
  /** Why the last copy failed; `null` once the next one has a result, or after `dismiss`. */
  problem: CommandError | null;
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
  const view = useShownView();
  const toast = useToast();
  const [isRunning, setRunning] = useState(false);
  const [problem, setProblem] = useState<CommandError | null>(null);
  const [pendingAction, setPendingAction] = useState<NoticeAction | null>(null);
  const running = useRef(false);
  const failed = useRef<CopyAttempt | null>(null);

  const run = useCallback(
    async (from: NoticeAction | null, attempt: CopyAttempt | null) => {
      if (running.current) return;
      running.current = true;
      setRunning(true);
      setPendingAction(from);
      try {
        if (attempt === null) {
          setProblem(noWorkspace());
          return;
        }
        await api.exportCopy(attempt.request, attempt.format, attempt.view);
        failed.current = null;
        setProblem(null);
        toast.show({ message: copied(attempt.format, attempt.request), tone: "success" });
      } catch (error) {
        failed.current = attempt;
        setProblem(asCommandError(error));
      } finally {
        running.current = false;
        setRunning(false);
        setPendingAction(null);
      }
    },
    [toast],
  );

  const copy = useCallback(
    (format: CopyFormat, request: ExportRequest) =>
      run(null, view === null ? null : { format, request, view }),
    [run, view],
  );

  const retry = useCallback(
    () => (failed.current === null ? Promise.resolve() : run("retry", failed.current)),
    [run],
  );

  const dismiss = useCallback(() => {
    failed.current = null;
    setProblem(null);
  }, []);

  return { copy, isRunning, problem, pendingAction, retry, dismiss };
}
