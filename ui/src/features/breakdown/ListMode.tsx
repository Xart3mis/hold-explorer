import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { dimId, dimName } from "../../app/filters/dims";
import { useFilters, withValues } from "../../app/filters/state";
import { useSnapshotQuery } from "../../app/view";
import type { Dim } from "../../bindings/Dim";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { Group } from "../../bindings/Group";
import type { GroupDetail } from "../../bindings/GroupDetail";
import type { LineRow } from "../../bindings/LineRow";
import type { ViewRef } from "../../bindings/ViewRef";
import {
  DataTable,
  textChars,
  type DataTableChildColumn,
  type DataTableChildren,
  type DataTableColumn,
} from "../../components";
import { formatCount, formatDays, formatList, isBlank } from "../../text/format";
import { t } from "../../text/i18n";
import { useDetailFocus, useSelection } from "../detail/selection";
import { DEFAULT_LINES_STATE, linesAddress } from "../lines/address";
import { breakdownAddress, type BreakdownState } from "./address";
import styles from "./BreakdownPage.module.css";

/** What the page knows of the lines of an expanded group. */
interface GroupReading {
  /** The group and its first lines; `null` when the filters no longer keep the group. */
  detail: GroupDetail | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function readGroup(view: ViewRef, spec: FilterSpec, dim: Dim, key: string) {
  return api.groupDetail(spec, dim, key, view);
}

/**
 * Reads the lines of one expanded group, and tells the page what it has. It draws nothing: the
 * table draws the lines under their group. One is there for each group that is expanded, so a
 * group is read when it expands, and read again only when the filters change.
 */
function GroupReader({
  spec,
  dim,
  groupKey,
  onRead,
  onForget,
}: {
  spec: FilterSpec;
  dim: Dim;
  groupKey: string;
  onRead: (key: string, reading: GroupReading) => void;
  onForget: (key: string) => void;
}) {
  const { data, isPending, error, refetch } = useSnapshotQuery({
    name: "groupDetail",
    params: [spec, dim, groupKey],
    read: readGroup,
  });
  useEffect(() => {
    onRead(groupKey, {
      detail: data,
      isLoading: isPending,
      error,
      refetch: () => {
        void refetch();
      },
    });
  }, [groupKey, data, isPending, error, refetch, onRead]);
  useEffect(
    () => () => {
      onForget(groupKey);
    },
    [groupKey, onForget],
  );
  return null;
}

const NO_LINES: readonly LineRow[] = [];
/** The children of a group that is collapsed: it expands, and nothing of it is read yet. */
const COLLAPSED: DataTableChildren<LineRow> = { rows: NO_LINES };

/** How many groups that were read and closed again keep their lines, for a quick reopening. */
const KEPT_CLOSED = 10;

/** The groups to keep read: every open one, and the last `KEPT_CLOSED` closed ones, in order. */
function keptGroups(read: readonly string[], open: ReadonlySet<string>): string[] {
  const closed = read.filter((key) => !open.has(key));
  const kept = new Set(closed.slice(-KEPT_CLOSED));
  return read.filter((key) => open.has(key) || kept.has(key));
}

const groupKeyOf = (group: Group) => group.key;
const lineKeyOf = (line: LineRow) => line.line_id;

/** The bar of a group: its holds against the holds of the largest group the command returned. */
function ShareBar({ holds, largest }: { holds: number; largest: number }): ReactNode {
  const share = largest > 0 ? (holds / largest) * 100 : 0;
  return (
    <span aria-hidden="true" className={styles.track}>
      <span data-part="bar" className={styles.bar} style={{ inlineSize: `${String(share)}%` }} />
    </span>
  );
}

/** What a line shows in the track of the bars: its disciplines, and the age of its oldest hold. */
function LineFacts({ line }: { line: LineRow }) {
  const disciplines = line.disciplines.filter((discipline) => !isBlank(discipline));
  return (
    <span className={styles.lineFacts}>
      <span className={styles.disciplines}>
        {disciplines.length === 0 ? t("common.noValue") : formatList(disciplines)}
      </span>
      {line.oldest_age_days === null ? null : (
        <span className={styles.oldest}>
          {t("breakdown.oldest", { age: formatDays(line.oldest_age_days) })}
        </span>
      )}
    </span>
  );
}

/** The key of the row an element is in; `null` outside a row. */
function rowKeyOf(element: EventTarget | null): string | null {
  const row = element instanceof Element ? element.closest<HTMLElement>("[role='row']") : null;
  return row?.dataset.key ?? null;
}

export interface ListModeProps {
  state: BreakdownState;
  spec: FilterSpec;
  /** The groups of the dimension as the command returned them, most holds first. */
  groups: readonly Group[];
  /** The dimension those groups are of: the one asked for, or the one before while it is read. */
  shownDim: Dim;
  isLoading: boolean;
  isStale: boolean;
  resultKey: string;
  emptyState?: ReactNode;
}

/**
 * The list of Breakdown: a table of the groups of a dimension, each with a bar of its holds, its
 * holds, and its lines. A group expands in place to its lines (the owner's choice of 2026-10-17):
 * they are read when it expands, the first two hundred of them, and a last row leads to all of
 * them in Lines. A line opens in the detail panel. The groups that are expanded are kept in the
 * address.
 */
export function ListMode({
  state,
  spec,
  groups,
  shownDim,
  isLoading,
  isStale,
  resultKey,
  emptyState,
}: ListModeProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { update } = useFilters();
  const { selection, select, close } = useSelection();
  const focus = useDetailFocus();
  const tableArea = useRef<HTMLDivElement>(null);
  // The row that opened the detail panel, and whether the key that is down is Enter: a line
  // chosen with Enter opens the panel with the focus on its heading, a line pressed keeps it.
  const opener = useRef<string | null>(null);
  const byEnter = useRef(false);

  const [readings, setReadings] = useState<ReadonlyMap<string, GroupReading>>(new Map());
  const onRead = useCallback((key: string, reading: GroupReading) => {
    setReadings((held) => new Map(held).set(key, reading));
  }, []);
  const onForget = useCallback((key: string) => {
    setReadings((held) => {
      if (!held.has(key)) return held;
      const next = new Map(held);
      next.delete(key);
      return next;
    });
  }, []);

  // Only the groups of the result on screen are read; an address may name others. A group that
  // was expanded is kept read while the result is the same, so one that is closed and opened
  // again shows its lines at once; under another result only the groups open in it are read.
  const shownKeys = useMemo(() => new Set(groups.map(groupKeyOf)), [groups]);
  // The address is read anew at every render; the set of open groups stays the same object while
  // the groups it names are the same.
  const openKeys = JSON.stringify(state.open);
  const open = useMemo(() => new Set(JSON.parse(openKeys) as string[]), [openKeys]);
  // While another dimension is read, the groups of before stay on screen, dimmed; they are of the
  // dimension before, so none of them expands or is read under the new one.
  const isCurrent = dimId(shownDim) === dimId(state.by);
  const [visited, setVisited] = useState<{ result: string; keys: readonly string[] }>({
    result: resultKey,
    keys: state.open,
  });
  const isNewResult = visited.result !== resultKey;
  const unread = state.open.filter((key) => isNewResult || !visited.keys.includes(key));
  // The groups read now: those open, and the last few that were closed, whose lines the table
  // keeps out of sight. Older ones are let go, so what the table holds does not grow all session.
  const now = keptGroups(isNewResult ? state.open : [...visited.keys, ...unread], open);
  if (isNewResult || unread.length > 0) setVisited({ result: resultKey, keys: now });
  const reading = isCurrent ? now.filter((key) => shownKeys.has(key)) : [];

  // When the panel closes, the focus goes back to the line that opened it, or to the table when
  // that row is no longer there.
  useEffect(() => {
    focus.setGiveBack(() => {
      const area = tableArea.current;
      if (area === null) return;
      const rows = [...area.querySelectorAll<HTMLElement>("[role='row'][data-key]")];
      const row = rows.find((candidate) => candidate.dataset.key === opener.current);
      (row ?? area.querySelector<HTMLElement>("[role='treegrid']"))?.focus();
    });
    return () => {
      focus.setGiveBack(null);
    };
  }, [focus]);

  // What the table is told by the keyboard, learned around it, as on Lines: Enter on a line opens
  // the panel with the focus on its heading, and Escape on the table closes the panel.
  const latest = useRef({ isOpen: selection !== null, close });
  useEffect(() => {
    latest.current = { isOpen: selection !== null, close };
  });
  const listenTo = useCallback(
    (area: HTMLDivElement | null) => {
      tableArea.current = area;
      if (area === null) return;
      const learn = (event: KeyboardEvent) => {
        byEnter.current = event.key === "Enter";
        // The row a line is chosen from: the same line may be under two groups.
        if (event.key === "Enter") opener.current = rowKeyOf(event.target) ?? opener.current;
      };
      const forget = (event: PointerEvent) => {
        byEnter.current = false;
        opener.current = rowKeyOf(event.target) ?? opener.current;
      };
      const answer = (event: KeyboardEvent) => {
        const now = latest.current;
        if (event.key === "Escape" && now.isOpen && !event.defaultPrevented) {
          event.preventDefault();
          now.close();
          focus.giveBack();
        }
      };
      area.addEventListener("keydown", learn, { capture: true });
      area.addEventListener("pointerdown", forget, { capture: true });
      area.addEventListener("keydown", answer);
      return () => {
        area.removeEventListener("keydown", learn, { capture: true });
        area.removeEventListener("pointerdown", forget, { capture: true });
        area.removeEventListener("keydown", answer);
        tableArea.current = null;
      };
    },
    [focus],
  );

  const largest = groups.reduce((most, group) => Math.max(most, group.holds), 0);
  const mostLines = groups.reduce((most, group) => Math.max(most, group.lines), 0);
  // The widest line ID of the groups that are read: the line IDs under a group are never cut.
  let widestLine = 0;
  for (const held of readings.values()) {
    widestLine = Math.max(widestLine, held.detail?.lines.widest_line_id ?? 0);
  }

  const columns = useMemo(
    (): DataTableColumn<Group>[] => [
      {
        id: "label",
        header: dimName(shownDim),
        cell: (group) => group.label,
        isRowHeader: true,
        size: { flex: 2, minChars: 20 },
      },
      {
        id: "share",
        header: t("breakdown.column.share"),
        cell: (group) => <ShareBar holds={group.holds} largest={largest} />,
        size: { flex: 3, minChars: 16 },
      },
      {
        id: "holds",
        header: t("breakdown.column.holds"),
        cell: (group) => formatCount(group.holds),
        kind: "number",
        size: { chars: textChars(formatCount(largest)) },
      },
      {
        id: "lines",
        header: t("breakdown.column.lines"),
        cell: (group) => formatCount(group.lines),
        kind: "number",
        size: { chars: textChars(formatCount(mostLines)) },
      },
    ],
    [shownDim, largest, mostLines],
  );
  const childColumns = useMemo(
    (): DataTableChildColumn<LineRow>[] => [
      { column: "label", cell: (line) => line.line_id, kind: "identifier", chars: widestLine },
      { column: "share", cell: (line) => <LineFacts line={line} />, isSupporting: true },
      { column: "holds", cell: (line) => formatCount(line.holds), kind: "number" },
    ],
    [widestLine],
  );

  /** Writes the groups that are open into the address, keeping the rest of it. */
  const setOpen = (keys: ReadonlySet<string>) => {
    void navigate(breakdownAddress({ ...state, open: [...keys] }, location.search), {
      replace: true,
    });
  };

  /**
   * The children of a group: those it was read with, also while it is collapsed, so that the
   * table keeps them and turns the group in one render. A group of the dimension before does not
   * expand.
   */
  const childRows = (group: Group): DataTableChildren<LineRow> | undefined => {
    if (!isCurrent) return undefined;
    const isOpen = open.has(group.key);
    const held = readings.get(group.key);
    if (held === undefined) return isOpen ? { rows: NO_LINES, isLoading: true } : COLLAPSED;
    if (held.error !== null) {
      // The command's message says what happened and what to do; the row stands under its group.
      return {
        rows: NO_LINES,
        error: { text: asCommandError(held.error).message, onRetry: held.refetch },
      };
    }
    if (held.detail === null) {
      return {
        rows: NO_LINES,
        notice: {
          text: t("breakdown.groupGone"),
          action: t("breakdown.collapse"),
          onAction: () => {
            const next = new Set(open);
            next.delete(group.key);
            setOpen(next);
          },
        },
      };
    }
    const lines = held.detail?.lines;
    if (lines === undefined) return { rows: NO_LINES, isLoading: held.isLoading };
    if (lines.total <= lines.rows.length) return { rows: lines.rows };
    return {
      rows: lines.rows,
      more: {
        text: t("breakdown.openAll", { count: lines.total }),
        onAction: () => {
          // The group's value takes the place of what its field was filtered by.
          update((current) =>
            withValues(current, shownDim, [{ key: group.key, label: group.label }], false),
          );
          void navigate(linesAddress(DEFAULT_LINES_STATE));
        },
      },
    };
  };

  return (
    <div ref={listenTo} data-part="breakdown-table" className={styles.table}>
      {reading.map((key) => (
        <GroupReader
          key={key}
          spec={spec}
          dim={shownDim}
          groupKey={key}
          onRead={onRead}
          onForget={onForget}
        />
      ))}
      <DataTable
        aria-label={t("breakdown.table", { dim: dimName(shownDim) })}
        columns={columns}
        rows={groups}
        rowKey={groupKeyOf}
        childRows={childRows}
        childKey={lineKeyOf}
        childColumns={childColumns}
        expandedKeys={open}
        onExpandedChange={(keys) => {
          if (isCurrent) setOpen(keys);
        }}
        selectedChildKey={selection?.kind === "line" ? selection.lineId : null}
        onChildSelectionChange={(line) => {
          if (byEnter.current) focus.askForHeading();
          byEnter.current = false;
          select({ kind: "line", lineId: line.line_id });
        }}
        height="fill"
        isLoading={isLoading}
        isStale={isStale}
        resultKey={resultKey}
        {...(isLoading
          ? {}
          : {
              countText: (shown: number) => t("breakdown.count", { count: shown }),
            })}
        {...(emptyState === undefined ? {} : { emptyState })}
      />
    </div>
  );
}
