import { Upload } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { useFilters } from "../../app/filters/state";
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
  SectionTitle,
  type ChartView,
  type LinePoint,
} from "../../components";
import { formatCount, formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { useSelection } from "../detail/selection";
import { FilterBar } from "../filters/FilterBar";
import { startImport } from "../import/start";
import { selectedBlocker } from "./address";
import styles from "./BlockersPage.module.css";
import { stepColumns } from "./columns";

const NO_ROWS: readonly SolveRow[] = [];

/** How many rows the table view of the curve shows: about the height of the curve. */
const CURVE_TABLE_ROWS = 6;

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
 * What Blockers shows in the place of its steps when there are none: in a snapshot without open
 * holds, a way to all holds; otherwise a way to clear the filters that keep none.
 */
function NoSteps() {
  const { isDefault, clear, update } = useFilters();
  return isDefault ? (
    <EmptyState
      placement="table"
      title={t("blockers.noOpenTitle")}
      action={
        <Button
          onPress={() => {
            update((current) => ({ ...current, status: "All" }));
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
 * other marks it, the table bringing its row into view. The steps of a snapshot are a few
 * thousand at most, so they come in one answer.
 *
 * Another filter is read anew; the steps of before stay on screen, dimmed, until the new ones are
 * there, and the table then returns to its top. A workspace without snapshots gets an empty state
 * that starts an import; a result without steps says why and offers the way back.
 */
export function BlockersPage() {
  const { start } = useShell();
  const hasSnapshot = start.open !== null && start.open.selected !== null;
  const location = useLocation();
  const { spec } = useFilters();
  const { select } = useSelection();
  const titleId = useId();
  const [view, setView] = useState<ChartView>("chart");
  // The point the pointer or the keyboard is on, whose numbers the line over the curve gives.
  const [active, setActive] = useState<number | null>(null);
  const columns = useMemo(() => stepColumns(), []);

  const query = useSnapshotQuery({
    name: "solveOrder",
    params: [spec],
    read: readSolveOrder,
    enabled: hasSnapshot,
  });
  // What was read for the request on screen, kept while the next request is read, and after it
  // failed.
  const asked = JSON.stringify(spec);
  const [kept, setKept] = useState<Shown | null>(null);
  const own = query.data !== undefined && !query.isPlaceholderData;
  if (own && (kept?.key !== asked || kept.solve !== query.data)) {
    setKept({ solve: query.data, key: asked });
  }
  const shown: Shown | null = own ? { solve: query.data, key: asked } : kept;

  const rows = shown?.solve.rows ?? NO_ROWS;
  const points = useMemo(
    (): LinePoint[] => rows.map((row) => ({ x: row.step, y: row.cumulative, label: row.label })),
    [rows],
  );
  const selectedKey = selectedBlocker(location.search);
  const selectedIndex = useMemo(() => {
    const index = rows.findIndex((row) => row.key === selectedKey);
    return index === -1 ? null : index;
  }, [rows, selectedKey]);

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
    select({ kind: "blocker", key });
  };

  return (
    <Page title={t("destinations.name.blockers")} fill bar={<FilterBar />}>
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
          <section aria-labelledby={titleId} data-part="curve" className={styles.curve}>
            <div className={styles.curveHead}>
              <SectionTitle level={2} id={titleId}>
                {t("blockers.curve")}
              </SectionTitle>
              {caption === null || view === "table" ? null : (
                <p data-part="freed" className={styles.freed}>
                  {caption}
                </p>
              )}
              <ChartViewToggle view={view} onChange={setView} className={styles.trailing} />
            </div>
            <LineChart
              aria-label={t("blockers.curve")}
              points={points}
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
              // About the height of the curve, so the steps keep their room under it.
              tableRows={CURVE_TABLE_ROWS}
              isLoading={isLoading}
              isStale={isStale}
            />
          </section>
        ) : null}
        {hasContent ? (
          <div data-part="steps" className={styles.table}>
            <DataTable
              aria-label={t("blockers.table")}
              columns={columns}
              leftOutText={(headers) => t("blockers.leftOut", { columns: formatList(headers) })}
              rows={rows}
              rowKey={stepKey}
              height="fill"
              isLoading={isLoading}
              isStale={isStale}
              resultKey={shown?.key ?? ""}
              // How many steps there are is said once it is known: not on a first load.
              {...(shown === null
                ? {}
                : {
                    totalRows: rows.length,
                    countText: (_shown: number, total: number) =>
                      t("blockers.count", { count: total }),
                  })}
              {...(isEmpty ? { emptyState: <NoSteps /> } : {})}
              onSelectionChange={selectStep}
              selectedKey={selectedKey}
              revealSelected
            />
          </div>
        ) : null}
      </div>
    </Page>
  );
}
