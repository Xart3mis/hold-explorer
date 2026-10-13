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

/**
 * What a popover holds. When it opens, the first field in it takes the focus: a popover with a
 * field is opened to type in it. Without a field the component library gives the focus to the
 * popover itself.
 */
function Body({ children }: { children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.querySelector<HTMLElement>("input:not([disabled]), textarea")?.focus();
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
