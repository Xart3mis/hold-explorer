/**
 * The view on screen: the workspace that is open and the snapshot that is selected. The Rust side
 * holds one view and the interface shows one, and for a moment they differ whenever a command
 * that changes the view is on its way. This module keeps what a screen reads in step with what
 * the top bar names, with two functions. A screen that follows the rule below cannot show one
 * snapshot's numbers under another snapshot's name, and cannot keep them under the wrong key.
 *
 * The rule for a new screen:
 *
 * 1. Read the data of the snapshot in view with `useSnapshotQuery`, and with nothing else. Give
 *    it a name, the parameters the answer depends on (a filter, a sort), and a function that
 *    calls the command with the view it is handed:
 *
 *        const lines = useSnapshotQuery({
 *          name: "lines",
 *          params: [filter, sort],
 *          read: (view) => api.lines(filter, sort, view),
 *        });
 *
 *    Do not build a `ViewRef` from the application start, do not write a key under
 *    `keys.snapshots`, and do not pass a command that takes a view to `useQuery`. The hook takes
 *    the key and the view from the same place, so the answer of a command is always kept under
 *    the view it was asked for.
 * 2. Show what the hook returns as every screen does: `data` is the answer for the view on
 *    screen; while `isPlaceholderData` is true it is the answer for the view of before, to be
 *    shown dimmed and marked as busy until the new one is there; without `data` the screen shows
 *    its skeletons. The answer is read again whenever the view changes and whenever an action on
 *    the workspace has ended.
 * 3. Send a command that changes the open workspace or the selected snapshot, or that may, only
 *    as an action made with `workspaceAction()`. The actions that exist are the ones of
 *    `useApp()`; a new one is added there. A feature never passes such a command to
 *    `useMutation` itself, and the lint rules refuse it.
 *
 * What the two functions do with that:
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
 *   good, and the interface takes the Rust side's word: it asks for the application start again,
 *   once. The start then usually names another view, and the hook reads for that one. If it
 *   names the same view and the command refuses it once more, the screen gets an error of the
 *   kind `ViewUnsettled`, whose message says what to do; it shows it as any error, with its
 *   retry. Asking for the start again makes the Rust side start over: it reopens the workspace
 *   that was open last, selects its newest snapshot, and drops a file that is open for import.
 */
