import { useState, type ReactNode } from "react";
import { Button as RacButton, type ButtonProps as RacButtonProps } from "react-aria-components";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { useFilters, withValues } from "../../app/filters/state";
import { searchWithSelection } from "../../app/selection";
import { useSnapshotQuery } from "../../app/view";
import type { BlockerDetail as BlockerAnswer } from "../../bindings/BlockerDetail";
import type { LinkedBlocker } from "../../bindings/LinkedBlocker";
import { Button, EmptyState, FactList, Skeleton, Tag, type Fact } from "../../components";
import { cx } from "../../components/cx";
import { formatCount, isBlank } from "../../text/format";
import { t } from "../../text/i18n";
import { DEFAULT_LINES_STATE, linesAddress } from "../lines/address";
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
          ? { value: t("detail.noStep"), isAbsent: true }
          : { value: t("detail.step", { step: blocker.step }) }),
    },
  ];
}

/**
 * One stop in the Tab order for a list of rows, each a button: Tab enters the list on the row the
 * keyboard was last on in it, the first at first; the up and down arrows move from row to row,
 * Home and End to the ends. A long list is then one Tab to pass, not fifty. Give each row
 * `rowProps(index)`.
 */
function useRowStop(count: number) {
  const [at, setAt] = useState(0);
  const stop = Math.min(at, Math.max(0, count - 1));
  const rowProps = (index: number): Partial<RacButtonProps> => ({
    excludeFromTabOrder: index !== stop,
    onFocus: () => {
      setAt(index);
    },
    onKeyDown: (event) => {
      const list = event.target instanceof Element ? event.target.closest("ul") : null;
      if (list === null) return;
      const rows = [...list.querySelectorAll<HTMLElement>(":scope > li > button")];
      const last = rows.length - 1;
      const next =
        event.key === "ArrowDown"
          ? Math.min(last, index + 1)
          : event.key === "ArrowUp"
            ? Math.max(0, index - 1)
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? last
                : null;
      if (next === null) {
        event.continuePropagation();
        return;
      }
      event.preventDefault();
      rows[next]?.focus();
    },
  });
  return rowProps;
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
  const shown = lines.slice(0, SHOWN_ROWS);
  const rowProps = useRowStop(shown.length);
  return (
    <>
      <ul aria-label={label} className={styles.rows}>
        {shown.map((lineId, index) => (
          <li key={lineId} className={styles.holdItem}>
            <RacButton
              {...rowProps(index)}
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
            // Named by the list it stands under, so the two read apart.
            <Button
              variant="quiet"
              aria-label={t("detail.showAllOf", { list: label })}
              onPress={onShowAll}
            >
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
  const shown = linked.slice(0, SHOWN_ROWS);
  const rowProps = useRowStop(shown.length);
  return (
    <>
      <ul aria-label={t("detail.linked")} className={styles.rows}>
        {shown.map((blocker, index) => (
          <li key={blocker.key} className={styles.holdItem}>
            <RacButton
              {...rowProps(index)}
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
  const location = useLocation();
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
  // That the filters leave out the blocker, or that the snapshot has none, is said of the
  // filters it was read for: while other filters are read, the panel waits as on a first load.
  // The same filters read again keep it, dimmed.
  const isAbsent = data === null && (!isStale || !query.isPlaceholderData);

  const head = (
    <PanelHead
      headingId={headingId}
      headingRef={heading}
      title={blocker?.label ?? t("detail.blockerTitle")}
      onClose={onClose}
    >
      {isAbsent || (data === undefined && error !== null) ? null : (
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

  if (isAbsent) {
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
  // blocker, those it frees and those it shares. The panel closes on the way: under that filter
  // it would say that every line kept is freed by the blocker alone.
  const showAll = () => {
    if (shown === undefined) return;
    update((current) =>
      withValues(current, "Blocker", [{ key: shown.key, label: shown.label }], false),
    );
    // The entry left behind is the page without the panel, so going back does not show it
    // under the filter of its blocker either.
    void navigate(
      { search: searchWithSelection(location.search, null), hash: location.hash },
      { replace: true, state: location.state as unknown },
    );
    void navigate(linesAddress(DEFAULT_LINES_STATE));
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
