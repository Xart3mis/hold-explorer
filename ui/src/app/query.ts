import { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { isCommandError } from "../api/error";

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