import {
  skipToken,
  useIsMutating,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "../api/commands";
import { isCommandError } from "../api/error";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { CommandError } from "../bindings/CommandError";
import type { ViewRef } from "../bindings/ViewRef";
import { t } from "./i18n";
import { startQuery } from "./query";

/** The kind of the error a data command answers with when it is asked for a view the Rust side does not hold. */
export const VIEW_CHANGED = "ViewChanged";

/**
 * The kind of the error a screen is given when a view was refused again after the interface had
 * taken the application start from the Rust side anew. Its message is from the text catalog.
 */
export const VIEW_UNSETTLED = "ViewUnsettled";

/**
 * The actions that change the open workspace or its selection share one scope: they run one after
 * another, in the order they were asked for. Each command acts on whatever workspace is open when
 * it arrives, so the order must not depend on which answer happens to come back first.
 */
const WORKSPACE_SCOPE = { id: "workspace" };

/** How many answers of `ViewChanged` in a row a reading takes before it asks for the application start. */
const REFUSALS = 5;
/** How long the first reading after `ViewChanged` waits; each one after it waits twice as long. */
const REREAD_FIRST_MS = 50;

/** The view the interface shows, as the cached application start has it; `null` without a workspace. */
function viewOf(start: AppStart | undefined): ViewRef | null {
  const open = start?.open;
  if (open === undefined || open === null) return null;
  return { workspace_id: open.workspace.id, snapshot_id: open.selected };
}

/** Whether the interface still shows this view, with no action on its way that may change it. */
function isShown(client: QueryClient, view: ViewRef): boolean {
  if (client.isMutating({ mutationKey: keys.workspaceAction }) > 0) return false;
  const shown = viewOf(client.getQueryData<AppStart>(keys.start));
  return shown?.workspace_id === view.workspace_id && shown.snapshot_id === view.snapshot_id;
}

function isViewChanged(error: unknown): boolean {
  return isCommandError(error) && error.kind === VIEW_CHANGED;
}

/** What a screen is told when the view stays refused: what happened, why, and what to do. */
function unsettled(): Error & CommandError {
  return Object.assign(new Error(t("errors.viewUnsettled")), { kind: VIEW_UNSETTLED });
}

export interface SnapshotQueryOptions<Data> {
  /** What is read, in one word that no other reading uses: "overview", "lines". Part of the key. */
  name: string;
  /** What else the answer depends on: the filter, a sort, a page. Part of the key. */
  params?: readonly unknown[];
  /** Calls the command. `view` is the view the key names; pass it to the command as it is. */
  read: (view: ViewRef) => Promise<Data>;
}

/**
 * Reads data of the snapshot in view; see the rule at the top of this file.
 *
 * The result is the one of `useQuery`. `error` is never the kind `ViewChanged`; it is the kind
 * `ViewUnsettled` when the view stayed refused. Without an open workspace nothing is read.
 */
export function useSnapshotQuery<Data>({
  name,
  params = [],
  read,
}: SnapshotQueryOptions<Data>): UseQueryResult<Data> {
  const client = useQueryClient();
  const { data: start } = useQuery(startQuery);
  const isChanging = useIsMutating({ mutationKey: keys.workspaceAction }) > 0;
  const view = viewOf(start);
  const queryKey = keys.snapshot(view, name, params);

  return useQuery({
    queryKey,
    queryFn:
      view === null
        ? skipToken
        : async (context) => {
            // The interface shows another view by now, or is about to: the reading is dropped
            // as if it had never been asked for. The key the hook has then is read by itself,
            // so nobody hears the error that is thrown after this.
            const drop = () => client.cancelQueries({ queryKey, exact: true });
            for (let refusals = 1; ; refusals += 1) {
              try {
                return await read(view);
              } catch (error) {
                if (!isViewChanged(error)) throw error;
                if (!isShown(client, view)) {
                  await drop();
                  throw error;
                }
                // Refused again after the application start was taken anew: it is an error now.
                if (refusals > REFUSALS) throw unsettled();
                if (refusals < REFUSALS) {
                  await new Promise((resolve) => {
                    setTimeout(resolve, REREAD_FIRST_MS * 2 ** (refusals - 1));
                  });
                  // Asking for the signal says that this reading may be dropped: it then is when
                  // the screen that asked is gone, and when an action on the workspace starts.
                  if (context.signal.aborted) throw error;
                  continue;
                }
                // The two sides disagree for good. The interface takes the Rust side's word,
                // once: the application start is asked for again and replaces the cached one.
                // When it cannot be had, the cached one stays as it is, untouched and not failed.
                let fresh: AppStart;
                try {
                  fresh = await api.appStart();
                } catch {
                  throw unsettled();
                }
                client.setQueryData(keys.start, fresh);
                if (!isShown(client, view)) {
                  await drop();
                  throw error;
                }
              }
            }
          },
    enabled: view !== null && !isChanging,
  });
}

export interface WorkspaceAction<Variables, Data> {
  /**
   * `switching` for an action after which every page shows another workspace or another
   * snapshot: the shell keeps the page that is there, dimmed, while it runs. `changing` for the
   * others: a new workspace, another name, an import, the demo.
   */
  kind: "switching" | "changing";
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
 * another; the key, so every reader of `useApp().isBusy` sees it and no snapshot query is
 * enabled meanwhile; and the dropping of the snapshot queries that are in flight when the action
 * is asked for, whose answers the Rust side may give for either view.
 */
export function workspaceAction<Variables = void, Data = unknown>(
  client: QueryClient,
  { kind, mutationFn, onSuccess }: WorkspaceAction<Variables, Data>,
): UseMutationOptions<Data, Error, Variables> {
  return {
    mutationKey: keys[kind],
    scope: WORKSPACE_SCOPE,
    mutationFn,
    onMutate: () => client.cancelQueries({ queryKey: keys.snapshots }),
    ...(onSuccess === undefined
      ? {}
      : { onSuccess: (data: Data, variables: Variables) => onSuccess(data, variables) }),
  };
}
