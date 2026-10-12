import { Skeleton } from "../../components";
import styles from "./Import.module.css";

/** The first-load state: blocks in the shape of the review to come, its figures and its rows. */
export function PageToCome() {
  return (
    <div aria-hidden="true" className={styles.shape}>
      <div className={styles.figures}>
        {["9ch", "7ch", "11ch"].map((width) => (
          <div key={width} className={styles.figure}>
            <span className={styles.shapeLabel}>
              <Skeleton width={width} />
            </span>
            <Skeleton variant="stat" />
          </div>
        ))}
      </div>
      {["58%", "74%", "66%", "49%"].map((width) => (
        <span key={width} className={styles.shapeRow}>
          <Skeleton width={width} />
        </span>
      ))}
    </div>
  );
}
