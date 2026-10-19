import { Upload } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { useFilters } from "../../app/filters/state";
import { useSelectedRows } from "../../app/selectedRows";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import { useSnapshotQuery } from "../../app/view";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { SolveRow } from "../../bindings/SolveRow";
import type { SolveView } from "../../bindings/SolveView";
import type { ViewRef } from "../../bindings/ViewRef";
import {
  Button,
  ChartViewToggle,
  DataTable,
  EmptyState,
  ErrorState,
  LineChart,
  nextSort,
  SectionTitle,
  useTableSort,
  type ChartView,
  type LinePoint,
} from "../../components";
import { formatCount, formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { useSelection } from "../detail/selection";
import { useTableDetailFocus } from "../detail/tableFocus";
import { ExportMenu, ExportNotices, usePageExports } from "../export/ExportMenu";
import { FilterBar } from "../filters/FilterBar";
import { startImport } from "../import/start";
import { BLOCKERS_PATH, searchWithStepSort, selectedBlocker, stepSort } from "./address";
import styles from "./BlockersPage.module.css";
import { stepColumns } from "./columns";

const NO_ROWS: readonly SolveRow[] = [];

/** How many rows the table view of the curve shows: about the height of the curve. */
const CURVE_TABLE_ROWS = 6;

/** How many steps the table is handed at first, and how many more each time its end comes near. */
const STEP_ROWS = 200;

/**
 * The most steps the table is handed as it is scrolled, as Lines loads its rows (DESIGN.md,
 * Table): what a filter change costs follows the rows a table is handed. A step selected past
 * them is handed over all the same, with the steps before it.
 */
export const MAX_STEP_ROWS = 5000;

/** The fewest steps the curve draws by default. */
const HEAD_LEAST = 10;

/** The count line of the steps: how many are handed to the table of how many there are. */
function stepCount(shown: number, total: number): string {
  if (shown >= total) return t("blockers.count", { count: total });
  if (shown >= MAX_STEP_ROWS) return t("blockers.countLimited", { shown, count: total });
  return t("blockers.countOf", { shown, count: total });
}

/** The number of steps that covers the step at `index`, in whole handfuls of `STEP_ROWS`. */
function rowsFor(index: number): number {
  return Math.ceil((index + 1) / STEP_ROWS) * STEP_ROWS;
}

function readSolveOrder(view: ViewRef, spec: FilterSpec) {
  return api.solveOrder(spec, view);
}

const stepKey = (row: SolveRow) => row.key;

/** The solve order on screen, and the request it was read for. */
interface Shown {
  solve: SolveView;
  key: string;
}

/**
 * What Blockers shows in the place of its steps when there are none. The command ranks the open
 * holds among those the filters keep, so: under the status Released, that blockers rank open
 * holds, and a way to them; in a snapshot without open holds, the same, and a way to a newer
 * export; otherwise a way to clear the filters that keep none.
 */
function NoSteps() {
  const { filters, isDefault, clear, update } = useFilters();
  if (filters.status === "Released") {
    return (
      <EmptyState
        placement="table"
        title={t("blockers.releasedTitle")}
        action={
          <Button
            onPress={() => {
              update((current) => ({ ...current, status: "Open" }));
            }}
          >
            {t("blockers.releasedAction")}
          </Button>
        }
      >
        {t("blockers.releasedText")}
      </EmptyState>
    );
  }
  return isDefault ? (
    <EmptyState
      placement="table"
      title={t("blockers.noOpenTitle")}
      action={
        <Button
          icon={Upload}
          onPress={() => {
            void startImport();
          }}
        >
          {t("blockers.noOpenAction")}
        </Button>
      }
    >
      {t("blockers.noOpenText")}
    </EmptyState>
  ) : (
    <EmptyState
      placement="table"
      title={t("blockers.noneTitle")}
      action={<Button onPress={clear}>{t("blockers.noneAction")}</Button>}
    >
      {t("blockers.noneText")}
    </EmptyState>
  );
}

/**
 * Blockers: the solve order of the blockers of the holds the filters keep. Each step takes the
 * blocker that frees the most lines given the steps before it; the command ranks them, and the
 * page shows its answer twice: as the curve of the lines freed after each step, up to the lines
 * on hold, and as the table of the steps. The two share the selection, which the address holds
 * as `?blocker=<key>` (see address.ts): a press on a point or a row selects its blocker, and the
 * other marks it, the table bringing its row into view, and the detail panel opens on that
 * blocker. The keys of the table are those of Lines: Enter on a step opens its blocker with the
 * focus on the heading of the panel, and Escape closes it and gives the focus back to the step.
 * The steps come in one answer, and the table is handed them 200 at a time as it is scrolled, up
 * to 5,000, as Lines loads its rows. A header sorts the steps, which asks for nothing: the table
 * is handed them in the sorted order, and the address keeps the sort (`sort=<column>&dir=`); the
 * curve keeps the order of the steps whatever the sort. The curve draws by default the steps
 * that free most lines (`steps_to_most`, at least ten), and every step on request; its table
 * view and the steps table hold every step either way.
 *
 * Another filter is read anew; the steps of before stay on screen, dimmed, until the new ones are
 * there, and the table then returns to its top. A workspace without snapshots gets an empty state
 * that starts an import; a result without steps says why and offers the way back.
 */
export function BlockersPage() {
  const { start } = useShell();
  const hasSnapshot = start.open !== null && start.open.selected !== null;
  const location = useLocation();
  const navigate = useNavigate();
  const { spec } = useFilters();
  const { select } = useSelection();
  const titleId = useId();
  const [view, setView] = useState<ChartView>("chart");
  // The point the pointer or the keyboard is on, whose numbers the line over the curve gives. The
  // chart tells it again when its points change, and that none is when it goes.
  const [active, setActive] = useState<number | null>(null);
  const columns = useMemo(() => stepColumns(), []);

  const query = useSnapshotQuery({
    name: "solveOrder",
    params: [spec],
    read: readSolveOrder,
    enabled: hasSnapshot,
  });
  // What was read for the request on screen, kept while the next request is read, and after it
  // failed, under the result it is.
  const asked = query.resultKey;
  const [kept, setKept] = useState<Shown | null>(null);
  const own = query.data !== undefined && !query.isPlaceholderData;
  if (own && (kept?.key !== asked || kept.solve !== query.data)) {
    setKept({ solve: query.data, key: asked });
  }
  const shown: Shown | null = own ? { solve: query.data, key: asked } : kept;

  const rows = shown?.solve.rows ?? NO_ROWS;
  const selectedKey = selectedBlocker(location.search);
  // The step of the selection, in the order of the steps: the curve's.
  const selectedIndex = useMemo(() => {
    const index = rows.findIndex((row) => row.key === selectedKey);
    return index === -1 ? null : index;
  }, [rows, selectedKey]);

  // The steps in the order of the table: the solve order, or the sort its address names.
  const sort = stepSort(location.search);
  const sortedRows = useTableSort(rows, columns, sort);
  const tableIndex = useMemo(() => {
    const index = sortedRows.findIndex((row) => row.key === selectedKey);
    return index === -1 ? null : index;
  }, [sortedRows, selectedKey]);

  // How many steps the table is handed, for the result on screen in its sort: 200 more each time
  // its end comes near, up to the limit, and always as many as cover the selected step in the
  // table's order. Those stay handed once the selection ends, so the row the user was on does not
  // leave the table. Another sort is another result: the table returns to its top, or to the
  // selected step, and is handed 200 again.
  const resultKey = shown?.key ?? "";
  const tableKey = sort === undefined ? resultKey : `${resultKey}|${sort.column}:${sort.direction}`;
  // The steps selected beside the open one, by step key, for the result on screen in its sort.
  const selected = useSelectedRows(tableKey);
  const [handed, setHanded] = useState({ key: tableKey, count: STEP_ROWS });
  const handedCount = handed.key === tableKey ? handed.count : STEP_ROWS;
  const covering = tableIndex === null ? 0 : Math.min(rows.length, rowsFor(tableIndex));
  if (covering > handedCount) setHanded({ key: tableKey, count: covering });
  const tableCount = Math.min(rows.length, Math.max(handedCount, covering));
  const tableRows = useMemo(
    () => (tableCount >= sortedRows.length ? sortedRows : sortedRows.slice(0, tableCount)),
    [sortedRows, tableCount],
  );
  const canHandMore = tableCount < rows.length && tableCount < MAX_STEP_ROWS;
  const handMore = () => {
    setHanded({ key: tableKey, count: Math.min(MAX_STEP_ROWS, tableCount + STEP_ROWS) });
  };

  // The steps the curve draws: those that free most lines, at least ten, up to the selected
  // step, or all of them, for the result they were asked for; another result starts at its
  // head again.
  const [allFor, setAllFor] = useState<string | null>(null);
  const showAll = allFor === resultKey;
  const head = Math.max(HEAD_LEAST, shown?.solve.steps_to_most ?? 0);
  const headTo = Math.min(
    rows.length,
    Math.max(head, selectedIndex === null ? 0 : selectedIndex + 1),
  );
  const drawn = showAll ? rows.length : headTo;
  // The table view holds every step, whatever the curve draws, and is built once for them: the
  // curve's points are a part of them, so a selection that draws more builds no row of it again.
  const allPoints = useMemo(
    (): LinePoint[] => rows.map((row) => ({ x: row.step, y: row.cumulative, label: row.label })),
    [rows],
  );
  const points = useMemo(
    () => (drawn === allPoints.length ? allPoints : allPoints.slice(0, drawn)),
    [allPoints, drawn],
  );
  const canShowAll = rows.length > Math.min(rows.length, head);

  // Enter, Escape, and the focus of the panel the steps open, as every such table has them. The
  // curve opens it as well, and is given the focus back when it did.
  const { listenTo, listenBeside, chosen } = useTableDetailFocus({ selectedKey });

  // What a file of the page is made from: the steps in the order of the table, and the curve as
  // it is drawn, its head or every step (0).
  const exports = usePageExports();
  const shownKeys = useMemo(() => sortedRows.map(stepKey), [sortedRows]);
  const exportMenu = (
    <ExportMenu
      screen="blockers"
      state={{ screen: "blockers", shownKeys }}
      loaded={tableRows.length}
      selected={[...selected.keys]}
      charts={[
        { choice: { kind: "Curve", steps: showAll ? 0 : headTo }, label: t("blockers.curve") },
      ]}
      // The steps on screen are those of the filters, not the ones before while they are read.
      isReady={own}
      exports={exports}
    />
  );

  if (!hasSnapshot) {
    return (
      <Page title={t("destinations.name.blockers")}>
        <EmptyState
          title={t("blockers.emptyTitle")}
          action={
            <Button
              variant="primary"
              icon={Upload}
              onPress={() => {
                void startImport();
              }}
            >
              {t("blockers.emptyAction")}
            </Button>
          }
        >
          {t("blockers.emptyText")}
        </EmptyState>
      </Page>
    );
  }

  const isLoading = shown === null && !query.isError;
  // A first load that failed has nothing to show: the notice stands alone, with its retry.
  const hasContent = shown !== null || !query.isError;
  const isStale = shown !== null && (!own || query.isRefetching);
  const isEmpty = shown !== null && rows.length === 0;
  const linesOnHold = shown?.solve.lines_on_hold ?? 0;
  // The numbers of the point in view: the one the pointer or the keyboard is on, else the
  // selected step, else the end of the solve order.
  const atIndex = active ?? selectedIndex ?? rows.length - 1;
  const at = rows[atIndex];
  const caption =
    at === undefined
      ? null
      : t("blockers.freed", { freed: at.cumulative, total: linesOnHold, count: at.step });
  const selectStep = (key: string) => {
    chosen(key);
    select({ kind: "blocker", key });
  };

  return (
    <Page
      title={t("destinations.name.blockers")}
      fill
      actions={exportMenu}
      notice={<ExportNotices exports={exports} />}
      bar={<FilterBar />}
    >
      <div data-part="blockers" className={styles.content}>
        {query.isError ? (
          <ErrorState
            error={asCommandError(query.error)}
            title={t("blockers.error")}
            onRetry={() => {
              void query.refetch();
            }}
          />
        ) : null}
        {hasContent && !isEmpty ? (
          <section
            ref={listenBeside}
            aria-labelledby={titleId}
            data-part="curve"
            className={styles.curve}
          >
            <div className={styles.curveHead}>
              <SectionTitle level={2} id={titleId}>
                {t("blockers.curve")}
              </SectionTitle>
              {caption === null || view === "table" ? null : (
                <p data-part="freed" className={styles.freed}>
                  {caption}
                </p>
              )}
              <div className={styles.trailing}>
                {canShowAll && view === "chart" ? (
                  <Button
                    variant="quiet"
                    onPress={() => {
                      setAllFor(showAll ? null : resultKey);
                    }}
                  >
                    {showAll
                      ? t("blockers.showHead", { count: headTo })
                      : t("blockers.showAll", { count: rows.length })}
                  </Button>
                ) : null}
                <ChartViewToggle view={view} onChange={setView} />
              </div>
            </div>
            <LineChart
              aria-label={t("blockers.curve")}
              points={view === "table" ? allPoints : points}
              yMax={linesOnHold}
              xLabel={t("blockers.axisX")}
              yLabel={t("blockers.axisY")}
              labelName={t("blockers.column.blocker")}
              formatY={formatCount}
              selectedIndex={selectedIndex}
              onActiveChange={setActive}
              onPointPress={(_, index) => {
                const row = rows[index];
                if (row !== undefined) selectStep(row.key);
              }}
              view={view}
              resultKey={shown?.key ?? ""}
              // About the height of the curve, so the steps keep their room under it.
              tableRows={CURVE_TABLE_ROWS}
              isLoading={isLoading}
              isStale={isStale}
            />
          </section>
        ) : null}
        {hasContent ? (
          <div ref={listenTo} data-part="steps" className={styles.table}>
            <DataTable
              aria-label={t("blockers.table")}
              columns={columns}
              leftOutText={(headers) => t("blockers.leftOut", { columns: formatList(headers) })}
              rows={tableRows}
              rowKey={stepKey}
              {...(sort === undefined ? {} : { sort })}
              onSortChange={(pressed) => {
                const next = nextSort(columns, sort, pressed.column);
                void navigate(`${BLOCKERS_PATH}${searchWithStepSort(location.search, next)}`, {
                  replace: true,
                });
              }}
              height="fill"
              isLoading={isLoading}
              isStale={isStale}
              resultKey={tableKey}
              // How many steps there are is said once it is known: not on a first load.
              {...(shown === null ? {} : { totalRows: rows.length, countText: stepCount })}
              {...(canHandMore ? { onLoadMore: handMore } : {})}
              {...(isEmpty ? { emptyState: <NoSteps /> } : {})}
              onSelectionChange={selectStep}
              selectedKey={selectedKey}
              selectedKeys={selected.keys}
              onSelectedKeysChange={selected.set}
              selectedText={(count) => t("blockers.selected", { count })}
              revealSelected
            />
          </div>
        ) : null}
      </div>
    </Page>
  );
}
