import { QueryClientProvider, useMutation, useQueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { ViewRef } from "../bindings/ViewRef";
import en from "../locales/en.json";
import { opened, openStart, otherWorkspace, startState, workspace } from "../test/fixtures";
import { commandFailure, mockCommands } from "../test/ipc";
import { queryClient } from "./query";
import { useSnapshotQuery, VIEW_CHANGED, VIEW_UNSETTLED, workspaceAction } from "./view";

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
function screenWith(
  read: Read,
  start: AppStart = openStart(),
  restart: () => AppStart = () => start,
) {
  // What the Rust side answers when the application start is asked for again.
  const appStart = vi.fn(restart);
  mockCommands({ app_start: appStart });
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
    appStart,
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

  it("after five such answers in a row asks for the application start again, once, and reads for the view it gives", async () => {
    const read = vi.fn<Read>((view) =>
      view.snapshot_id === 1 ? Promise.resolve("lines of 1") : Promise.reject(viewChanged()),
    );
    const start = openStart();
    // The Rust side holds the older snapshot, and says so when it is asked.
    const { result, appStart } = screenWith(read, start, () => ({
      ...start,
      open: opened({ selected: 1 }),
    }));
    const seen: unknown[] = [];
    const watch = setInterval(() => {
      if (result.current.lines.isError) seen.push(result.current.lines.error);
    }, 5);
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 1");
    });
    clearInterval(watch);
    // Five answers for the view the interface showed, then one reading for the view it took over.
    expect(read.mock.calls.map(([view]) => view.snapshot_id)).toEqual([2, 2, 2, 2, 2, 1]);
    expect(appStart).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData<AppStart>(keys.start)?.open?.selected).toBe(1);
    // Nothing of it was an error to the screen, and nothing is left under the view that is gone.
    expect(seen).toEqual([]);
    const gone = queryClient.getQueryState(keys.snapshot(HERE, "lines", ["oldest"]));
    expect(gone?.error ?? null).toBeNull();
    expect(gone?.data).toBeUndefined();
  });

  it("reads once more when the application start gives the same view, and takes the answer", async () => {
    let refusals = 5;
    const read = vi.fn<Read>(() => {
      refusals -= 1;
      return refusals >= 0 ? Promise.reject(viewChanged()) : Promise.resolve("lines of 2");
    });
    const { result, appStart } = screenWith(read);
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });
    expect(read).toHaveBeenCalledTimes(6);
    expect(appStart).toHaveBeenCalledTimes(1);
    expect(result.current.lines.isError).toBe(false);
  });

  it("gives an error that says what to do when the view is refused again after the application start was read, and reads again on a retry", async () => {
    let settled = false;
    const read = vi.fn<Read>(() =>
      settled ? Promise.resolve("lines of 2") : Promise.reject(viewChanged()),
    );
    const { result, appStart } = screenWith(read);
    await waitFor(() => {
      expect(result.current.lines.isError).toBe(true);
    });
    // Five answers, the application start once, a sixth answer, and then it stops.
    expect(read).toHaveBeenCalledTimes(6);
    expect(appStart).toHaveBeenCalledTimes(1);
    expect(result.current.lines.error).toMatchObject({
      kind: VIEW_UNSETTLED,
      message: en.errors.viewUnsettled,
    });
    expect(en.errors.viewUnsettled).toMatch(/restart Hold Explorer/i);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(read).toHaveBeenCalledTimes(6);
    expect(appStart).toHaveBeenCalledTimes(1);

    // The screen offers a retry, and a retry reads again.
    settled = true;
    await act(async () => {
      await result.current.lines.refetch();
    });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });
    expect(read).toHaveBeenCalledTimes(7);
    expect(result.current.lines.isError).toBe(false);
  });

  it("gives that error as well when the application start cannot be read again", async () => {
    const read = vi.fn<Read>(() => Promise.reject(viewChanged()));
    const { result, appStart } = screenWith(read, openStart(), () => {
      throw commandFailure("Io", "The workspaces folder could not be read.");
    });
    await waitFor(() => {
      expect(result.current.lines.isError).toBe(true);
    });
    expect(result.current.lines.error).toMatchObject({ kind: VIEW_UNSETTLED });
    expect(appStart).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(5);
    // What the interface held is still what it holds, and the start itself is not a failed one.
    expect(queryClient.getQueryData<AppStart>(keys.start)?.open?.selected).toBe(2);
    expect(queryClient.getQueryState(keys.start)?.status).toBe("success");
  });

  it("stops for good when the screen goes during the first reading: nothing more is read, and the application start is not asked for", async () => {
    const { read, waiting } = heldRead();
    const { unmount, appStart } = screenWith(read);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    // The user leaves the page while its first reading is on its way, and the command refuses it.
    unmount();
    await act(async () => {
      waiting[0]?.reject(viewChanged());
      await Promise.resolve();
    });
    // Longer than five refusals and their waits would take.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(read).toHaveBeenCalledTimes(1);
    expect(appStart).not.toHaveBeenCalled();
    const left = queryClient.getQueryState(keys.snapshot(HERE, "lines", ["oldest"]));
    expect(left?.fetchStatus ?? "idle").toBe("idle");
    expect(left?.error ?? null).toBeNull();
  });

  it("stops as well when the screen goes after a refusal, between two readings", async () => {
    const waiting: ((reason: unknown) => void)[] = [];
    const read = vi.fn<Read>(
      () =>
        new Promise<string>((_resolve, reject) => {
          waiting.push(reject);
        }),
    );
    const { unmount, appStart } = screenWith(read);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    await act(async () => {
      waiting[0]?.(viewChanged());
      await Promise.resolve();
    });
    // The second reading is on its way when the user leaves.
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    unmount();
    await act(async () => {
      waiting[1]?.(viewChanged());
      await Promise.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(read).toHaveBeenCalledTimes(2);
    expect(appStart).not.toHaveBeenCalled();
  });

  it("does not ask for the application start for a reading that was dropped while it waited to read again", async () => {
    const read = vi.fn<Read>(() => Promise.reject(viewChanged()));
    const { unmount, appStart } = screenWith(read);
    // Four refusals are in; the screen goes before the fifth.
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(4);
    });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(read.mock.calls.length).toBeLessThanOrEqual(5);
    expect(appStart).not.toHaveBeenCalled();
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
