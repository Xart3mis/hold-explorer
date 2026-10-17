import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { workspaceApi } from "../../api/workspace-commands";
import { searchForAnotherSnapshot } from "../selection";
import { workspaceAction } from "../view";
import { showOpened } from "./start";

/**
 * The action on the snapshots of the open workspace: select the one to view. See
 * ui/src/app/actions/start.ts for what every action does.
 *
 * A hold selected for the detail panel is taken out of the address as the other snapshot is asked
 * for, before anything of that snapshot can be read: its position names another hold there, or
 * none. A line stays selected, and the panel reads it again for the snapshot that is shown. The
 * address is the one the snapshot was chosen at; a selection that fails leaves the hold closed.
 */
export function useSnapshotActions() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const selectSnapshot = useMutation(
    workspaceAction(client, {
      kind: "switching",
      mutationFn: (id: number) => {
        const next = searchForAnotherSnapshot(search);
        if (next !== null) void navigate({ pathname, search: next }, { replace: true });
        return workspaceApi.snapshotSelect(id);
      },
      onSuccess: (open) => {
        showOpened(client, open);
      },
    }),
  );

  return { selectSnapshot };
}
