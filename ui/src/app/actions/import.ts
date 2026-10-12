import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../../api/workspace-commands";
import type { ImportCommit } from "../../bindings/ImportCommit";
import type { ImportPhase } from "../../bindings/ImportPhase";
import { workspaceAction } from "../view";
import { readList, showOpened } from "./start";

/** A commit of the file that is open for import: the request, and who hears each phase. */
export interface Commit {
  request: ImportCommit;
  /** Called with each phase of the commit as it starts. */
  onProgress: (phase: ImportPhase) => void;
}

/**
 * The action that commits the file that is open for import. See ui/src/app/actions/start.ts for
 * what every action does.
 */
export function useImportCommit() {
  const client = useQueryClient();

  // An import makes its target the open workspace, with the new snapshot selected: it may open
  // another workspace, or create one. So it takes its turn with the other actions on the open
  // workspace, and the start holds what it opened before the next of them runs.
  const importCommit = useMutation(
    workspaceAction(client, {
      kind: "changing",
      mutationFn: ({ request, onProgress }: Commit) =>
        workspaceApi.importCommit(request, onProgress),
      onSuccess: (done, { request }) => {
        showOpened(client, done.open);
        // A workspace the import created is new to the folder; one that existed is already listed.
        return request.target.kind === "New" ? readList(client) : undefined;
      },
    }),
  );

  return { importCommit };
}
