// Typecheck only (never run): the kind of an error is the generated union, so a kind compared
// with a text that is no kind fails to compile.
import type { CommandError } from "../bindings/CommandError";
import type { ErrorKind } from "../bindings/ErrorKind";
import type { AppError } from "./error";

declare const error: CommandError;
declare const failure: AppError;

export const known: boolean = error.kind === "NoWorkspace";
// @ts-expect-error a misspelt kind is no kind a command answers with
export const misspelt: boolean = error.kind === "NoWorkspce";
// @ts-expect-error the interface's own kinds are not kinds a command answers with
export const interfaceOwn: boolean = error.kind === "Dialog";

export const own: boolean = failure.kind === "ViewUnsettled";
// @ts-expect-error a misspelt kind is no kind of the interface's either
export const misspeltOwn: boolean = failure.kind === "ViewUnsetled";

export const kind: ErrorKind = "SnapshotDateOutOfRange";
// @ts-expect-error a kind is one of the generated union
export const notAKind: ErrorKind = "Restart";
