import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { Dialog, DialogTrigger, Popover as RacPopover } from "react-aria-components";
import { lengthToken } from "../../design/token-values";
import { cx } from "../cx";
import styles from "./Popover.module.css";

export interface PopoverProps {
  /**
   * The control that opens the popover: a button of this library, a `FilterChip`, or an
   * `AddFilterChip`. It says that it opens something, and whether that is open.
   */
  trigger: ReactElement;
  /** What the popover is for: "Filter by discipline". It is the name of the dialog. */
  "aria-label": string;
  /** Where it opens while there is room: under the trigger, lined up with its leading or trailing edge. */
  placement?: "bottom start" | "bottom end";
  /** Whether it is open, when the screen holds that. */
  isOpen?: boolean;
  /** Called when it opens or closes: by its trigger, by Escape, by a press outside. */
  onOpenChange?: (isOpen: boolean) => void;
  /** What it holds, or a function that is handed the way to close it. */
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string | undefined;
}

/** The kinds of `input` that text is not typed into: marks, buttons, and what is not shown. */
const NOT_TEXT = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Whether text is typed into the element: a text area, or an input of a kind that takes text. */
function takesText(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (element.disabled) return false;
  return element instanceof HTMLTextAreaElement || !NOT_TEXT.has(element.type);
}

/**
 * What a popover holds. When it opens, the first field in it takes the focus: a popover with a
 * field is opened to type in it. A field is where text is typed; the hidden input of a checkbox
 * or of a radio is not one. Without a field the component library gives the focus to the popover
 * itself.
 */
function Body({ children }: { children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const entries = body.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    );
    [...(entries ?? [])].find(takesText)?.focus();
  }, []);
  return (
    <div ref={body} className={styles.body}>
      {children}
    </div>
  );
}

/**
 * A small surface that opens from a control and holds controls of its own. Opening moves the
 * focus into it, to the first field it holds, or to the popover itself when it holds none; Tab
 * stays inside; Escape or a press outside closes it and gives the focus back to its trigger. It
 * is not a modal: the page behind stays as it is.
 */
export function Popover({
  trigger,
  placement = "bottom start",
  isOpen,
  onOpenChange,
  children,
  className,
  ...props
}: PopoverProps) {
  const offset = lengthToken("--space-1");
  return (
    <DialogTrigger
      {...(isOpen === undefined ? {} : { isOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {trigger}
      <RacPopover
        placement={placement}
        className={cx(styles.popover, className)}
        style={{ zIndex: "var(--z-dropdown)" }}
        {...(offset === null ? {} : { offset })}
      >
        <Dialog aria-label={props["aria-label"]} className={cx(styles.dialog)}>
          {({ close }) => (
            <Body>{typeof children === "function" ? children(close) : children}</Body>
          )}
        </Dialog>
      </RacPopover>
    </DialogTrigger>
  );
}
