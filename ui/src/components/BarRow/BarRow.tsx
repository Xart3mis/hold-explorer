import { useRef, type ReactNode } from "react";
import { Button, ToggleButton } from "react-aria-components";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Skeleton } from "../Skeleton/Skeleton";
import { Tooltip } from "../Tooltip/Tooltip";
import { useIsCut } from "../useIsCut";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./BarRow.module.css";

/**
 * How many shapes a skeleton row has. The stylesheet gives each its label, bar, and value width,
 * so the rows vary like real rows do.
 */
const SKELETON_SHAPES = 6;

export interface BarRowGroupProps {
  /** What the bars show: "Holds by discipline". */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** The rows, sorted by value unless the dimension has an order of its own. */
  children?: ReactNode;
  /** A first load: skeleton rows with bars of varied length. */
  isLoading?: boolean;
  /** How many skeleton rows a first load shows. */
  skeletonRows?: number;
  /** A refetch: the previous rows stay, dimmed, until the new rows arrive. */
  isStale?: boolean;
  className?: string | undefined;
}

/**
 * A group of bar rows. Labels, bars, and values line up in columns across the rows. To assistive
 * technology it is a named list, and each row is an item of it.
 */
export function BarRowGroup({
  children,
  isLoading,
  skeletonRows = SKELETON_SHAPES,
  isStale,
  className,
  ...props
}: BarRowGroupProps) {
  const loading = isLoading === true;
  return (
    <div
      role="list"
      {...props}
      aria-busy={loading ? "true" : undefined}
      data-stale={isStale === true && !loading ? "" : undefined}
      className={cx(styles.group, className)}
    >
      {loading ? (
        <>
          <VisuallyHidden>{t("common.loading")}</VisuallyHidden>
          {Array.from({ length: skeletonRows }, (_, index) => (
            <div
              key={index}
              data-part="skeleton-row"
              data-shape={index % SKELETON_SHAPES}
              className={styles.row}
            >
              <span className={styles.label}>
                <Skeleton className={styles.skeletonLabel} />
              </span>
              <span className={styles.track}>
                <Skeleton variant="bar" className={styles.skeletonBar} />
              </span>
              <span className={styles.value}>
                <Skeleton className={styles.skeletonValue} />
              </span>
            </div>
          ))}
        </>
      ) : (
        children
      )}
    </div>
  );
}

interface BarRowBase {
  /** The category. */
  label: string;
  /** Its value, formatted. */
  value: string;
  /** A second value, formatted: "612 lines". */
  secondaryValue?: string;
  /** The length of the bar as a share of the longest bar of the group, from 0 to 1. */
  fraction: number;
  /**
   * The step of an age band, 1 (youngest) to 5 (oldest). Only a group whose categories have an
   * order takes it; every other bar is the neutral color of plain data.
   */
  ordinalStep?: 1 | 2 | 3 | 4 | 5;
  /** The category is an identifier, a line ID: its label is written in the monospace face. */
  isIdentifier?: boolean;
}

/** A row that filters by its category when it is pressed. */
interface PressableBarRowProps extends BarRowBase {
  isStatic?: false;
  opens?: false;
  /** Filters by the category, or removes it from the filter. */
  onPress: () => void;
  /** Whether the category is in the active filter. */
  isSelected?: boolean;
}

/**
 * A row that opens what it names on another screen, in place of filtering by it: a blocker on
 * Blockers, a line in Lines. It is a plain button: it is not on or off, so it is never selected.
 */
interface OpeningBarRowProps extends BarRowBase {
  isStatic?: false;
  opens: true;
  /** Opens the category. */
  onPress: () => void;
  isSelected?: never;
}

/**
 * A row that only shows its category: a screen that cannot filter by it yet. It is not a button,
 * takes no focus, and has no hover, pressed, or selected look, so nothing on it says that it can
 * be pressed. It has no action and is never in the active filter.
 */
interface StaticBarRowProps extends BarRowBase {
  isStatic: true;
  opens?: never;
  onPress?: never;
  isSelected?: never;
}

/** A row is a button or it is not: a row that can be pressed has an action, a static row none. */
export type BarRowProps = PressableBarRowProps | OpeningBarRowProps | StaticBarRowProps;

/**
 * One category as a row: its label, a bar as long as its share, and its value. An item of the
 * list its group is, and inside it a button, unless it is static: a toggle that filters by the
 * category, or a plain button that opens it. A button whose label is cut says it in full in a
 * tooltip.
 */
export function BarRow(props: BarRowProps) {
  const { label, value, secondaryValue, fraction, ordinalStep, isIdentifier } = props;
  const share = Math.min(1, Math.max(0, fraction));
  const labelText = useRef<HTMLSpanElement>(null);
  const cut = useIsCut(labelText, label);
  const content = (
    <>
      <span
        ref={labelText}
        data-part="bar-label"
        data-identifier={isIdentifier === true ? "" : undefined}
        className={styles.label}
      >
        {label}
      </span>{" "}
      <span className={styles.track}>
        <span
          data-part="bar"
          data-ordinal={ordinalStep}
          aria-hidden="true"
          className={styles.bar}
          style={{ inlineSize: `${String(Math.round(share * 1000) / 10)}%` }}
        />
      </span>
      <span className={styles.value}>{value}</span>
      {secondaryValue === undefined ? null : (
        <>
          {" "}
          <span className={styles.secondary}>{secondaryValue}</span>
        </>
      )}
    </>
  );
  if (props.isStatic === true) {
    return (
      <div role="listitem" data-part="bar-row" className={styles.row}>
        {content}
      </div>
    );
  }
  if (props.opens === true) {
    return (
      <div role="listitem" className={styles.item}>
        <Tooltip text={label} isDisabled={!cut}>
          <Button onPress={props.onPress} data-part="bar-row" className={cx(styles.row)}>
            {content}
          </Button>
        </Tooltip>
      </div>
    );
  }
  return (
    <div role="listitem" className={styles.item}>
      <Tooltip text={label} isDisabled={!cut}>
        <ToggleButton
          isSelected={props.isSelected === true}
          onPress={props.onPress}
          data-part="bar-row"
          className={cx(styles.row)}
        >
          {content}
        </ToggleButton>
      </Tooltip>
    </div>
  );
}
