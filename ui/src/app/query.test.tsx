import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { commandFailure } from "../test/ipc";
import { queryClient } from "./query";

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

  it("decides a retry by what failed", () => {
    const retry = queryClient.getDefaultOptions().queries?.retry;
    if (typeof retry !== "function") throw new Error("The query client has no retry rule.");
    expect(retry(0, { kind: "Internal", message: "It broke." } as unknown as Error)).toBe(false);
    expect(retry(0, new Error("The page was reloaded."))).toBe(true);
    expect(retry(3, new Error("The page was reloaded."))).toBe(false);
  });

  it("never retries a mutation, and runs without a network connection", () => {
    const options = queryClient.getDefaultOptions();
    expect(options.mutations?.retry).toBe(false);
    expect(options.queries?.networkMode).toBe("always");
    expect(options.mutations?.networkMode).toBe("always");
  });
});
