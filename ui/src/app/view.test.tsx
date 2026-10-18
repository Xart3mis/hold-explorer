import { QueryClientProvider, useMutation, useQueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { keys } from "../api/keys";
import type { AppStart } from "../bindings/AppStart";
import type { ViewRef } from "../bindings/ViewRef";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import en from "../locales/en.json";
import { opened, openStart, otherWorkspace, startState, workspace } from "../test/fixtures";
import { commandFailure, mockCommands } from "../test/ipc";
import { queryClient } from "./query";
import { ShellContext, type Shell, type ShellNotice } from "./shell/context";
import {
  useSnapshotPages,
  useSnapshotQuery,
  VIEW_CHANGED,
  VIEW_UNSETTLED,
  workspaceAction,
  type Paged,
} from "./view";

/** What the shell was asked to say, in the order it was asked. A test starts with none. */
const notices: ShellNotice[] = [];
beforeEach(() => {
  notices.length = 0;
});

/** The shell a screen is rendered in, as far as a reading needs it: it takes the notices. */
const shell: Shell = {
  start: openStart(),
  dragged: null,
  arrivedAt: () => false,
  report: () => undefined,
  notify: (notice) => {
    notices.push(notice);
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ShellContext value={shell}>{children}</ShellContext>
    </QueryClientProvider>
  );
}

/** The reading of the screen below: the lines of the view, in the order of the one parameter. */
type Read = (view: ViewRef, sort: string) => Promise<string>;

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

/** What the Rust side answers when it is asked what it holds: at once, or when the test says. */
type Held = () => WorkspaceOpen | null | Promise<WorkspaceOpen | null>;

/**
 * A screen with one reading of the snapshot in view, beside an action on the open workspace whose
 * answer the test gives. The application start is in the cache, as the shell leaves it.
 */
function renderScreen<Props, Reading>(
  useReading: (props: Props) => Reading,
  initialProps: Props,
  start: AppStart,
  held: Held,
) {
  // What the Rust side answers when it is asked which workspace and snapshot it holds.
  const current = vi.fn(held);
  // The application start is asked for when the page loads, and by no reading.
  const appStart = vi.fn(() => start);
  mockCommands({ app_start: appStart, workspace_current: current });
  queryClient.setQueryData(keys.start, start);
  let finish: (next: AppStart | null) => void = () => undefined;
  const sent = vi.fn();
  const hook = renderHook(
    (props: Props) => {
      const client = useQueryClient();
      const lines = useReading(props);
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
    { wrapper, initialProps },
  );
  return {
    ...hook,
    sent,
    appStart,
    current,
    finish: async (next: AppStart | null) => {
      await act(async () => {
        finish(next);
        await Promise.resolve();
      });
    },
  };
}

/** A screen that reads the lines of the snapshot in view, oldest first. */
function screenWith(read: Read, start: AppStart = openStart(), held: Held = () => start.open) {
  return renderScreen(
    () => useSnapshotQuery({ name: "lines", params: ["oldest"], read }),
    undefined,
    start,
    held,
  );
}

/** A page of lines as a command answers one: its rows, how many there are in all, and one more fact. */
interface LinesPage extends Paged<string> {
  widest: number;
}

type ReadPage = (view: ViewRef, offset: number, sort: string) => Promise<LinesPage>;

/**
 * The page of two lines at `offset`, of `total` lines. A row names the order, the snapshot, and
 * its place, so a test sees which reading every row on screen came from.
 */
function pageOf(view: ViewRef, offset: number, sort: string, total = 5): LinesPage {
  const count = Math.min(2, Math.max(total - offset, 0));
  const rows = Array.from(
    { length: count },
    (_, index) => `${sort} ${String(view.snapshot_id)}:${String(offset + index)}`,
  );
  return { total, rows, widest: 21 };
}

/** A paged reading whose answers the test gives one by one, in the order the calls arrived. */
function heldPages() {
  const waiting: {
    view: ViewRef;
    offset: number;
    sort: string;
    /** Answers with the page that was asked for. */
    answer: () => void;
    reject: (e: unknown) => void;
  }[] = [];
  const read = vi.fn<ReadPage>(
    (view, offset, sort) =>
      new Promise<LinesPage>((resolve, reject) => {
        waiting.push({
          view,
          offset,
          sort,
          answer: () => {
            resolve(pageOf(view, offset, sort));
          },
          reject,
        });
      }),
  );
  return { read, waiting };
}

/** A screen with a table of the lines of the snapshot in view, read page by page, in an order. */
function tableWith(read: ReadPage, start: AppStart = openStart(), held: Held = () => start.open) {
  return renderScreen(
    ({ sort }: { sort: string }) => useSnapshotPages({ name: "lines", params: [sort], read }),
    { sort: "oldest" },
    start,
    held,
  );
}

describe("useSnapshotQuery", () => {
  it("reads for the view of the cached start, and keeps the answer under the key of that view", async () => {
    const read = vi.fn<Read>(() => Promise.resolve("lines of 2"));
    const { result } = screenWith(read);
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(HERE, "oldest");
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

  it("hands the params to the reading in their order, after the view, and keeps them in the key", async () => {
    const filter = { status: "Open" };
    const read = vi.fn((view: ViewRef, spec: { status: string }, sort: string, page: number) =>
      Promise.resolve(
        `${spec.status} lines of ${String(view.snapshot_id)}, ${sort}, ${String(page)}`,
      ),
    );
    queryClient.setQueryData(keys.start, openStart());
    const { result } = renderHook(
      () => useSnapshotQuery({ name: "lines", params: [filter, "oldest", 3], read }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.data).toBe("Open lines of 2, oldest, 3");
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(HERE, filter, "oldest", 3);
    const key = keys.snapshot(HERE, "lines", [filter, "oldest", 3]);
    expect(key.slice(-3)).toEqual([filter, "oldest", 3]);
    expect(queryClient.getQueryData(key)).toBe("Open lines of 2, oldest, 3");
  });

  it("reads nothing while it is told that there is nothing to ask for, and reads once there is", async () => {
    const read = vi.fn<Read>(() => Promise.resolve("lines of 2"));
    queryClient.setQueryData(keys.start, openStart());
    const { result, rerender } = renderHook(
      ({ enabled }) => useSnapshotQuery({ name: "lines", params: ["oldest"], read, enabled }),
      { wrapper, initialProps: { enabled: false } },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    rerender({ enabled: true });
    await waitFor(() => {
      expect(result.current.data).toBe("lines of 2");
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads nothing on a refetch while it is told that there is nothing to ask for, or while an action runs", async () => {
    const read = vi.fn<Read>(() => Promise.resolve("lines of 2"));
    const start = openStart();
    const { result, rerender } = renderScreen(
      ({ enabled }: { enabled: boolean }) =>
        useSnapshotQuery({ name: "lines", params: ["oldest"], read, enabled }),
      { enabled: false },
      start,
      () => start.open,
    );
    await act(async () => {
      await result.current.lines.refetch();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.lines.fetchStatus).toBe("idle");

    rerender({ enabled: true });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });
    expect(read).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.action.isPending).toBe(true);
    });
    await act(async () => {
      await result.current.lines.refetch();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.lines.data).toBe("lines of 2");
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
    const holds = vi.fn<(view: ViewRef) => Promise<string>>(() => Promise.resolve("holds of 2"));
    const opening = renderHook(() => useSnapshotQuery({ name: "holds", params: [], read: holds }), {
      wrapper,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(holds).not.toHaveBeenCalled();
    expect(opening.result.current.fetchStatus).toBe("idle");
    expect(opening.result.current.data).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.lines.fetchStatus).toBe("idle");

    // The action is over and the view is the one of before: both read for it.
    await finish(null);
    await waitFor(() => {
      expect(opening.result.current.data).toBe("holds of 2");
    });
    expect(holds).toHaveBeenCalledWith(HERE);
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(2);
    });
    expect(read).toHaveBeenLastCalledWith(HERE, "oldest");
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

  it("after five such answers in a row asks which workspace and snapshot are open, once, and reads for the view it is told", async () => {
    const read = vi.fn<Read>((view) =>
      view.snapshot_id === 1 ? Promise.resolve("lines of 1") : Promise.reject(viewChanged()),
    );
    const start = openStart();
    // The Rust side holds the older snapshot, and says so when it is asked.
    const { result, appStart, current } = screenWith(read, start, () => opened({ selected: 1 }));
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
    expect(current).toHaveBeenCalledTimes(1);
    // The Rust side is asked what it holds. It is not made to start over.
    expect(appStart).not.toHaveBeenCalled();
    // The cached start takes the answer as its open workspace, and keeps everything else.
    expect(queryClient.getQueryData<AppStart>(keys.start)).toEqual({
      ...start,
      open: opened({ selected: 1 }),
    });
    // Nothing of it was an error to the screen, and nothing is left under the view that is gone.
    expect(seen).toEqual([]);
    const gone = queryClient.getQueryState(keys.snapshot(HERE, "lines", ["oldest"]));
    expect(gone?.error ?? null).toBeNull();
    expect(gone?.data).toBeUndefined();
  });

  it("lists the workspace the Rust side holds, as an action that opens one does", async () => {
    const read = vi.fn<Read>((view) =>
      view.workspace_id === otherWorkspace.id
        ? Promise.resolve("lines of the other")
        : Promise.reject(viewChanged()),
    );
    const start = openStart();
    // The Rust side holds a workspace the cached list does not know yet.
    const held = opened({ workspace: { ...otherWorkspace, snapshot_count: 7 } });
    const { result } = screenWith(read, start, () => held);
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of the other");
    });
    const cached = queryClient.getQueryData<AppStart>(keys.start);
    expect(cached?.open).toEqual(held);
    expect(cached?.list.workspaces.find((entry) => entry.id === otherWorkspace.id)).toEqual(
      held.workspace,
    );
  });

  it("has the shell say, once, that the view on screen was brought back in step, however many readings found out", async () => {
    const read = vi.fn<Read>((view) =>
      view.snapshot_id === 1 ? Promise.resolve("lines of 1") : Promise.reject(viewChanged()),
    );
    // The Rust side answers what it holds when the test lets it, so that two readings ask.
    const answers: ((open: WorkspaceOpen) => void)[] = [];
    const { result, current } = screenWith(
      read,
      openStart(),
      () =>
        new Promise<WorkspaceOpen>((resolve) => {
          answers.push(resolve);
        }),
    );
    // A second reading of the same screen is refused in the same way, and asks as well.
    const holds = vi.fn<(view: ViewRef) => Promise<string>>((view) =>
      view.snapshot_id === 1 ? Promise.resolve("holds of 1") : Promise.reject(viewChanged()),
    );
    const beside = renderHook(() => useSnapshotQuery({ name: "holds", params: [], read: holds }), {
      wrapper,
    });
    await waitFor(() => {
      expect(answers).toHaveLength(2);
    });
    expect(notices).toEqual([]);
    act(() => {
      for (const answer of answers) answer(opened({ selected: 1 }));
    });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 1");
    });
    await waitFor(() => {
      expect(beside.result.current.data).toBe("holds of 1");
    });
    expect(current).toHaveBeenCalledTimes(2);
    // The notice is the shell's, with a title and a text from the catalog. It is not an error.
    expect(notices).toEqual([
      { title: en.shell.viewResyncedTitle, text: en.shell.viewResyncedText },
    ]);
    expect(en.shell.viewResyncedText).toMatch(/shows the one that is open/i);
    expect(en.shell.viewResyncedText).toMatch(/do it again/i);
    expect(result.current.lines.isError).toBe(false);
    expect(beside.result.current.isError).toBe(false);
  });

  it("takes it as well when the Rust side holds no workspace: nothing is open, and nothing more is read", async () => {
    const read = vi.fn<Read>(() => Promise.reject(viewChanged()));
    const start = openStart();
    const { result, current } = screenWith(read, start, () => null);
    await waitFor(() => {
      expect(queryClient.getQueryData<AppStart>(keys.start)?.open).toBeNull();
    });
    expect(queryClient.getQueryData<AppStart>(keys.start)).toEqual({ ...start, open: null });
    // No workspace is open, so the notice does not speak of one that is.
    expect(notices).toEqual([
      { title: en.shell.viewResyncedTitle, text: en.shell.viewResyncedNoneText },
    ]);
    expect(en.shell.viewResyncedNoneText).toMatch(/no workspace is open/i);
    expect(en.shell.viewResyncedNoneText).not.toMatch(/the one that is open/i);
    expect(en.shell.viewResyncedNoneText).toMatch(/do it again/i);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(read).toHaveBeenCalledTimes(5);
    expect(current).toHaveBeenCalledTimes(1);
    expect(result.current.lines.isError).toBe(false);
    expect(result.current.lines.fetchStatus).toBe("idle");
  });

  it("takes the answer of the Rust side also when the screen that asked has gone meanwhile", async () => {
    const read = vi.fn<Read>(() => Promise.reject(viewChanged()));
    const answers: ((open: WorkspaceOpen) => void)[] = [];
    const start = openStart();
    const { unmount, current } = screenWith(
      read,
      start,
      () =>
        new Promise<WorkspaceOpen>((resolve) => {
          answers.push(resolve);
        }),
    );
    await waitFor(() => {
      expect(answers).toHaveLength(1);
    });
    // The user leaves the page while the Rust side is being asked what it holds.
    unmount();
    await act(async () => {
      answers[0]?.(opened({ selected: 1 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // What it holds is what every page shows from now on, and the user is told.
    expect(queryClient.getQueryData<AppStart>(keys.start)).toEqual({
      ...start,
      open: opened({ selected: 1 }),
    });
    expect(notices).toEqual([
      { title: en.shell.viewResyncedTitle, text: en.shell.viewResyncedText },
    ]);
    // The reading itself is over: its screen is not there.
    expect(read).toHaveBeenCalledTimes(5);
    expect(current).toHaveBeenCalledTimes(1);
  });

  it("discards the answer of the Rust side when an action on the open workspace was asked for meanwhile", async () => {
    const read = vi.fn<Read>((view) =>
      view.snapshot_id === 2 ? Promise.reject(viewChanged()) : Promise.resolve("lines of 1"),
    );
    const answers: ((open: WorkspaceOpen) => void)[] = [];
    const start = openStart();
    const { result, finish, current } = screenWith(
      read,
      start,
      () =>
        new Promise<WorkspaceOpen>((resolve) => {
          answers.push(resolve);
        }),
    );
    await waitFor(() => {
      expect(answers).toHaveLength(1);
    });
    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.action.isPending).toBe(true);
    });
    // The answer is of before the action: the action will say what is open when it is done.
    await act(async () => {
      answers[0]?.(opened({ workspace: otherWorkspace }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(queryClient.getQueryData<AppStart>(keys.start)).toEqual(start);
    expect(notices).toEqual([]);

    // Also once the action is over, an answer that was asked for before it is not taken.
    await finish({ ...start, open: opened({ selected: 1 }) });
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 1");
    });
    expect(queryClient.getQueryData<AppStart>(keys.start)?.open?.workspace.id).toBe(workspace().id);
    expect(notices).toEqual([]);
    expect(current).toHaveBeenCalledTimes(1);
  });

  it("discards the answer as well when an action was asked for and was over before the answer came", async () => {
    const read = vi.fn<Read>((view) =>
      view.snapshot_id === 2 ? Promise.reject(viewChanged()) : Promise.resolve("lines of 1"),
    );
    const answers: ((open: WorkspaceOpen) => void)[] = [];
    const start = openStart();
    const { result, finish } = screenWith(
      read,
      start,
      () =>
        new Promise<WorkspaceOpen>((resolve) => {
          answers.push(resolve);
        }),
    );
    await waitFor(() => {
      expect(answers).toHaveLength(1);
    });
    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.action.isPending).toBe(true);
    });
    await finish({ ...start, open: opened({ selected: 1 }) });
    await waitFor(() => {
      expect(result.current.action.isSuccess).toBe(true);
    });
    // No action runs now, and the answer is still older than what the action opened.
    await act(async () => {
      answers[0]?.(opened({ workspace: otherWorkspace }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(queryClient.getQueryData<AppStart>(keys.start)?.open).toEqual(opened({ selected: 1 }));
    expect(notices).toEqual([]);
  });

  it("reads once more when the Rust side holds the same view, and takes the answer", async () => {
    let refusals = 5;
    const read = vi.fn<Read>(() => {
      refusals -= 1;
      return refusals >= 0 ? Promise.reject(viewChanged()) : Promise.resolve("lines of 2");
    });
    const { result, appStart, current } = screenWith(read);
    await waitFor(() => {
      expect(result.current.lines.data).toBe("lines of 2");
    });
    expect(read).toHaveBeenCalledTimes(6);
    expect(current).toHaveBeenCalledTimes(1);
    expect(appStart).not.toHaveBeenCalled();
    expect(result.current.lines.isError).toBe(false);
    // Nothing on screen changed, so the shell has nothing to say.
    expect(notices).toEqual([]);
  });

  it("gives an error that says what to do when the view is refused again after the Rust side said it holds that view, and reads again on a retry", async () => {
    let settled = false;
    const read = vi.fn<Read>(() =>
      settled ? Promise.resolve("lines of 2") : Promise.reject(viewChanged()),
    );
    const { result, appStart, current } = screenWith(read);
    await waitFor(() => {
      expect(result.current.lines.isError).toBe(true);
    });
    // Five answers, the question what is open once, a sixth answer, and then it stops.
    expect(read).toHaveBeenCalledTimes(6);
    expect(current).toHaveBeenCalledTimes(1);
    expect(appStart).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    expect(result.current.lines.error).toMatchObject({
      kind: VIEW_UNSETTLED,
      message: en.errors.viewUnsettled,
    });
    expect(en.errors.viewUnsettled).toMatch(/restart Hold Explorer/i);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(read).toHaveBeenCalledTimes(6);
    expect(current).toHaveBeenCalledTimes(1);

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

  it("gives that error as well when the Rust side cannot say what it holds", async () => {
    const read = vi.fn<Read>(() => Promise.reject(viewChanged()));
    const { result, appStart, current } = screenWith(read, openStart(), () => {
      throw commandFailure("Io", "The workspace file could not be read.");
    });
    await waitFor(() => {
      expect(result.current.lines.isError).toBe(true);
    });
    expect(result.current.lines.error).toMatchObject({ kind: VIEW_UNSETTLED });
    expect(current).toHaveBeenCalledTimes(1);
    expect(appStart).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    expect(read).toHaveBeenCalledTimes(5);
    // What the interface held is still what it holds, and the start itself is not a failed one.
    expect(queryClient.getQueryData<AppStart>(keys.start)?.open?.selected).toBe(2);
    expect(queryClient.getQueryState(keys.start)?.status).toBe("success");
  });

  it("stops for good when the screen goes during the first reading: nothing more is read, and the Rust side is asked nothing", async () => {
    const { read, waiting } = heldRead();
    const { unmount, appStart, current } = screenWith(read);
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
    expect(current).not.toHaveBeenCalled();
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
    const { unmount, appStart, current } = screenWith(read);
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
    expect(current).not.toHaveBeenCalled();
    expect(appStart).not.toHaveBeenCalled();
  });

  it("does not ask what is open for a reading that was dropped while it waited to read again", async () => {
    const read = vi.fn<Read>(() => Promise.reject(viewChanged()));
    const { unmount, appStart, current } = screenWith(read);
    // Four refusals are in; the screen goes before the fifth.
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(4);
    });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(read.mock.calls.length).toBeLessThanOrEqual(5);
    expect(current).not.toHaveBeenCalled();
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

describe("useSnapshotPages", () => {
  it("reads the first page at offset 0, for the view of the cached start, and gives its rows and its total", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(pageOf(view, offset, sort)),
    );
    const { result } = tableWith(read);
    // A first load: nothing to show yet.
    expect(result.current.lines.isPending).toBe(true);
    expect(result.current.lines.rows).toEqual([]);
    expect(result.current.lines.first).toBeUndefined();
    expect(result.current.lines.total).toBeUndefined();
    expect(result.current.lines.hasMore).toBe(false);
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(HERE, 0, "oldest");
    const { lines } = result.current;
    expect(lines.first).toEqual({ total: 5, rows: ["oldest 2:0", "oldest 2:1"], widest: 21 });
    expect(lines.total).toBe(5);
    expect(lines.hasMore).toBe(true);
    expect(lines.isPending).toBe(false);
    expect(lines.isLoadingMore).toBe(false);
    expect(lines.isRefetching).toBe(false);
    expect(lines.isPlaceholderData).toBe(false);
    expect(lines.error).toBeNull();
    // The pages are kept under the key every reading for a snapshot has: view, name, params.
    expect(queryClient.getQueryData(keys.snapshotPages(HERE, "lines", ["oldest"]))).toMatchObject({
      pages: [lines.first],
    });
  });

  it("reads the next page at the number of rows loaded, and joins the rows in order", async () => {
    const { read, waiting } = heldPages();
    const { result } = tableWith(read);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });

    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    expect(read).toHaveBeenLastCalledWith(HERE, 2, "oldest");
    await waitFor(() => {
      expect(result.current.lines.isLoadingMore).toBe(true);
    });
    // The rows that are there stay as they are while the next ones are on their way.
    expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    expect(result.current.lines.isPlaceholderData).toBe(false);
    expect(result.current.lines.isRefetching).toBe(false);
    act(() => {
      waiting[1]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual([
        "oldest 2:0",
        "oldest 2:1",
        "oldest 2:2",
        "oldest 2:3",
      ]);
    });
    expect(result.current.lines.isLoadingMore).toBe(false);
    expect(result.current.lines.hasMore).toBe(true);

    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(3);
    });
    expect(read).toHaveBeenLastCalledWith(HERE, 4, "oldest");
    act(() => {
      waiting[2]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(5);
    });
    expect(result.current.lines.rows.at(-1)).toBe("oldest 2:4");
    // The first page is still the first page as it was answered, and the total is its total.
    expect(result.current.lines.first).toEqual(pageOf(HERE, 0, "oldest"));
    expect(result.current.lines.total).toBe(5);
  });

  it("has no more once the rows loaded are as many as the total, and then reads nothing", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(pageOf(view, offset, sort, 2)),
    );
    const { result } = tableWith(read);
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    expect(result.current.lines.total).toBe(2);
    expect(result.current.lines.hasMore).toBe(false);
    act(() => {
      result.current.lines.loadMore();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.lines.isLoadingMore).toBe(false);
  });

  it("has no rows and no more when the reading selects nothing", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(pageOf(view, offset, sort, 0)),
    );
    const { result } = tableWith(read);
    await waitFor(() => {
      expect(result.current.lines.total).toBe(0);
    });
    expect(result.current.lines.rows).toEqual([]);
    expect(result.current.lines.hasMore).toBe(false);
    expect(result.current.lines.isPending).toBe(false);
  });

  it("sends nothing for a second loadMore while one is on its way", async () => {
    const { read, waiting } = heldPages();
    const { result } = tableWith(read);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });

    // Twice in one turn, as two scroll events do, and once more when the screen knows it loads.
    act(() => {
      result.current.lines.loadMore();
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(result.current.lines.isLoadingMore).toBe(true);
    });
    act(() => {
      result.current.lines.loadMore();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(waiting).toHaveLength(2);
    expect(waiting[1]?.offset).toBe(2);

    act(() => {
      waiting[1]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(4);
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps the rows of before as placeholder data when the params change, and replaces them whole", async () => {
    const { read, waiting } = heldPages();
    const { result, rerender } = tableWith(read);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    act(() => {
      waiting[1]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(4);
    });
    const before = result.current.lines.rows;

    // Another order: the first page of it is asked for, and the rows of before stand in.
    const seen: (readonly string[])[] = [];
    const watch = setInterval(() => {
      seen.push(result.current.lines.rows);
    }, 2);
    rerender({ sort: "newest" });
    await waitFor(() => {
      expect(waiting).toHaveLength(3);
    });
    expect(waiting[2]).toMatchObject({ view: HERE, offset: 0, sort: "newest" });
    expect(result.current.lines.rows).toEqual(before);
    expect(result.current.lines.isPlaceholderData).toBe(true);
    expect(result.current.lines.isPending).toBe(false);
    // Rows that stand in are not rows that are read again.
    expect(result.current.lines.isRefetching).toBe(false);
    // Rows that stand in are not added to: the next page would be of the order of before.
    act(() => {
      result.current.lines.loadMore();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(waiting).toHaveLength(3);

    act(() => {
      waiting[2]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual(["newest 2:0", "newest 2:1"]);
    });
    clearInterval(watch);
    expect(result.current.lines.isPlaceholderData).toBe(false);
    expect(result.current.lines.first).toEqual(pageOf(HERE, 0, "newest"));
    // At no moment were rows of the two orders on screen together.
    for (const rows of seen) {
      expect(new Set(rows.map((row) => row.split(" ")[0])).size).toBeLessThanOrEqual(1);
    }
  });

  it("drops a page that is on its way when an action on the open workspace starts, and reads page zero again for the new view", async () => {
    const { read, waiting } = heldPages();
    const start = openStart();
    const { result, finish } = tableWith(read, start);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });

    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.lines.isLoadingMore).toBe(false);
    });
    // The page arrives after all. The Rust side may have answered it for either view.
    await act(async () => {
      waiting[1]?.answer();
      await Promise.resolve();
    });
    expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    // Nothing is read while the action runs, also when the table asks for more.
    act(() => {
      result.current.lines.loadMore();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(waiting).toHaveLength(2);

    await finish({ ...start, open: opened({ selected: 1 }) });
    await waitFor(() => {
      expect(waiting).toHaveLength(3);
    });
    expect(waiting[2]).toMatchObject({ view: OLDER, offset: 0, sort: "oldest" });
    expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    expect(result.current.lines.isPlaceholderData).toBe(true);
    act(() => {
      waiting[2]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual(["oldest 1:0", "oldest 1:1"]);
    });
    expect(result.current.lines.isPlaceholderData).toBe(false);
    expect(queryClient.getQueryData(keys.snapshotPages(HERE, "lines", ["oldest"]))).toMatchObject({
      pages: [pageOf(HERE, 0, "oldest")],
    });
  });

  it("reads a later page again when the command answers that the view changed, and never shows that answer", async () => {
    let refusals = 2;
    const read = vi.fn<ReadPage>((view, offset, sort) => {
      if (offset > 0 && refusals > 0) {
        refusals -= 1;
        return Promise.reject(viewChanged());
      }
      return Promise.resolve(pageOf(view, offset, sort));
    });
    const { result } = tableWith(read);
    const seen: unknown[] = [];
    const watch = setInterval(() => {
      if (result.current.lines.error !== null) seen.push(result.current.lines.error);
    }, 5);
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual([
        "oldest 2:0",
        "oldest 2:1",
        "oldest 2:2",
        "oldest 2:3",
      ]);
    });
    clearInterval(watch);
    expect(read.mock.calls.map(([, offset]) => offset)).toEqual([0, 2, 2, 2]);
    expect(seen).toEqual([]);
    expect(result.current.lines.error).toBeNull();
  });

  it("asks which workspace and snapshot are open after five such answers, as every reading does, and reads page zero for the view it is told", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      view.snapshot_id === 1
        ? Promise.resolve(pageOf(view, offset, sort))
        : Promise.reject(viewChanged()),
    );
    const { result, appStart, current } = tableWith(read, openStart(), () =>
      opened({ selected: 1 }),
    );
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual(["oldest 1:0", "oldest 1:1"]);
    });
    expect(read.mock.calls.map(([view, offset]) => [view.snapshot_id, offset])).toEqual([
      [2, 0],
      [2, 0],
      [2, 0],
      [2, 0],
      [2, 0],
      [1, 0],
    ]);
    expect(current).toHaveBeenCalledTimes(1);
    expect(appStart).not.toHaveBeenCalled();
    expect(notices).toHaveLength(1);
    expect(result.current.lines.error).toBeNull();
  });

  it("gives any other failure as the error it is, and reads again on a retry", async () => {
    let failing = true;
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      failing
        ? Promise.reject(commandFailure("Io", "The workspace file could not be read."))
        : Promise.resolve(pageOf(view, offset, sort)),
    );
    const { result } = tableWith(read);
    await waitFor(() => {
      expect(result.current.lines.error).toMatchObject({ kind: "Io" });
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.lines.rows).toEqual([]);

    failing = false;
    act(() => {
      result.current.lines.refetch();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    expect(result.current.lines.error).toBeNull();
    expect(read).toHaveBeenLastCalledWith(HERE, 0, "oldest");
  });

  it("does not ask again for a later page that failed, however often the table asks for more, and reads it once on a retry", async () => {
    let failing = true;
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      offset > 0 && failing
        ? Promise.reject(commandFailure("Io", "The workspace file could not be read."))
        : Promise.resolve(pageOf(view, offset, sort)),
    );
    const { result } = tableWith(read);
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(result.current.lines.error).toMatchObject({ kind: "Io" });
    });
    expect(read).toHaveBeenCalledTimes(2);
    // The rows that are there stay, and there are more: only the page after them failed.
    expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    expect(result.current.lines.hasMore).toBe(true);
    expect(result.current.lines.isLoadingMore).toBe(false);

    // A table that is at the end of its rows asks for more whenever it looks.
    for (let asked = 0; asked < 3; asked += 1) {
      act(() => {
        result.current.lines.loadMore();
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.lines.error).toMatchObject({ kind: "Io" });

    // The retry of the screen reads the page that failed, once, and no page that is there.
    failing = false;
    act(() => {
      result.current.lines.refetch();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(4);
    });
    expect(read).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenLastCalledWith(HERE, 2, "oldest");
    expect(result.current.lines.error).toBeNull();
  });

  /**
   * A table whose second page failed and was not tried again. The reading fails for every page
   * after the first until the test says otherwise.
   */
  async function afterFailedPage() {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      offset > 0
        ? Promise.reject(commandFailure("Io", "The workspace file could not be read."))
        : Promise.resolve(pageOf(view, offset, sort)),
    );
    const table = tableWith(read);
    await waitFor(() => {
      expect(table.result.current.lines.rows).toHaveLength(2);
    });
    act(() => {
      table.result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(table.result.current.lines.error).toMatchObject({ kind: "Io" });
    });
    expect(read.mock.calls.map(([, offset]) => offset)).toEqual([0, 2]);
    return { ...table, read };
  }

  // The one state in which loaded pages are read again without an invalidation. The query
  // library marks a reading whose last fetch failed as invalid, whatever its stale time. These
  // two cases say what follows from that, so that a new version of the library that does it
  // otherwise is noticed, and the rule at the top of view.ts is changed with it.
  it("reads the loaded pages once more when an action ends with the view as it was after a page failed, and then tries that page again when asked", async () => {
    const { result, finish, read } = await afterFailedPage();
    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.action.isPending).toBe(true);
    });
    await finish(null);
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(3);
    });
    await waitFor(() => {
      expect(result.current.lines.error).toBeNull();
    });
    // The page that was loaded is read again, once, and not the page that failed.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(read.mock.calls.map(([, offset]) => offset)).toEqual([0, 2, 0]);
    expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    expect(result.current.lines.hasMore).toBe(true);

    // With the error gone, a table that asks for more sends the page that failed one more time.
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(result.current.lines.error).toMatchObject({ kind: "Io" });
    });
    expect(read.mock.calls.map(([, offset]) => offset)).toEqual([0, 2, 0, 2]);
    // And only once: the error is set again.
    act(() => {
      result.current.lines.loadMore();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("reads the loaded pages once more when the screen comes back after a page failed", async () => {
    const { unmount, read } = await afterFailedPage();
    unmount();
    const back = tableWith(read);
    await waitFor(() => {
      expect(read).toHaveBeenCalledTimes(3);
    });
    await waitFor(() => {
      expect(back.result.current.lines.error).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(read.mock.calls.map(([, offset]) => offset)).toEqual([0, 2, 0]);
    expect(back.result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
  });

  it("ends the loading when a page comes without rows, though the total says there are more", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(
        offset === 0 ? pageOf(view, offset, sort) : { total: 5, rows: [], widest: 21 },
      ),
    );
    const { result } = tableWith(read);
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    expect(result.current.lines.hasMore).toBe(true);
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(result.current.lines.hasMore).toBe(false);
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    expect(result.current.lines.total).toBe(5);
    // The same offset is not asked for again.
    for (let asked = 0; asked < 3; asked += 1) {
      act(() => {
        result.current.lines.loadMore();
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.lines.error).toBeNull();
  });

  /** A table whose first two pages are loaded, with the reading still held by the test. */
  async function twoPages(start: AppStart = openStart()) {
    const { read, waiting } = heldPages();
    const table = tableWith(read, start);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.answer();
    });
    await waitFor(() => {
      expect(table.result.current.lines.rows).toHaveLength(2);
    });
    act(() => {
      table.result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    act(() => {
      waiting[1]?.answer();
    });
    await waitFor(() => {
      expect(table.result.current.lines.rows).toHaveLength(4);
    });
    return { ...table, read, waiting };
  }

  it("reads no page again after an action on the workspace that leaves the view as it was", async () => {
    const { result, finish, read } = await twoPages();
    const before = result.current.lines.rows;
    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.action.isPending).toBe(true);
    });
    // A rename: the workspace and the snapshot in view are the ones of before.
    await finish(null);
    await waitFor(() => {
      expect(result.current.action.isSuccess).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.lines.rows).toBe(before);
    expect(result.current.lines.isPlaceholderData).toBe(false);
    expect(result.current.lines.isRefetching).toBe(false);
  });

  it("reads nothing when the table goes and comes back with the same key", async () => {
    const { unmount, read } = await twoPages();
    unmount();
    const back = tableWith(read);
    // The rows are there at once, and nothing asks for them again.
    expect(back.result.current.lines.rows).toHaveLength(4);
    expect(back.result.current.lines.isPending).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(read).toHaveBeenCalledTimes(2);
    expect(back.result.current.lines.isRefetching).toBe(false);
  });

  it("reads the loaded pages again when the readings of the snapshots are invalidated, and says so meanwhile", async () => {
    const { result, read, waiting } = await twoPages();
    expect(result.current.lines.isRefetching).toBe(false);
    // What a command does that changes the data of a snapshot.
    act(() => {
      void queryClient.invalidateQueries({ queryKey: keys.snapshots });
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(3);
    });
    expect(waiting[2]).toMatchObject({ view: HERE, offset: 0, sort: "oldest" });
    await waitFor(() => {
      expect(result.current.lines.isRefetching).toBe(true);
    });
    // The rows of before stay on screen, as the rows of this reading, and nothing is added to them.
    expect(result.current.lines.rows).toHaveLength(4);
    expect(result.current.lines.isPlaceholderData).toBe(false);
    expect(result.current.lines.isLoadingMore).toBe(false);
    act(() => {
      result.current.lines.loadMore();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(waiting).toHaveLength(3);

    act(() => {
      waiting[2]?.answer();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(4);
    });
    expect(waiting[3]).toMatchObject({ view: HERE, offset: 2, sort: "oldest" });
    expect(result.current.lines.isRefetching).toBe(true);
    act(() => {
      waiting[3]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.isRefetching).toBe(false);
    });
    expect(result.current.lines.rows).toHaveLength(4);
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("drops a page that is on its way when an action starts that leaves the view as it was, and reads it when the table asks again", async () => {
    const { read, waiting } = heldPages();
    const { result, finish } = tableWith(read);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.lines.isLoadingMore).toBe(false);
    });
    await act(async () => {
      waiting[1]?.answer();
      await Promise.resolve();
    });
    await finish(null);
    await waitFor(() => {
      expect(result.current.action.isSuccess).toBe(true);
    });
    // The page that was dropped is not kept, and nothing reads by itself.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(waiting).toHaveLength(2);
    expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    expect(result.current.lines.hasMore).toBe(true);

    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(3);
    });
    expect(waiting[2]).toMatchObject({ view: HERE, offset: 2, sort: "oldest" });
    act(() => {
      waiting[2]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(4);
    });
  });

  it("reads the first page once the action is over that dropped it and left the view as it was", async () => {
    const { read, waiting } = heldPages();
    const { result, finish } = tableWith(read);
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.action.isPending).toBe(true);
    });
    await act(async () => {
      waiting[0]?.answer();
      await Promise.resolve();
    });
    expect(result.current.lines.rows).toEqual([]);
    // Nothing is there for this key, so it is read: that the pages are never stale is about pages.
    await finish(null);
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    expect(waiting[1]).toMatchObject({ view: HERE, offset: 0, sort: "oldest" });
    act(() => {
      waiting[1]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    });
  });

  it("keeps its pages apart from a plain reading of the same name and params", async () => {
    const page = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(pageOf(view, offset, sort)),
    );
    const { result } = tableWith(page);
    const plain = renderHook(
      () =>
        useSnapshotQuery({
          name: "lines",
          params: ["oldest"],
          read: (view, sort) => Promise.resolve(`${sort} lines of ${String(view.snapshot_id)}`),
        }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    await waitFor(() => {
      expect(plain.result.current.data).toBe("oldest lines of 2");
    });
    const plainKey = keys.snapshot(HERE, "lines", ["oldest"]);
    const pagesKey = keys.snapshotPages(HERE, "lines", ["oldest"]);
    expect(pagesKey).not.toEqual(plainKey);
    expect(queryClient.getQueryData(plainKey)).toBe("oldest lines of 2");
    expect(queryClient.getQueryData(pagesKey)).toMatchObject({
      pages: [pageOf(HERE, 0, "oldest")],
    });
    // Both are readings of a snapshot: an action on the workspace and an invalidation find both.
    for (const key of [plainKey, pagesKey]) {
      expect(key.slice(0, keys.snapshots.length)).toEqual(keys.snapshots);
      expect(key.slice(1, 4)).toEqual([HERE.workspace_id, HERE.snapshot_id, "lines"]);
      expect(key.at(-1)).toBe("oldest");
    }
    expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
  });

  it("keeps loadMore and refetch the same functions from one render to the next", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(pageOf(view, offset, sort)),
    );
    const { result, rerender } = tableWith(read);
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    const { loadMore, refetch } = result.current.lines;
    rerender({ sort: "oldest" });
    expect(result.current.lines.loadMore).toBe(loadMore);
    expect(result.current.lines.refetch).toBe(refetch);
    // An effect that depends on them does not run again for a render that changed nothing.
    rerender({ sort: "oldest" });
    expect(result.current.lines.loadMore).toBe(loadMore);
    expect(result.current.lines.refetch).toBe(refetch);
  });

  it("asks which workspace and snapshot are open after five such answers for a later page: the pages of the view of before stay under its key, and page zero is read for the view it is told", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      view.snapshot_id === 2 && offset > 0
        ? Promise.reject(viewChanged())
        : Promise.resolve(pageOf(view, offset, sort)),
    );
    const { result, appStart, current } = tableWith(read, openStart(), () =>
      opened({ selected: 1 }),
    );
    const seen: unknown[] = [];
    const watch = setInterval(() => {
      if (result.current.lines.error !== null) seen.push(result.current.lines.error);
    }, 5);
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual(["oldest 2:0", "oldest 2:1"]);
    });
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual(["oldest 1:0", "oldest 1:1"]);
    });
    clearInterval(watch);
    expect(read.mock.calls.map(([view, offset]) => [view.snapshot_id, offset])).toEqual([
      [2, 0],
      [2, 2],
      [2, 2],
      [2, 2],
      [2, 2],
      [2, 2],
      [1, 0],
    ]);
    expect(current).toHaveBeenCalledTimes(1);
    expect(appStart).not.toHaveBeenCalled();
    expect(notices).toHaveLength(1);
    expect(seen).toEqual([]);
    expect(result.current.lines.isPlaceholderData).toBe(false);
    // The view of before keeps the page it had, without the page that was refused and without an error.
    const gone = queryClient.getQueryState(keys.snapshotPages(HERE, "lines", ["oldest"]));
    expect(gone?.data).toMatchObject({ pages: [pageOf(HERE, 0, "oldest")] });
    expect(gone?.error ?? null).toBeNull();
    expect(gone?.fetchStatus).toBe("idle");
  });

  it("reads nothing while no workspace is open", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(pageOf(view, offset, sort)),
    );
    const { result } = tableWith(read, startState());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.lines.rows).toEqual([]);
    act(() => {
      result.current.lines.loadMore();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
  });

  it("names the result its rows belong to: the same while the rows of before stand in, another with the first new page", async () => {
    const { read, waiting } = heldPages();
    // Every render of the screen, as the hook gave it: the key and the rows it was rendered with.
    const seen: { key: string; rows: readonly string[] }[] = [];
    const start = openStart();
    const { result, rerender } = renderScreen(
      ({ sort }: { sort: string }) => {
        const pages = useSnapshotPages({ name: "lines", params: [sort], read });
        seen.push({ key: pages.resultKey, rows: pages.rows });
        return pages;
      },
      { sort: "oldest" },
      start,
      () => start.open,
    );
    await waitFor(() => {
      expect(waiting).toHaveLength(1);
    });
    act(() => {
      waiting[0]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    const oldest = result.current.lines.resultKey;
    expect(oldest).not.toBe("");

    // A page more is the same result.
    act(() => {
      result.current.lines.loadMore();
    });
    await waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    act(() => {
      waiting[1]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(4);
    });
    expect(result.current.lines.resultKey).toBe(oldest);

    // Another order: while its first page is on its way the rows of before stand in, and the key
    // still names them, at every render.
    seen.length = 0;
    rerender({ sort: "newest" });
    await waitFor(() => {
      expect(waiting).toHaveLength(3);
    });
    expect(result.current.lines.isPlaceholderData).toBe(true);
    expect(result.current.lines.resultKey).toBe(oldest);
    // A chain of changes before any of them answered: the rows that stand in are still those.
    rerender({ sort: "largest" });
    await waitFor(() => {
      expect(waiting).toHaveLength(4);
    });
    expect(result.current.lines.isPlaceholderData).toBe(true);
    expect(result.current.lines.resultKey).toBe(oldest);

    act(() => {
      waiting[3]?.answer();
    });
    await waitFor(() => {
      expect(result.current.lines.rows).toEqual(["largest 2:0", "largest 2:1"]);
    });
    const largest = result.current.lines.resultKey;
    expect(largest).not.toBe(oldest);
    // The key changed in the same render as the rows, never before and never after them.
    for (const { key, rows } of seen) {
      expect(key).toBe(rows[0]?.startsWith("largest") === true ? largest : oldest);
    }
    // Renders with the rows of before and with the new rows were both seen.
    expect(seen.some(({ key }) => key === oldest)).toBe(true);
    expect(seen.some(({ key }) => key === largest)).toBe(true);

    // Back to an order whose pages are kept: its key comes back with its rows.
    rerender({ sort: "oldest" });
    await waitFor(() => {
      expect(result.current.lines.rows[0]).toBe("oldest 2:0");
    });
    expect(result.current.lines.resultKey).toBe(oldest);
  });

  it("reads nothing while it is not enabled, and keeps what it has", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(pageOf(view, offset, sort)),
    );
    const start = openStart();
    const { result, rerender } = renderScreen(
      ({ sort, enabled }: { sort: string; enabled: boolean }) =>
        useSnapshotPages({ name: "lines", params: [sort], read, enabled }),
      { sort: "oldest", enabled: false },
      start,
      () => start.open,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.lines.isPending).toBe(true);

    rerender({ sort: "oldest", enabled: true });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    expect(read).toHaveBeenCalledTimes(1);

    // Another order while it is not enabled: nothing is read, and nothing is added.
    rerender({ sort: "newest", enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.lines.loadMore();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads nothing on a retry while it is not enabled, or while an action runs", async () => {
    const read = vi.fn<ReadPage>((view, offset, sort) =>
      Promise.resolve(pageOf(view, offset, sort)),
    );
    const start = openStart();
    const { result, rerender } = renderScreen(
      ({ enabled }: { enabled: boolean }) =>
        useSnapshotPages({ name: "lines", params: ["oldest"], read, enabled }),
      { enabled: false },
      start,
      () => start.open,
    );
    act(() => {
      result.current.lines.refetch();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.lines.isPending).toBe(true);

    rerender({ enabled: true });
    await waitFor(() => {
      expect(result.current.lines.rows).toHaveLength(2);
    });
    expect(read).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.action.mutate(1);
    });
    await waitFor(() => {
      expect(result.current.action.isPending).toBe(true);
    });
    act(() => {
      result.current.lines.refetch();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.lines.rows).toHaveLength(2);
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
