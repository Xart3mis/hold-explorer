import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { useFilters, withValues, type Filters } from "../../app/filters/state";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import { useSnapshotQuery } from "../../app/view";
import type { Dim } from "../../bindings/Dim";
import type { Group } from "../../bindings/Group";
import type { OverviewView } from "../../bindings/OverviewView";
import type { Status } from "../../bindings/Status";
import type { Summary } from "../../bindings/Summary";
import {
  BarRow,
  BarRowGroup,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Notice,
  StatTile,
  StatTileGroup,
  VisuallyHidden,
  type DataTableColumn,
  textChars,
} from "../../components";
import { formatCount, formatDateTime, formatDays } from "../../text/format";
import { t, type MessageKey } from "../../text/i18n";
import { FilterBar } from "../filters/FilterBar";
import { startImport } from "../import/start";
import { DEFAULT_LINES_STATE, linesAddress } from "../lines/address";
import { presetQuery } from "../lines/presets";
import styles from "./OverviewPage.module.css";

/**
 * The two groups of the page: what each is by, in the words of the first column of its table, and
 * the dimension a bar of it filters by.
 */
const DIMENSIONS = [
  { id: "discipline", column: "overview.columnDiscipline", dim: "Discipline" },
  { id: "holdType", column: "overview.columnHoldType", dim: "HoldType" },
] as const satisfies readonly { id: string; column: MessageKey; dim: Dim }[];

type DimensionId = (typeof DIMENSIONS)[number]["id"];

/**
 * How many skeleton rows stand for each group on a first load. A bar row group has six shapes of
 * skeleton row, falling like rows sorted by value; more rows than that would start again at the
 * longest bar.
 */
const SKELETON_ROWS: Record<DimensionId, number> = { discipline: 6, holdType: 4 };

/** What the page calls its figures and its groups, in the text catalog. */
interface Words {
  figures: MessageKey;
  holds: MessageKey;
  lines: MessageKey;
  /** The fourth figure: which median of the summary it is, its label, and why it may be absent. */
  median: "median_age_days" | "median_duration_days";
  medianLabel: MessageKey;
  medianMissing: MessageKey;
  title: Record<DimensionId, MessageKey>;
  toTable: Record<DimensionId, MessageKey>;
}

/**
 * The page shows the holds the status of the filters keeps, and names them after it: nothing on
 * it calls a released hold open. The open holds have an age and the released ones a duration;
 * among all holds the median age is that of the open ones, and its label says so.
 */
const WORDS: Record<Status, Words> = {
  Open: {
    figures: "overview.figures",
    holds: "overview.openHolds",
    lines: "overview.linesOnHold",
    median: "median_age_days",
    medianLabel: "overview.medianAge",
    medianMissing: "overview.medianAgeMissing",
    title: { discipline: "overview.byDiscipline", holdType: "overview.byHoldType" },
    toTable: {
      discipline: "overview.showDisciplineAsTable",
      holdType: "overview.showHoldTypeAsTable",
    },
  },
  Released: {
    figures: "overview.releasedFigures",
    holds: "overview.releasedHolds",
    lines: "overview.releasedLines",
    median: "median_duration_days",
    medianLabel: "overview.releasedMedianDuration",
    medianMissing: "overview.releasedMedianDurationMissing",
    title: {
      discipline: "overview.releasedByDiscipline",
      holdType: "overview.releasedByHoldType",
    },
    toTable: {
      discipline: "overview.releasedShowDisciplineAsTable",
      holdType: "overview.releasedShowHoldTypeAsTable",
    },
  },
  All: {
    figures: "overview.allFigures",
    holds: "overview.allHolds",
    lines: "overview.allLines",
    median: "median_age_days",
    medianLabel: "overview.allMedianAge",
    medianMissing: "overview.medianAgeMissing",
    title: { discipline: "overview.allByDiscipline", holdType: "overview.allByHoldType" },
    toTable: {
      discipline: "overview.allShowDisciplineAsTable",
      holdType: "overview.allShowHoldTypeAsTable",
    },
  },
};

