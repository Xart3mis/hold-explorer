import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button as RacButton,
  Disclosure as RacDisclosure,
  DisclosurePanel,
  Heading,
} from "react-aria-components";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  /** What the row is about. It is the name of the button that opens it. */
  title: string;
  /** How many, after the title and part of the name of the button: "37 times". */
  count?: string;
  /** One sentence under the title that is always shown: what the row means, what the app did. */
  summary?: string;
  /** The row is open when it is first shown. */
  defaultExpanded?: boolean;
  /**
   * Makes the title a heading of this level, under the heading of its section. Without it the
   * title is the name of the button and nothing more.
   */
  level?: 2 | 3 | 4;
  /** A quiet button at the trailing edge of the first line, outside the button that opens the row. */
  action?: ReactNode;
  /** The detail. It is on the page only while the row is open. */
  children: ReactNode;
  className?: string | undefined;
}

/**
 * A row that opens in place. Its title, its count, and its summary are on the page at once; the
 * detail is one press away, on the same page. Enter or Space opens and closes it. The detail
 * appears at once: no height is animated.
 */
export function Disclosure({
  title,
  count,
  summary,
  defaultExpanded = false,
  level,
  action,
  children,
  className,
}: DisclosureProps) {
  return (
    <RacDisclosure defaultExpanded={defaultExpanded} className={cx(styles.disclosure, className)}>
      {({ isExpanded }) => {
        const trigger = (
          <RacButton slot="trigger" className={cx(styles.trigger)}>
            <Icon icon={isExpanded ? ChevronDown : ChevronRight} className={styles.chevron} />
            <span className={styles.title}>{title}</span>
            {count === undefined ? null : (
              <>
                {" "}
                <span className={styles.count}>{count}</span>
              </>
            )}
          </RacButton>
        );
        return (
          <>
            <div className={styles.head}>
              {level === undefined ? (
                <div className={styles.heading}>{trigger}</div>
              ) : (
                <Heading level={level} className={cx(styles.heading)}>
                  {trigger}
                </Heading>
              )}
              {action}
            </div>
            {summary === undefined ? null : <p className={styles.summary}>{summary}</p>}
            <DisclosurePanel className={cx(styles.panel)}>
              {isExpanded ? children : null}
            </DisclosurePanel>
          </>
        );
      }}
    </RacDisclosure>
  );
}

export interface DisclosureGroupProps {
  /** The rows: `Disclosure`, and `DisclosureStatement` where there is nothing to open. */
  children: ReactNode;
  className?: string | undefined;
}

/** Rows that open, one under the other, with the hairline above the first of them. */
export function DisclosureGroup({ children, className }: DisclosureGroupProps) {
  return (
    <div data-part="disclosure-group" className={cx(styles.group, className)}>
      {children}
    </div>
  );
}

export interface DisclosureStatementProps {
  /** What there is to say in the place of the row: "No rows were skipped." */
  children: string;
}

/**
 * A statement in the place of a row that opens, where there is nothing to open. It starts where
 * the titles of the rows start. A row is never disabled: one that could not be opened and did not
 * say why would be a dead control.
 */
export function DisclosureStatement({ children }: DisclosureStatementProps) {
  return <p className={styles.statement}>{children}</p>;
}
