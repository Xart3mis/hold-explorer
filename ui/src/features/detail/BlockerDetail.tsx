import type { ReactNode } from "react";
import { Button as RacButton } from "react-aria-components";
import { useNavigate } from "react-router";
import { api } from "../../api/commands";
import { useFilters, withValues } from "../../app/filters/state";
import { searchWithSelection } from "../../app/selection";
import { useSnapshotQuery } from "../../app/view";
import type { BlockerDetail as BlockerAnswer } from "../../bindings/BlockerDetail";
import type { LinkedBlocker } from "../../bindings/LinkedBlocker";
import { Button, EmptyState, FactList, Skeleton, Tag, type Fact } from "../../components";
import { formatCount, isBlank } from "../../text/format";
import { t } from "../../text/i18n";
import { DEFAULT_LINES_STATE, linesAddress } from "../lines/address";
import { cx } from "../../components/cx";
import styles from "./Detail.module.css";
import { HoldList } from "./HoldList";
import {
  Loading,
  notGiven,
  PanelBody,
  PanelHead,
  Section,
  SkeletonRows,
  useHeading,
  useKept,
  type DetailProps,
} from "./parts";
import { useDetailFocus, useSelection } from "./selection";

/**
 * How many rows a list of the panel shows at most. A blocker can free or share hundreds of lines;
 * Lines lists them all, filtered by the blocker.
 */
export const SHOWN_ROWS = 50;

/** The facts of the blocker; their labels show on a first load. */
function blockerFacts(blocker: BlockerAnswer | undefined): Fact[] {
  const waiting = { value: "" };
  return [
    {
      label: t("detail.fact.discipline"),
      ...(blocker === undefined
        ? waiting
        : isBlank(blocker.discipline)
          ? notGiven()
          : { value: blocker.discipline }),
    },
    {
      label: t("detail.fact.holds"),
      ...(blocker === undefined ? waiting : { value: formatCount(blocker.holds) }),
    },
    {
      label: t("detail.fact.frees"),
      ...(blocker === undefined
        ? waiting
        : { value: t("detail.lineCount", { count: blocker.frees.length }) }),
    },
    {
      label: t("detail.fact.shared"),
      ...(blocker === undefined
        ? waiting
        : { value: t("detail.lineCount", { count: blocker.shared.length }) }),
    },
    {
      label: t("detail.fact.solveOrder"),
      ...(blocker === undefined
        ? waiting
        : blocker.step === null
          ? { value: t("detail.notRanked"), isAbsent: true }
          : { value: t("detail.step", { step: blocker.step }) }),
    },
  ];
}

/** Under a list that holds more than it shows: how many it shows, and what leads to the rest. */
function More({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div data-part="detail-more" className={styles.more}>
      <span className={styles.caption}>{text}</span>
      {action}
    </div>
  );
}

/** Lines, each a button that opens that line in the panel: the first of them, and the way to all. */
function LineList({
  lines,
  label,
  onShowAll,
}: {
  lines: readonly string[];
  label: string;
  onShowAll: () => void;
}) {
  const { select } = useSelection();
  const focus = useDetailFocus();
  return (
    <>
      <ul aria-label={label} className={styles.rows}>
        {lines.slice(0, SHOWN_ROWS).map((lineId) => (
          <li key={lineId} className={styles.holdItem}>
            <RacButton
              data-part="line-row"
              className={cx(styles.lineRow)}
              onPress={() => {
                // The button is gone once the line shows, so the focus goes to the heading.
                focus.askForHeading();
                select({ kind: "line", lineId });
              }}
            >
              {lineId}
            </RacButton>
          </li>
        ))}
      </ul>
      {lines.length <= SHOWN_ROWS ? null : (
        <More
          text={t("detail.shownOf", { shown: SHOWN_ROWS, count: lines.length })}
          action={
            <Button variant="quiet" onPress={onShowAll}>
              {t("detail.showAll")}
            </Button>
          }
        />
      )}
    </>
  );
}

/** The other blockers on the lines of this one, each a button that opens it in the panel. */
function LinkedList({ linked }: { linked: readonly LinkedBlocker[] }) {
  const { select } = useSelection();
  const focus = useDetailFocus();
  return (
    <>
      <ul aria-label={t("detail.linked")} className={styles.rows}>
        {linked.slice(0, SHOWN_ROWS).map((blocker) => (
          <li key={blocker.key} className={styles.holdItem}>
            <RacButton
              data-part="blocker-row"
              className={cx(styles.holdRow)}
              onPress={() => {
                focus.askForHeading();
                select({ kind: "blocker", key: blocker.key });
              }}
            >
              <span className={styles.rowTitle}>{blocker.label}</span>
              <span className={styles.rowFoot}>
                <Tag>{blocker.kind}</Tag>
                <span className={styles.trailing}>
                  {t("detail.sharesLines", { count: blocker.shared_lines })}
                </span>
              </span>
            </RacButton>
          </li>
        ))}
      </ul>
      {linked.length <= SHOWN_ROWS ? null : (
        <More text={t("detail.linkedShownOf", { shown: SHOWN_ROWS, count: linked.length })} />
      )}
    </>
  );
}

