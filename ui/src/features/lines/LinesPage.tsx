import { Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { useFilters } from "../../app/filters/state";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import { useSnapshotPages, useSnapshotQuery, type SnapshotPages } from "../../app/view";
import type { Field } from "../../bindings/Field";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { HoldQuery } from "../../bindings/HoldQuery";
import type { HoldRef } from "../../bindings/HoldRef";
import type { HoldsView } from "../../bindings/HoldsView";
import type { LinePage } from "../../bindings/LinePage";
import type { LineQuery } from "../../bindings/LineQuery";
import type { LineRow } from "../../bindings/LineRow";
import type { Status } from "../../bindings/Status";
import type { ViewRef } from "../../bindings/ViewRef";
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  ViewSwitch,
  type DataTableSort,
} from "../../components";
import { cx } from "../../components/cx";
import { t } from "../../text/i18n";
import { FilterBar } from "../filters/FilterBar";
import { startImport } from "../import/start";
import {
  DEFAULT_HOLDS_STATE,
  DEFAULT_LINES_STATE,
  linesAddress,
  parseLinesAddress,
  selectionOf,
  withSelection,
  type LinesMode,
  type LinesState,
} from "./address";
import { holdColumns } from "./holdColumns";
import { lineColumns } from "./lineColumns";
import styles from "./LinesPage.module.css";
import { narrowingPreset, PRESETS, presetOf, presetQuery, presetsFor } from "./presets";
import { holdSortOf, holdTableSort, lineSortOf, lineTableSort, pressedSort } from "./sorts";

/** How many rows a command answers at most, and how many the holds are asked for at a time. */
const PAGE_ROWS = 200;

/**
 * The most rows a table of this page loads. Past it the table asks for no more, and the count
 * line says how many there are and how to reach the others. A filter change re-renders the rows
 * that are loaded; up to this many it stays well under a tenth of a second in a production build,
 * and at thirty thousand it took about a third of one (decision of 2026-10-13).
 */
export const MAX_LOADED_ROWS = 5000;

/** The holds as the page reads them: a page, and the status it was read with. */
interface HoldsPage extends HoldsView {
  status: Status;
}

type HoldOrder = Omit<HoldQuery, "offset">;

/** The rows on screen, of one mode or the other: the reading they come from. */
type Shown =
  | { mode: "lines"; pages: SnapshotPages<LineRow, LinePage> }
  | { mode: "holds"; pages: SnapshotPages<HoldRef, HoldsPage> };

const NO_FIELDS: readonly Field[] = [];
const NO_ROWS: readonly never[] = [];

/** The query of the lines and the order of the holds while the page shows the other mode. */
const DEFAULT_QUERY: LineQuery = presetQuery("all");
const DEFAULT_ORDER: HoldOrder = { sort: "FileOrder", reverse: false, limit: PAGE_ROWS };

const lineKey = (line: LineRow) => line.line_id;
const holdKey = (hold: HoldRef) => String(hold.position);

function readLines(view: ViewRef, offset: number, spec: FilterSpec, query: LineQuery) {
  return api.lines(spec, query, offset, view);
}

async function readHolds(
  view: ViewRef,
  offset: number,
  spec: FilterSpec,
  order: HoldOrder,
): Promise<HoldsPage> {
  const page = await api.holds(spec, { ...order, offset }, view);
  return { ...page, status: spec.status };
}

/** The same list for as long as it has the same items, so what is built from it is kept. */
function useSameList<Item>(list: readonly Item[]): readonly Item[] {
  const [held, setHeld] = useState(list);
  const same = held.length === list.length && held.every((item, index) => item === list[index]);
  if (!same) setHeld(list);
  return same ? held : list;
}

/**
 * The rows to show: those of the mode in view once it has any, those of the other mode while the
 * first page of this one is on its way, and after a reading failed before it had any rows, the
 * rows that were shown before. `null` on a first load.
 */
function useShown(active: Shown, other: Shown): { shown: Shown | null; isOwn: boolean } {
  const fresh =
    active.pages.first !== undefined ? active : other.pages.first !== undefined ? other : null;
  const [kept, setKept] = useState<Shown | null>(fresh);
  if (fresh !== null && (kept?.mode !== fresh.mode || kept.pages.rows !== fresh.pages.rows)) {
    setKept(fresh);
  }
  const shown = fresh ?? (active.pages.error === null ? null : kept);
  return { shown, isOwn: shown !== null && shown === active };
}

