import { Label, ProgressBar } from "react-aria-components";
import { formatPercent } from "../../text/format";
import { cx } from "../cx";
import styles from "./Progress.module.css";

export interface ProgressProps {
  /**
   * What is happening and how far, in words: "Reading rows, 4,200 of 9,300". A bar never appears
   * without it; under reduced motion it carries the state alone.
   */
  label: string;
  /** How far, from 0 to 1. Leave it out while no total is known. */
  value?: number;
  /** The id of the label, for a region around the bar that is named by it. */
  labelId?: string | undefined;
  className?: string | undefined;
}

/**
 * A progress bar under its label. With a value, the fill is moved along the track by a transform.
 * Without one, a segment travels along the track. It never rests at 100 percent: when the work is
 * done, the screen replaces it.
 */
export function Progress({ label, value, labelId, className }: ProgressProps) {
  const fraction = value === undefined ? undefined : Math.min(1, Math.max(0, value));
  // The percentage is written by the app's own formatter, for the eye and for assistive technology.
  const share = fraction === undefined ? undefined : formatPercent(fraction);
  return (
    <ProgressBar
      {...(fraction === undefined || share === undefined
        ? { isIndeterminate: true }
        : { value: fraction * 100, valueLabel: share })}
      data-indeterminate={fraction === undefined ? "" : undefined}
      className={cx(styles.progress, className)}
    >
      {() => (
        <>
          <div className={styles.header}>
            <Label id={labelId} className={cx(styles.label)}>
              {label}
            </Label>
            {share === undefined ? null : <span className={styles.value}>{share}</span>}
          </div>
          <div className={styles.track}>
            {fraction === undefined ? (
              <div className={styles.runner}>
                <div data-part="segment" className={styles.segment} />
              </div>
            ) : (
              <div
                data-part="fill"
                className={styles.fill}
                style={{
                  transform: `translateX(${String(Math.round((fraction - 1) * 1000) / 10)}%)`,
                }}
              />
            )}
          </div>
        </>
      )}
    </ProgressBar>
  );
}
