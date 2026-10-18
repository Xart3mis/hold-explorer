import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { dimId, dimName, isSameDim } from "../../app/filters/dims";
import { useFilters, withValues } from "../../app/filters/state";
import { useSnapshotQuery } from "../../app/view";
import type { Dim } from "../../bindings/Dim";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { FoldedMatrix } from "../../bindings/FoldedMatrix";
import type { Group } from "../../bindings/Group";
import type { ViewRef } from "../../bindings/ViewRef";
import {
  ChartViewToggle,
  ErrorState,
  Heatmap,
  IconButton,
  Select,
  type ChartView,
  type HeatmapItem,
} from "../../components";
import { formatCount } from "../../text/format";
import { t } from "../../text/i18n";
import { DEFAULT_HOLDS_STATE, linesAddress } from "../lines/address";
import { breakdownAddress, type BreakdownState } from "./address";
import styles from "./BreakdownPage.module.css";
import { NoHolds } from "./NoHolds";

function readMatrix(view: ViewRef, spec: FilterSpec, rows: Dim, cols: Dim) {
  return api.matrix(spec, rows, cols, view);
}

/** The matrix on screen, and the dimensions and the request it was read for. */
interface Shown {
  matrix: FoldedMatrix;
  rows: Dim;
  cols: Dim;
  key: string;
}

const NO_ITEMS: readonly HeatmapItem[] = [];
const NO_CELLS: readonly (readonly number[])[] = [];

const itemOf = (group: Group): HeatmapItem => ({ key: group.key, label: group.label });

export interface MatrixModeProps {
  state: BreakdownState;
  spec: FilterSpec;
  /** The dimensions the selects offer, in their order. */
  dims: readonly Dim[];
}

/**
 * The matrix of Breakdown: the holds the filters keep, counted for every pair of a value of the
 * rows' dimension and a value of the columns', as a heatmap with its legend, or as its table. The
 * command keeps the thirty largest values of each side and folds the rest into Other, and the
 * page says how many it folded. A press on a cell puts both of its values into the filters, in
 * place of what those fields were filtered by, and opens the holds of Lines; Other is many values
 * and does not open. The two dimensions are in the address, and are never the same one.
 */
