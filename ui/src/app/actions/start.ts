/**
 * The application start and the actions that change it, one module of this folder per concern.
 * Each action is a mutation that writes what its command returns into the cached start, so every
 * screen shows the state the Rust side has and nothing else. An action that changes which
 * workspaces exist, or what one is called, also reads the workspaces folder again.
 *
 * The actions on the open workspace are made with `workspaceAction()` (ui/src/app/view.ts), and
 * only so: they run one after another, `isBusy` is true for every reader while any of them runs
 * or waits its turn, and nothing is read for the snapshot in view meanwhile. The commit of an
 * import is one of them.
 *
 * A failed action leaves the cached state as it was. Its error is the `error` of the mutation;
 * show it with `asCommandError`.
 */
import { useIsMutating, useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "../../api/commands";
import { asCommandError, isErrorKind } from "../../api/error";
import { keys } from "../../api/keys";
import type { AppStart } from "../../bindings/AppStart";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../../bindings/WorkspaceView";
import { startQuery } from "../query";

/** Changes the cached application start, when there is one. */
export function changeStart(client: QueryClient, next: (start: AppStart) => AppStart): void {
  client.setQueryData<AppStart>(keys.start, (start) => (start === undefined ? start : next(start)));
}

/** Puts a workspace into the cached list in place of its old entry, or at the end when it is new. */
export function listed(start: AppStart, workspace: WorkspaceView): AppStart {
  const known = start.list.workspaces.some((entry) => entry.id === workspace.id);
  const workspaces = known
    ? start.list.workspaces.map((entry) => (entry.id === workspace.id ? workspace : entry))
    : [...start.list.workspaces, workspace];
  return { ...start, list: { ...start.list, workspaces } };
}

/** The workspace a command opened is the open one, with the snapshot the command selected. */
export function showOpened(client: QueryClient, open: WorkspaceOpen): void {
  changeStart(client, (state) => listed({ ...state, open }, open.workspace));
}

/**
 * Reads the workspaces folder again and writes what it holds into the cached start. A folder that
 * cannot be read is kept as the list error, exactly as the application start reports one. The
 * order of the list is the one the command gives; the interface sorts nothing.
 */
export async function readList(client: QueryClient): Promise<void> {
  try {
    const list = await client.query({
      queryKey: keys.workspaces,
      queryFn: () => api.workspaceList(),
      staleTime: 0,
    });
    changeStart(client, (start) => ({ ...start, list, list_error: null }));
  } catch (error) {
    const { kind, message } = asCommandError(error);
    // Only a command reads the folder; a kind of the interface's own cannot come from it.
    const listError = { kind: isErrorKind(kind) ? kind : "Internal", message } as const;
    changeStart(client, (start) => ({ ...start, list_error: listError }));
  }
}

/** The application start, and whether an action on the open workspace is on its way. */
export function useStart() {
  const start = useQuery(startQuery);
  const isBusy = useIsMutating({ mutationKey: keys.workspaceAction }) > 0;

  return {
    /** What `app_start` returned, as the actions have changed it since. Absent until it is loaded. */
    start: start.data,
    isLoading: start.isPending,
    /** Why the application start failed, when it did. */
    error: start.isError ? asCommandError(start.error) : null,
    /** Asks for the application start again, after a failure. */
    reload: () => void start.refetch(),
    isReloading: start.isRefetching,
    /**
     * An action on the open workspace is running or waiting its turn, started by any part of the
     * app. A control that starts such an action is inert meanwhile (`isInert`): it starts nothing
     * and shows no spinner. The spinner is on the control that started the action that runs,
     * which knows it by the `isPending` of the action it called.
     */
    isBusy,
  };
}
