import type { ReactNode } from "react";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Skeleton } from "../Skeleton/Skeleton";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./FactList.module.css";

export interface Fact {
  /** The name of the fact. It is also what tells the rows of a list apart. */
  label: string;
  /** The value. Text, or text with its own marks: it is never cut, so it may be long. */
  value: ReactNode;
  /**
   * `identifier` for a line ID, a tag, a source ID, or a file name: it is written in the
   * monospace, exactly as the source wrote it, and can be selected and copied.
   */
  kind?: "text" | "identifier";
  /** The value is words that say that the fact is absent. They are written in the muted ink. */
  isAbsent?: boolean;
  /** One quiet button at the end of the row that acts on its fact. */
  action?: ReactNode;
}

export interface FactListProps {
  /** What the facts are about: "File facts". */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  items: readonly Fact[];
  /** A first load: the labels show, and each value is a still block. */
  isLoading?: boolean;
  className?: string | undefined;
}

/**
 * Pairs of a label and a value, ruled like the rows of a register. The labels form a column, so
 * the values start on one line. It is a list to assistive technology, and each row reads its
 * label and then its value. It is not interactive: a row that leads somewhere has an action.
 */
export function FactList({ items, isLoading, className, ...props }: FactListProps) {
  const loading = isLoading === true;
  return (
    // The roles are written out. A list that is drawn without its markers is not told as a list
    // by every engine, and the web view of the Linux build is one that drops it.
    <div
      role="list"
      {...props}
      aria-busy={loading ? "true" : undefined}
      className={cx(styles.list, className)}
    >
      {items.map((item, index) => (
        // Two columns of an export may share a header, so the label alone is no key.
        <div key={`${String(index)}:${item.label}`} role="listitem" className={styles.row}>
          <span className={styles.label}>{item.label}</span>
          {loading ? (
            <span className={styles.value}>
              <Skeleton className={styles.skeleton} />
            </span>
          ) : (
            <>
              <span
                data-kind={item.kind === "identifier" ? "identifier" : undefined}
                data-absent={item.isAbsent === true ? "" : undefined}
                className={styles.value}
              >
                {item.value}
              </span>
              {item.action === undefined ? null : (
                <span className={styles.action}>{item.action}</span>
              )}
            </>
          )}
        </div>
      ))}
      {loading ? (
        <div role="listitem" className={styles.status}>
          <VisuallyHidden>{t("common.loading")}</VisuallyHidden>
        </div>
      ) : null}
    </div>
  );
}
