import type { ReactNode } from "react";
import { Tooltip as RacTooltip, TooltipTrigger } from "react-aria-components";
import { durationToken, lengthToken } from "../../design/token-values";
import { cx } from "../cx";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  /** What the tooltip says. The same text must be on the page or in the control's accessible name. */
  text: string;
  /** The shortcut of the control, shown after the text. */
  shortcut?: string;
  /** Switches the tooltip off, for a control that needs one only at times: a label that is cut. */
  isDisabled?: boolean;
  /** The side it shows on while there is room. */
  placement?: "top" | "bottom" | "start" | "end";
  /** The one control it describes: a button or another focusable component of this library. */
  children: ReactNode;
}

/**
 * A short label for the control it wraps. It shows after the pointer has rested on the control,
 * and at once on keyboard focus. It stays while the pointer is on the control or on the tooltip,
 * and goes when the pointer has left both, when the focus leaves, when the control is pressed,
 * and on Escape. It never takes focus and never holds what is available nowhere else.
 */
export function Tooltip({
  text,
  shortcut,
  isDisabled = false,
  placement = "bottom",
  children,
}: TooltipProps) {
  const delay = durationToken("--delay-tooltip");
  // The time the pointer has to cross from the control onto the tooltip, where it may rest.
  const closeDelay = durationToken("--duration-fast");
  const offset = lengthToken("--space-1");
  return (
    <TooltipTrigger
      isDisabled={isDisabled}
      {...(delay === null ? {} : { delay })}
      {...(closeDelay === null ? {} : { closeDelay })}
    >
      {children}
      <RacTooltip
        placement={placement}
        {...(offset === null ? {} : { offset })}
        className={cx(styles.tooltip)}
        style={{ zIndex: "var(--z-tooltip)" }}
      >
        <span>{text}</span>
        {shortcut === undefined ? null : <kbd className={styles.shortcut}>{shortcut}</kbd>}
      </RacTooltip>
    </TooltipTrigger>
  );
}
