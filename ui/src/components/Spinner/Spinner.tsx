import { cx } from "../cx";
import styles from "./Spinner.module.css";

/**
 * The one loop of the interface: a ring that turns once per loop period, and stands still under
 * reduced motion. It is decorative; the control it sits in says what is happening.
 */
export function Spinner({ className }: { className?: string | undefined }) {
  return <span data-part="spinner" aria-hidden="true" className={cx(styles.spinner, className)} />;
}