/**
 * The four figures of the snapshot: one container, its cells divided by hairlines. The two figures
 * of lines open Lines: all of them, and those with a single hold. The other two have no screen
 * behind them yet.
 */
function Figures({
  summary,
  words,
  onLines,
  onSingleHoldLines,
}: {
  summary?: Summary;
  words: Words;
  onLines: () => void;
  onSingleHoldLines: () => void;
}) {
  const loading = summary === undefined;
  const median = summary?.[words.median];
  return (
    <StatTileGroup aria-label={t(words.figures)}>
      <StatTile
        label={t(words.holds)}
        {...(loading ? { isLoading: true } : { value: formatCount(summary.holds) })}
      />
      <StatTile
        label={t(words.lines)}
        onPress={onLines}
        {...(loading ? { isLoading: true } : { value: formatCount(summary.lines) })}
      />
      <StatTile
        label={t("overview.singleHoldLines")}
        onPress={onSingleHoldLines}
        {...(loading ? { isLoading: true } : { value: formatCount(summary.single_hold_lines) })}
      />
      {/* An age or a duration needs dates. Without them the tile says so; it never shows a zero. */}
      <StatTile
        label={t(words.medianLabel)}
        {...(loading
          ? { isLoading: true }
          : median === null || median === undefined
            ? { unavailable: t(words.medianMissing) }
            : { value: formatDays(median) })}
      />
    </StatTileGroup>
  );
}

interface GroupSectionProps {
  /** What the group shows: "Open holds by discipline". */
  title: string;
  /** What a row of it is: "Discipline". The header of the first column of its table. */
  column: string;
  /**
   * The name of its switch for assistive technology. Both switches show "Show as table"; the
   * name adds the group, so that two controls of one page do not share a name. It starts with
   * the words that are shown, so that the switch can also be asked for by them.
   */
  toTable: string;
  /** What the group says when the command sent it no row. */
  none: string;
  /** The groups as the command sent them. Absent on a first load. */
  groups?: readonly Group[];
  skeletonRows: number;
  /** Whether the group is shown as a table in place of its bars. */
  asTable: boolean;
  onAsTableChange: (asTable: boolean) => void;
  /** Whether a value of the group is in the active filter. */
  isFiltered: (group: Group) => boolean;
  /** Filters by the value of a bar that is pressed. */
  onPress: (group: Group) => void;
}

/** Whether the filters keep a value of a dimension: it is among the values of its entry. */
function isFilteredBy(filters: Filters, dim: Dim, group: Group): boolean {
  return filters.fields.some(
    (entry) =>
      entry.dim === dim && !entry.negate && entry.values.some((value) => value.key === group.key),
  );
}

/** The room the widest of the counts shown needs, so the name of the group gets the rest. */
function countChars(counts: readonly number[]): number {
  return Math.max(1, ...counts.map((count) => textChars(formatCount(count))));
}

/** The least room of the name of a group before its table scrolls sideways. */
const LABEL_CHARS = 16;

const ALL_ROWS = { maxRows: Number.POSITIVE_INFINITY } as const;

/**
 * One group of the page: its title, the switch to its table, and its rows, as bars or as a table.
 * A bar is pressed to see the lines of its value: it filters by that value and opens Lines.
 * The rows are shown largest first. That is the order the command sends; a copy is put in that
 * order here so that it does not depend on it, and rows of the same count keep the order given.
 * The length of a bar is its row's holds as a share of the largest count of the group; no number
 * that is shown is worked out here.
 */
