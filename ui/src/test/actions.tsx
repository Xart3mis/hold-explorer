import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { expect, vi } from "vitest";
import { useStart } from "../app/actions/start";
import { queryClient } from "../app/query";
import { openStart } from "./fixtures";
import { mockCommands, type Handlers } from "./ipc";

/**
 * The query client of the app, around a hook a test renders by itself, on a router: an action
 * may change the address, as selecting a snapshot does when a hold is open.
 */
export function wrapper({ children }: { children: ReactNode }) {
  return wrapperAt("/")({ children });
}

/** Where the router of a test starts: an address, or an address with what was passed to it. */
type Entry = string | { pathname: string; search?: string; hash?: string; state?: unknown };

/** The same, on a router at `path`. */
function wrapperAt(path: Entry) {
  return function At({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

/**
 * The application start beside the actions a test is about (the hooks of ui/src/app/actions/),
 * once the start has answered, with a workspace open. The router is at `path`, and `search` is
 * the search text of the address the router is at, and `location` that address.
 */
export async function loaded<Actions extends object>(
  useActions: () => Actions,
  handlers: Handlers,
  path: Entry = "/",
) {
  const start = openStart();
  mockCommands({ app_start: () => start, workspace_list: () => start.list, ...handlers });
  const hook = renderHook(
    () => {
      const location = useLocation();
      return { ...useStart(), ...useActions(), search: location.search, location };
    },
    { wrapper: wrapperAt(path) },
  );
  await waitFor(() => {
    expect(hook.result.current.start).toBeDefined();
  });
  return hook;
}

/** A command whose answers the test gives one by one, in the order the calls arrived. */
export function held<Result>() {
  const waiting: { resolve: (value: Result) => void; reject: (reason: unknown) => void }[] = [];
  const handler = vi.fn(
    () =>
      new Promise<Result>((resolve, reject) => {
        waiting.push({ resolve, reject });
      }),
  );
  return { handler, waiting };
}
