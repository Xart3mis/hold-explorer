// The table with a long list, for looking at it and for measuring it. Development only; it is a
// view of the gallery page:
//
//   /gallery.html?view=table&theme=dark
//   /gallery.html?view=table&theme=light&density=compact
//
// Thirty thousand lines are made up here. A loader hands them out two hundred at a time after a
// short delay, as the commands will, so the table asks for more as it is scrolled. Typing in the
// filter swaps the rows for the first page of what matches. "Load all" brings every row in at
// once, to look at the table with all of them loaded.
//
// Every time the rows change, what that change cost is written beside the filter and kept in
// `window.hxTableRenders`, newest last.
import {
  Profiler,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, DataTable, EmptyState, TextField, type DataTableColumn } from "../components";
import { formatCount } from "../text/format";
import styles from "./gallery.module.css";

interface DevLine {
  id: string;
  holds: number;
  disciplines: string;
  holdTypes: string;
  oldest: number;
  blocker: string;
  blockerType: string;
  size: string;
}

const TOTAL = 30_000;
const PAGE = 200;
const DELAY = 120;

const DISCIPLINES = ["Piping", "Process", "Civil", "Instrumentation and control", "Structural"];
const HOLD_TYPES = ["Vendor data", "Process data", "Client decision", "Stress analysis"];
const BLOCKER_TYPES = ["Drawing", "Data sheet", "Tie-in", "Calculation", "Vendor document"];
const SERVICES = ["FW", "CW", "PR", "PP", "OO", "ST", "NG"];

/** One of the lines, the same at every start: nothing here is random. */
function devLine(index: number): DevLine {
  const unit = 500 + (index % 97);
  const service = SERVICES[index % SERVICES.length] ?? "FW";
  const disciplines = [DISCIPLINES[index % 5], index % 3 === 0 ? DISCIPLINES[(index + 2) % 5] : ""]
    .filter((name) => name !== undefined && name !== "")
    .join(", ");
  return {
    id: `78B${String((index % 12) + 1).padStart(2, "0")}-${String(unit)}-${String(index + 1).padStart(5, "0")}-${service}-${String((index % 9) + 1).padStart(3, "0")}`,
    holds: (index % 13) + 1,
    disciplines,
    holdTypes: HOLD_TYPES[index % HOLD_TYPES.length] ?? "",
    oldest: (index * 7) % 240,
    blocker: `${String(unit)}-${service}-${String(4000 + (index % 800))}`,
    blockerType: BLOCKER_TYPES[index % BLOCKER_TYPES.length] ?? "",
    size: `${String(((index % 12) + 1) * 2)}"`,
  };
}

let made: readonly DevLine[] | null = null;
function allLines(): readonly DevLine[] {
  made ??= Array.from({ length: TOTAL }, (_, index) => devLine(index));
  return made;
}

/** The widest line ID of the whole list, as the commands send it with each page. */
const WIDEST_ID = 22;

const columns: DataTableColumn<DevLine>[] = [
  {
    id: "id",
    header: "Line",
    kind: "identifier",
    isRowHeader: true,
    size: { chars: WIDEST_ID },
    cell: (line) => line.id,
  },
  {
    id: "holds",
    header: "Holds",
    kind: "number",
    size: { chars: 3 },
    cell: (line) => formatCount(line.holds),
  },
  {
    id: "disciplines",
    header: "Disciplines",
    size: { flex: 2, minChars: 20 },
    cell: (line) => line.disciplines,
  },
  {
    id: "types",
    header: "Hold types",
    size: { flex: 1, minChars: 14 },
    cell: (line) => line.holdTypes,
  },
  {
    id: "blocker",
    header: "Blocker",
    kind: "identifier",
    size: { chars: 12 },
    cell: (line) => line.blocker,
  },
  {
    id: "blockerType",
    header: "Blocker type",
    isSupporting: true,
    size: { chars: 12 },
    cell: (line) => line.blockerType,
  },
  {
    id: "oldest",
    header: "Oldest",
    kind: "number",
    size: { chars: 5 },
    cell: (line) => `${formatCount(line.oldest)} d`,
  },
  {
    id: "size",
    header: "Model size",
    kind: "number",
    isSupporting: true,
    size: { chars: 4 },
    cell: (line) => line.size,
  },
];

interface Loaded {
  /** The filter these rows match. */
  filter: string;
  rows: readonly DevLine[];
  total: number;
}

