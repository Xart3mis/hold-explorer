/**
 * The view on screen: the workspace that is open and the snapshot that is selected. The Rust side
 * holds one view and the interface shows one, and for a moment they differ whenever a command
 * that changes the view is on its way. This module keeps what a screen reads in step with what
 * the top bar names, with three functions. A screen that follows the rule below cannot show one
 * snapshot's numbers under another snapshot's name, and cannot keep them under the wrong key.
 *
 * The rule for a new screen:
 *
 * 1. Read the data of the snapshot in view with `useSnapshotQuery`, or with `useSnapshotPages`
 *    when the command answers a page at a time, and with nothing else. Give it a name (one of
 *    `ReadingName`; a new reading adds its name there), the parameters the answer depends on (a
 *    filter, a sort), and a function that calls the command with the view and the parameters it
 *    is handed:
 *
 *        const options = useSnapshotQuery({
 *          name: "filterOptions",
 *          params: [spec],
 *          read: (view, spec) => api.filterOptions(spec, view),
 *        });
 *
 *        const lines = useSnapshotPages({
 *          name: "lines",
 *          params: [spec, query],
 *          read: (view, offset, spec, query) => api.lines(spec, query, offset, view),
 *        });
 *
 *    The function takes the parameters as arguments and closes over nothing the answer depends
 *    on, so the command is always sent what the key names. Do not build a `ViewRef` from the
 *    application start, do not write a key under `keys.snapshots`, and do not pass a command that
 *    takes a view to `useQuery`. The hooks take the key and the view from the same place, so the
 *    answer of a command is always kept under the view it was asked for. A paged reading and a
 *    plain one may have the same name and params: the key of the paged one has a marker after
 *    the name (`keys.snapshotPages`), so the pages of one are never taken for the answer of the
 *    other.
 * 2. Show what the hook returns as every screen does. Of `useSnapshotQuery`: `data` is the answer
 *    for the view on screen; while `isPlaceholderData` is true it is the answer for the view or
 *    the parameters of before, to be shown dimmed and marked as busy until the new one is there;
 *    without `data` the screen shows its skeletons. `resultKey` names the result `data` is:
 *    hand it to a table or a chart, and keep a result under it. It is read again whenever the
 *    view changes and whenever an action on the workspace has ended. Of `useSnapshotPages`:
 *    `rows` are the rows loaded so far, `loadMore` asks for the next page when the table nears
 *    their end, `resultKey` names the result those rows belong to (hand it to the table, so that
 *    it returns to its top when, and only when, the rows on screen are another result), and
 *    `isPlaceholderData` and `isPending` mean the same. A table may call `loadMore` whenever it
 *    is near the end of its rows: the call does nothing while a page is on its way, while
 *    `error` is set, and once `hasMore` is false, which it is when the rows are all there and
 *    also after a page that came without rows. A page that failed is not asked for again by
 *    itself: the screen shows `error` with a retry, and `refetch` reads that page, once.
 *    The pages that are loaded are not read again while the key stays the same: not after an
 *    action that left the view as it was, and not when the screen comes back. The data of a
 *    snapshot cannot change under its key, which names the view and the params, and a snapshot
 *    that is replaced gets another id. They are read again only after `keys.snapshots` was
 *    invalidated, and `isRefetching` is true meanwhile. There is one exception. After a page
 *    failed and was not retried, the pages that are loaded are read once more when an action
 *    ends with the view as it was or when the screen comes back; that clears `error`, so the
 *    next `loadMore` tries the page that failed again, once.
 * 3. Send a command that changes the open workspace or the selected snapshot, or that may, only
 *    as an action made with `workspaceAction()`. The actions that exist are the hooks of
 *    ui/src/app/actions/; a new one is added there. Those commands are in
 *    ui/src/api/workspace-commands.ts, which only the modules of ui/src/app/ may import: a
 *    feature cannot send one, and the lint rules refuse the import.
 * 4. A command that changes the data of a snapshot without changing the view (there is none yet;
 *    the first is the edit of a snapshot's date) invalidates `keys.snapshots` once it has
 *    answered, so every reading of every screen is read again. It must: apart from the
 *    exception of rule 2, nothing else makes a paged reading read its pages again.
 * 5. The one exception to rule 1: a command sent once, when the user asks, rather than read (an
 *    export) takes its view from `useShownView`, which builds it from the application start.
 *    That view is `null` while an action on the workspace runs, and the control that sends the
 *    command waits meanwhile, as for a first load. Such a command is never sent again by itself:
 *    an answer of `ViewChanged` is shown as a failure, in the command's own words, and a failure
 *    is put away once another view is on screen, so it is never sent again for a view that is
 *    gone.
 *
 * What the three functions do with that:
 *
 * - While an action is running or waiting its turn, no snapshot query is enabled, and the
 *   readings that were in flight when the action was asked for are dropped: their answers are
 *   never kept. So nothing is read while the two sides may differ.
 * - A data command checks the view it is sent against the one the Rust side holds, and answers
 *   with the kind `ViewChanged` when they differ. A screen never sees that answer as an error.
 *   When the interface has moved on to another view, or is about to, the reading is dropped and
 *   the hook reads for the view that is shown. When the interface still shows the view it asked
 *   for, the hook reads again, a little later each time, and the screen stays busy meanwhile.
 * - That does not go on for ever. After five such answers in a row the two sides disagree for
 *   good, and the interface takes the Rust side's word: it asks which workspace and snapshot are
 *   open (`workspace_current`), once, and puts the answer into the cached start as its open
 *   workspace. Asking changes nothing on the Rust side: a file that is open for import and the
 *   selection stay as they are. The answer usually names another view than the one on screen;
 *   the hook then reads for that one, and the shell says in a notice that the workspace or
 *   snapshot on screen was brought back in step, and that an action that seems to be missing
 *   should be done again. If the answer names the same view and the command refuses it once
 *   more, the screen gets an error of the kind `ViewUnsettled`, whose message says what to do;
 *   it shows it as any error, with its retry. The answer is taken also when the screen that
 *   asked has gone meanwhile: what the Rust side holds is what every page shows from then on.
 *   It is discarded only when an action on the workspace was asked for after the question: the
 *   action says what is open when it is done, and the answer may be older than that.
 * - The application start (`app_start`) is asked for once, when the page loads, by the start
 *   query, and by nothing in this module: asking for it makes the Rust side start over.
 * - A reading is dropped when the screen that asked for it goes. It then reads nothing more and
 *   asks the Rust side nothing. A screen that comes back reads what it does not have: a plain
 *   reading again, a paged one only when its pages are not there.
 */
