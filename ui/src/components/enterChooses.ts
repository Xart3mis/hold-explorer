import { useEffect, type RefObject } from "react";

/**
 * Lets Enter choose the radio that has the focus inside a group, as Space does. A radio group
 * whose choice opens something, such as the views of a page or its presets, is pressed like a
 * row of buttons, and Enter is the key a user presses on a button.
 */
export function useEnterChooses(group: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = group.current;
    if (element === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const { target } = event;
      if (event.key !== "Enter" || !(target instanceof HTMLInputElement)) return;
      if (target.type === "radio" && !target.checked) target.click();
    };
    element.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("keydown", onKeyDown);
    };
  }, [group]);
}
