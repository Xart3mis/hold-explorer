// Typecheck only (never run): the kinds `ErrorState` takes are exactly those the interface holds
// an error under. The component may not import ui/src/api/, so it lists the interface's own
// kinds itself, and this check keeps the two lists the same.
import type { AppError } from "../api/error";
import type { ShownErrorKind } from "../components/ErrorState/ErrorState";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export const shownKinds: Same<ShownErrorKind, AppError["kind"]> = true;
