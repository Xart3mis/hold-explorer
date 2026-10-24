import {
  keepPreviousData,
  notifyManager,
  QueryClient,
  queryOptions,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { answerDialogsFor } from "../api/dialogs";
import { keys } from "../api/keys";
import { workspaceApi } from "../api/workspace-commands";

/**
 * The one query client. Every command result is loaded through it.
 *
 * - A refetch keeps the previous data, also when the key changes (another snapshot, another
 *   filter), so a screen dims its previous render and never falls back to skeletons.
 * - Nothing is tried again by itself. A command is a local call, and it fails the same way every
 *   time: a `CommandError` is the command's answer, and anything else, a panic or an argument
 *   the command cannot read, is a fault that asking again does not mend. A retry would only keep
 *   the skeleton on screen for seconds before the error. The one exception is made where it is
 *   needed, not here: the readings of ui/src/app/view.ts are read again after `ViewChanged`.
 * - Commands are local calls. They run whether or not the machine is online, and nothing is
 *   fetched again because the window was shown or the network came back.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      placeholderData: keepPreviousData,
      retry: false,
      networkMode: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: false,
      networkMode: "always",
    },
  },
});

/**
 * The application start: settings, the workspaces, the workspace that was reopened. Read it with
 * `useQuery(startQuery)`.
 *
 * It is never stale. Asking again lists the workspace folder, so a part of the app that mounts
 * must not cause it; whoever changes what the start holds (the theme, the open workspace, the
 * list) writes the new state into the cache or invalidates this key.
 */
export const startQuery = queryOptions({
  queryKey: keys.start,
  queryFn: async () => {
    const start = await workspaceApi.appStart();
    // Only the start says whether the dialogs are the system's or the e2e build's substitutes.
    answerDialogsFor(start);
    return start;
  },
  staleTime: Infinity,
});

// The same for a reader that names the key with options of its own.
queryClient.setQueryDefaults(keys.start, { staleTime: Infinity });

// The file that is open for import is written into the cache by the import page and read by the
// pages after it. It is the Rust side's draft, so nothing asks for it again and it is kept until
// the import is cancelled or done, however long a page of the flow stays open or closed.
queryClient.setQueryDefaults(keys.importDraft, { staleTime: Infinity, gcTime: Infinity });
// The same holds for what the review of that file found and for what the user has chosen on the
// way: both belong to the draft and go when it goes.
queryClient.setQueryDefaults(keys.importReview, { staleTime: Infinity, gcTime: Infinity });
queryClient.setQueryDefaults(keys.importChoices, { staleTime: Infinity, gcTime: Infinity });
// The change of the workspaces folder is the interface's own record of where it is, written by
// its actions, so nothing asks for it and it stays until it is put away.
queryClient.setQueryDefaults(keys.folderChange, { staleTime: Infinity, gcTime: Infinity });
// The filters the user has set are kept by workspace for the session. Nothing reads them from
// anywhere else, so they are never stale and never dropped while the app runs.
queryClient.setQueryDefaults(keys.filters, { staleTime: Infinity, gcTime: Infinity });
// The same holds for the filters each saved view was saved or applied with, labels and all.
queryClient.setQueryDefaults(keys.viewFilters, { staleTime: Infinity, gcTime: Infinity });

/**
 * What a reader finds in the cache, read again whenever the cache changes. The cache also changes
 * while a component renders, when a query is first asked for, so a change is passed on after the
 * render that caused it, the way the query library passes its own changes on.
 */
export function useCached<Data>(read: (client: QueryClient) => Data | undefined): Data | undefined {
  const client = useQueryClient();
  const subscribe = useCallback(
    (changed: () => void) => client.getQueryCache().subscribe(notifyManager.batchCalls(changed)),
    [client],
  );
  return useSyncExternalStore(subscribe, () => read(client));
}
