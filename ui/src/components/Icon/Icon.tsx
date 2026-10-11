import type { LucideIcon } from "lucide-react";
import { cx } from "../cx";
import styles from "./Icon.module.css";

export interface IconProps {
  /** An icon of the one outline set, Lucide. */
  icon: LucideIcon;
  className?: string | undefined;
}

/**
 * An icon at the size and stroke of DESIGN.md, in the color of the text around it. It is always
 * decorative: the label beside it, or the accessible name of its control, says what it means.
 */
export function Icon({ icon: Glyph, className }: IconProps) {
  return <Glyph aria-hidden="true" focusable="false" className={cx(styles.icon, className)} />;
}
