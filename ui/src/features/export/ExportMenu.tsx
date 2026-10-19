import { useRef, useState } from "react";
import { OPTIONAL_FIELDS } from "../../api/plantim";
import { useFilterOptions } from "../../app/filters/options";
import { useFilters } from "../../app/filters/state";
import { useShownView } from "../../app/view";
import type { ChartChoice } from "../../bindings/ChartChoice";
import type { CopyFormat } from "../../bindings/CopyFormat";
import type { ExportPhase } from "../../bindings/ExportPhase";
import type { SaveFormat } from "../../bindings/SaveFormat";
import type { Status } from "../../bindings/Status";
import { MenuButton, MenuItem, MenuSeparator, MenuSubmenu, Popover } from "../../components";
import { t, type MessageKey } from "../../text/i18n";
import {
  ariaKeyShortcuts,
  EXPORT_SHORTCUT,
  formatShortcut,
  useExportShortcut,
} from "../shell/shortcuts";
import { ChoicePanel, hasChoice, panelColumns, screenName, type RowCounts } from "./ChoicePanel";
import { readChoice, writeChoice, type ExportChoice } from "./choices";
import { ExportNotice } from "./ExportNotice";
import { fileView } from "./fileName";
import { buildRequest, filterTexts, type ExportScreen, type ScreenState } from "./requests";
import { useCopyExport, useSaveExport, type CopyExport, type SaveExport } from "./run";
import styles from "./ExportMenu.module.css";

/** The save and the copy of a page: one of them runs at a time, whichever control started it. */
export interface PageExports {
  save: SaveExport;
  copy: CopyExport;
  /** A save or a copy runs: the menu shows it, and every other export control is inert. */
  isRunning: boolean;
}

/**
 * The exports of a page. The page holds them, so that its Export menu starts them and the notice
 * of a failure stands under its header (`ExportNotices`). One failure stands at a time: that of
 * the save or the copy that had the last result, so a copy that works puts away the failure of a
 * save before it, and a copy that fails takes its place.
 */
export function usePageExports(): PageExports {
  const save = useSaveExport();
  const copy = useCopyExport();
  const isSaveLast = save.settled > copy.settled;
  return {
    save: isSaveLast ? save : { ...save, problem: null },
    copy: isSaveLast ? { ...copy, problem: null } : copy,
    isRunning: save.isRunning || copy.isRunning,
  };
}

/**
 * Why the last save or copy of the page failed, under its header. While either runs, the controls
 * of the notice are inert.
 */
export function ExportNotices({ exports }: { exports: PageExports }) {
  const { save, copy, isRunning } = exports;
  return (
    <>
      <ExportNotice run={{ ...save, isRunning }} className={styles.notice} />
      <ExportNotice run={{ ...copy, isRunning }} className={styles.notice} />
    </>
  );
}

/** A chart a screen can save or copy, with the name the menu gives it. */
export interface ExportChart {
  choice: ChartChoice;
  label: string;
}

export interface ExportMenuProps {
  screen: ExportScreen;
  /** The screen's state the request is built from (query, sort, dimension, the shown keys). */
  state: ScreenState;
  /** How many rows are loaded, and which are selected, on a screen with a table. */
  loaded?: number;
  /**
   * How many rows the filters keep, on a table that loads its rows by pages; a table the page
   * holds whole has them all loaded.
   */
  total?: number | undefined;
  selected?: readonly string[];
  /** The charts this screen can save, with their names; none on Lines. */
  charts?: readonly ExportChart[];
  /**
   * Whether the screen has data to export: its own result is there (not a first load, and not an
   * older result standing in). The menu also waits while a workspace or snapshot is switched. A
   * screen without a snapshot does not show the menu (DESIGN.md, Menu: a menu with nothing to
   * offer is not shown).
   */
  isReady: boolean;
  /**
   * The screen shows no row, so the copies of its table are not offered. Without it, a table is
   * empty when `total` (or else `loaded`) is 0.
   */
  isEmpty?: boolean;
  /** The save and the copy of the page, whose failure the page shows under its header. */
  exports: PageExports;
}

const NO_CHARTS: readonly ExportChart[] = [];

/** The items whose label can name the status they export under. */
type NotedItem =
  | "excel"
  | "workbook"
  | "csv"
  | "report"
  | "copyTable"
  | "copyLineIds"
  | "chartPng"
  | "chartSvg"
  | "copyChart"
  | "chartsPng"
  | "chartsSvg"
  | "copyCharts";

