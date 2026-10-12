import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "../api/commands";
import { asCommandError } from "../api/error";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { CommandError } from "../bindings/CommandError";
import type { ImportCommit } from "../bindings/ImportCommit";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { Theme } from "../bindings/Theme";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";
import { t } from "./i18n";
import { startQuery } from "./query";

/**
 * The actions that change the open workspace or its selection share one scope: they run one after
 * another, in the order they were asked for. Each command acts on whatever workspace is open when
 * it arrives, so the order must not depend on which answer happens to come back first.
 */
const WORKSPACE_SCOPE = { id: "workspace" };
/** Changes of the settings are sent one after another as well, so the last one asked for is the last one saved. */
const SETTINGS_SCOPE = { id: "settings" };

/** The kind of the error a rename fails with when its workspace is no longer the open one. */
export const WORKSPACE_CHANGED = "WorkspaceChanged";

/** A rename: the workspace it is meant for, and the name to give it. */
export interface Rename {
  /** The id of the workspace to rename. The command renames the open workspace, whichever it is. */
  id: string;
  name: string;
}

/** A commit of the file that is open for import: the request, and who hears each phase. */
export interface Commit {
  request: ImportCommit;
  /** Called with each phase of the commit as it starts. */
  onProgress: (phase: ImportPhase) => void;
}

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
 * What is known about the changes of the theme that are on their way. The cached start shows the
 * theme that was asked for last, at once; this keeps the theme the settings file is known to
 * hold, to go back to when the last change fails.
 */
interface ThemeChanges {
  /** The number of the change that was asked for last. */
  latest: number;
  /** How many changes have been asked for and not yet answered. */
  waiting: number;
  /** The theme the settings file holds, as far as the answers say. */
  saved: Theme | undefined;
}

const themeChanges = new WeakMap<QueryClient, ThemeChanges>();

function themeChangesOf(client: QueryClient): ThemeChanges {
  let changes = themeChanges.get(client);
  if (!changes) {
    changes = { latest: 0, waiting: 0, saved: undefined };
    themeChanges.set(client, changes);
  }
  return changes;
}

/**
 * The application start and the actions that change it. Each action is a mutation that writes
 * what its command returns into the cached start, so every screen shows the state the Rust side
 * has and nothing else. An action that changes which workspaces exist, or what one is called,
 * also reads the workspaces folder again.
 *
 * The actions on the open workspace run one after another, and `isBusy` is true for every reader
 * while any of them runs or waits its turn. The commit of an import is one of them.
 *
 * A failed action leaves the cached state as it was. Its error is the `error` of the mutation;
 * show it with `asCommandError`.
 */
export function useApp() {
  const client = useQueryClient();
  const start = useQuery(startQuery);
  const isBusy = useIsMutating({ mutationKey: keys.workspaceAction }) > 0;

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
    scope: WORKSPACE_SCOPE,
    mutationFn: (id: string) => api.workspaceOpen(id),
    onSuccess: opened,
  });

  const createWorkspace = useMutation({
    mutationKey: keys.changing,
    scope: WORKSPACE_SCOPE,
    mutationFn: (name: string) => api.workspaceCreate(name),
    onSuccess: openedAndListed,
  });

  const openDemo = useMutation({
    mutationKey: keys.changing,
    scope: WORKSPACE_SCOPE,
    mutationFn: () => api.demoCreate(),
    onSuccess: openedAndListed,
  });

  const renameWorkspace = useMutation({
    mutationKey: keys.changing,
    scope: WORKSPACE_SCOPE,
    // The check is made when the rename's turn comes: an action asked for before it may have
    // opened another workspace, and the command would give that one the name.
    mutationFn: ({ id, name }: Rename) => {
      const open = client.getQueryData<AppStart>(keys.start)?.open;
      if (open?.workspace.id !== id) {
        const gone: Error & CommandError = Object.assign(new Error(t("workspaces.renameGone")), {
          kind: WORKSPACE_CHANGED,
        });
        return Promise.reject(gone);
      }
      return api.workspaceRename(name);
    },
    onSuccess: (workspace) => {
      change(client, (state) =>
        listed(
          state.open?.workspace.id === workspace.id
            ? { ...state, open: { ...state.open, workspace } }
            : state,
          workspace,
        ),
      );
      return readList(client);
    },
  });

  const selectSnapshot = useMutation({
    mutationKey: keys.switching,
    scope: WORKSPACE_SCOPE,
    mutationFn: (id: number) => api.snapshotSelect(id),
    onSuccess: opened,
  });

  // An import makes its target the open workspace, with the new snapshot selected: it may open
  // another workspace, or create one. So it takes its turn with the other actions on the open
  // workspace, and the start holds what it opened before the next of them runs.
  const importCommit = useMutation({
    mutationKey: keys.changing,
    scope: WORKSPACE_SCOPE,
    mutationFn: ({ request, onProgress }: Commit) => api.importCommit(request, onProgress),
    onSuccess: (done, { request }) => {
      opened(done.open);
      // A workspace the import created is new to the folder; one that existed is already listed.
      return request.target.kind === "New" ? readList(client) : undefined;
    },
  });

  const setTheme = useMutation({
    scope: SETTINGS_SCOPE,
    mutationFn: (theme: Theme) => api.setTheme(theme),
    // The theme is applied at once: AppProviders applies whatever theme the cached start holds.
    onMutate: (theme) => {
      const changes = themeChangesOf(client);
      if (changes.waiting === 0) {
        changes.saved = client.getQueryData<AppStart>(keys.start)?.settings.theme;
      }
      changes.waiting += 1;
      changes.latest += 1;
      change(client, (state) => ({ ...state, settings: { ...state.settings, theme } }));
      return { change: changes.latest };
    },
    // The settings are now what the command says. A later choice that is still on its way stays
    // on screen.
    onSuccess: (settings, _theme, asked) => {
      const changes = themeChangesOf(client);
      changes.saved = settings.theme;
      change(client, (state) => ({
        ...state,
        settings:
          asked.change === changes.latest ? settings : { ...settings, theme: state.settings.theme },
      }));
    },
    // A theme that could not be saved is not kept: the next start would not have it. Only the
    // change that was asked for last goes back, and it goes back to the theme that is saved. An
    // earlier change that fails leaves a later one alone.
    onError: (_error, _theme, asked) => {
      const { latest, saved } = themeChangesOf(client);
      if (asked?.change !== latest || saved === undefined) return;
      change(client, (state) => ({ ...state, settings: { ...state.settings, theme: saved } }));
    },
    onSettled: (_settings, _error, _theme, asked) => {
      if (asked !== undefined) themeChangesOf(client).waiting -= 1;
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
    /**
     * An action on the open workspace is running or waiting its turn, started by any part of the
     * app. A control that starts such an action shows itself as pending meanwhile.
     */
    isBusy,
    openWorkspace,
    createWorkspace,
    renameWorkspace,
    selectSnapshot,
    importCommit,
    setTheme,
    openDemo,
    refreshWorkspaces,
  };
}
