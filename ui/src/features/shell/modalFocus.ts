import { useLayoutEffect, useRef } from "react";

/**
 * Gives the focus back to where it was when a modal opened, for the two modals of the shell (the
 * command palette and the shortcut sheet) together. It notes the focused element when no modal is
 * open and one opens, and restores it when the last one closes. A hand-over from one modal to the
 * other notes and restores nothing, so the focus goes back to the control the first modal was
 * opened from, not to the page or to the modal before.
 *
 * A modal closes at once, and what was chosen in it may move the focus on purpose (a page, a
 * line, the Save view popover). The focus is therefore restored on the next frame, and only if
 * nothing has taken it by then: it is on the page body, or on an element that is gone.
 */
export function useModalFocusReturn(isOpen: boolean): void {
  const wasOpen = useRef(false);
  const returnTo = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);
  // A layout effect, so the note is taken before the modal's own effects move the focus.
  useLayoutEffect(() => {
    if (isOpen === wasOpen.current) return;
    wasOpen.current = isOpen;
    if (isOpen) {
      if (frame.current !== null) {
        // The other modal opened in the frame after this one closed: a hand-over.
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
        return;
      }
      const active = document.activeElement;
      returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
      return;
    }
    const back = returnTo.current;
    if (back === null) return;
    // Kept until the frame: a modal opening before it is a hand-over, and needs the note.
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      returnTo.current = null;
      const active = document.activeElement;
      const lost = active === null || active === document.body || !active.isConnected;
      if (lost && back.isConnected) back.focus();
    });
  }, [isOpen]);
  useLayoutEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );
}
