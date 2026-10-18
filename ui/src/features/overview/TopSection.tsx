import { useId } from "react";
import { BarRow, BarRowGroup } from "../../components";
import { formatCount } from "../../text/format";
import styles from "./Section.module.css";

/** How many skeleton rows stand for each list of the most holds: the command sends ten at most. */
const TOP_SKELETON_ROWS = 6;

/** One list of the most holds: its title, and a row for each of what the command sent. */
export function TopSection<Item>({
  title,
  none,
  items,
  itemKey,
  label,
  holds,
  isIdentifier = false,
  hasLongLabels = false,
  onOpen,
}: {
  title: string;
  /** What the list says when the command sent it no row. */
  none: string;
  /** The rows as the command sent them, most holds first. Absent on a first load. */
  items?: readonly Item[];
  itemKey: (item: Item) => string;
  label: (item: Item) => string;
  holds: (item: Item) => number;
  /** Whether what a row names is an identifier, a line ID. */
  isIdentifier?: boolean;
  /** Whether its labels are long names, which take the room the bars leave. */
  hasLongLabels?: boolean;
  /** Opens what a row names. */
  onOpen: (item: Item) => void;
}) {
  const titleId = useId();
  // The rows keep the order the command gives; a bar is as long as its share of the largest count.
  const largest = Math.max(0, ...(items ?? []).map(holds));
  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <h2 id={titleId} className={styles.groupTitle}>
          {title}
        </h2>
      </div>
      {items === undefined ? (
        <BarRowGroup
          isLoading
          skeletonRows={TOP_SKELETON_ROWS}
          labels={hasLongLabels ? "wide" : "fixed"}
          aria-labelledby={titleId}
        />
      ) : items.length === 0 ? (
        <p className={styles.none}>{none}</p>
      ) : (
        <BarRowGroup labels={hasLongLabels ? "wide" : "fixed"} aria-labelledby={titleId}>
          {items.map((item) => (
            <BarRow
              key={itemKey(item)}
              opens
              isIdentifier={isIdentifier}
              onPress={() => {
                onOpen(item);
              }}
              label={label(item)}
              value={formatCount(holds(item))}
              fraction={largest > 0 ? holds(item) / largest : 0}
            />
          ))}
        </BarRowGroup>
      )}
    </section>
  );
}
