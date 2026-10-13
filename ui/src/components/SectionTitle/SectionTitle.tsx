import { cx } from "../cx";
import styles from "./SectionTitle.module.css";

export interface SectionTitleProps {
  /**
   * The heading level that assistive technology reads: 2 for a section of a page and for the
   * title of a panel, 3 for a part inside one. Levels follow the page title without skipping one.
   */
  level: 2 | 3;
  /** The title, in sentence case. */
  children: string;
  /** An id, so the section the title heads can be named by it. */
  id?: string;
  className?: string | undefined;
}

/** The heading of a part of a page or of a panel. It is text: it opens nothing. */
export function SectionTitle({ level, children, id, className }: SectionTitleProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <Heading id={id} data-level={level} className={cx(styles.title, className)}>
      {children}
    </Heading>
  );
}
