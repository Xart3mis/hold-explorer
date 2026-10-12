import { useMutation, useQueryClient } from "@tanstack/react-query";
import { keys } from "../../api/keys";
import { workspaceApi } from "../../api/workspace-commands";
import type { AppStart } from "../../bindings/AppStart";
import type { CommandError } from "../../bindings/CommandError";
import { t } from "../../text/i18n";
import { workspaceAction } from "../view";
import { changeStart, listed, readList, showOpened } from "./start";

/** The kind of the error a rename fails with when its workspace is no longer the open one. */
export const WORKSPACE_CHANGED = "WorkspaceChanged";

/** A rename: the workspace it is meant for, and the name to give it. */
export interface Rename {
  /** The id of the workspace to rename. The command renames the open workspace, whichever it is. */
  id: string;
  name: string;
}

/**
 * The actions on the workspaces: open one, create one, rename the open one, and read the
 * workspaces folder again. See ui/src/app/actions/start.ts for what every action does.
 */
export function useWorkspaceActions() {
  const client = useQueryClient();

  const openWorkspace = useMutation(
    workspaceAction(client, {
      kind: "switching",
      mutationFn: (id: string) => workspaceApi.workspaceOpen(id),
      onSuccess: (open) => {
        showOpened(client, open);
      },
    }),
  );

  const createWorkspace = useMutation(
    workspaceAction(client, {
      kind: "changing",
      mutationFn: (name: string) => workspaceApi.workspaceCreate(name),
      onSuccess: (open) => {
        showOpened(client, open);
        return readList(client);
      },
    }),
  );

  const renameWorkspace = useMutation(
    workspaceAction(client, {
      kind: "changing",
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
        return workspaceApi.workspaceRename(name);
      },
      onSuccess: (workspace) => {
        changeStart(client, (state) =>
          listed(
            state.open?.workspace.id === workspace.id
              ? { ...state, open: { ...state.open, workspace } }
              : state,
            workspace,
          ),
        );
        return readList(client);
      },
    }),
  );

  const refreshWorkspaces = useMutation({ mutationFn: () => readList(client) });

  return { openWorkspace, createWorkspace, renameWorkspace, refreshWorkspaces };
}