function GroupSection({
  title,
  column,
  toTable,
  none,
  groups,
  skeletonRows,
  asTable,
  onAsTableChange,
  isFiltered,
  onPress,
}: GroupSectionProps) {
  const titleId = useId();
  const rows = groups === undefined ? [] : [...groups].sort((a, b) => b.holds - a.holds);
  const largest = rows[0]?.holds ?? 0;
  const columns: DataTableColumn<Group>[] = [
    {
      id: "label",
      header: column,
      cell: (group) => group.label,
      isRowHeader: true,
      size: { flex: 1, minChars: LABEL_CHARS },
    },
    {
      id: "holds",
      header: t("overview.columnHolds"),
      cell: (group) => formatCount(group.holds),
      kind: "number",
      size: { chars: countChars(rows.map((group) => group.holds)) },
    },
    {
      id: "lines",
      header: t("overview.columnLines"),
      cell: (group) => formatCount(group.lines),
      kind: "number",
      isSupporting: true,
      size: { chars: countChars(rows.map((group) => group.lines)) },
    },
  ];

  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <h2 id={titleId} className={styles.groupTitle}>
          {title}
        </h2>
        {rows.length === 0 ? null : (
          <Checkbox isSelected={asTable} onChange={onAsTableChange} aria-label={toTable}>
            {t("overview.showAsTable")}
          </Checkbox>
        )}
      </div>
      {groups === undefined ? (
        <BarRowGroup isLoading skeletonRows={skeletonRows} aria-labelledby={titleId} />
      ) : rows.length === 0 ? (
        <p className={styles.none}>{none}</p>
      ) : asTable ? (
        <DataTable
          aria-label={title}
          columns={columns}
          rows={rows}
          // A blank value has the empty key, and a row needs a key that is not empty.
          rowKey={(group) => `group:${group.key}`}
          // A group is read whole, as its bars are: the page scrolls, the table does not.
          height={ALL_ROWS}
        />
      ) : (
        <BarRowGroup aria-labelledby={titleId}>
          {rows.map((group) => (
            <BarRow
              key={group.key}
              isSelected={isFiltered(group)}
              onPress={() => {
                onPress(group);
              }}
              label={group.label}
              value={formatCount(group.holds)}
              secondaryValue={t("overview.lines", { count: group.lines })}
              fraction={largest > 0 ? group.holds / largest : 0}
            />
          ))}
        </BarRowGroup>
      )}
    </section>
  );
}

/**
 * Overview: the headline figures of the snapshot in view, and its holds by discipline and by
 * hold type, for the filters every data screen shares: the open holds unless the filter bar
 * under its header says otherwise. It shows what the `overview` command returns for the open
 * workspace, the selected snapshot, and those filters, and reads it again when any of them
 * changes; the numbers of before stay on screen, dimmed, until the new ones are there. A workspace without snapshots gets an empty
 * state that starts an import. A snapshot whose file lacked the hold ID or the released column
 * is said to be limited, above its figures.
 *
 * What the eye is told by the skeletons and by the dimming, assistive technology is told by one
 * status line that the page keeps for as long as it is open: that the overview is loading, that
 * it is being updated, that it is updated. The line sits beside the content, not inside it,
 * because the content is marked as busy meanwhile and what is busy may hold its changes back.
 */