/** The label of each item as it is. */
const PLAIN_KEYS: Record<NotedItem, MessageKey> = {
  excel: "export.menu.excel",
  workbook: "export.menu.workbook",
  csv: "export.menu.csv",
  report: "export.menu.report",
  copyTable: "export.menu.copyTable",
  copyLineIds: "export.menu.copyLineIds",
  chartPng: "export.menu.chartPng",
  chartSvg: "export.menu.chartSvg",
  copyChart: "export.menu.copyChart",
  chartsPng: "export.menu.chartsPng",
  chartsSvg: "export.menu.chartsSvg",
  copyCharts: "export.menu.copyCharts",
};

/** The label of each item with a note in brackets: the status, "all rows", or both. */
const NOTED_KEYS: Record<NotedItem, MessageKey> = {
  excel: "export.menu.noted.excel",
  workbook: "export.menu.noted.workbook",
  csv: "export.menu.noted.csv",
  report: "export.menu.noted.report",
  copyTable: "export.menu.noted.copyTable",
  copyLineIds: "export.menu.noted.copyLineIds",
  chartPng: "export.menu.noted.chartPng",
  chartSvg: "export.menu.noted.chartSvg",
  copyChart: "export.menu.noted.copyChart",
  chartsPng: "export.menu.noted.chartsPng",
  chartsSvg: "export.menu.noted.chartsSvg",
  copyCharts: "export.menu.noted.copyCharts",
};

/** The label of an item that writes rows, when the remembered rows fall back to all of them. */
const FALLBACK_KEYS: Partial<Record<NotedItem, MessageKey>> = {
  excel: "export.menu.excelAll",
  csv: "export.menu.csvAll",
  copyTable: "export.menu.copyTableAll",
  copyLineIds: "export.menu.copyLineIdsAll",
};

/** The note of a status an export is remembered to apply. */
const STATUS_NOTES: Record<Status, MessageKey> = {
  Open: "export.menu.note.Open",
  Released: "export.menu.note.Released",
  All: "export.menu.note.All",
};

/** The name of the button while a save's command runs, by its phase. */
const PHASE_KEYS: Record<ExportPhase, MessageKey> = {
  Reading: "export.menu.phase.Reading",
  Writing: "export.menu.phase.Writing",
};

/** Whether the screen's table loads its rows by pages, so that "loaded" names some of them. */
function hasPagedRows(state: ScreenState): boolean {
  return state.screen === "lines" || state.screen === "holds";
}

/**
 * The Export menu of a data screen, at the trailing edge of its header. Each item exports at once
 * with the columns and rows remembered for the screen; an item that saves ends in an ellipsis,
 * since the save dialog follows. What does not apply to the screen is left out: CSV and the copies
 * of the table on the Overview, whose view is several tables; the selected rows while none is
 * selected; the line IDs on the matrix. The Overview's four charts are in a submenu of each
 * action. `Ctrl+E` saves the view as Excel, as the first item does.
 *
 * While an export runs the button shows it (and the phase of a save in its name) and opens
 * nothing, so no second export starts; while the screen has nothing to export yet, or a workspace
 * or snapshot is being switched, it waits.
 *
 * A status remembered for the screen other than "As the filters" is named in every item, which
 * all export under it. When it is not the status the screen's rows were read under, the rows on
 * screen are not the export's: the items write every row the status keeps, "Copy selected rows"
 * is left out, and the items that would have written the loaded or the selected rows say "all
 * rows", as they do when the selected rows are remembered and none is selected.
 */
