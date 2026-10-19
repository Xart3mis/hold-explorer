import { useFilters } from "../../app/filters/state";
import type { ChartChoice } from "../../bindings/ChartChoice";
import type { CopyFormat } from "../../bindings/CopyFormat";
import type { SaveFormat } from "../../bindings/SaveFormat";
import { MenuButton, MenuItem, MenuSeparator, MenuSubmenu } from "../../components";
import { t } from "../../text/i18n";
import {
  ariaKeyShortcuts,
  EXPORT_SHORTCUT,
  formatShortcut,
  useExportShortcut,
} from "../shell/shortcuts";
import { readChoice, type ExportChoice } from "./choices";
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
 * of a failure stands under its header (`ExportNotices`).
 */
export function usePageExports(): PageExports {
  const save = useSaveExport();
  const copy = useCopyExport();
  return { save, copy, isRunning: save.isRunning || copy.isRunning };
}

/**
 * Why the last save or copy of the page failed, under its header. While either runs, the controls
 * of both notices are inert.
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
  selected?: readonly string[];
  /** The charts this screen can save, with their names; none on Lines. */
  charts?: readonly ExportChart[];
  /**
   * Whether the screen has data to export: a first load leaves the menu inert. A screen without a
   * snapshot does not show the menu (DESIGN.md, Menu: a menu with nothing to offer is not shown).
   */
  isReady: boolean;
  /** The save and the copy of the page, whose failure the page shows under its header. */
  exports: PageExports;
}

const NO_CHARTS: readonly ExportChart[] = [];

/**
 * The Export menu of a data screen, at the trailing edge of its header. Each item exports at once
 * with the columns and rows remembered for the screen; an item that saves ends in an ellipsis,
 * since the save dialog follows. What does not apply to the screen is left out: CSV and the copies
 * of the table on the Overview, whose view is several tables; the selected rows while none is
 * selected; the line IDs on the matrix. The Overview's four charts are in a submenu of each
 * action. `Ctrl+E` saves the view as Excel, as the first item does.
 *
 * While an export runs the button shows it and opens nothing, so no second export starts; while
 * the screen has nothing to export yet, it waits.
 */
export function ExportMenu({
  screen,
  state,
  loaded,
  selected,
  charts = NO_CHARTS,
  isReady,
  exports,
}: ExportMenuProps) {
  const { filters, spec } = useFilters();
  const { save, copy, isRunning } = exports;
  const table = loaded === undefined ? undefined : { loaded, selected: selected ?? [] };
  const hasTable = state.screen !== "overview";
  const hasRows = table !== undefined;
  const isMatrix = state.screen === "matrix";
  const selectedCount = selected?.length ?? 0;

  /** The request of the screen, with the remembered choice, or with the rows `rows` names. */
  const request = (rows?: ExportChoice["rows"]) => {
    const choice = readChoice(screen);
    return buildRequest(
      state,
      spec,
      filterTexts(filters),
      rows === undefined ? choice : { ...choice, rows },
      table,
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
  useExportShortcut(isReady && !isRunning ? excel : null);

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
          {t("export.menu.chartPng")}
        </MenuItem>
        <MenuItem
          id="chart-svg"
          onAction={() => {
            saveAs({ kind: "ChartSvg", chart: onlyChart.choice });
          }}
        >
          {t("export.menu.chartSvg")}
        </MenuItem>
        <MenuItem
          id="chart-copy"
          onAction={() => {
            copyAs({ kind: "Chart", chart: onlyChart.choice });
          }}
        >
          {t("export.menu.copyChart")}
        </MenuItem>
      </>
    ) : (
      <>
        <MenuSeparator />
        <MenuSubmenu id="charts-png" label={t("export.menu.chartsPng")}>
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
        <MenuSubmenu id="charts-svg" label={t("export.menu.chartsSvg")}>
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
        <MenuSubmenu id="charts-copy" label={t("export.menu.copyCharts")}>
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

  return (
    <MenuButton
      label={t("export.menu.label")}
      menuLabel={t("export.menu.name")}
      align="end"
      isPending={isRunning}
      isInert={!isReady}
    >
      <MenuItem
        id="excel"
        detail={formatShortcut(EXPORT_SHORTCUT)}
        keyShortcuts={ariaKeyShortcuts(EXPORT_SHORTCUT)}
        onAction={excel}
      >
        {t("export.menu.excel")}
      </MenuItem>
      <MenuItem
        id="workbook"
        onAction={() => {
          saveAs({ kind: "Workbook" });
        }}
      >
        {t("export.menu.workbook")}
      </MenuItem>
      {hasTable ? (
        <MenuItem
          id="csv"
          onAction={() => {
            saveAs({ kind: "Csv" });
          }}
        >
          {t(isMatrix ? "export.menu.csvHolds" : "export.menu.csv")}
        </MenuItem>
      ) : null}
      <MenuItem
        id="report"
        onAction={() => {
          saveAs({ kind: "Report" });
        }}
      >
        {t("export.menu.report")}
      </MenuItem>
      {hasTable ? (
        <>
          <MenuSeparator />
          <MenuItem
            id="copy-table"
            onAction={() => {
              copyAs({ kind: "Table" });
            }}
          >
            {t(isMatrix ? "export.menu.copyHolds" : "export.menu.copyTable")}
          </MenuItem>
          {hasRows && selectedCount > 0 ? (
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
              {t("export.menu.copyLineIds")}
            </MenuItem>
          ) : null}
        </>
      ) : null}
      {chartItems}
    </MenuButton>
  );
}
