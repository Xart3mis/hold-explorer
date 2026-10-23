import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commands";
import { asCommandError, type AppError } from "../../api/error";
import { keys } from "../../api/keys";
import { workspaceApi } from "../../api/workspace-commands";
import type { AppStart } from "../../bindings/AppStart";
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
 * Where the change of the workspaces folder is: a folder being checked (`path` is `null` for the
 * default one); a checked folder offered, with the files a move would take; the change running;
 * its answer; or a failure of the dialog, of the check, or of the change. A change that runs or
 * has answered keeps the folder it started from (`from`), as the cached start names it; `null`
 * when that is not known.
 */
export type FolderChange =
  | { step: "checking"; path: string | null }
  | { step: "offer"; path: string | null; check: FolderCheck }
  | { step: "moving"; choice: FolderChoice; from: string | null }
  | { step: "done"; choice: FolderChoice; moved: FolderMoved; from: string | null }
  | { step: "failed"; error: AppError };

/**
 * The actions that change the workspaces folder: `check` a folder that was chosen, or the default
 * one (`null`), then `move` to it, moving the workspace files or leaving them. The change is an
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
    mutationFn: (path: string | null) => api.checkWorkspaceFolder(path),
    onMutate: (path) => {
      put({ step: "checking", path });
    },
    onSuccess: (checked, path) => {
      put({ step: "offer", path, check: checked });
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
        const from = client.getQueryData<AppStart>(keys.start)?.list.folder ?? null;
        put({ step: "moving", choice, from });
      },
      mutationFn: ({ path, moveFiles }: FolderChoice) =>
        workspaceApi.setWorkspaceFolder(path, moveFiles),
      onSuccess: (moved: FolderMoved, choice: FolderChoice) => {
        const was = client.getQueryData<FolderChange>(keys.folderChange);
        const from = was?.step === "moving" ? was.from : null;
        changeStart(client, () => moved.start);
        put({ step: "done", choice, moved, from });
      },
    }),
    onError: (error) => {
      put({ step: "failed", error: asCommandError(error) });
    },
  });

  /** Records a failure that came before any command, such as the dialog's. */
  const fail = (error: AppError) => {
    put({ step: "failed", error });
  };

  const dismiss = () => {
    client.removeQueries({ queryKey: keys.folderChange, exact: true });
  };

  return { change, check, move, fail, dismiss };
}
