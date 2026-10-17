import { useCallback } from "react";

/** Chooses the radio that has the focus when Enter is pressed on it. */
function onKeyDown(event: KeyboardEvent): void {
  const { target } = event;
  if (event.key !== "Enter" || !(target instanceof HTMLInputElement)) return;
  if (target.type === "radio" && !target.checked) target.click();
}

/**
 * Lets Enter choose the radio that has the focus inside a group, as Space does. A radio group
 * whose choice opens something, such as the views of a page or its presets, is pressed like a
 * row of buttons, and Enter is the key a user presses on a button.
 *
 * Returns a ref to give the group. It follows the element it is given: a group that is rendered
 * again, or only later, is listened to as well, and one that goes is let go.
 */
export function useEnterChooses(): (element: HTMLElement | null) => (() => void) | undefined {
  return useCallback((element: HTMLElement | null) => {
    if (element === null) return undefined;
    element.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