export function OverviewPage() {
  const { start } = useShell();
  const open = start.open;
  const [asTable, setAsTable] = useState<Record<DimensionId, boolean>>({
    discipline: false,
    holdType: false,
  });
  const { filters, spec, isDefault, update } = useFilters();
  const navigate = useNavigate();
  /** Opens Lines in a state of its own, under the filters that are set. */
  const openLines = (address: string) => {
    void navigate(address);
  };
  const words = WORDS[filters.status];
  const query = useSnapshotQuery({
    name: "overview",
    params: [spec],
    read: (view, asked) => api.overview(asked, view),
  });
  // What was read for the snapshot or the workspace of before is shown until the new reading is
  // there, with one exception: that the workspace of before had no snapshot says nothing about
  // this one, so the page waits as on a first load.
  const view: OverviewView | null | undefined =
    query.isError || (query.isPlaceholderData && query.data === null) ? undefined : query.data;
  const isLoading = view === undefined && !query.isError;
  // The numbers on screen belong to another snapshot, workspace, or filter, and the new ones are
  // on their way.
  const isUpdating = view !== undefined && view !== null && query.isPlaceholderData;
  // Whether the numbers on screen took the place of such numbers: said once they are there.
  const [change, setChange] = useState({ isUpdating: false, isUpdated: false });
  if (change.isUpdating !== isUpdating) {
    setChange({
      isUpdating,
      isUpdated: change.isUpdating && view !== undefined && view !== null,
    });
  }
  const status = isLoading
    ? t("overview.loading")
    : isUpdating
      ? t("overview.updating")
      : change.isUpdated && view !== undefined && view !== null
        ? t("overview.updated")
        : "";

  // The line under the title names the snapshot the numbers on screen belong to, with its two
  // counts as the command gives them: all its holds, and those of them that are open. So the
  // line and the first figure agree. Before the numbers are there, and when they could not be
  // read, it names the snapshot the shell has selected and gives no number.
  const selected = open?.snapshots.find((snapshot) => snapshot.id === open.selected);
  const description =
    view === null
      ? undefined
      : view !== undefined
        ? t("overview.description", {
            date: formatDateTime(view.snapshot.taken_at),
            count: view.snapshot.row_count,
            open: view.snapshot.open_count,
          })
        : selected === undefined
          ? undefined
          : t("overview.descriptionSnapshot", { date: formatDateTime(selected.taken_at) });

  // A limited snapshot is said to be one, of the snapshot the page is about: the one whose
  // numbers are on screen, and before they are there, the one the shell has selected.
  const about = view === null ? undefined : (view?.snapshot ?? selected);

  const groupsOf = (id: DimensionId, from: OverviewView) =>
    id === "discipline" ? from.by_discipline : from.by_hold_type;

  return (
    <Page
      title={t("destinations.name.overview")}
      width="content"
      {...(description === undefined ? {} : { description })}
      // A workspace without snapshots has nothing to filter; its empty state says what to do.
      {...(open?.selected == null ? {} : { bar: <FilterBar /> })}
    >
      <VisuallyHidden role="status">{status}</VisuallyHidden>
      {about?.limited === true ? (
        <Notice tone="info" title={t("overview.limitedTitle")} className={styles.limited}>
          {t("overview.limitedText")}
        </Notice>
      ) : null}
      {query.isError ? (
        <ErrorState
          error={asCommandError(query.error)}
          title={t("overview.error")}
          onRetry={() => void query.refetch()}
          isRetrying={query.isRefetching}
        />
      ) : view === null ? (
        <EmptyState
          title={t("overview.emptyTitle")}
          action={
            <Button
              variant="primary"
              icon={Upload}
              onPress={() => {
                void startImport();
              }}
            >
              {t("overview.emptyAction")}
            </Button>
          }
        >
          {t("overview.emptyText")}
        </EmptyState>
      ) : (
        <div
          data-part="overview"
          aria-busy={isLoading || isUpdating ? "true" : undefined}
          data-stale={isUpdating ? "" : undefined}
          className={styles.overview}
        >
          <Figures
            words={words}
            onLines={() => {
              openLines(linesAddress(DEFAULT_LINES_STATE));
            }}
            onSingleHoldLines={() => {
              openLines(linesAddress({ rows: "lines", query: presetQuery("single") }));
            }}
            {...(view === undefined ? {} : { summary: view.summary })}
          />
          <div className={styles.groups}>
            {DIMENSIONS.map(({ id, column, dim }) => (
              <GroupSection
                key={id}
                title={t(words.title[id])}
                column={t(column)}
                toTable={t(words.toTable[id])}
                // Without filters the snapshot has no open hold; with them, none that they keep.
                none={t(isDefault ? "overview.noOpenHolds" : "overview.noneMatch")}
                skeletonRows={SKELETON_ROWS[id]}
                {...(view === undefined ? {} : { groups: groupsOf(id, view) })}
                asTable={asTable[id]}
                onAsTableChange={(shown) => {
                  setAsTable((before) => ({ ...before, [id]: shown }));
                }}
                isFiltered={(group) => isFilteredBy(filters, dim, group)}
                onPress={(group) => {
                  // The value takes the place of what the field was filtered by.
                  update((current) =>
                    withValues(current, dim, [{ key: group.key, label: group.label }], false),
                  );
                  openLines(linesAddress(DEFAULT_LINES_STATE));
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