/** The row of presets: one is marked when the query of the page is that preset. */
function PresetRow({
  absent,
  query,
  onChoose,
}: {
  absent: readonly Field[];
  query: LineQuery;
  onChoose: (query: LineQuery) => void;
}) {
  const marked = presetOf(query);
  return (
    <ToggleButtonGroup
      aria-label={t("lines.presets.label")}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={marked === null ? [] : [marked]}
      onSelectionChange={(keys) => {
        const [id] = keys;
        const preset = PRESETS.find((candidate) => candidate.id === id);
        if (preset !== undefined) onChoose(presetQuery(preset.id));
      }}
      data-part="presets"
      className={cx(styles.presets)}
    >
      {presetsFor(absent).map((preset) => (
        <ToggleButton key={preset.id} id={preset.id} className={cx(styles.preset)}>
          {t(preset.label)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/**
 * Lines: the lines of the snapshot in view under the filters every data screen shares, or their
 * holds, in one table that fills the content area. The page holds its own state in its address
 * (see address.ts): the mode, the sort, a preset, and the row that is selected. A filter, a sort,
 * a preset, or the other mode is read from the first page again; the rows of before stay on
 * screen, dimmed, until it is there, and the table then returns to its top. Rows are loaded two
 * hundred at a time as the table is scrolled, up to `MAX_LOADED_ROWS`.
 *
 * A workspace without snapshots gets an empty state that starts an import. A result without rows
 * says why: the filters, or the preset, and offers the way back.
 */
export function LinesPage() {
  const { start } = useShell();
  const hasSnapshot = start.open !== null && start.open.selected !== null;
  const location = useLocation();
  const navigate = useNavigate();
  const state = parseLinesAddress(location.search);
  const mode = state.rows;
  const { spec, isDefault, clear } = useFilters();

  const options = useSnapshotQuery({
    name: "filterOptions",
    params: [spec],
    read: (view, asked) => api.filterOptions(asked, view),
    enabled: hasSnapshot,
  });
  const absent = useSameList(options.data?.absent ?? NO_FIELDS);

  const lineQuery = state.rows === "lines" ? state.query : DEFAULT_QUERY;
  const holdOrder: HoldOrder =
    state.rows === "holds"
      ? { sort: state.sort, reverse: state.reverse, limit: PAGE_ROWS }
      : DEFAULT_ORDER;
  const lines = useSnapshotPages({
    name: "lines",
    params: [spec, lineQuery],
    read: readLines,
    enabled: hasSnapshot && mode === "lines",
  });
  const holds = useSnapshotPages({
    name: "holds",
    params: [spec, holdOrder],
    read: readHolds,
    enabled: hasSnapshot && mode === "holds",
  });
  const linesShown: Shown = { mode: "lines", pages: lines };
  const holdsShown: Shown = { mode: "holds", pages: holds };
  const active = mode === "lines" ? linesShown : holdsShown;
  const { shown, isOwn } = useShown(active, mode === "lines" ? holdsShown : linesShown);
  const shownMode: LinesMode = shown?.mode ?? mode;

  const lineWidest = shown?.mode === "lines" ? (shown.pages.first?.widest_line_id ?? 0) : 0;
  const holdWidest = shown?.mode === "holds" ? (shown.pages.first?.widest_line_id ?? 0) : 0;
  const holdStatus =
    shown?.mode === "holds" ? (shown.pages.first?.status ?? spec.status) : spec.status;
  const lineTable = useMemo(() => lineColumns(lineWidest, absent), [lineWidest, absent]);
  const holdTable = useMemo(
    () => holdColumns(holdWidest, absent, holdStatus),
    [holdWidest, absent, holdStatus],
  );

  /** Writes a state of the page into its address, keeping the rest of it. */
  const go = (next: LinesState) => {
    void navigate(linesAddress(next, location.search), { replace: true });
  };
  const select = (key: string) => {
    void navigate(
      { pathname: location.pathname, search: withSelection(location.search, shownMode, key) },
      { replace: true },
    );
  };

  if (!hasSnapshot) {
    return (
      <Page title={t("destinations.name.lines")}>
        <EmptyState
          title={t("lines.emptyTitle")}
          action={
            <Button
              variant="primary"
              icon={Upload}
              onPress={() => {
                void startImport();
              }}
            >
              {t("lines.emptyAction")}
            </Button>
          }
        >
          {t("lines.emptyText")}
        </EmptyState>
      </Page>
    );
  }

  const pages = shown?.pages;
  const rowCount = pages?.rows.length ?? 0;
  const total = pages?.total;
  const isLoading = shown === null && active.pages.error === null;
  const isStale =
    shown !== null && (!isOwn || shown.pages.isPlaceholderData || shown.pages.isRefetching);
  // A table loads its rows up to a limit, and only the rows of the reading it is given.
  const canLoad = isOwn && pages?.hasMore === true && rowCount < MAX_LOADED_ROWS;

  const countText = (count: number, of: number) => {
    const holdsMode = shownMode === "holds";
    if (count >= of) return t(holdsMode ? "lines.countHolds" : "lines.countLines", { count: of });
    if (count >= MAX_LOADED_ROWS) {
      return t(holdsMode ? "lines.countHoldsLimited" : "lines.countLinesLimited", {
        shown: count,
        count: of,
      });
    }
    return t(holdsMode ? "lines.countHoldsOf" : "lines.countLinesOf", { shown: count, count: of });
  };

  // Why there is no row: the preset, the filters, or a snapshot without open holds.
  const narrowing = shownMode === "lines" ? narrowingPreset(lineQuery) : null;
  const narrowingName = PRESETS.find((preset) => preset.id === narrowing)?.label;
  const emptyState =
    total !== 0 ? undefined : narrowingName !== undefined ? (
      <EmptyState
        placement="table"
        title={t("lines.presetNoneTitle", { preset: t(narrowingName) })}
        action={
          <Button
            onPress={() => {
              go(DEFAULT_LINES_STATE);
            }}
          >
            {t("lines.presetNoneAction")}
          </Button>
        }
      >
        {t("lines.presetNoneText", { preset: t(narrowingName) })}
      </EmptyState>
    ) : isDefault ? (
      <EmptyState placement="table" title={t("lines.noOpenTitle")}>
        {t("lines.noOpenText")}
      </EmptyState>
    ) : (
      <EmptyState
        placement="table"
        title={t(shownMode === "holds" ? "lines.noneTitleHolds" : "lines.noneTitleLines")}
        action={<Button onPress={clear}>{t("lines.noneAction")}</Button>}
      >
        {t("lines.noneText")}
      </EmptyState>
    );

  // The sorted header, of the table of the mode in view.
  const tableSort =
    state.rows !== shownMode
      ? undefined
      : state.rows === "lines"
        ? lineTableSort(state.query.sort, state.query.reverse)
        : holdTableSort(state.sort, state.reverse);

  const common = {
    ...(tableSort === undefined ? {} : { sort: tableSort }),
    height: "fill",
    isLoading,
    isStale,
    resultKey: pages?.resultKey ?? "",
    // How many rows there are is said once it is known: not on a first load, not after it failed.
    ...(total === undefined ? {} : { totalRows: total, countText }),
    ...(canLoad ? { onLoadMore: pages.loadMore } : {}),
    isLoadingMore: isOwn && pages?.isLoadingMore === true,
    ...(emptyState === undefined ? {} : { emptyState }),
    onSelectionChange: select,
    selectedKey: selectionOf(location.search, shownMode),
  } as const;

  return (
    <Page
      title={t("destinations.name.lines")}
      fill
      views={
        <ViewSwitch
          aria-label={t("lines.modes")}
          views={[
            { id: "lines", label: t("lines.modeLines") },
            { id: "holds", label: t("lines.modeHolds") },
          ]}
          value={mode}
          onChange={(id) => {
            go(id === "holds" ? DEFAULT_HOLDS_STATE : DEFAULT_LINES_STATE);
          }}
        />
      }
      bar={<FilterBar />}
    >
      <div data-part="lines" className={styles.content}>
        {mode === "lines" ? (
          <PresetRow
            absent={absent}
            query={lineQuery}
            onChoose={(query) => {
              go({ rows: "lines", query });
            }}
          />
        ) : null}
        {active.pages.error === null ? null : (
          <ErrorState
            error={asCommandError(active.pages.error)}
            title={t(mode === "holds" ? "lines.errorHolds" : "lines.errorLines")}
            onRetry={active.pages.refetch}
          />
        )}
        <div data-part="lines-table" className={styles.table}>
          {shownMode === "holds" ? (
            <DataTable
              // A table of the other kind of row is another table: its rows are built anew.
              key="holds"
              aria-label={t("lines.holdsTable")}
              columns={holdTable}
              rows={shown?.mode === "holds" ? shown.pages.rows : NO_ROWS}
              rowKey={holdKey}
              onSortChange={(asked: DataTableSort) => {
                if (state.rows !== "holds") return;
                const next = pressedSort(holdTableSort(state.sort, state.reverse), asked.column);
                const choice = holdSortOf(next.column, next.direction);
                if (choice !== null) go({ rows: "holds", ...choice });
              }}
              {...common}
            />
          ) : (
            <DataTable
              key="lines"
              aria-label={t("lines.linesTable")}
              columns={lineTable}
              rows={shown?.mode === "lines" ? shown.pages.rows : NO_ROWS}
              rowKey={lineKey}
              onSortChange={(asked: DataTableSort) => {
                if (state.rows !== "lines") return;
                const { query } = state;
                const next = pressedSort(lineTableSort(query.sort, query.reverse), asked.column);
                const choice = lineSortOf(next.column, next.direction);
                if (choice !== null) go({ rows: "lines", query: { ...query, ...choice } });
              }}
              {...common}
            />
          )}
        </div>
      </div>
    </Page>
  );
}
