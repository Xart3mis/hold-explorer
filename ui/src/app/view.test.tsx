import { QueryClientProvider, useMutation, useQueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { ViewRef } from "../bindings/ViewRef";
import { opened, openStart, otherWorkspace, startState, workspace } from "../test/fixtures";
import { commandFailure, mockCommands } from "../test/ipc";
import { queryClient } from "./query";
import { useSnapshotQuery, VIEW_CHANGED, workspaceAction } from "./view";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

type Read = (view: ViewRef) => Promise<string>;

const HERE: ViewRef = { workspace_id: workspace().id, snapshot_id: 2 };
const OLDER: ViewRef = { workspace_id: workspace().id, snapshot_id: 1 };

/** What the Rust side answers to a request for a view it does not hold. */
const viewChanged = () => commandFailure(VIEW_CHANGED, "The view changed on the way.");

/** A reading whose answers the test gives one by one, in the order the calls arrived. */
function heldRead() {
  const waiting: {
    view: ViewRef;
    resolve: (data: string) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const read = vi.fn<Read>(
    (view) =>
      new Promise<string>((resolve, reject) => {
        waiting.push({ view, resolve, reject });
      }),
  );
  return { read, waiting };
}

/**
 * A screen that reads the lines of the snapshot in view, beside an action on the open workspace
 * whose answer the test gives. The application start is in the cache, as the shell leaves it.
 */
function screenWith(read: Read, start: AppStart = openStart()) {
  mockCommands({ app_start: () => start });
  queryClient.setQueryData(keys.start, start);
  let finish: (next: AppStart | null) => void = () => undefined;
  const sent = vi.fn();
  const hook = renderHook(
    () => {
      const client = useQueryClient();
      const lines = useSnapshotQuery({ name: "lines", params: ["oldest"], read });
      const action = useMutation(
        workspaceAction(client, {
          kind: "switching",
          mutationFn: (id: number) => {
            sent(id);
            return new Promise<AppStart | null>((resolve) => {
              finish = resolve;
            });
          },
          onSuccess: (next) => {
            if (next !== null) client.setQueryData(keys.start, next);
          },
        }),
      );
      return { lines, action };
    },
    { wrapper },
  );
  return {
    ...hook,
    sent,
    finish: async (next: AppStart | null) => {
      await act(async () => {
        finish(next);
        await Promise.resolve();
      });
    },
  };
}

describe("useSnapshotQuery", () => {
  it("reads for the view of the cached start, and keeps the answer under the key of that view", async () => {
    const read = vi.fn<Read>(() => Promise.resolve("lines of 2"));
    const { result } = screenWith(read);
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(HERE);
    expect(queryClient.getQueryData(keys.snapshot(HERE, "lines", ["oldest"]))).toBe("lines of 2");
    // The key starts with what every reading for a snapshot starts with, then the view.
    expect(keys.snapshot(HERE, "lines", ["oldest"])).toEqual([
      ...keys.snapshots,
      HERE.workspace_id,
      HERE.snapshot_id,
      "lines",
      "oldest",
    ]);
  });

  it("reads again, for the new view, when another snapshot is the selected one", async () => {
    const { read, waiting } = heldRead();
    const start = openStart();
    const { result } = screenWith(read, start);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.resolve("lines of 2");
    });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });
    act(() => {
      queryClient.setQueryData<AppStart>(keys.start, { ...start, open: opened({ selected: 1 }) });
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    expect(waiting[1]?.view).toEqual(OLDER);
    // What was read for the view of before stays, marked as standing in, until the new answer is there.
    expect(result.current.lines.data).toBe("lines of 2");
    expect(result.current.lines.isPlaceholderData).toBe(true);
    act(() => {
      waiting[1]?.resolve("lines of 1");
    });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 1");
    });
    expect(result.current.lines.isPlaceholderData).toBe(false);
  });

  it("reads nothing while no workspace is open", async () => {
    const read = vi.fn<Read>(() => Promise.resolve("lines"));
    const { result } = screenWith(read, startState());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.lines.fetchStatus).toBe("idle");
  });

  it("reads nothing while an action on the open workspace is in flight, and reads once it is over", async () => {
    const { read, waiting } = heldRead();
    const { result, finish } = screenWith(read);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.resolve("lines of 2");
    });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });

    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.action.isPending).toBe(true);
    });
    // A screen that opens meanwhile reads nothing, and the one that is open reads nothing again.
    const blockers = vi.fn<Read>(() => Promise.resolve("blockers of 2"));
    const opening = renderHook(() => useSnapshotQuery({ name: "blockers", read: blockers }), {
      wrapper,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(blockers).not.toHaveBeenCalled();
    expect(opening.result.current.fetchStatus).toBe("idle");
    expect(opening.result.current.data).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.lines.fetchStatus).toBe("idle");

    // The action is over and the view is the one of before: both read for it.
    await finish(null);
    await waitFor(() => {
      expect(opening.result.current.data).toBe("blockers of 2");
    });
    expect(blockers).toHaveBeenCalledWith(HERE);
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(2);
    });
    expect(read).toHaveBeenLastCalledWith(HERE);
  });

  it("drops a reading that is in flight when an action on the open workspace starts, and never keeps its answer", async () => {
    const { read, waiting } = heldRead();
    const start = openStart();
    const { result, finish } = screenWith(read, start);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });

    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.lines.fetchStatus).toBe("idle");
    });
    // The answer arrives after all. The Rust side may have answered it for either view.
    await act(async () => {
      waiting[0]?.resolve("lines of who knows which snapshot");
      await Promise.resolve();
    });
    expect(result.current.lines.data).toBeUndefined();
    expect(queryClient.getQueryData(keys.snapshot(HERE, "lines", ["oldest"]))).toBeUndefined();

    await finish({ ...start, open: opened({ selected: 1 }) });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    expect(waiting[1]?.view).toEqual(OLDER);
    act(() => {
      waiting[1]?.resolve("lines of 1");
    });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 1");
    });
    expect(queryClient.getQueryData(keys.snapshot(HERE, "lines", ["oldest"]))).toBeUndefined();
  });

  it("reads again when the command answers that the view changed, and never gives that answer as an error", async () => {
    const seen: unknown[] = [];
    const read = vi
      .fn<Read>()
      .mockImplementationOnce(() => Promise.reject(viewChanged()))
      .mockImplementationOnce(() => Promise.reject(viewChanged()))
      .mockImplementation(() => Promise.resolve("lines of 2"));
    const { result } = screenWith(read);
    const watch = setInterval(() => {
      if (result.current.lines.isError) seen.push(result.current.lines.error);
    }, 5);
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });
    clearInterval(watch);
    expect(read).toHaveBeenCalledTimes(3);
    for (const [view] of read.mock.calls) expect(view).toEqual(HERE);
    expect(seen).toEqual([]);
    expect(result.current.lines.isError).toBe(false);
    expect(queryClient.getQueryState(keys.snapshot(HERE, "lines", ["oldest"]))?.error).toBeNull();
  });

  it("drops a reading the command refused once the interface shows another view, and leaves no error behind", async () => {
    const { read, waiting } = heldRead();
    const start = openStart();
    const { result } = screenWith(read, start);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    // Another workspace is the open one before the answer is back.
    act(() => {
      queryClient.setQueryData<AppStart>(keys.start, {
        ...start,
        open: opened({ workspace: otherWorkspace }),
      });
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    await act(async () => {
      waiting[0]?.reject(viewChanged());
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const before = queryClient.getQueryState(keys.snapshot(HERE, "lines", ["oldest"]));
    expect(before?.status).toBe("pending");
    expect(before?.fetchStatus).toBe("idle");
    expect(before?.error).toBeNull();
    expect(result.current.lines.isError).toBe(false);

    act(() => {
      waiting[1]?.resolve("lines of the other workspace");
    });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of the other workspace");
    });
    expect(waiting[1]?.view).toEqual({ workspace_id: otherWorkspace.id, snapshot_id: 2 });
    // The one refusal was not asked again for the view that is gone.
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("gives any other failure of the command as the error it is, without asking again", async () => {
    const read = vi.fn<Read>(() =>
      Promise.reject(commandFailure("Io", "The workspace file could not be read.")),
    );
    const { result } = screenWith(read);
    await waitFor(() => {
      expect(result.current.lines.isError).toBe(true);
    });
    expect(result.current.lines.error).toMatchObject({ kind: "Io" });
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("workspaceAction", () => {
  it("puts every action in the one scope and under the key of its kind", () => {
    const switching = workspaceAction(queryClient, {
      kind: "switching",
      mutationFn: () => Promise.resolve(null),
    });
    const changing = workspaceAction(queryClient, {
      kind: "changing",
      mutationFn: () => Promise.resolve(null),
    });
    expect(switching.mutationKey).toEqual(keys.switching);
    expect(changing.mutationKey).toEqual(keys.changing);
    expect(switching.scope).toBeDefined();
    expect(switching.scope).toEqual(changing.scope);
    // Both are found by the key every action on the open workspace is under.
    for (const options of [switching, changing]) {
      expect(options.mutationKey?.slice(0, keys.workspaceAction.length)).toEqual(
        keys.workspaceAction,
      );
    }
  });

  it("runs the actions one after another, in the order they were asked for", async () => {
    const order: string[] = [];
    const finish: (() => void)[] = [];
    const run = (name: string) => () => {
      order.push(name);
      return new Promise<null>((resolve) => {
        finish.push(() => {
          resolve(null);
        });
      });
    };
    const { result } = renderHook(
      () => {
        const client = useQueryClient();
        return {
          first: useMutation(
            workspaceAction(client, { kind: "switching", mutationFn: run("first") }),
          ),
          second: useMutation(
            workspaceAction(client, { kind: "changing", mutationFn: run("second") }),
          ),
        };
      },
      { wrapper },
    );
    act(() => {
      result.current.first.mutate();
      result.current.second.mutate();
    });
    await waitFor(() => {
      expect(order).toEqual(["first"]);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual(["first"]);
    act(() => {
      finish[0]?.();
    });
    await waitFor(() => {
      expect(order).toEqual(["first", "second"]);
    });
    act(() => {
      finish[1]?.();
    });
    await waitFor(() => {
      expect(result.current.second.isSuccess).toBe(true);
    });
  });
});
