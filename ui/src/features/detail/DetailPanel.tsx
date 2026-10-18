import { useCallback, useEffect, useId, useRef } from "react";
import { useFilterOptions } from "../../app/filters/options";
import { cx } from "../../components/cx";
import { BlockerDetail } from "./BlockerDetail";
import styles from "./Detail.module.css";
import { HoldDetail } from "./HoldDetail";
import { LineDetail } from "./LineDetail";
import { useDetailFocus, useSelection, type Selection } from "./selection";

/** What the panel shows: a line, a hold, or a blocker. */
export type PanelSelection = NonNullable<Selection>;

export interface DetailPanelProps {
  /** What the panel shows: the selection the address names. */
  selection: PanelSelection;
  className?: string | undefined;
}

const NONE: readonly never[] = [];

/**
 * The detail panel: the line, the hold, or the blocker the address selects, in a region at the right of the
 * shell, with its own scroll. It reads the snapshot in view, so another snapshot shows the same
 * line or blocker as that snapshot has it. Escape inside it, the close button, and the close action of its
 * empty state close it, and the focus goes back to the row that opened it.
 *
 * Which sections a snapshot can fill is read as the filter bar reads it, from the options of the
 * filters in use: a limited snapshot shows no released holds, one without the size columns no
 * sizes.
 */
export function DetailPanel({ selection, className }: DetailPanelProps) {
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const { close } = useSelection();
  const focus = useDetailFocus();
  const options = useFilterOptions();
  // When the options cannot be read, the panel shows what the line or the hold has.
  const absent = options.data?.absent ?? (options.isError ? NONE : null);

  const onClose = useCallback(() => {
    close();
    focus.giveBack();
  }, [close, focus]);

  // Escape closes the panel from wherever the focus is inside it. What handles Escape itself
  // inside the panel (a tooltip) marks it as handled, and the panel then stays.
  useEffect(() => {
    const element = panel.current;
    if (element === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    element.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    // The panel is named by its heading, which each kind of selection writes with this id.
    <aside
      ref={panel}
      aria-labelledby={headingId}
      data-part="detail-panel"
      className={cx(styles.panel, className)}
    >
      {selection.kind === "line" ? (
        <LineDetail
          key={`line:${selection.lineId}`}
          headingId={headingId}
          lineId={selection.lineId}
          absent={absent}
          onClose={onClose}
        />
      ) : selection.kind === "hold" ? (
        <HoldDetail
          key={`hold:${String(selection.position)}`}
          headingId={headingId}
          position={selection.position}
          absent={absent}
          onClose={onClose}
        />
      ) : (
        <BlockerDetail
          key={`blocker:${selection.key}`}
          headingId={headingId}
          blockerKey={selection.key}
          absent={absent}
          onClose={onClose}
        />
      )}
    </aside>
  );
}
