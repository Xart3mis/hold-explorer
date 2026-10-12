import { t } from "../../app/i18n";
import { BarRowGroup, Skeleton, VisuallyHidden } from "../../components";
import { Page } from "../shell/Page";
import styles from "./OverviewPage.module.css";

/**
 * Overview: its page header and the layout of the page. What the page shows is read with the
 * `overview` command; until that reading is there the page is in its first-load state, blocks in
 * the shape of the figures and the bars.
 */
export function OverviewPage() {
  return (
    <Page title={t("destinations.name.overview")} width="content">
      <div aria-busy="true" className={styles.loading}>
        <VisuallyHidden role="status">{t("overview.loading")}</VisuallyHidden>
        <div aria-hidden="true" className={styles.figures}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={styles.figure}>
              <span className={styles.figureLabel}>
                <Skeleton width="12ch" />
              </span>
              <Skeleton variant="stat" />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className={styles.sectionTitle}>
          <Skeleton width="20ch" />
        </div>
        <BarRowGroup isLoading aria-label={t("overview.loading")} />
      </div>
    </Page>
  );
}
