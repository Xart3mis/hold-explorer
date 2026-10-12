import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api/commands";
import { asCommandError } from "../api/error";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { Theme } from "../bindings/Theme";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";
import { startQuery } from "./query";

/** Changes the cached application start, when there is one. */
function change(client: QueryClient, next: (start: AppStart) => AppStart): void {
  client.setQueryData<AppStart>(keys.start, (start) => (start === undefined ? start : next(start)));
}

/** Puts a workspace into the cached list in place of its old entry, or at the end when it is new. */
function listed(start: AppStart, workspace: WorkspaceView): AppStart {
  const known = start.list.workspaces.some((entry) => entry.id === workspace.id);
  const workspaces = known
    ? start.list.workspaces.map((entry) => (entry.id === workspace.id ? workspace : entry))
    : [...start.list.workspaces, workspace];
  return { ...start, list: { ...start.list, workspaces } };
}

/**
 * Reads the workspaces folder again and writes what it holds into the cached start. A folder that
 * cannot be read is kept as the list error, exactly as the application start reports one. The
 * order of the list is the one the command gives; the interface sorts nothing.
 */
async function readList(client: QueryClient): Promise<void> {
  try {
    const list = await client.query({
      queryKey: keys.workspaces,
      queryFn: () => api.workspaceList(),
      staleTime: 0,
    });
    change(client, (start) => ({ ...start, list, list_error: null }));
  } catch (error) {
    change(client, (start) => ({ ...start, list_error: asCommandError(error) }));
  }
}

/**
 * The application start and the actions that change it. Each action is a mutation that writes
 * what its command returns into the cached start, so every screen shows the state the Rust side
 * has and nothing else. An action that changes which workspaces exist, or what one is called,
 * also reads the workspaces folder again.
 *
 * A failed action leaves the cached state as it was. Its error is the `error` of the mutation;
 * show it with `asCommandError`.
 */
export function useApp() {
  const client = useQueryClient();
  const start = useQuery(startQuery);

  /** The workspace the command opened is the open one, with the snapshot the command selected. */
  const opened = (open: WorkspaceOpen) => {
    change(client, (state) => listed({ ...state, open }, open.workspace));
  };
  const openedAndListed = (open: WorkspaceOpen) => {
    opened(open);
    return readList(client);
  };

  const openWorkspace = useMutation({
    mutationKey: keys.switching,
    mutationFn: (id: string) => api.workspaceOpen(id),
    onSuccess: opened,
  });

  const createWorkspace = useMutation({
    mutationFn: (name: string) => api.workspaceCreate(name),
    onSuccess: openedAndListed,
  });

  const openDemo = useMutation({
    mutationFn: () => api.demoCreate(),
    onSuccess: openedAndListed,
  });

  const renameWorkspace = useMutation({
    mutationFn: (name: string) => api.workspaceRename(name),
    onSuccess: (workspace) => {
      change(client, (state) =>
        listed(
          state.open === null ? state : { ...state, open: { ...state.open, workspace } },
          workspace,
        ),
      );
      return readList(client);
    },
  });

  const selectSnapshot = useMutation({
    mutationKey: keys.switching,
    mutationFn: (id: number) => api.snapshotSelect(id),
    onSuccess: opened,
  });

  const setTheme = useMutation({
    mutationFn: (theme: Theme) => api.setTheme(theme),
    // The theme is applied at once: AppProviders applies whatever theme the cached start holds.
    onMutate: (theme) => {
      const before = client.getQueryData<AppStart>(keys.start)?.settings.theme;
      change(client, (state) => ({ ...state, settings: { ...state.settings, theme } }));
      return { before };
    },
    onSuccess: (settings) => {
      change(client, (state) => ({ ...state, settings }));
    },
    // A theme that could not be saved is not kept: the next start would not have it.
    onError: (_error, _theme, context) => {
      const before = context?.before;
      if (before === undefined) return;
      change(client, (state) => ({ ...state, settings: { ...state.settings, theme: before } }));
    },
  });

  const refreshWorkspaces = useMutation({ mutationFn: () => readList(client) });

  return {
    /** What `app_start` returned, as the actions have changed it since. Absent until it is loaded. */
    start: start.data,
    isLoading: start.isPending,
    /** Why the application start failed, when it did. */
    error: start.isError ? asCommandError(start.error) : null,
    /** Asks for the application start again, after a failure. */
    reload: () => void start.refetch(),
    isReloading: start.isRefetching,
    openWorkspace,
    createWorkspace,
    renameWorkspace,
    selectSnapshot,
    setTheme,
    openDemo,
    refreshWorkspaces,
  };
}
