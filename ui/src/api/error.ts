import type { CommandError } from "../bindings/CommandError";
import i18next from "../text/i18n";

/** Whether a value has the shape of what a failed command carries. */
export function isCommandError(value: unknown): value is CommandError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

/** What a rejected command carries, as a `CommandError`. Anything else becomes kind `Internal`. */
export function asCommandError(value: unknown): CommandError {
  if (isCommandError(value)) return { kind: value.kind, message: value.message };
  if (value instanceof Error) return { kind: "Internal", message: value.message };
  if (typeof value === "string") return { kind: "Internal", message: value };
  return { kind: "Internal", message: i18next.t("errors.unreported") };
}
