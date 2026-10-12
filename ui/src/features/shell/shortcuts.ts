// Keyboard shortcuts are registered here and nowhere else. The shortcuts of the destinations
// come from the destination list; the one shortcut that is not a destination's is named below.
import { useEffect } from "react";
import type { Destination } from "../../app/destinations";
import { t } from "../../app/i18n";

/** Starts an import. */
export const IMPORT_SHORTCUT = "Ctrl+I";

export interface ShortcutBinding {
  /** Modifiers, then the key, joined by `+`: `Ctrl+1`, `Ctrl+,`, `/`. */
  shortcut: string;
  run: () => void;
}

interface Parsed {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parse(shortcut: string): Parsed {
  // The key is the last part, so a shortcut may end in the plus sign itself.
  const parts = shortcut === "+" ? ["+"] : shortcut.split("+");
  const key = parts.pop() ?? "";
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  return {
    ctrl: modifiers.has("ctrl"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt"),
    key: key.toLowerCase(),
  };
}

/** Whether a key press is this shortcut: the same key with exactly the modifiers it names. */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const wanted = parse(shortcut);
  return (
    event.key.toLowerCase() === wanted.key &&
    event.ctrlKey === wanted.ctrl &&
    event.shiftKey === wanted.shift &&
    event.altKey === wanted.alt &&
    !event.metaKey
  );
}

/** Whether a key typed into this element is text: a field, a text area, a select, or edited content. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

/**
 * Runs the binding a key press matches and keeps the key from the page. A shortcut does not fire
 * while a text field has focus, unless it has Ctrl: a plain key there is text. A key that is held
 * down, or that something else has handled, is left alone. Returns whether a binding ran.
 */
export function handleShortcut(
  event: KeyboardEvent,
  bindings: readonly ShortcutBinding[],
): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return false;
  const typing = isTextEntry(event.target);
  for (const binding of bindings) {
    if (!matchesShortcut(event, binding.shortcut)) continue;
    if (typing && !parse(binding.shortcut).ctrl) continue;
    event.preventDefault();
    binding.run();
    return true;
  }
  return false;
}

/**
 * Every shortcut of the app: one for each destination of the list that names one, built or not,
 * then the import.
 */
export function shortcutBindings(
  list: readonly Destination[],
  actions: { open: (path: string) => void; startImport: () => void },
): ShortcutBinding[] {
  const bindings: ShortcutBinding[] = [];
  for (const destination of list) {
    if (destination.shortcut === undefined) continue;
    bindings.push({
      shortcut: destination.shortcut,
      run: () => {
        actions.open(destination.path);
      },
    });
  }
  bindings.push({ shortcut: IMPORT_SHORTCUT, run: actions.startImport });
  return bindings;
}

/** Listens for the shortcuts on the whole window, while the component that calls it is shown. */
export function useShortcuts(bindings: readonly ShortcutBinding[]): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleShortcut(event, bindings);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [bindings]);
}

/** A shortcut as a tooltip shows it, with the names of the keys taken from the text catalog. */
export function formatShortcut(shortcut: string): string {
  const parts = shortcut === "+" ? ["+"] : shortcut.split("+");
  return parts.map((part) => (part.toLowerCase() === "ctrl" ? t("keys.ctrl") : part)).join("+");
}

/** A shortcut in the form `aria-keyshortcuts` takes: `Control+1`. */
export function ariaKeyShortcuts(shortcut: string): string {
  const parts = shortcut === "+" ? ["+"] : shortcut.split("+");
  return parts.map((part) => (part.toLowerCase() === "ctrl" ? "Control" : part)).join("+");
}
