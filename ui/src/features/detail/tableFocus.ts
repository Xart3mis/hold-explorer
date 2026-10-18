import { useCallback, useEffect, useRef } from "react";
import { useDetailFocus, useSelection } from "./selection";

/** The key the table gave the row an element is in; `null` outside a row. */
function rowKeyOf(element: Element | null): string | null {
  return element?.closest<HTMLElement>("[role='row']")?.dataset.key ?? null;
}

/**
 * What opened the panel: a row of the table, by the key the table gave it (its element is built
 * anew as the table scrolls), or another control beside the table, by its element.
 */
type Opener = { kind: "row"; key: string } | { kind: "element"; element: HTMLElement };

export interface TableDetailFocus {
  /** For the box around the table: its keys are learned there, and its rows are given back. */
  listenTo: (area: HTMLElement | null) => (() => void) | undefined;
  /**
   * For the box around another control that opens the panel beside the table (the curve of
   * Blockers): its Enter and Escape are learned as the table's are.
   */
  listenBeside: (area: HTMLElement | null) => (() => void) | undefined;
  /**
   * Says that the page is about to select what a row or the control beside the table chose, by
   * the key of the row when it is one. What has the focus is remembered as what opened the panel,
   * and a choice made with Enter asks the panel to take the focus to its heading.
   */
  chosen: (key: string) => void;
}

/**
 * The keys and the focus of a table that opens the detail panel, as DESIGN.md sets them ("Detail
 * panel", "Keys and focus"), for every page that has such a table. The table answers Enter and
 * Escape itself, so what they do for the panel is learned around it:
 *
 * - A row chosen with Enter opens the panel with the focus on its heading; a row pressed keeps
 *   the focus. Enter on the row that is open already (`selectedKey`) takes the focus there.
 * - Escape on the table, or beside it, closes the panel, unless what has the focus handled it.
 * - When the panel closes, from here or from the panel, the focus goes back to what opened it:
 *   the row, found by its key, or the table when that row is gone; or the control beside the
 *   table it was opened from.
 */
export function useTableDetailFocus({
  selectedKey,
}: {
  /** The key of the row the panel shows, as the table names it; `null` for none. */
  selectedKey: string | null;
}): TableDetailFocus {
  const { selection, close } = useSelection();
  const focus = useDetailFocus();
  const table = useRef<HTMLElement | null>(null);
  const opener = useRef<Opener | null>(null);
  // Whether the key that is down is Enter: the choice it makes moves the focus to the panel.
  const byEnter = useRef(false);

  useEffect(() => {
    focus.setGiveBack(() => {
      const from = opener.current;
      if (from?.kind === "element" && from.element.isConnected) {
        from.element.focus();
        return;
      }
      const area = table.current;
      if (area === null) return;
      const rows = [...area.querySelectorAll<HTMLElement>("[role='row'][data-key]")];
      const row =
        from?.kind === "row" ? rows.find((candidate) => candidate.dataset.key === from.key) : null;
      (row ?? area.querySelector<HTMLElement>("[role='grid'], [role='treegrid']"))?.focus();
    });
    return () => {
      focus.setGiveBack(null);
    };
  }, [focus]);

  // The listeners are attached once and read what the page shows now.
  const latest = useRef({ isOpen: selection !== null, selectedKey, close });
  useEffect(() => {
    latest.current = { isOpen: selection !== null, selectedKey, close };
  });

  const attach = useCallback(
    (area: HTMLElement, isTable: boolean) => {
      const learn = (event: KeyboardEvent) => {
        byEnter.current = event.key === "Enter";
      };
      const forget = () => {
        byEnter.current = false;
      };
      const answer = (event: KeyboardEvent) => {
        const now = latest.current;
        if (event.key === "Escape" && now.isOpen && !event.defaultPrevented) {
          event.preventDefault();
          now.close();
          focus.giveBack();
          return;
        }
        if (!isTable || event.key !== "Enter" || !now.isOpen) return;
        const key = rowKeyOf(event.target instanceof Element ? event.target : null);
        if (key !== null && key === now.selectedKey) {
          opener.current = { kind: "row", key };
          focus.focusHeading();
        }
      };
      area.addEventListener("keydown", learn, { capture: true });
      area.addEventListener("pointerdown", forget, { capture: true });
      area.addEventListener("keydown", answer);
      return () => {
        area.removeEventListener("keydown", learn, { capture: true });
        area.removeEventListener("pointerdown", forget, { capture: true });
        area.removeEventListener("keydown", answer);
      };
    },
    [focus],
  );

  const listenTo = useCallback(
    (area: HTMLElement | null) => {
      table.current = area;
      if (area === null) return undefined;
      const detach = attach(area, true);
      return () => {
        detach();
        table.current = null;
      };
    },
    [attach],
  );
  const listenBeside = useCallback(
    (area: HTMLElement | null) => (area === null ? undefined : attach(area, false)),
    [attach],
  );

  const chosen = useCallback(
    (key: string) => {
      const active = document.activeElement;
      const inTable = table.current !== null && active !== null && table.current.contains(active);
      // A row of the table by the key the table gave it (the same line may stand under two
      // groups); a control elsewhere by its element; the row of the key when nothing has focus.
      opener.current = inTable
        ? { kind: "row", key: rowKeyOf(active) ?? key }
        : active instanceof HTMLElement && active !== document.body
          ? { kind: "element", element: active }
          : { kind: "row", key };
      if (byEnter.current) focus.askForHeading();
      byEnter.current = false;
    },
    [focus],
  );

  return { listenTo, listenBeside, chosen };
}
