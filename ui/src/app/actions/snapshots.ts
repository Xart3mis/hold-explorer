import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../../api/workspace-commands";
import { workspaceAction } from "../view";
import { showOpened } from "./start";

/**
 * The action on the snapshots of the open workspace: select the one to view. See
 * ui/src/app/actions/start.ts for what every action does.
 */
export function useSnapshotActions() {
  const client = useQueryClient();

  const selectSnapshot = useMutation(
    workspaceAction(client, {
      kind: "switching",
      mutationFn: (id: number) => workspaceApi.snapshotSelect(id),
      onSuccess: (open) => {
        showOpened(client, open);
      },
    }),
  );

  return { selectSnapshot };
}
