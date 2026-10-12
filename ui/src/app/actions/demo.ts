import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../../api/workspace-commands";
import { workspaceAction } from "../view";
import { readList, showOpened } from "./start";

/**
 * The action that builds the demo workspace and opens it. See ui/src/app/actions/start.ts for
 * what every action does.
 */
export function useDemo() {
  const client = useQueryClient();

  const openDemo = useMutation(
    workspaceAction(client, {
      kind: "changing",
      mutationFn: () => workspaceApi.demoCreate(),
      onSuccess: (open) => {
        showOpened(client, open);
        return readList(client);
      },
    }),
  );

  return { openDemo };
}