import {
  hashKey,
  skipToken,
  useInfiniteQuery,
  useIsMutating,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/commands";
import { isCommandError } from "../api/error";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { CommandError } from "../bindings/CommandError";
import type { ViewRef } from "../bindings/ViewRef";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import { t } from "../text/i18n";
import { listed } from "./actions/start";
import { useShell, type ShellNotice } from "./shell/context";

/** The kind of the error a data command answers with when it is asked for a view the Rust side does not hold. */
export const VIEW_CHANGED = "ViewChanged";

/**
 * The kind of the error a screen is given when a view was refused again after the Rust side had
 * said that it holds that view. Its message is from the text catalog.
 */
export const VIEW_UNSETTLED = "ViewUnsettled";

/**
 * The actions that change the open workspace or its selection share one scope: they run one after
 * another, in the order they were asked for. Each command acts on whatever workspace is open when
 * it arrives, so the order must not depend on which answer happens to come back first.
 */
const WORKSPACE_SCOPE = { id: "workspace" };

/** How many answers of `ViewChanged` in a row a reading takes before it asks the Rust side what it holds. */
const REFUSALS = 5;
/** How long the first reading after `ViewChanged` waits; each one after it waits twice as long. */
const REREAD_FIRST_MS = 50;

/** The view an open workspace is shown as; `null` without a workspace. */
function viewOf(open: WorkspaceOpen | null | undefined): ViewRef | null {
  if (open === undefined || open === null) return null;
  return { workspace_id: open.workspace.id, snapshot_id: open.selected };
}

function isSameView(one: ViewRef | null, other: ViewRef | null): boolean {
  return one?.workspace_id === other?.workspace_id && one?.snapshot_id === other?.snapshot_id;
}

/**
 * The view on screen, for a command that is sent once, when the user asks, rather than read: an
 * export (rule 5). Such a command checks the view as a reading does and answers `ViewChanged`
 * when the Rust side holds another; it is not sent again by itself, so its caller shows that
 * answer as it shows any failure. `null` while no workspace is open, and while an action on the
 * workspace runs or waits its turn: the two sides may differ then, so nothing is sent.
 */
export function useShownView(): ViewRef | null {
  const view = viewOf(useShell().start.open);
  const isActing = useIsMutating({ mutationKey: keys.workspaceAction }) > 0;
  return isActing ? null : view;
}

/** The view the interface shows, as the cached application start has it. */
function shownView(client: QueryClient): ViewRef | null {
  return viewOf(client.getQueryData<AppStart>(keys.start)?.open);
}

/** Whether the interface still shows this view, with no action on its way that may change it. */
function isShown(client: QueryClient, view: ViewRef): boolean {
  if (client.isMutating({ mutationKey: keys.workspaceAction }) > 0) return false;
  return isSameView(shownView(client), view);
}

/**
 * The number of the action on the open workspace that was asked for last; 0 when there was none.
 * Every action gets a higher number than the one before it, so a higher number later on says
 * that an action was asked for in between, whether it still runs or is over.
 */
function lastAction(client: QueryClient): number {
  const actions = client.getMutationCache().findAll({ mutationKey: keys.workspaceAction });
  return Math.max(0, ...actions.map((action) => action.mutationId));
}

function isViewChanged(error: unknown): boolean {
  return isCommandError(error) && error.kind === VIEW_CHANGED;
}

/** What a screen is told when the view stays refused: what happened, why, and what to do. */
function unsettled(): Error & CommandError {
  return Object.assign(new Error(t("errors.viewUnsettled")), { kind: VIEW_UNSETTLED });
}

/** One reading for one view: where it is kept, who waits for it, and whom it tells. */
interface Reading {
  client: QueryClient;
  /** The key the answer is kept under. It names `view`. */
  queryKey: QueryKey;
  view: ViewRef;
  /**
   * Aborted when the reading is dropped: the screen is gone, or an action on the workspace starts.
   */
  signal: AbortSignal;
  /** Shows a notice of the shell. */
  notify: (notice: ShellNotice) => void;
}

/**
 * Performs one reading for a view: calls `read` with the view, and deals with the answer
 * `ViewChanged` as the top of this file says. Both hooks read through it, each page of
 * `useSnapshotPages` as one reading.
 */
async function readForView<Data>(
  { client, queryKey, view, signal, notify }: Reading,
  read: (view: ViewRef) => Promise<Data>,
): Promise<Data> {
  // The signal says that this reading may be dropped: it is when the screen that asked is gone,
  // and when an action on the workspace starts. From then on nobody waits for it, so it stops at
  // once, after whatever it was waiting for: it reads nothing more, and it asks the Rust side
  // nothing for a page that is not there.
  //
  // `drop` is for a reading the interface has moved on from: it shows another view by now, or is
  // about to. The reading is dropped as if it had never been asked for. The key the hook has
  // then is read by itself, so nobody hears the error thrown after it.
  const drop = () => client.cancelQueries({ queryKey, exact: true });
  // Asked each time anew: it becomes true while this function waits.
  const isDropped = () => signal.aborted;
  for (let refusals = 1; ; refusals += 1) {
    try {
      return await read(view);
    } catch (error) {
      if (isDropped()) throw error;
      if (!isViewChanged(error)) throw error;
      if (!isShown(client, view)) {
        await drop();
        throw error;
      }
      // Refused again after the Rust side said that it holds this view: it is an error now.
      if (refusals > REFUSALS) throw unsettled();
      if (refusals < REFUSALS) {
        await new Promise((resolve) => {
          setTimeout(resolve, REREAD_FIRST_MS * 2 ** (refusals - 1));
        });
        if (isDropped()) throw error;
        continue;
      }
      // The two sides disagree for good. The interface takes the Rust side's word, once: it asks
      // which workspace and snapshot are open, which changes nothing there. When that cannot be
      // had, the cached start stays as it is, untouched and not failed.
      const asked = lastAction(client);
      let held: WorkspaceOpen | null;
      try {
        held = await api.workspaceCurrent();
      } catch {
        throw unsettled();
      }
      // An action that was asked for meanwhile says what is open when it is done, and this
      // answer may be older than that. Nothing else is a reason to discard it: when the screen
      // that asked has gone, what the Rust side holds is still what every page shows from now on.
      if (lastAction(client) > asked) throw error;
      // Another reading of the same screen may have brought the start in step a moment ago. The
      // user is told once, by the reading that changes what is on screen.
      const moved = !isSameView(shownView(client), viewOf(held));
      // As an action that opens a workspace does, the list names it as the Rust side has it.
      client.setQueryData<AppStart>(keys.start, (start) =>
        start === undefined
          ? start
          : held === null
            ? { ...start, open: null }
            : listed({ ...start, open: held }, held.workspace),
      );
      if (moved) {
        notify({
          title: t("shell.viewResyncedTitle"),
          text: t(held === null ? "shell.viewResyncedNoneText" : "shell.viewResyncedText"),
        });
      }
      if (isDropped()) throw error;
      if (!isShown(client, view)) {
        await drop();
        throw error;
      }
    }
  }
}

/**
 * What is read for the snapshot in view, in one word that no other reading uses. Part of the key.
 * A reading is plain or paged, and a name may be used for one of each: the key of a paged reading
 * has a marker after the name (`keys.snapshotPages`), so the two never share a key.
 */
export type ReadingName =
  | "overview"
  | "filterOptions"
  | "filterValues"
  | "lines"
  | "holds"
  | "lineDetail"
  | "holdDetail"
  | "breakdown"
  | "matrix"
  | "solveOrder"
  | "blockerDetail"
  | "groupDetail";

/**
 * What both hooks start from: the key of a reading for the view on screen, built by `keyOf`,
 * whether it may be read now, and the function that performs it for that view; `null` while no
 * workspace is open.
 */
function useReading(
  keyOf: (view: ViewRef | null, name: string, params: readonly unknown[]) => QueryKey,
  name: ReadingName,
  params: readonly unknown[],
) {
  const client = useQueryClient();
  const { start, notify } = useShell();
  const isChanging = useIsMutating({ mutationKey: keys.workspaceAction }) > 0;
  const view = viewOf(start.open);
  const queryKey = keyOf(view, name, params);
  return {
    queryKey,
    isReadable: view !== null && !isChanging,
    perform:
      view === null
        ? null
        : <Data>(signal: AbortSignal, read: (view: ViewRef) => Promise<Data>) =>
            readForView({ client, queryKey, view, signal, notify }, read),
  };
}

export interface SnapshotQueryOptions<Data, Params extends readonly unknown[]> {
  name: ReadingName;
  /** What else the answer depends on: the filter, a sort. Part of the key. */
  params: Params;
  /** Calls the command with the view and the params the key names. */
  read: (view: ViewRef, ...params: Params) => Promise<Data>;
  /** False while the reading has nothing to ask for; default true. */
  enabled?: boolean;
}

/** What `useSnapshotQuery` returns: the result of `useQuery`, and the name of its result. */
export type SnapshotQuery<Data> = UseQueryResult<Data> & {
  /**
   * The result `data` belongs to: the key it was read under, as a text, so another snapshot is
   * another result as another filter is. It stays the same while the answer of before stands in
   * for another, also through several changes, and changes in the render that shows the new
   * answer. Hand it to a table or a chart as its `resultKey`, and keep a result under it.
   */
  resultKey: string;
};

/**
 * Reads data of the snapshot in view; see the rule at the top of this file.
 *
 * `params` is taken as the list it is written as, each entry with its own type, so `read` is
 * handed them typed without naming their types. The result is the one of `useQuery`, with the
 * `resultKey` of its data. `error` is never the kind `ViewChanged`; it is the kind
 * `ViewUnsettled` when the view stayed refused. Without an open workspace nothing is read.
 */
export function useSnapshotQuery<Data, const Params extends readonly unknown[]>({
  name,
  params,
  read,
  enabled = true,
}: SnapshotQueryOptions<Data, Params>): SnapshotQuery<Data> {
  const { queryKey, isReadable, perform } = useReading(keys.snapshot, name, params);
  const isEnabled = enabled && isReadable;
  const query = useQuery({
    queryKey,
    queryFn:
      perform === null
        ? skipToken
        : ({ signal }) => perform(signal, (view) => read(view, ...params)),
    enabled: isEnabled,
  });
  // The answer that stands in is the one this reading showed last as its own, so the key it was
  // shown under names it, also through several changes.
  const ownKey = hashKey(queryKey);
  const [lastOwn, setLastOwn] = useState(ownKey);
  if (!query.isPlaceholderData && query.data !== undefined && lastOwn !== ownKey) {
    setLastOwn(ownKey);
  }
  const resultKey = query.isPlaceholderData ? lastOwn : ownKey;
  // The query library reads again on `refetch` whatever `enabled` says. Here a refetch reads
  // nothing while nothing may be read, and answers with what is there. The result is a proxy of
  // the one of the library that adds `resultKey`, so the library still sees which of its parts a
  // screen reads, and its `refetch` is one function from render to render, as the library's own
  // is.
  const shown = useRef(query);
  useEffect(() => {
    shown.current = query;
  });
  const idle = useCallback(() => Promise.resolve(shown.current), []);
  return new Proxy(query, {
    get: (target, key, receiver): unknown =>
      key === "resultKey"
        ? resultKey
        : key === "refetch" && !isEnabled
          ? idle
          : (Reflect.get(target, key, receiver) as unknown),
  }) as SnapshotQuery<Data>;
}

/** A page as a paged command answers one: its rows, and how many rows there are in all. */
export interface Paged<Row> {
  total: number;
  rows: readonly Row[];
}

export interface SnapshotPages<Row, Page extends Paged<Row>> {
  /** Every row loaded so far, in order. */
  rows: readonly Row[];
  /** The first page as answered: its total, and whatever else the command says once. */
  first: Page | undefined;
  total: number | undefined;
  /** False once the rows are all there, and after a page that came without rows. */
  hasMore: boolean;
  /**
   * Asks for the next page. It does nothing while a page is on its way, while `error` is set,
   * while the rows stand in for others, and once `hasMore` is false.
   */
  loadMore: () => void;
  isLoadingMore: boolean;
  /** True on a first load: nothing to show yet. */
  isPending: boolean;
  /** True while the rows shown are those of the filter, sort, or view of before. */
  isPlaceholderData: boolean;
  /**
   * The result the rows shown belong to: the key they were read under, as a text. It stays the
   * same while the rows of before stand in for others, also through several changes, and changes
   * in the render that shows the first page of the new result. Pages that are added or read
   * again keep it. Hand it to a table as its `resultKey`.
   */
  resultKey: string;
  /**
   * True while the pages that are loaded are read again, after `keys.snapshots` was invalidated.
   * The rows of before stay meanwhile, to be shown dimmed, and `loadMore` waits.
   */
  isRefetching: boolean;
  error: Error | null;
  /**
   * The retry of the screen. After a later page failed it reads that page; after anything else
   * failed it reads again what was being read.
   */
  refetch: () => void;
}

const NO_ROWS: readonly never[] = [];

/**
 * The key each list of pages was read under, by the list, for the lists that stood in for the
 * pages of another key. Pages that stand in are the very list the reading before had, so this
 * names them for as long as they are shown, and forgets them once nobody holds them.
 */
const readUnder = new WeakMap<object, string>();

/**
 * The offset of the page after these: the number of rows loaded. There is none once the rows are
 * all there, and none after a page that came without rows: the offset would stay where it was,
 * and the same page would be asked for without end.
 */
function nextOffset(pages: readonly Paged<unknown>[]): number | undefined {
  const [first] = pages;
  const last = pages.at(-1);
  if (first === undefined || last === undefined || last.rows.length === 0) return undefined;
  const loaded = pages.reduce((count, page) => count + page.rows.length, 0);
  return loaded < first.total ? loaded : undefined;
}

/**
 * Reads data of the snapshot in view a page at a time; see the rule at the top of this file.
 *
 * The first page is read at offset 0, and each one after it at the number of rows loaded, when
 * `loadMore` is called. Other params start again at the first page: the rows of before stand in
 * until it is there and are then replaced whole, so rows of two readings are never shown
 * together. `error` is never the kind `ViewChanged`. Without an open workspace nothing is read.
 *
 * The type of a row is the one of the rows of the page `read` answers; no type is named at the
 * call.
 */
export function useSnapshotPages<
  Page extends Paged<unknown>,
  const Params extends readonly unknown[],
>(options: {
  name: ReadingName;
  params: Params;
  read: (view: ViewRef, offset: number, ...params: Params) => Promise<Page>;
  /**
   * False while the screen does not show these rows, as the rows of a mode that is not chosen:
   * nothing is read and nothing is added, and what was read stays. Default true.
   */
  enabled?: boolean;
}): SnapshotPages<Page["rows"][number], Page> {
  const { name, params, read, enabled = true } = options;
  const { queryKey, isReadable, perform } = useReading(keys.snapshotPages, name, params);
  const isEnabled = enabled && isReadable;

  const query = useInfiniteQuery({
    queryKey,
    queryFn:
      perform === null
        ? skipToken
        : ({ signal, pageParam }) => perform(signal, (view) => read(view, pageParam, ...params)),
    initialPageParam: 0,
    getNextPageParam: (_last: Page, pages: Page[]) => nextOffset(pages),
    // The rows of the params or the view of before stand in until the first page is there. They
    // are the pages of the reading before, kept under its key, which names them meanwhile.
    placeholderData: (previous, before) => {
      if (previous !== undefined && before !== undefined) readUnder.set(previous, before.queryHash);
      return previous;
    },
    // The pages that are loaded are never read again by themselves: not when an action on the
    // workspace has ended, and not when the screen comes back. The data of a snapshot cannot
    // change under this key: the key names the view and the params, and a snapshot that is
    // replaced gets another id. So a command that does change the data of a snapshot must
    // invalidate `keys.snapshots`. The one other thing that reads these pages again is a page
    // that failed: the query library then takes the reading for invalid, whatever is set here.
    staleTime: Infinity,
    enabled: isEnabled,
  });

  const pages = query.data?.pages;
  const ownKey = hashKey(queryKey);
  const resultKey = query.isPlaceholderData ? (readUnder.get(query.data) ?? ownKey) : ownKey;
  const rows = useMemo<readonly Page["rows"][number][]>(
    () => pages?.flatMap((page) => page.rows) ?? NO_ROWS,
    [pages],
  );
  const hasMore = pages !== undefined && nextOffset(pages) !== undefined;
  // Nothing is added to rows that stand in for others. Nothing is read while an action on the
  // workspace runs or while a reading of this key is on its way. And a page that failed is not
  // asked for again by a table that only looks whether it is near its end: that takes a retry.
  const canLoadMore =
    isEnabled && hasMore && !query.isPlaceholderData && !query.isFetching && query.error === null;
  const { fetchNextPage, refetch, isFetchNextPageError } = query;

  const loadMore = useCallback(() => {
    // A call that comes before the screen knows a page is on its way is ignored by the query.
    if (canLoadMore) void fetchNextPage({ cancelRefetch: false });
  }, [canLoadMore, fetchNextPage]);

  const retry = useCallback(() => {
    // Nothing is read while nothing may be read, whatever the query library would do.
    if (!isEnabled) return;
    // After a later page failed, the pages before it are there and are what they were: only the
    // page that failed is read. After anything else failed, what was being read is read again.
    void (isFetchNextPageError ? fetchNextPage({ cancelRefetch: false }) : refetch());
  }, [isEnabled, isFetchNextPageError, fetchNextPage, refetch]);

  return {
    rows,
    first: pages?.[0],
    total: pages?.[0]?.total,
    hasMore,
    loadMore,
    isLoadingMore: query.isFetchingNextPage,
    isPending: query.isPending,
    isPlaceholderData: query.isPlaceholderData,
    resultKey,
    // Rows that stand in for others are waited for, not read again.
    isRefetching: query.isRefetching && !query.isPlaceholderData,
    error: query.error,
    refetch: retry,
  };
}

export interface WorkspaceAction<Variables, Data> {
  /**
   * `switching` for an action after which every page shows another workspace: the shell keeps the
   * page that is there, dimmed, while it runs. `selecting` for the one that selects another
   * snapshot of the open workspace: a switching action as well, under `keys.selectingSnapshot`,
   * so a screen can tell it from one that opens another workspace. `changing` for the others: a
   * new workspace, another name, an import, the demo.
   */
  kind: "switching" | "selecting" | "changing";
  /**
   * Called when the action is asked for, also when it then waits its turn behind another: what
   * must change at once, such as the selection of the detail panel, which is taken out of the
   * address before anything of another view can be read.
   */
  onAsk?: (variables: Variables) => void;
  /** Sends the command. */
  mutationFn: (variables: Variables) => Promise<Data>;
  /** Writes what the command returned into the cached start. The action lasts until it is done. */
  onSuccess?: (data: Data, variables: Variables) => unknown;
}

/**
 * The options of a mutation that changes the open workspace or its selection; pass them to
 * `useMutation`. See the rule at the top of this file.
 *
 * It fixes what such an action must not be without: the scope, so the actions run one after
 * another; the key, so every reader of `useStart().isBusy` sees it and no snapshot query is
 * enabled meanwhile; and the dropping of the snapshot queries that are in flight when the action
 * is asked for, whose answers the Rust side may give for either view.
 */
export function workspaceAction<Variables = void, Data = unknown>(
  client: QueryClient,
  { kind, onAsk, mutationFn, onSuccess }: WorkspaceAction<Variables, Data>,
): UseMutationOptions<Data, Error, Variables> {
  return {
    mutationKey: kind === "selecting" ? keys.selectingSnapshot : keys[kind],
    scope: WORKSPACE_SCOPE,
    mutationFn,
    onMutate: (variables: Variables) => {
      onAsk?.(variables);
      return client.cancelQueries({ queryKey: keys.snapshots });
    },
    ...(onSuccess === undefined
      ? {}
      : { onSuccess: (data: Data, variables: Variables) => onSuccess(data, variables) }),
  };
}