/** The lines that match a filter, two hundred at a time, each page after a short delay. */
function useLines(filter: string) {
  const matching = useMemo(() => {
    const text = filter.trim().toLowerCase();
    if (text === "") return allLines();
    return allLines().filter(
      (line) =>
        line.id.toLowerCase().includes(text) || line.disciplines.toLowerCase().includes(text),
    );
  }, [filter]);
  const [loaded, setLoaded] = useState<Loaded>({ filter: "\u0000", rows: [], total: 0 });
  const [isLoadingMore, setLoadingMore] = useState(false);
  const timer = useRef<number | null>(null);
  const state = useRef({ matching, filter, loaded });
  // Before the table looks for the end of its rows, which it does after it has rendered.
  useLayoutEffect(() => {
    state.current = { matching, filter, loaded };
  });

  // Another filter: the first page of what matches, after the delay. The rows of before stay.
  useEffect(() => {
    const first = window.setTimeout(() => {
      setLoaded({ filter, rows: matching.slice(0, PAGE), total: matching.length });
    }, DELAY);
    return () => {
      window.clearTimeout(first);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setLoadingMore(false);
    };
  }, [filter, matching]);

  const loadMore = useCallback(() => {
    const now = state.current;
    if (timer.current !== null || now.loaded.filter !== now.filter) return;
    if (now.loaded.rows.length >= now.matching.length) return;
    setLoadingMore(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const { matching: list, filter: current } = state.current;
      setLoaded((before) =>
        before.filter === current
          ? { ...before, rows: list.slice(0, before.rows.length + PAGE) }
          : before,
      );
      setLoadingMore(false);
    }, DELAY);
  }, []);

  const loadAll = useCallback(() => {
    const { matching: list, filter: current } = state.current;
    setLoaded({ filter: current, rows: list, total: list.length });
  }, []);

  return {
    rows: loaded.rows,
    /** The filter the rows match: what they are a result of. */
    resultKey: loaded.filter,
    total: loaded.total,
    hasMore: loaded.filter === filter && loaded.rows.length < loaded.total,
    isFirstLoad: loaded.filter === "\u0000",
    isStale: loaded.filter !== filter && loaded.filter !== "\u0000",
    isLoadingMore,
    loadMore,
    loadAll,
  };
}

declare global {
  interface Window {
    /** What the table page measured: one entry for each change of the rows, newest last. */
    hxTableRenders?: { rows: number; react: number; elapsed: number }[];
  }
}

/** The table that is a page: it fills the window under its controls, and loads as it is scrolled. */
export function TablePage() {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const lines = useLines(filter);
  const [measured, setMeasured] = useState<string>("");
  const rendered = useRef<readonly DevLine[]>(lines.rows);
  const renders = useRef<{ start: number; actual: number }[]>([]);

  // What a change of the rows cost, said once it is on screen: the time React spent rendering,
  // from the render that brought the new rows to the frame that shows them, and the time that
  // passed meanwhile. The renders that only follow a scroll are not part of it.
  useEffect(() => {
    if (rendered.current === lines.rows) return;
    rendered.current = lines.rows;
    const start = renders.current.at(-1)?.start ?? performance.now();
    const count = lines.rows.length;
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const react = renders.current
          .filter((render) => render.start >= start)
          .reduce((sum, render) => sum + render.actual, 0);
        renders.current = [];
        const entry = {
          rows: count,
          react: Math.round(react * 10) / 10,
          elapsed: Math.round((performance.now() - start) * 10) / 10,
        };
        (window.hxTableRenders ??= []).push(entry);
        setMeasured(
          `${formatCount(count)} rows: React rendered for ${String(entry.react)} ms, on screen after ${String(entry.elapsed)} ms`,
        );
      }, 0);
    });
  }, [lines.rows]);

  return (
    <main className={styles.tablePage}>
      <header className={styles.tableHead}>
        <h1 className={styles.frameTitle}>Lines</h1>
        <div className={styles.tableControls}>
          <TextField
            label="Filter lines"
            placeholder="78B01, Civil"
            value={filter}
            onChange={setFilter}
          />
          <Button variant="secondary" onPress={lines.loadAll}>
            Load all
          </Button>
          <span className={styles.caption}>{measured}</span>
        </div>
      </header>
      <div className={styles.tableBody}>
        <Profiler
          id="table"
          onRender={(_, __, actual, ___, start) => {
            renders.current.push({ start, actual });
          }}
        >
          <DataTable
            aria-label="Lines"
            columns={columns}
            rows={lines.rows}
            rowKey={(line) => line.id}
            resultKey={lines.resultKey}
            selectedKey={selected}
            onSelectionChange={setSelected}
            height="fill"
            isLoading={lines.isFirstLoad}
            isStale={lines.isStale}
            totalRows={lines.total}
            countText={(shown, total) => `${formatCount(shown)} of ${formatCount(total)} lines`}
            {...(lines.hasMore ? { onLoadMore: lines.loadMore } : {})}
            isLoadingMore={lines.isLoadingMore}
            emptyState={
              <EmptyState
                title="No line matches this filter"
                placement="table"
                action={
                  <Button
                    onPress={() => {
                      setFilter("");
                    }}
                  >
                    Clear the filter
                  </Button>
                }
              >
                The filter looks in the line ID and in the disciplines.
              </EmptyState>
            }
          />
        </Profiler>
      </div>
    </main>
  );
}
