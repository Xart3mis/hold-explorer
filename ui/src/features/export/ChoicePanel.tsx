import { useId, useState } from "react";
import { dimName } from "../../app/filters/dims";
import type { Field } from "../../bindings/Field";
import type { Status } from "../../bindings/Status";
import { Button, Checkbox, ChoiceGroup, SectionTitle, type Choice } from "../../components";
import { t, type MessageKey } from "../../text/i18n";
import { holdColumns } from "../lines/holdColumns";
import { lineColumns } from "../lines/lineColumns";
import type { ExportChoice } from "./choices";
import { FILE_COLUMNS, type ExportScreen, type ScreenState } from "./requests";
import styles from "./ChoicePanel.module.css";

/** A column the panel offers: its id in the file, and its name as the table names it. */
export interface PanelColumn {
  id: string;
  header: string;
}

/** How many rows each choice of rows writes, as the screen counts them. */
export interface RowCounts {
  /** Every row the filters keep; not said while it is not known. */
  all?: number | undefined;
  /** The rows the table has loaded. */
  loaded: number;
  /** The rows selected. */
  selected: number;
}

/**
 * Whether the exports of a screen have columns and rows to choose: the Overview and the matrix
 * write fixed tables, and their requests ignore both.
 */
export function hasChoice(screen: ExportScreen): boolean {
  return FILE_COLUMNS[screen].length > 0;
}

/** The name of a screen in the panel: its title, and its button. */
const SCREEN_NAMES: Record<ExportScreen, MessageKey> = {
  overview: "export.fileView.overview",
  lines: "export.fileView.lines",
  holds: "export.fileView.holds",
  breakdown: "export.fileView.breakdown",
  matrix: "export.fileView.matrix",
  blockers: "export.fileView.blockers",
};

/** The name of a screen, as the title and the save button of its panel write it. */
export function screenName(screen: ExportScreen): string {
  return t(SCREEN_NAMES[screen]);
}

/** The column that names the rows of a screen: the row header of its table, first in its file. */
export function rowNameColumn(screen: ExportScreen): string | undefined {
  return FILE_COLUMNS[screen][0];
}

/** The days of a hold, as the file names them for the status it is written under. */
const DAYS_KEYS: Record<Status, MessageKey> = {
  Open: "file.column.holds.age",
  Released: "file.column.holds.duration",
  All: "file.column.holds.days",
};

/**
 * The columns the file of a screen writes under `status`, in table order, named as its table
 * names them: those whose field the snapshot has (`absent` lists those it has none of), and of the
 * hold rows those the status shows (the release date of released holds), with the two the file
 * writes beyond the table, the source ID and the release remark.
 */
export function panelColumns(
  state: ScreenState,
  absent: readonly Field[],
  status: Status,
): PanelColumn[] {
  switch (state.screen) {
    case "overview":
    case "matrix":
      return [];
    case "lines": {
      const shown = new Set(lineColumns(0, absent).map((column) => column.id));
      return FILE_COLUMNS.lines
        .filter((id) => shown.has(id))
        .map((id) => ({ id, header: t(`file.column.lines.${id}` as MessageKey) }));
    }
    case "holds": {
      const shown = new Set(holdColumns(0, absent, status).map((column) => column.id));
      if (!absent.includes("SourceId")) shown.add("sourceId");
      if (status !== "Open" && !absent.includes("ReleaseRemark")) shown.add("releaseRemark");
      return FILE_COLUMNS.holds
        .filter((id) => shown.has(id))
        .map((id) => ({
          id,
          header: t(id === "days" ? DAYS_KEYS[status] : (`file.column.holds.${id}` as MessageKey)),
        }));
    }
    case "breakdown":
      return FILE_COLUMNS.breakdown.map((id) => ({
        id,
        header:
          id === "label" ? dimName(state.dim) : t(`file.column.breakdown.${id}` as MessageKey),
      }));
    case "blockers":
      return FILE_COLUMNS.blockers.map((id) => ({
        id,
        header: t(`file.column.blockers.${id}` as MessageKey),
      }));
  }
}

const STATUS_CHOICES: readonly { value: ExportChoice["status"]; key: MessageKey }[] = [
  { value: "filters", key: "export.panel.statusFilters" },
  { value: "Open", key: "export.panel.statusOpen" },
  { value: "Released", key: "export.panel.statusReleased" },
  { value: "All", key: "export.panel.statusAll" },
];

/**
 * The choices of rows a screen offers, with their counts. Under a status other than the one the
 * rows on screen were read under (`isOwnStatus` false), those rows are not the export's: only
 * every row is offered, uncounted, and it says why.
 */
function rowChoices(state: ScreenState, counts: RowCounts, isOwnStatus: boolean): Choice[] {
  if (!isOwnStatus) {
    return [
      {
        value: "all",
        label: t("export.panel.rowsAllUncounted"),
        description: t("export.panel.rowsByStatus"),
      },
    ];
  }
  const isPaged = state.screen === "lines" || state.screen === "holds";
  const choices: Choice[] = [
    {
      value: "all",
      label:
        counts.all === undefined
          ? t("export.panel.rowsAllUncounted")
          : t("export.panel.rowsAll", { count: counts.all }),
    },
  ];
  if (isPaged && counts.all !== undefined && counts.loaded > 0 && counts.loaded < counts.all) {
    choices.push({
      value: "loaded",
      label: t("export.panel.rowsLoaded", { count: counts.loaded }),
    });
  }
  if (counts.selected > 0) {
    choices.push({
      value: "selected",
      label: t("export.panel.rowsSelected", { count: counts.selected }),
    });
  }
  return choices;
}