/**
 * A blocker in the detail panel, among the holds the filters of the bar keep: its type; its
 * discipline, its holds, how many lines it frees on its own and how many it shares, and its step
 * in the solve order of the same holds; then those lines, the blockers it shares them with, and
 * its oldest open hold. Each line, blocker, and hold opens in the panel in its place. A list
 * shows its first rows, and the lines lead to Lines, filtered by the blocker, for all of them.
 * A blocker the filters leave out is said to be so, with a way to clear them.
 */
export function BlockerDetail({
  blockerKey,
  headingId,
  absent,
  onClose,
}: DetailProps & { blockerKey: string }) {
  const heading = useHeading();
  const navigate = useNavigate();
  const { spec, isDefault, clear, update } = useFilters();
  const query = useSnapshotQuery({
    name: "blockerDetail",
    params: [spec, blockerKey],
    read: (view, filter, key) => api.blockerDetail(filter, key, view),
  });
  const { data, isStale } = useKept(query);
  const error = query.isError
    ? {
        error: query.error,
        title: t("detail.errorBlocker"),
        retry: () => void query.refetch(),
        isRetrying: query.isFetching,
      }
    : null;
  const blocker = data ?? undefined;

  const head = (
    <PanelHead
      headingId={headingId}
      headingRef={heading}
      title={blocker?.label ?? t("detail.blockerTitle")}
      onClose={onClose}
    >
      {data === null || (data === undefined && error !== null) ? null : (
        <div className={styles.tagRow}>
          {blocker === undefined ? (
            <span aria-hidden="true" className={styles.tagWaiting}>
              <Skeleton width="6ch" />
            </span>
          ) : (
            <Tag>{blocker.kind}</Tag>
          )}
        </div>
      )}
    </PanelHead>
  );

  if (data === null) {
    return (
      <>
        {head}
        <PanelBody isStale={isStale} error={error}>
          {isDefault ? (
            <EmptyState
              title={t("detail.blockerMissingTitle")}
              placement="table"
              action={<Button onPress={onClose}>{t("detail.closePanel")}</Button>}
            >
              {t("detail.blockerMissingText")}
            </EmptyState>
          ) : (
            <EmptyState
              title={t("detail.blockerFilteredTitle")}
              placement="table"
              action={<Button onPress={clear}>{t("detail.clearFilters")}</Button>}
            >
              {t("detail.blockerFilteredText")}
            </EmptyState>
          )}
        </PanelBody>
      </>
    );
  }

  // A first load that failed has nothing under its notice.
  if (data === undefined && error !== null) {
    return (
      <>
        {head}
        <PanelBody isStale={false} error={error}>
          {null}
        </PanelBody>
      </>
    );
  }

  const isLoading = blocker === undefined || absent === null;
  const shown = isLoading ? undefined : blocker;
  // Lines, with the filters of the bar and this blocker added to them: every line of the
  // blocker, those it frees and those it shares. The panel stays open on the blocker there.
  const showAll = () => {
    if (shown === undefined) return;
    update((current) =>
      withValues(current, "Blocker", [{ key: shown.key, label: shown.label }], false),
    );
    void navigate(
      linesAddress(
        DEFAULT_LINES_STATE,
        searchWithSelection("", { kind: "blocker", key: shown.key }),
      ),
    );
  };
  return (
    <>
      {head}
      <PanelBody isStale={isStale} error={error}>
        {isLoading ? <Loading /> : null}
        <FactList
          aria-label={t("detail.blockerFacts")}
          items={blockerFacts(shown)}
          isLoading={isLoading}
        />
        <Section title={t("detail.frees")}>
          {shown === undefined ? (
            <SkeletonRows count={2} lines={1} />
          ) : shown.frees.length === 0 ? (
            <p className={styles.statement}>{t("detail.noFrees")}</p>
          ) : (
            <LineList lines={shown.frees} label={t("detail.frees")} onShowAll={showAll} />
          )}
        </Section>
        <Section title={t("detail.shared")}>
          {shown === undefined ? (
            <SkeletonRows count={2} lines={1} />
          ) : shown.shared.length === 0 ? (
            <p className={styles.statement}>{t("detail.noShared")}</p>
          ) : (
            <LineList lines={shown.shared} label={t("detail.shared")} onShowAll={showAll} />
          )}
        </Section>
        <Section title={t("detail.linked")}>
          {shown === undefined ? (
            <SkeletonRows />
          ) : shown.linked.length === 0 ? (
            <p className={styles.statement}>{t("detail.noLinked")}</p>
          ) : (
            <LinkedList linked={shown.linked} />
          )}
        </Section>
        <Section title={t("detail.oldest")}>
          {shown === undefined ? (
            <SkeletonRows count={1} lines={3} />
          ) : shown.oldest === null ? (
            <p className={styles.statement}>{t("detail.noOldest")}</p>
          ) : (
            <HoldList holds={[shown.oldest]} absent={absent} label={t("detail.oldest")} showsLine />
          )}
        </Section>
      </PanelBody>
    </>
  );
}
