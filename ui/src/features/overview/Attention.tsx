import { ChevronRight, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { Button as RacButton } from "react-aria-components";
import type { StaleCount } from "../../bindings/StaleCount";
import { Icon, Skeleton, Tag } from "../../components";
import { cx } from "../../components/cx";
import { t } from "../../text/i18n";
import own from "./Attention.module.css";
import styles from "./Section.module.css";

/**
 * What needs attention: the open holds the filters keep that have waited long, as one entry that
 * opens them in Lines. A real state, so it carries a warning tag with its icon. When none has
 * waited that long the section says so in one quiet line, and there is nothing to press. When the
 * command says the age of the holds cannot be known, because the open holds the filters keep have
 * no creation date, it says that, and not that none is stale.
 */
export function Attention({
  stale,
  isFiltered,
  onOpen,
}: {
  /** Absent on a first load. */
  stale?: StaleCount;
  isFiltered: boolean;
  /** Opens the stale holds in Lines. */
  onOpen: (stale: StaleCount) => void;
}) {
  const titleId = useId();
  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <h2 id={titleId} className={styles.groupTitle}>
          {t("overview.attention")}
        </h2>
      </div>
      {stale === undefined ? (
        <div className={own.list}>
          <div className={own.skeleton}>
            <Skeleton />
          </div>
        </div>
      ) : stale.holds === 0 ? (
        <p className={styles.none}>
          {!stale.ages_known
            ? t("overview.staleUnknown")
            : t(isFiltered ? "overview.staleNoneMatch" : "overview.staleNone", {
                days: stale.days,
              })}
        </p>
      ) : (
        <div role="list" aria-labelledby={titleId} className={own.list}>
          <div role="listitem" className={own.item}>
            <RacButton
              onPress={() => {
                onOpen(stale);
              }}
              className={cx(own.entry)}
            >
              <Tag tone="warning" icon={TriangleAlert}>
                {t("overview.staleTag")}
              </Tag>{" "}
              <span className={own.text}>
                {t("overview.stale", { count: stale.holds, days: stale.days })}
              </span>
              <Icon icon={ChevronRight} className={own.chevron} />
            </RacButton>
          </div>
        </div>
      )}
    </section>
  );
}
