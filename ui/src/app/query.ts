import { keepPreviousData, QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "../api/commands";
import { isCommandError } from "../api/error";
import { keys } from "../api/keys";

/** How often a failure that is not a command's own answer is tried again. */
const RETRIES = 3;

/**
 * The one query client. Every command result is loaded through it.
 *
 * - A refetch keeps the previous data, also when the key changes (another snapshot, another
 *   filter), so a screen dims its previous render and never falls back to skeletons.
 * - A `CommandError` is the command's answer, not a fault of the channel: asking again returns
 *   the same error, so it is never retried. Mutations are never retried.
 * - Commands are local calls. They run whether or not the machine is online, and nothing is
 *   fetched again because the window was shown or the network came back.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      placeholderData: keepPreviousData,
      retry: (failureCount, error) => !isCommandError(error) && failureCount < RETRIES,
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
  queryFn: () => api.appStart(),
  staleTime: Infinity,
});

// The same for a reader that names the key with options of its own.
queryClient.setQueryDefaults(keys.start, { staleTime: Infinity });

// The file that is open for import is written into the cache by the import page and read by the
// pages after it. It is the Rust side's draft, so nothing asks for it again and it is kept until
// the import is cancelled or done, however long a page of the flow stays open or closed.
queryClient.setQueryDefaults(keys.importDraft, { staleTime: Infinity, gcTime: Infinity });
