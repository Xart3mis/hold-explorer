// The system's file dialogs: choosing a file to import, a folder to keep the workspaces in, and
// where to save an export. This is the one module that imports the dialog plugin, and the lint
// rules refuse it to every other: the build the end-to-end tests drive (the cargo feature `e2e`)
// answers the dialogs with commands instead, and only here is that chosen. Screens import these
// functions from window.ts, which the tests replace.
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AppStart } from "../bindings/AppStart";
import { t, type MessageKey } from "../text/i18n";
import { api } from "./commands";
import { IMPORT_EXTENSIONS } from "./files";

/**
 * Whether the dialogs are answered by the substitute commands of the `e2e` build. The application
 * start says so (`AppStart.e2e`); nothing in the page decides it.
 */
let substitutes = false;

/**
 * Takes from an application start whether this is the `e2e` build, whose dialogs are answered by
 * the substitute commands. The start query calls it with every start it receives.
 */
export function answerDialogsFor(start: Pick<AppStart, "e2e">): void {
  substitutes = start.e2e;
}

/**
 * Asks for one file to import, offering the formats an import reads. Resolves with its path, or
 * with `null` when the dialog was cancelled.
 */
export function chooseImportFile(): Promise<string | null> {
  if (substitutes) return api.e2eOpenPath();
  return open({
    multiple: false,
    directory: false,
    filters: [{ name: t("import.fileFilter"), extensions: [...IMPORT_EXTENSIONS] }],
  });
}

/**
 * Asks for a folder to keep the workspaces in. Resolves with its path, or with `null` when the
 * dialog was cancelled. The `e2e` build answers it as it answers the open dialog.
 */
export function chooseFolder(): Promise<string | null> {
  if (substitutes) return api.e2eOpenPath();
  return open({ multiple: false, directory: true });
}

/** The kinds of file an export saves, each offered alone in the save dialog. */
export type FileFormat = "xlsx" | "csv" | "pdf" | "png" | "svg";

/** The name of each kind of file in the filter of the save dialog. */
const FORMAT_NAMES: Record<FileFormat, MessageKey> = {
  xlsx: "export.fileFilter.xlsx",
  csv: "export.fileFilter.csv",
  pdf: "export.fileFilter.pdf",
  png: "export.fileFilter.png",
  svg: "export.fileFilter.svg",
};

/**
 * Asks where to save, offering one format, with `defaultName` as the name the dialog proposes.
 * Resolves with the path, or `null` when cancelled. The path is the one chosen, as it is: the
 * save command refuses a name that does not end in the extension of its format.
 */
export function chooseSavePath(defaultName: string, format: FileFormat): Promise<string | null> {
  if (substitutes) return api.e2eSavePath(defaultName);
  return save({
    defaultPath: defaultName,
    filters: [{ name: t(FORMAT_NAMES[format]), extensions: [format] }],
  });
}
