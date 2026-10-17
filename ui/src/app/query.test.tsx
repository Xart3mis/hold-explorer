import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { commandFailure } from "../test/ipc";
import { keys } from "../api/keys";
import { queryClient, startQuery } from "./query";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("queryClient", () => {
  it("keeps the previous data while a query with a new key loads", async () => {
    let finish: (value: string) => void = () => undefined;
    const load = vi.fn((id: number) =>
      id === 1 ? Promise.resolve("first") : new Promise<string>((resolve) => (finish = resolve)),
    );
    const { result, rerender } = renderHook(
      ({ id }) => useQuery({ queryKey: ["test", "snapshot", id], queryFn: () => load(id) }),
      { wrapper, initialProps: { id: 1 } },
    );
    await waitFor(() => {
      expect(result.current.data).toBe("first");
    });

    rerender({ id: 2 });
    expect(result.current.data).toBe("first");
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isFetching).toBe(true);

    finish("second");
    await waitFor(() => {
      expect(result.current.data).toBe("second");
    });
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it("does not retry a command that failed with a CommandError", async () => {
    const load = vi.fn(() =>
      Promise.reject(commandFailure("NoWorkspace", "No workspace is open.")),
    );
    const { result } = renderHook(
      () => useQuery({ queryKey: ["test", "failing"], queryFn: load }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatchObject({ kind: "NoWorkspace" });
  });

  it("does not ask again when a call fails for another reason than the command's own answer", async () => {
    // A command is a local call: a panic or a bad argument fails the same way every time, and
    // asking again only keeps the skeleton on screen for longer.
    const load = vi.fn(() =>
      Promise.reject(new Error("invalid args `view` for command `overview`")),
    );
    const started = Date.now();
    const { result } = renderHook(() => useQuery({ queryKey: ["test", "broken"], queryFn: load }), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.failureCount).toBe(1);
    // The error is there at once, not after the waits between tries.
    expect(Date.now() - started).toBeLessThan(900);
  });

  it("never retries a query, whatever failed", () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false);
  });

  it("never takes the application start for stale: it is refreshed on purpose, not on a mount", () => {
    expect(startQuery.queryKey).toEqual(keys.start);
    expect(startQuery.staleTime).toBe(Infinity);
    expect(queryClient.getQueryDefaults(keys.start).staleTime).toBe(Infinity);
  });

  it("keeps the filters of every workspace for as long as the app runs", () => {
    // Nothing observes them while another page or another workspace is shown. Without these
    // defaults the query client would drop them five minutes after they were set.
    const defaults = queryClient.getQueryDefaults(keys.workspaceFilters("a1b2c3d4e5f60718"));
    expect(defaults.gcTime).toBe(Infinity);
    expect(defaults.staleTime).toBe(Infinity);
  });

  it("never retries a mutation, and runs without a network connection", () => {
    const options = queryClient.getDefaultOptions();
    expect(options.mutations?.retry).toBe(false);
    expect(options.queries?.networkMode).toBe("always");
    expect(options.mutations?.networkMode).toBe("always");
  });
});