export function MatrixMode({ state, spec, dims }: MatrixModeProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { update } = useFilters();
  const [view, setView] = useState<ChartView>("chart");

  const query = useSnapshotQuery({
    name: "matrix",
    params: [spec, state.rows, state.cols],
    read: readMatrix,
  });
  // What was read for the request on screen, kept while the next request is read, under the
  // result it is.
  const asked = query.resultKey;
  const [kept, setKept] = useState<Shown | null>(null);
  const own = query.data !== undefined && !query.isPlaceholderData;
  if (own && (kept?.key !== asked || kept.matrix !== query.data)) {
    setKept({ matrix: query.data, rows: state.rows, cols: state.cols, key: asked });
  }
  const shown: Shown | null = own
    ? { matrix: query.data, rows: state.rows, cols: state.cols, key: asked }
    : kept;

  const go = (next: BreakdownState) => {
    void navigate(breakdownAddress(next, location.search), { replace: true });
  };
  /** The dimensions a select offers: those of the snapshot, and the one chosen when it lacks it. */
  const choicesWith = (chosen: Dim, other: Dim) =>
    (dims.some((dim) => isSameDim(dim, chosen)) ? dims : [...dims, chosen]).map((dim) => ({
      id: dimId(dim),
      label: dimName(dim),
      // The other select's dimension: the two are never the same.
      isDisabled: isSameDim(dim, other),
    }));
  const choose = (part: "rows" | "cols", id: string) => {
    const dim = [...dims, state.rows, state.cols].find((candidate) => dimId(candidate) === id);
    if (dim === undefined || isSameDim(dim, state[part])) return;
    go({ ...state, [part]: dim });
  };

  const isLoading = shown === null && !query.isError;
  const isStale = shown !== null && (!own || query.isRefetching);
  // A matrix of other dimensions, other filters, or another snapshot than those asked for is on
  // its way out: its cells do not open, and the page offers no press.
  const isCurrent = own;
  const matrix = shown?.matrix;
  const isEmpty = matrix !== undefined && (matrix.rows.length === 0 || matrix.cols.length === 0);
  const rowsDim = shown?.rows ?? state.rows;
  const colsDim = shown?.cols ?? state.cols;
  const name = t("breakdown.matrix", { rows: dimName(rowsDim), cols: dimName(colsDim) });

  const openCell = (rowKey: string, colKey: string) => {
    if (matrix === undefined) return;
    // The keys are those of the kept values; Other is never pressed, so its empty key never
    // stands for a blank value here.
    const row = matrix.rows.find((group) => group.key === rowKey);
    const col = matrix.cols.find((group) => group.key === colKey);
    if (row === undefined || col === undefined) return;
    update((current) =>
      withValues(withValues(current, rowsDim, [itemOf(row)], false), colsDim, [itemOf(col)], false),
    );
    void navigate(linesAddress(DEFAULT_HOLDS_STATE));
  };
  const isChart = view === "chart" && matrix !== undefined && !isEmpty;

  const folded =
    matrix === undefined
      ? []
      : [[matrix.folded_rows, rowsDim] as const, [matrix.folded_cols, colsDim] as const].filter(
          ([count]) => count > 0,
        );
  const notes = [
    ...(isChart && isCurrent
      ? [
          t(
            matrix.other_row === null && matrix.other_col === null
              ? "breakdown.pressHintUnfolded"
              : "breakdown.pressHint",
          ),
        ]
      : []),
    ...folded.map(([count, dim]) => t("breakdown.folded", { count, dim: dimName(dim) })),
  ];

  return (
    <>
      <div className={styles.controls}>
        <Select
          label={t("breakdown.rows")}
          options={choicesWith(state.rows, state.cols)}
          selectedKey={dimId(state.rows)}
          onSelectionChange={(id) => {
            choose("rows", id);
          }}
          className={styles.groupBy}
        />
        <IconButton
          icon={ArrowRightLeft}
          label={t("breakdown.swap")}
          onPress={() => {
            go({ ...state, rows: state.cols, cols: state.rows });
          }}
        />
        <Select
          label={t("breakdown.cols")}
          options={choicesWith(state.cols, state.rows)}
          selectedKey={dimId(state.cols)}
          onSelectionChange={(id) => {
            choose("cols", id);
          }}
          className={styles.groupBy}
        />
        <ChartViewToggle view={view} onChange={setView} className={styles.trailing} />
      </div>
      {notes.length === 0 ? null : (
        <div data-part="matrix-notes" className={styles.notes}>
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      {query.isError ? (
        <ErrorState
          error={asCommandError(query.error)}
          title={t("breakdown.matrixError")}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {shown === null && query.isError ? null : isEmpty && view === "table" ? (
        <NoHolds />
      ) : (
        <Heatmap
          aria-label={name}
          rows={matrix?.rows.map(itemOf) ?? NO_ITEMS}
          cols={matrix?.cols.map(itemOf) ?? NO_ITEMS}
          cells={matrix?.cells ?? NO_CELLS}
          max={matrix?.max_cell ?? 0}
          otherRow={matrix?.other_row ? t("breakdown.other") : undefined}
          otherCol={matrix?.other_col ? t("breakdown.other") : undefined}
          {...(isCurrent ? { onCellPress: openCell, pressHint: t("breakdown.cellHint") } : {})}
          formatCell={formatCount}
          rowsLabel={dimName(rowsDim)}
          colsLabel={dimName(colsDim)}
          valueLabel={t("breakdown.column.holds")}
          view={view}
          resultKey={shown?.key ?? ""}
          isLoading={isLoading}
          isStale={isStale}
          emptyState={<NoHolds />}
          className={styles.matrix}
        />
      )}
    </>
  );
}
