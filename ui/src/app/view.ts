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
import { isCommandError } from "../api/error";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { ViewRef } from "../bindings/ViewRef";
import { startQuery } from "./query";

/** The kind of the error a data command answers with when it is asked for a view the Rust side does not hold. */
export const VIEW_CHANGED = "ViewChanged";

/**
 * The actions that change the open workspace or its selection share one scope: they run one after
 * another, in the order they were asked for. Each command acts on whatever workspace is open when
 * it arrives, so the order must not depend on which answer happens to come back first.
 */
const WORKSPACE_SCOPE = { id: "workspace" };

/** How long the first reading after `ViewChanged` waits, and the longest any later one waits. */
const REREAD_FIRST_MS = 50;
const REREAD_LONGEST_MS = 1000;

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
 * The result is the one of `useQuery`. `error` is never the kind `ViewChanged`. Without an open
 * workspace nothing is read.
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
            for (let again = 0; ; again += 1) {
              try {
                return await read(view);
              } catch (error) {
                if (!isViewChanged(error)) throw error;
                if (!isShown(client, view)) {
                  // The interface shows another view by now, or is about to: this reading is
                  // dropped as if it had never been asked for. The key the hook has then is read
                  // by itself, so nobody hears the error that is thrown here.
                  await client.cancelQueries({ queryKey, exact: true });
                  throw error;
                }
                await new Promise((resolve) => {
                  setTimeout(resolve, Math.min(REREAD_FIRST_MS * 4 ** again, REREAD_LONGEST_MS));
                });
                // Asking for the signal says that this reading may be dropped: it then is when
                // the screen that asked is gone, and when an action on the workspace starts.
                if (context.signal.aborted) throw error;
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
