import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, vi } from "vitest";
import { useStart } from "../app/actions/start";
import { queryClient } from "../app/query";
import { openStart } from "./fixtures";
import { mockCommands, type Handlers } from "./ipc";

/** The query client of the app, around a hook a test renders by itself. */
export function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * The application start beside the actions a test is about (the hooks of ui/src/app/actions/),
 * once the start has answered, with a workspace open.
 */
export async function loaded<Actions extends object>(
  useActions: () => Actions,
  handlers: Handlers,
) {
  const start = openStart();
  mockCommands({ app_start: () => start, workspace_list: () => start.list, ...handlers });
  const hook = renderHook(() => ({ ...useStart(), ...useActions() }), { wrapper });
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