export function ExportMenu({
  screen,
  state,
  loaded,
  total,
  selected,
  charts = NO_CHARTS,
  isReady,
  isEmpty,
  exports,
}: ExportMenuProps) {
  const { filters, spec } = useFilters();
  const options = useFilterOptions();
  const shownView = useShownView();
  const { save, copy, isRunning } = exports;
  const ready = isReady && shownView !== null;
  const table = loaded === undefined ? undefined : { loaded, selected: selected ?? [] };
  const hasTable = state.screen !== "overview";
  const hasRows = table !== undefined;
  const isMatrix = state.screen === "matrix";
  const selectedCount = selected?.length ?? 0;
  // Copying a table of no row is not offered: there is nothing to copy.
  const hasNoRow = isEmpty ?? (total ?? loaded) === 0;
  const button = useRef<HTMLButtonElement>(null);
  const [isPanelOpen, setPanelOpen] = useState(false);
  // The choice remembered for the screen, read once for it and kept as the panel saves it.
  const [remembered, setRemembered] = useState(() => ({ screen, choice: readChoice(screen) }));
  if (remembered.screen !== screen) setRemembered({ screen, choice: readChoice(screen) });
  const choice = remembered.screen === screen ? remembered.choice : readChoice(screen);
  const canChoose = hasRows && hasChoice(screen);
  const status = choice.status === "filters" ? spec.status : choice.status;
  // The rows on screen were read under the filters' status; another status writes every row.
  const isOwnStatus = status === spec.status;
  // The rows remembered that the items cannot write (the selected ones while none is selected,
  // or rows on screen under another status): the items that write rows write them all.
  const fallsBack =
    canChoose &&
    ((choice.rows === "selected" && (selectedCount === 0 || !isOwnStatus)) ||
      (choice.rows === "loaded" && !isOwnStatus && hasPagedRows(state)));
  // The columns the snapshot and the status give the file, once the snapshot's fields are known.
  const absent = options.data?.absent;
  const offered =
    absent === undefined ? undefined : panelColumns(state, absent, status).map((col) => col.id);
  const statusNote = choice.status === "filters" ? null : t(STATUS_NOTES[choice.status]);
  const rowsNote =
    statusNote === null
      ? t("export.menu.note.allRows")
      : t("export.menu.note.both", { status: statusNote });

  /**
   * The label of an item: its own, or with the status it exports under, and "all rows" when it
   * writes rows (`writesRows`) and the remembered rows fall back.
   */
  const label = (item: NotedItem, writesRows = false) => {
    if (writesRows && fallsBack) {
      return statusNote === null && FALLBACK_KEYS[item] !== undefined
        ? t(FALLBACK_KEYS[item])
        : t(NOTED_KEYS[item], { note: rowsNote });
    }
    return statusNote === null ? t(PLAIN_KEYS[item]) : t(NOTED_KEYS[item], { note: statusNote });
  };

  /** The request of the screen, with the remembered choice, or with the rows `rows` names. */
  const request = (rows?: ExportChoice["rows"]) => {
    return buildRequest(
      state,
      spec,
      filterTexts(filters),
      rows === undefined ? choice : { ...choice, rows },
      table,
      offered,
    );
  };
  const saveAs = (format: SaveFormat) => {
    void save.save(format, request(), fileView(screen, format));
  };
  const copyAs = (format: CopyFormat, rows?: ExportChoice["rows"]) => {
    void copy.copy(format, request(rows));
  };

  const excel = () => {
    saveAs({ kind: "Excel" });
  };
  useExportShortcut(ready && !isRunning ? excel : null);

  const [onlyChart] = charts;
  const chartItems =
    charts.length === 0 ? null : charts.length === 1 && onlyChart !== undefined ? (
      <>
        <MenuSeparator />
        <MenuItem
          id="chart-png"
          onAction={() => {
            saveAs({ kind: "ChartPng", chart: onlyChart.choice });
          }}
        >
          {label("chartPng")}
        </MenuItem>
        <MenuItem
          id="chart-svg"
          onAction={() => {
            saveAs({ kind: "ChartSvg", chart: onlyChart.choice });
          }}
        >
          {label("chartSvg")}
        </MenuItem>
        <MenuItem
          id="chart-copy"
          onAction={() => {
            copyAs({ kind: "Chart", chart: onlyChart.choice });
          }}
        >
          {label("copyChart")}
        </MenuItem>
      </>
    ) : (
      <>
        <MenuSeparator />
        <MenuSubmenu id="charts-png" label={label("chartsPng")}>
          {charts.map((chart, index) => (
            <MenuItem
              key={chart.label}
              id={`png-${String(index)}`}
              onAction={() => {
                saveAs({ kind: "ChartPng", chart: chart.choice });
              }}
            >
              {t("export.menu.saveChart", { chart: chart.label })}
            </MenuItem>
          ))}
        </MenuSubmenu>
        <MenuSubmenu id="charts-svg" label={label("chartsSvg")}>
          {charts.map((chart, index) => (
            <MenuItem
              key={chart.label}
              id={`svg-${String(index)}`}
              onAction={() => {
                saveAs({ kind: "ChartSvg", chart: chart.choice });
              }}
            >
              {t("export.menu.saveChart", { chart: chart.label })}
            </MenuItem>
          ))}
        </MenuSubmenu>
        <MenuSubmenu id="charts-copy" label={label("copyCharts")}>
          {charts.map((chart, index) => (
            <MenuItem
              key={chart.label}
              id={`copy-${String(index)}`}
              onAction={() => {
                copyAs({ kind: "Chart", chart: chart.choice });
              }}
            >
              {chart.label}
            </MenuItem>
          ))}
        </MenuSubmenu>
      </>
    );

  const counts: RowCounts = {
    all: total ?? loaded,
    loaded: loaded ?? 0,
    selected: selectedCount,
  };
  // While a save's command runs, the button's name says how far it has come.
  const phase = save.isRunning && save.phase !== null ? t(PHASE_KEYS[save.phase]) : null;

  return (
    <>
      <MenuButton
        label={t("export.menu.label")}
        {...(phase === null ? {} : { "aria-label": phase })}
        menuLabel={t("export.menu.name")}
        align="end"
        isPending={isRunning}
        isInert={!ready}
        triggerRef={button}
        isExpanded={isPanelOpen}
      >
        <MenuItem
          id="excel"
          detail={formatShortcut(EXPORT_SHORTCUT)}
          keyShortcuts={ariaKeyShortcuts(EXPORT_SHORTCUT)}
          onAction={excel}
        >
          {label("excel", true)}
        </MenuItem>
        <MenuItem
          id="workbook"
          onAction={() => {
            saveAs({ kind: "Workbook" });
          }}
        >
          {label("workbook")}
        </MenuItem>
        {hasTable ? (
          <MenuItem
            id="csv"
            onAction={() => {
              saveAs({ kind: "Csv" });
            }}
          >
            {isMatrix && statusNote === null ? t("export.menu.csvHolds") : label("csv", true)}
          </MenuItem>
        ) : null}
        <MenuItem
          id="report"
          onAction={() => {
            saveAs({ kind: "Report" });
          }}
        >
          {label("report")}
        </MenuItem>
        {hasTable && !hasNoRow ? (
          <>
            <MenuSeparator />
            <MenuItem
              id="copy-table"
              onAction={() => {
                copyAs({ kind: "Table" });
              }}
            >
              {isMatrix && statusNote === null
                ? t("export.menu.copyHolds")
                : label("copyTable", true)}
            </MenuItem>
            {hasRows && selectedCount > 0 && isOwnStatus ? (
              <MenuItem
                id="copy-selected"
                onAction={() => {
                  copyAs({ kind: "Table" }, "selected");
                }}
              >
                {t("export.menu.copySelected", { count: selectedCount })}
              </MenuItem>
            ) : null}
            {hasRows ? (
              <MenuItem
                id="copy-line-ids"
                onAction={() => {
                  copyAs({ kind: "LineIds" });
                }}
              >
                {label("copyLineIds", true)}
              </MenuItem>
            ) : null}
          </>
        ) : null}
        {chartItems}
        {canChoose ? (
          <>
            <MenuSeparator />
            <MenuItem
              id="choice"
              onAction={() => {
                setPanelOpen(true);
              }}
            >
              {t("export.menu.choice")}
            </MenuItem>
          </>
        ) : null}
      </MenuButton>
      {canChoose ? (
        <Popover
          anchor={button}
          isOpen={isPanelOpen}
          onOpenChange={setPanelOpen}
          placement="bottom end"
          aria-label={t("export.panel.title", { screen: screenName(screen) })}
        >
          {(close) => (
            <ScreenChoicePanel
              screen={screen}
              state={state}
              counts={counts}
              choice={choice}
              onSave={(saved) => {
                writeChoice(screen, saved);
                setRemembered({ screen, choice: saved });
                close();
              }}
              onCancel={close}
            />
          )}
        </Popover>
      ) : null}
    </>
  );
}

interface ScreenChoicePanelProps {
  screen: ExportScreen;
  state: ScreenState;
  counts: RowCounts;
  choice: ExportChoice;
  onSave: (choice: ExportChoice) => void;
  onCancel: () => void;
}

/**
 * The panel of a screen, with what it is drawn from: the choice remembered for the screen, the
 * status of the filters, and the fields the snapshot lacks. Until those are read, every optional
 * field is taken as lacking, as the tables do, so that no column is offered that will go.
 */
function ScreenChoicePanel({
  screen,
  state,
  counts,
  choice,
  onSave,
  onCancel,
}: ScreenChoicePanelProps) {
  const { spec } = useFilters();
  const options = useFilterOptions();
  return (
    <ChoicePanel
      screen={screen}
      state={state}
      absent={options.data?.absent ?? OPTIONAL_FIELDS}
      filterStatus={spec.status}
      counts={counts}
      choice={choice}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
