import { Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { useFilters, withValues } from "../../app/filters/state";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import { useSnapshotQuery } from "../../app/view";
import type { Dim } from "../../bindings/Dim";
import type { Group } from "../../bindings/Group";
import type { LineRow } from "../../bindings/LineRow";
import type { OverviewView } from "../../bindings/OverviewView";
import type { Status } from "../../bindings/Status";
import type { Summary } from "../../bindings/Summary";
import {
  Button,
  EmptyState,
  ErrorState,
  Notice,
  StatTile,
  StatTileGroup,
  VisuallyHidden,
} from "../../components";
import { formatCount, formatDateTime, formatDays } from "../../text/format";
import { t, type MessageKey } from "../../text/i18n";
import { blockersAddress } from "../blockers/address";
import { ExportMenu, ExportNotices, usePageExports, type ExportChart } from "../export/ExportMenu";
import { FilterBar } from "../filters/FilterBar";
import { startImport } from "../import/start";
import { DEFAULT_LINES_STATE, linesAddress, withSelection } from "../lines/address";
import { presetQuery } from "../lines/presets";
import { Attention } from "./Attention";
import { GroupSection, isFilteredBy } from "./GroupSection";
import styles from "./OverviewPage.module.css";
import { TopSection } from "./TopSection";

/**
 * The three groups of the page: what each is by, in the words of the first column of its table,
 * and the dimension a bar of it filters by.
 */
const DIMENSIONS = [
  { id: "discipline", column: "overview.columnDiscipline", dim: "Discipline" },
  { id: "holdType", column: "overview.columnHoldType", dim: "HoldType" },
  { id: "role", column: "overview.columnRole", dim: "Role" },
] as const satisfies readonly { id: string; column: MessageKey; dim: Dim }[];

type DimensionId = (typeof DIMENSIONS)[number]["id"];

/**
 * What a file of the Overview is made from: the page has no state of its own beyond the filters.
 */
const OVERVIEW_STATE = { screen: "overview" } as const;

/**
 * How many skeleton rows stand for each group on a first load. A bar row group has six shapes of
 * skeleton row, falling like rows sorted by value; more rows than that would start again at the
 * longest bar.
 */
const SKELETON_ROWS: Record<DimensionId, number> = { discipline: 6, holdType: 4, role: 4 };

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
 * among all holds the median age is that of the open ones, and its label says so. The lists of
 * the most holds and the stale holds have the same words under every status: neither calls the
 * holds it counts open, and the stale holds are open ones by what they are.
 */
const WORDS: Record<Status, Words> = {
  Open: {
    figures: "overview.figures",
    holds: "overview.openHolds",
    lines: "overview.linesOnHold",
    median: "median_age_days",
    medianLabel: "overview.medianAge",
    medianMissing: "overview.medianAgeMissing",
    title: {
      discipline: "overview.byDiscipline",
      holdType: "overview.byHoldType",
      role: "overview.byRole",
    },
    toTable: {
      discipline: "overview.showDisciplineAsTable",
      holdType: "overview.showHoldTypeAsTable",
      role: "overview.showRoleAsTable",
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
      role: "overview.releasedByRole",
    },
    toTable: {
      discipline: "overview.releasedShowDisciplineAsTable",
      holdType: "overview.releasedShowHoldTypeAsTable",
      role: "overview.releasedShowRoleAsTable",
    },
  },
  All: {
    figures: "overview.allFigures",
    holds: "overview.allHolds",
    lines: "overview.allLines",
    median: "median_age_days",
    medianLabel: "overview.allMedianAge",
    medianMissing: "overview.medianAgeMissing",
    title: {
      discipline: "overview.allByDiscipline",
      holdType: "overview.allByHoldType",
      role: "overview.allByRole",
    },
    toTable: {
      discipline: "overview.allShowDisciplineAsTable",
      holdType: "overview.allShowHoldTypeAsTable",
      role: "overview.allShowRoleAsTable",
    },
  },
};

/**
 * The four figures of the snapshot: one container, its cells divided by hairlines. The two figures
 * of lines open Lines: all of them, and those with a single hold. The other two have no screen
 * behind them yet.
 *
 * The lines with a single hold are those of the snapshot while the filters are the default. Once
 * a filter is set the command counts the holds it keeps on each line, so a line of many holds of
 * which the filter keeps one is counted: the tile then says "Lines with one hold", which is what
 * it counts.
 */
function Figures({
  summary,
  words,
  isFiltered,
  onLines,
  onSingleHoldLines,
}: {
  summary?: Summary;
  words: Words;
  isFiltered: boolean;
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
        label={t(isFiltered ? "overview.linesWithOneHold" : "overview.singleHoldLines")}
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

/**
 * Overview: the headline figures of the snapshot in view; its holds by discipline, by hold type,
 * and by role; the blockers and the lines with the most holds; and what needs attention, the
 * holds that have waited long. All for the filters every data screen shares: the open holds
 * unless the filter bar under its header says otherwise. It shows what the `overview` command
 * returns for the open workspace, the selected snapshot, and those filters, and reads it again
 * when any of them changes; the numbers of before stay on screen, dimmed, until the new ones are
 * there. A workspace without snapshots gets an empty state that starts an import. A snapshot
 * whose file lacked the hold ID or the released column is said to be limited, above its
 * figures.
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
    role: false,
  });
  const { filters, spec, isDefault, update } = useFilters();
  const navigate = useNavigate();
  /** Opens another destination at an address of its own, under the filters that are set. */
  const openAt = (address: string) => {
    void navigate(address);
  };
  const words = WORDS[filters.status];
  const exports = usePageExports();
  // The four charts of the page, named as their sections are.
  const charts: ExportChart[] = [
    ...DIMENSIONS.map(({ id, dim }) => ({
      choice: { kind: "Bars", dim } as const,
      label: t(words.title[id]),
    })),
    { choice: { kind: "TopBlockers" }, label: t("overview.topBlockers") },
  ];
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
    id === "discipline" ? from.by_discipline : id === "holdType" ? from.by_hold_type : from.by_role;
  // Without filters the snapshot has no open hold; with them, none that they keep.
  const none = t(isDefault ? "overview.noOpenHolds" : "overview.noneMatch");

  return (
    <Page
      title={t("destinations.name.overview")}
      width="content"
      {...(description === undefined ? {} : { description })}
      // A workspace without snapshots has nothing to export: the menu is not shown.
      {...(open?.selected == null
        ? {}
        : {
            actions: (
              <ExportMenu
                screen="overview"
                state={OVERVIEW_STATE}
                charts={charts}
                // The numbers of the request on screen, not those of before standing in.
                isReady={view !== undefined && view !== null && !query.isPlaceholderData}
                exports={exports}
              />
            ),
            notice: <ExportNotices exports={exports} />,
          })}
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
            isFiltered={!isDefault}
            onLines={() => {
              openAt(linesAddress(DEFAULT_LINES_STATE));
            }}
            onSingleHoldLines={() => {
              openAt(linesAddress({ rows: "lines", query: presetQuery("single") }));
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
                none={none}
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
                  openAt(linesAddress(DEFAULT_LINES_STATE));
                }}
              />
            ))}
            <TopSection<Group>
              title={t("overview.topBlockers")}
              none={none}
              {...(view === undefined ? {} : { items: view.top_blockers })}
              itemKey={(blocker) => blocker.key}
              label={(blocker) => blocker.label}
              holds={(blocker) => blocker.holds}
              hasLongLabels
              onOpen={(blocker) => {
                // The blocker is selected on Blockers, under the filters that are set.
                openAt(blockersAddress(blocker.key));
              }}
            />
            <TopSection<LineRow>
              title={t("overview.topLines")}
              none={none}
              {...(view === undefined ? {} : { items: view.top_lines })}
              itemKey={(line) => line.line_id}
              label={(line) => line.line_id}
              holds={(line) => line.holds}
              isIdentifier
              onOpen={(line) => {
                // The line is opened in the panel, over the lines most holds first.
                openAt(linesAddress(DEFAULT_LINES_STATE, withSelection("", "lines", line.line_id)));
              }}
            />
            <Attention
              isFiltered={!isDefault}
              {...(view === undefined ? {} : { stale: view.stale })}
              onOpen={({ days }) => {
                // The holds that have waited that long, oldest first. A stale hold is an open one,
                // and the age band matches the duration of a released hold, so the status is set
                // to the open holds; the age takes the band of the stale holds in place of what it
                // was filtered by, and every other filter stays.
                update((current) => ({
                  ...current,
                  status: "Open",
                  ageBands: [{ min_days: days, max_days: null }],
                }));
                openAt(linesAddress({ rows: "holds", sort: "OldestFirst", reverse: false }));
              }}
            />
          </div>
        </div>
      )}
    </Page>
  );
}
