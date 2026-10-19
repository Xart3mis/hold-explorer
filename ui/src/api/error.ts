import type { ErrorKind } from "../bindings/ErrorKind";
import i18next from "../text/i18n";

/**
 * The kinds of failure the interface reports itself, in the shape of a command's error: a dialog
 * of the system that failed (`Dialog`), a view still refused after the Rust side said it holds it
 * (`ViewUnsettled`), and a rename whose workspace is no longer the open one (`WorkspaceChanged`).
 * No command answers with them.
 */
export type InterfaceKind = "Dialog" | "ViewUnsettled" | "WorkspaceChanged";

/** A failure as the interface holds it: what a command answered, or one of the interface's own. */
export interface AppError {
  kind: ErrorKind | InterfaceKind;
  message: string;
}

/**
 * Every kind a command answers with, so a value can be checked at run time. Typed by the generated
 * `ErrorKind`: a kind the Rust side adds or drops fails the type check here until the list follows.
 */
const COMMAND_KINDS: Record<ErrorKind, true> = {
  NotAWorkspace: true,
  NewerSchema: true,
  AlreadyImported: true,
  SnapshotNotFound: true,
  SnapshotDateOutOfRange: true,
  Io: true,
  Database: true,
  Corrupt: true,
  NotFound: true,
  Unreadable: true,
  EmptyFile: true,
  NoDataSheet: true,
  SheetNotFound: true,
  MissingColumns: true,
  Empty: true,
  NoHolds: true,
  FileInUse: true,
  Folder: true,
  Write: true,
  TooManyRows: true,
  Workbook: true,
  Image: true,
  Report: true,
  Text: true,
  NoWorkspace: true,
  NoDraft: true,
  WorkspaceNotFound: true,
  ReplaceNotOffered: true,
  ViewChanged: true,
  Settings: true,
  NotWritten: true,
  Clipboard: true,
  Open: true,
  Extension: true,
  Internal: true,
};

const INTERFACE_KINDS: Record<InterfaceKind, true> = {
  Dialog: true,
  ViewUnsettled: true,
  WorkspaceChanged: true,
};

/** Whether a value is a kind a command answers with. */
export function isErrorKind(value: unknown): value is ErrorKind {
  return typeof value === "string" && Object.hasOwn(COMMAND_KINDS, value);
}

function isKind(value: unknown): value is AppError["kind"] {
  return isErrorKind(value) || (typeof value === "string" && Object.hasOwn(INTERFACE_KINDS, value));
}

/**
 * Whether a value has the shape of what a failed command carries, or of a failure the interface
 * made in that shape: a known kind and a message.
 */
export function isCommandError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    isKind(value.kind) &&
    "message" in value &&
    typeof value.message === "string"
  );
}

/** What a rejected command carries, as an `AppError`. Anything else becomes kind `Internal`. */
export function asCommandError(value: unknown): AppError {
  if (isCommandError(value)) return { kind: value.kind, message: value.message };
  if (value instanceof Error) return { kind: "Internal", message: value.message };
  if (typeof value === "string") return { kind: "Internal", message: value };
  return { kind: "Internal", message: i18next.t("errors.unreported") };
}
