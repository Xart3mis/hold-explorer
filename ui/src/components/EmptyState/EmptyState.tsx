import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /** What is absent. */
  title: string;
  /** One or two sentences: why, and what to do. */
  children: ReactNode;
  /**
   * The one action: a secondary button, or a primary button when it is the main action of the
   * screen. An empty state over active filters offers "Clear all".
   */
  action?: ReactNode;
  /** `page` on an otherwise empty page (the default); `table` inside a table area, under its header. */
  placement?: "page" | "table";
  className?: string | undefined;
}

/**
 * What a screen shows when it has nothing to show: what is absent, why, and the next action. It
 * sits where the content would be, left-aligned, with no illustration and no icon.
 */
export function EmptyState({
  title,
  children,
  action,
  placement = "page",
  className,
}: EmptyStateProps) {
  return (
    <div data-placement={placement} className={cx(styles.empty, className)}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{children}</p>
      {action === undefined ? null : <div className={styles.action}>{action}</div>}
    </div>
  );
}
