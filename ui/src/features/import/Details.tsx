import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Disclosure, DisclosurePanel, Heading } from "react-aria-components";
import { Icon } from "../../components";
import { cx } from "../../components/cx";
import styles from "./Import.module.css";

export interface DetailsProps {
  /** What the row is about. It is the name of the button that opens it. */
  title: string;
  /** How many, after the title and part of the name: "37 times". */
  count?: string;
  /** One sentence under the title that is always shown: what it means, what the app did. */
  text?: string;
  /** The level of the heading the title is, under the heading of its section. */
  level: 2 | 3;
  /** A button at the trailing edge of the first line, outside the button that opens the row. */
  action?: ReactNode;
  /** The detail, shown once the row is opened. */
  children: ReactNode;
}

/**
 * A row that opens in place. Its title, its count, and its sentence are visible at once; the
 * detail is one press away, on the same page. Enter or Space opens and closes it. The detail
 * appears at once: no height is animated.
 */
export function Details({ title, count, text, level, action, children }: DetailsProps) {
  return (
    <Disclosure className={cx(styles.details)}>
      {({ isExpanded }) => (
        <>
          <div className={styles.detailsHead}>
            <Heading level={level} className={cx(styles.detailsHeading)}>
              <Button slot="trigger" className={cx(styles.detailsTrigger)}>
                <Icon
                  icon={isExpanded ? ChevronDown : ChevronRight}
                  className={styles.detailsChevron}
                />
                <span className={styles.detailsTitle}>{title}</span>
                {count === undefined ? null : (
                  <>
                    {" "}
                    <span className={styles.detailsCount}>{count}</span>
                  </>
                )}
              </Button>
            </Heading>
            {action}
          </div>
          {text === undefined ? null : <p className={styles.detailsText}>{text}</p>}
          <DisclosurePanel className={cx(styles.detailsPanel)}>
            {isExpanded ? children : null}
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}
