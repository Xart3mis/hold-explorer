import { Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { RadioButton, RadioField, RadioGroup } from "react-aria-components";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { OPTIONAL_FIELDS } from "../../api/plantim";
import { useFilterOptions } from "../../app/filters/options";
import { useFilters } from "../../app/filters/state";
import { useSelectedRows } from "../../app/selectedRows";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import { useSnapshotPages, type SnapshotPages } from "../../app/view";
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
  useEnterChooses,
  ViewSwitch,
  type DataTableSort,
} from "../../components";
import { cx } from "../../components/cx";
import { formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { useTableDetailFocus } from "../detail/tableFocus";
import { ExportMenu, ExportNotices, usePageExports } from "../export/ExportMenu";
import type { ScreenState } from "../export/requests";
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
import {
  HOLD_SORTS,
  holdSortOf,
  holdTableSort,
  LINE_SORTS,
  lineSortOf,
  lineTableSort,
  pressedSort,
} from "./sorts";
import { countTextFor } from "./count";
import { LinesEmptyState } from "./LinesEmptyState";

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
 * The rows to show: those of the mode in view once it has rows of its own, and until then the
 * rows that were on screen last. Rows of the mode in view stand in for its next result only when
 * they were on screen: a reading of the other mode, or rows kept from an earlier visit to this one
 * under other filters, never stand in. After a reading failed, the rows of before stay. `null` on
 * a first load; `isOwn` is true while the rows are the mode's own reading.
 */
function useShown(active: Shown): { shown: Shown | null; isOwn: boolean } {
  const [kept, setKept] = useState<Shown | null>(null);
  const isOwn =
    active.pages.first !== undefined &&
    !(active.pages.isPlaceholderData && kept !== null && kept.mode !== active.mode);
  if (isOwn && (kept?.mode !== active.mode || kept.pages.rows !== active.pages.rows)) {
    setKept(active);
  }
  return { shown: isOwn ? active : kept, isOwn };
}

/**
 * The row of presets: one is marked when the query of the page is that preset. It is a radio
 * group: one stop for Tab, the arrow keys move to a preset and choose it, and Space and Enter
 * choose the preset that has the focus.
 */
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
  const enterChooses = useEnterChooses();
  return (
    <RadioGroup
      ref={enterChooses}
      aria-label={t("lines.presets.label")}
      orientation="horizontal"
      value={marked}
      onChange={(id) => {
        const preset = PRESETS.find((candidate) => candidate.id === id);
        if (preset !== undefined && preset.id !== marked) onChoose(presetQuery(preset.id));
      }}
      data-part="presets"
      className={cx(styles.presets)}
    >
      {presetsFor(absent).map((preset) => (
        <RadioField key={preset.id} value={preset.id} className={cx(styles.presetField)}>
          <RadioButton className={cx(styles.preset)}>{t(preset.label)}</RadioButton>
        </RadioField>
      ))}
    </RadioGroup>
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
  const { spec, isDefault, clear, update } = useFilters();
  // Enter, Escape, and the focus of the panel this table opens, as every such table has them.
  const { listenTo, chosen } = useTableDetailFocus({
    selectedKey: selectionOf(location.search, mode),
  });

  const options = useFilterOptions({ enabled: hasSnapshot });
  // Which columns and presets the snapshot can fill is known once its options are read. Until then
  // the table waits with the columns every import has, so that nothing shows that will go, and if
  // they cannot be read it keeps to those.
  const optionsRead = options.data !== undefined || options.isError;
  const absent = useSameList(options.data?.absent ?? OPTIONAL_FIELDS);

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
  const active: Shown = mode === "lines" ? { mode, pages: lines } : { mode, pages: holds };
  const { shown, isOwn } = useShown(active);
  const shownMode: LinesMode = shown?.mode ?? mode;
  // The rows selected beside the open one, by line ID or hold position, for the result on screen:
  // another filter, sort, mode, or snapshot is another result, and clears them. The export menu
  // reads them from here.
  const selected = useSelectedRows(`${shown?.mode ?? ""}|${shown?.pages.resultKey ?? ""}`);
  const exports = usePageExports();
  // What a file of the page is made from: the rows of the mode in view, in their order.
  const exportState: ScreenState =
    state.rows === "lines"
      ? { screen: "lines", query: state.query }
      : { screen: "holds", sort: state.sort, reverse: state.reverse };
  const exportMenu = (
    <ExportMenu
      screen={exportState.screen === "lines" ? "lines" : "holds"}
      state={exportState}
      loaded={shown?.pages.rows.length ?? 0}
      selected={[...selected.keys]}
      // Only the rows of the address's own result are exported: while rows of the other mode, or
      // of other filters or another sort, stand in, the loaded count and the selection are theirs.
      isReady={isOwn && !active.pages.isPlaceholderData}
      exports={exports}
    />
  );

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
    chosen(key);
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
  const isLoading = !optionsRead || (shown === null && active.pages.error === null);
  // A first load that failed has nothing to show: the notice stands alone, with its retry.
  const hasTable = shown !== null || active.pages.error === null;
  const isStale =
    shown !== null && (!isOwn || shown.pages.isPlaceholderData || shown.pages.isRefetching);
  // A table loads its rows up to a limit, and only the rows of the reading it is given.
  const canLoad = isOwn && pages?.hasMore === true && rowCount < MAX_LOADED_ROWS;

  const countText = countTextFor(shownMode, MAX_LOADED_ROWS);
  const emptyState =
    total !== 0 ? undefined : (
      <LinesEmptyState
        mode={shownMode}
        narrowing={shownMode === "lines" ? narrowingPreset(lineQuery) : null}
        isDefault={isDefault}
        onAllLines={() => {
          go(DEFAULT_LINES_STATE);
        }}
        onClear={clear}
        onAllHolds={() => {
          update((current) => ({ ...current, status: "All" }));
        }}
      />
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
    // The columns that leave a narrow table are read in the panel of a row.
    leftOutText: (headers: readonly string[]) =>
      t(shownMode === "holds" ? "lines.leftOutHolds" : "lines.leftOutLines", {
        columns: formatList(headers),
      }),
    onSelectionChange: select,
    selectedKey: selectionOf(location.search, shownMode),
    selectedKeys: selected.keys,
    onSelectedKeysChange: selected.set,
    selectedText: (count: number) =>
      t(shownMode === "holds" ? "lines.selectedHolds" : "lines.selectedLines", { count }),
  } as const;

  return (
    <Page
      title={t("destinations.name.lines")}
      fill
      actions={exportMenu}
      notice={<ExportNotices exports={exports} />}
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
        {mode !== "lines" ? null : optionsRead ? (
          <PresetRow
            absent={absent}
            query={lineQuery}
            onChoose={(query) => {
              go({ rows: "lines", query });
            }}
          />
        ) : (
          // The room of the presets, kept while it is not known which the snapshot can answer.
          <div aria-hidden="true" className={styles.presetsWaiting} />
        )}
        {active.pages.error === null ? null : (
          <ErrorState
            error={asCommandError(active.pages.error)}
            title={t(mode === "holds" ? "lines.errorHolds" : "lines.errorLines")}
            onRetry={active.pages.refetch}
          />
        )}
        {hasTable ? (
          <div ref={listenTo} data-part="lines-table" className={styles.table}>
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
                  const current = holdTableSort(state.sort, state.reverse);
                  const next = pressedSort(HOLD_SORTS, current, asked.column);
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
                  const current = lineTableSort(query.sort, query.reverse);
                  const next = pressedSort(LINE_SORTS, current, asked.column);
                  const choice = lineSortOf(next.column, next.direction);
                  if (choice !== null) go({ rows: "lines", query: { ...query, ...choice } });
                }}
                {...common}
              />
            )}
          </div>
        ) : null}
      </div>
    </Page>
  );
}
