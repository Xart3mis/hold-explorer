import { cx } from "../cx";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  /**
   * What the block stands for: a line of text (inside its line box), the value of a stat tile, or
   * the bar of a bar row.
   */
  variant?: "text" | "stat" | "bar";
  /** The width of what it stands for, for example `12ch` or `60%`. A text line fills its box otherwise. */
  width?: string;
  className?: string | undefined;
}

/**
 * A still block in the shape of content that is loading for the first time. It never shimmers or
 * pulses, and a refetch never shows it. The container says that it is loading; the block is
 * hidden from assistive technology.
 */
export function Skeleton({ variant = "text", width, className }: SkeletonProps) {
  return (
    <span
      data-part="skeleton"
      data-variant={variant}
      aria-hidden="true"
      className={cx(styles.skeleton, className)}
      style={width === undefined ? undefined : { inlineSize: width }}
    />
  );
}
