import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commands";
import { asCommandError, type AppError } from "../../api/error";
import { keys } from "../../api/keys";
import { workspaceApi } from "../../api/workspace-commands";
import type { FolderCheck } from "../../bindings/FolderCheck";
import type { FolderMoved } from "../../bindings/FolderMoved";
import { useCached } from "../query";
import { workspaceAction } from "../view";
import { useLeaveSelection } from "./selection";
import { changeStart } from "./start";

/** A change of the workspaces folder: the folder and whether its workspace files go with it. */
export interface FolderChoice {
  /** The folder; `null` for the default one. */
  path: string | null;
  moveFiles: boolean;
}

/**
 * Where the change of the workspaces folder is: a chosen folder being checked; a folder offered,
 * with the check that names the files a move would take (`null` for the default folder, which is
 * checked when the change is sent); the change running; its answer; or a failure of the dialog,
 * of the check, or of the change.
 */
export type FolderChange =
  | { step: "checking"; path: string }
  | { step: "offer"; check: FolderCheck | null }
  | { step: "moving"; choice: FolderChoice }
  | { step: "done"; choice: FolderChoice; moved: FolderMoved }
  | { step: "failed"; error: AppError };

/**
 * The actions that change the workspaces folder: `check` a folder that was chosen, then `change`
 * to it (or to the default one), moving the workspace files or leaving them. The change is an
 * action on the open workspace (it closes it and reopens it from where its file is then): it runs
 * after the others, and while it runs every control that starts one waits. Its answer is the new
 * start, which takes the place of the cached one. See ui/src/app/actions/start.ts.
 *
 * Where the change is (`change`) is kept in the cache, written by the actions themselves, so a
 * page that is left and comes back while the files move shows them moving, and then the answer.
 * `dismiss` puts it away.
 */
export function useWorkspaceFolder() {
  const client = useQueryClient();
  // Neither a line nor a hold of the workspace names anything once it is reopened.
  const leave = useLeaveSelection();
  const change = useCached((cache) => cache.getQueryData<FolderChange>(keys.folderChange));
  const put = (next: FolderChange) => {
    client.setQueryData<FolderChange>(keys.folderChange, next);
  };

  const check = useMutation({
    mutationFn: (path: string) => api.checkWorkspaceFolder(path),
    onMutate: (path) => {
      put({ step: "checking", path });
    },
    onSuccess: (checked) => {
      put({ step: "offer", check: checked });
    },
    onError: (error) => {
      put({ step: "failed", error: asCommandError(error) });
    },
  });

  const move = useMutation({
    ...workspaceAction(client, {
      kind: "changing",
      onAsk: (choice: FolderChoice) => {
        leave.forWorkspace();
        put({ step: "moving", choice });
      },
      mutationFn: ({ path, moveFiles }: FolderChoice) =>
        workspaceApi.setWorkspaceFolder(path, moveFiles),
      onSuccess: (moved: FolderMoved, choice: FolderChoice) => {
        changeStart(client, () => moved.start);
        put({ step: "done", choice, moved });
      },
    }),
    onError: (error) => {
      put({ step: "failed", error: asCommandError(error) });
    },
  });

  /** Offers the default folder, for a change that moves the files or leaves them. */
  const offerDefault = () => {
    put({ step: "offer", check: null });
  };

  /** Records a failure that came before any command, such as the dialog's. */
  const fail = (error: AppError) => {
    put({ step: "failed", error });
  };

  const dismiss = () => {
    client.removeQueries({ queryKey: keys.folderChange, exact: true });
  };

  return { change, check, move, offerDefault, fail, dismiss };
}
