import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { openHoldsFilter } from "../../api/filter";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import { useSnapshotQuery } from "../../app/view";
import type { Group } from "../../bindings/Group";
import type { OverviewView } from "../../bindings/OverviewView";
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
} from "../../components";
import { formatCount, formatDateTime, formatDays } from "../../text/format";
import { t } from "../../text/i18n";
import { startImport } from "../import/start";
import styles from "./OverviewPage.module.css";

/** The page shows the open holds, and sends the whole filter that says so. */
const OPEN_HOLDS = openHoldsFilter();

/** The two groups of the page: what each is by, in the words of its title and of its table. */
const DIMENSIONS = [
  {
    id: "discipline",
    title: "overview.byDiscipline",
    column: "overview.columnDiscipline",
    toTable: "overview.showDisciplineAsTable",
  },
  {
    id: "holdType",
    title: "overview.byHoldType",
    column: "overview.columnHoldType",
    toTable: "overview.showHoldTypeAsTable",
  },
] as const;

type DimensionId = (typeof DIMENSIONS)[number]["id"];

/**
 * How many skeleton rows stand for each group on a first load. A bar row group has six shapes of
 * skeleton row, falling like rows sorted by value; more rows than that would start again at the
 * longest bar.
 */
const SKELETON_ROWS: Record<DimensionId, number> = { discipline: 6, holdType: 4 };

/** The four figures of the snapshot: one container, its cells divided by hairlines. */
function Figures({ summary }: { summary?: Summary }) {
  const loading = summary === undefined;
  const age = summary?.median_age_days;
  return (
    <StatTileGroup aria-label={t("overview.figures")}>
      <StatTile
        label={t("overview.openHolds")}
        {...(loading ? { isLoading: true } : { value: formatCount(summary.holds) })}
      />
      <StatTile
        label={t("overview.linesOnHold")}
        {...(loading ? { isLoading: true } : { value: formatCount(summary.lines) })}
      />
      <StatTile
        label={t("overview.singleHoldLines")}
        {...(loading ? { isLoading: true } : { value: formatCount(summary.single_hold_lines) })}
      />
      {/* An age needs a creation date. Without one the tile says so; it never shows a zero. */}
      <StatTile
        label={t("overview.medianAge")}
        {...(loading
          ? { isLoading: true }
          : age === null || age === undefined
            ? { unavailable: t("overview.medianAgeMissing") }
            : { value: formatDays(age) })}
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
  /** The groups as the command sent them. Absent on a first load. */
  groups?: readonly Group[];
  skeletonRows: number;
  /** Whether the group is shown as a table in place of its bars. */
  asTable: boolean;
  onAsTableChange: (asTable: boolean) => void;
}

/**
 * One group of the page: its title, the switch to its table, and its rows, as bars or as a table.
 * The rows are shown largest first. That is the order the command sends; a copy is put in that
 * order here so that it does not depend on it, and rows of the same count keep the order given.
 * The length of a bar is its row's holds as a share of the largest count of the group; no number
 * that is shown is worked out here.
 */
function GroupSection({
  title,
  column,
  toTable,
  groups,
  skeletonRows,
  asTable,
  onAsTableChange,
}: GroupSectionProps) {
  const titleId = useId();
  const rows = groups === undefined ? [] : [...groups].sort((a, b) => b.holds - a.holds);
  const largest = rows[0]?.holds ?? 0;
  const columns: DataTableColumn<Group>[] = [
    { id: "label", header: column, cell: (group) => group.label, isRowHeader: true },
    {
      id: "holds",
      header: t("overview.columnHolds"),
      cell: (group) => formatCount(group.holds),
      kind: "number",
    },
    {
      id: "lines",
      header: t("overview.columnLines"),
      cell: (group) => formatCount(group.lines),
      kind: "number",
      isSupporting: true,
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
        <p className={styles.none}>{t("overview.noOpenHolds")}</p>
      ) : asTable ? (
        <DataTable
          aria-label={title}
          columns={columns}
          rows={rows}
          // A blank value has the empty key, and a row needs a key that is not empty.
          rowKey={(group) => `group:${group.key}`}
        />
      ) : (
        <BarRowGroup aria-labelledby={titleId}>
          {rows.map((group) => (
            <BarRow
              key={group.key}
              isStatic
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
 * Overview: the headline figures of the snapshot in view, and its open holds by discipline and
 * by hold type. It shows what the `overview` command returns for the open workspace and the
 * selected snapshot, and reads it again when either changes; the numbers of before stay on
 * screen, dimmed, until the new ones are there. A workspace without snapshots gets an empty
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
  const query = useSnapshotQuery({
    name: "overview",
    params: [OPEN_HOLDS],
    read: (view, spec) => api.overview(spec, view),
  });
  // What was read for the snapshot or the workspace of before is shown until the new reading is
  // there, with one exception: that the workspace of before had no snapshot says nothing about
  // this one, so the page waits as on a first load.
  const view: OverviewView | null | undefined =
    query.isError || (query.isPlaceholderData && query.data === null) ? undefined : query.data;
  const isLoading = view === undefined && !query.isError;
  // The numbers on screen belong to another snapshot or workspace, and the new ones are on their way.
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
          <Figures {...(view === undefined ? {} : { summary: view.summary })} />
          <div className={styles.groups}>
            {DIMENSIONS.map(({ id, title, column, toTable }) => (
              <GroupSection
                key={id}
                title={t(title)}
                column={t(column)}
                toTable={t(toTable)}
                skeletonRows={SKELETON_ROWS[id]}
                {...(view === undefined ? {} : { groups: groupsOf(id, view) })}
                asTable={asTable[id]}
                onAsTableChange={(shown) => {
                  setAsTable((before) => ({ ...before, [id]: shown }));
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