function isRows(value: string): value is ExportChoice["rows"] {
  return value === "all" || value === "loaded" || value === "selected";
}

function isStatus(value: string): value is ExportChoice["status"] {
  return STATUS_CHOICES.some((choice) => choice.value === value);
}

export interface ChoicePanelProps {
  /** The screen whose exports the choice is for. */
  screen: ExportScreen;
  /** Its state, which says which columns its file has and how the rows are counted. */
  state: ScreenState;
  /** The fields the snapshot has no value in: their columns are not offered. */
  absent: readonly Field[];
  /** The status of the filters, which "As the filters" stands for. */
  filterStatus: Status;
  counts: RowCounts;
  /** The choice remembered for the screen, which the panel starts from. */
  choice: ExportChoice;
  /** Called with the choice to keep for the screen. */
  onSave: (choice: ExportChoice) => void;
  /** Called to close the panel without keeping anything. */
  onCancel: () => void;
}

/**
 * What the "Columns and rows" panel of the Export menu holds: the rows, the status, and the
 * columns its exports write, and the buttons that keep the choice for the screen or leave it as
 * it was (DESIGN.md, Columns and rows panel).
 *
 * A remembered choice of rows that the screen does not offer now (the selected rows while none
 * is selected, or any but all under a status other than the filters') shows as all rows, and
 * saving keeps the rows shown: what the panel shows is what it saves. The column that names the
 * row is always written. Every column of the file checked is kept as no columns named, which
 * writes every column the file has, whichever status it is written under.
 */
export function ChoicePanel({
  screen,
  state,
  absent,
  filterStatus,
  counts,
  choice,
  onSave,
  onCancel,
}: ChoicePanelProps) {
  const all = FILE_COLUMNS[screen];
  const rowName = rowNameColumn(screen);
  const [rows, setRows] = useState(choice.rows);
  const [status, setStatus] = useState(choice.status);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => {
    const kept = new Set(choice.columns.length === 0 ? all : choice.columns);
    if (rowName !== undefined) kept.add(rowName);
    return kept;
  });

  const exportStatus = status === "filters" ? filterStatus : status;
  const rowOptions = rowChoices(state, counts, exportStatus === filterStatus);
  const shownRows = rowOptions.some((option) => option.value === rows) ? rows : "all";
  const columns = panelColumns(state, absent, exportStatus);
  const name = screenName(screen);
  const columnsLabel = useId();

  const toggle = (id: string, isChecked: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      if (isChecked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const save = () => {
    const isEvery = all.every((id) => checked.has(id));
    onSave({
      columns: isEvery ? [] : all.filter((id) => checked.has(id)),
      rows: shownRows,
      status,
    });
  };

  return (
    <div className={styles.panel}>
      <SectionTitle level={2}>{t("export.panel.title", { screen: name })}</SectionTitle>
      <ChoiceGroup
        label={t("export.panel.rows")}
        value={shownRows}
        onChange={(value) => {
          if (isRows(value)) setRows(value);
        }}
        options={rowOptions}
      />
      <ChoiceGroup
        label={t("export.panel.status")}
        value={status}
        onChange={(value) => {
          if (isStatus(value)) setStatus(value);
        }}
        options={STATUS_CHOICES.map((option) => ({ value: option.value, label: t(option.key) }))}
      />
      <div role="group" aria-labelledby={columnsLabel} className={styles.columns}>
        <div className={styles.columnsHead}>
          <span id={columnsLabel} className={styles.label}>
            {t("export.panel.columns")}
          </span>
          <div className={styles.shortcuts}>
            <Button
              variant="quiet"
              aria-label={t("export.panel.allColumnsName")}
              onPress={() => {
                setChecked(new Set(all));
              }}
            >
              {t("export.panel.allColumns")}
            </Button>
            <Button
              variant="quiet"
              onPress={() => {
                setChecked(new Set(rowName === undefined ? [] : [rowName]));
              }}
            >
              {t("export.panel.rowName")}
            </Button>
          </div>
        </div>
        <div className={styles.list}>
          {columns.map((column) =>
            column.id === rowName ? (
              <Checkbox key={column.id} isSelected isDisabled>
                {column.header} <span className={styles.always}>{t("export.panel.always")}</span>
              </Checkbox>
            ) : (
              <Checkbox
                key={column.id}
                isSelected={checked.has(column.id)}
                onChange={(isChecked) => {
                  toggle(column.id, isChecked);
                }}
              >
                {column.header}
              </Checkbox>
            ),
          )}
        </div>
      </div>
      <div className={styles.actions}>
        <Button onPress={save}>{t("export.panel.save", { screen: name })}</Button>
        <Button variant="quiet" onPress={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
