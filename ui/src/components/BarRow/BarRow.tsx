import type { ReactNode } from "react";
import { ToggleButton } from "react-aria-components";
import { t } from "../../app/i18n";
import { cx } from "../cx";
import { Skeleton } from "../Skeleton/Skeleton";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./BarRow.module.css";

/** The shapes of the skeleton rows: label, bar, and value widths that vary like real rows do. */
const SKELETON_ROWS = [
  { label: "9ch", bar: "100%", value: "5ch" },
  { label: "14ch", bar: "82%", value: "5ch" },
  { label: "7ch", bar: "57%", value: "3ch" },
  { label: "12ch", bar: "38%", value: "3ch" },
  { label: "10ch", bar: "24%", value: "3ch" },
  { label: "8ch", bar: "12%", value: "2ch" },
] as const;

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

/** A group of bar rows. Labels, bars, and values line up in columns across the rows. */
export function BarRowGroup({
  children,
  isLoading,
  skeletonRows = SKELETON_ROWS.length,
  isStale,
  className,
  ...props
}: BarRowGroupProps) {
  const loading = isLoading === true;
  return (
    <div
      role="group"
      {...props}
      aria-busy={loading ? "true" : undefined}
      data-stale={isStale === true && !loading ? "" : undefined}
      className={cx(styles.group, className)}
    >
      {loading ? (
        <>
          <VisuallyHidden>{t("common.loading")}</VisuallyHidden>
          {Array.from({ length: skeletonRows }, (_, index) => {
            const shape = SKELETON_ROWS[index % SKELETON_ROWS.length] ?? SKELETON_ROWS[0];
            return (
              <div key={index} data-part="skeleton-row" className={styles.row}>
                <span className={styles.label}>
                  <Skeleton width={shape.label} />
                </span>
                <span className={styles.track}>
                  <Skeleton variant="bar" width={shape.bar} />
                </span>
                <span className={styles.value}>
                  <Skeleton width={shape.value} />
                </span>
              </div>
            );
          })}
        </>
      ) : (
        children
      )}
    </div>
  );
}

export interface BarRowProps {
  /** The category. */
  label: string;
  /** Its value, formatted. */
  value: string;
  /** A second value, formatted: "612 lines". */
  secondaryValue?: string;
  /** The length of the bar as a share of the longest bar of the group, from 0 to 1. */
  fraction: number;
  /** Whether the category is in the active filter. */
  isSelected?: boolean;
  /** Filters by the category, or removes it from the filter. */
  onPress?: () => void;
  /**
   * The step of an age band, 1 (youngest) to 5 (oldest). Only a group whose categories have an
   * order takes it; every other bar is the neutral color of plain data.
   */
  ordinalStep?: 1 | 2 | 3 | 4 | 5;
}

/** One category as a row: its label, a bar as long as its share, and its value. A button. */
export function BarRow({
  label,
  value,
  secondaryValue,
  fraction,
  isSelected,
  onPress,
  ordinalStep,
}: BarRowProps) {
  const share = Math.min(1, Math.max(0, fraction));
  return (
    <ToggleButton
      isSelected={isSelected === true}
      {...(onPress === undefined ? {} : { onPress })}
      className={cx(styles.row)}
    >
      <span className={styles.label}>{label}</span>{" "}
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
    </ToggleButton>
  );
}
