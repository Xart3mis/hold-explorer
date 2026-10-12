import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "../bindings/Settings";
import type { Theme } from "../bindings/Theme";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import { opened, openStart, otherWorkspace, workspace } from "../test/fixtures";
import { commandFailure, mockCommands, type Handlers } from "../test/ipc";
import { queryClient } from "./query";
import { useApp } from "./useApp";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** The hook once the application start has answered, with a workspace open. */
async function loaded(handlers: Handlers) {
  const start = openStart();
  mockCommands({ app_start: () => start, workspace_list: () => start.list, ...handlers });
  const hook = renderHook(() => useApp(), { wrapper });
  await waitFor(() => {
    expect(hook.result.current.start).toBeDefined();
  });
  return hook;
}

/** A command whose answers the test gives one by one, in the order the calls arrived. */
function held<Result>() {
  const waiting: { resolve: (value: Result) => void; reject: (reason: unknown) => void }[] = [];
  const handler = vi.fn(
    () =>
      new Promise<Result>((resolve, reject) => {
        waiting.push({ resolve, reject });
      }),
  );
  return { handler, waiting };
}

const settings = (theme: Theme): Settings => ({ theme, workspace_dir: null, last_workspace: null });

describe("useApp: the order of actions", () => {
  it("runs the actions that change the open workspace one after another", async () => {
    const open = held<WorkspaceOpen>();
    const select = vi.fn(({ id }: { id: number }) =>
      opened({ workspace: otherWorkspace, selected: id }),
    );
    const { result } = await loaded({ workspace_open: open.handler, snapshot_select: select });
    expect(result.current.isBusy).toBe(false);

    act(() => {
      result.current.openWorkspace.mutate(otherWorkspace.id);
      result.current.selectSnapshot.mutate(1);
    });
    await waitFor(() => {
      expect(open.handler).toHaveBeenCalledTimes(1);
    });
    // The second action waits for the first: the Rust side never sees them out of order.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(select).not.toHaveBeenCalled();
    expect(result.current.isBusy).toBe(true);

    open.waiting[0]?.resolve(opened({ workspace: otherWorkspace }));
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ id: 1 });
    });
    await waitFor(() => {
      expect(result.current.isBusy).toBe(false);
    });
    expect(result.current.start?.open).toMatchObject({ workspace: otherWorkspace, selected: 1 });
  });

  it("says that an action is pending to every reader, not only to the one that started it", async () => {
    const open = held<WorkspaceOpen>();
    mockCommands({ app_start: () => openStart(), workspace_open: open.handler });
    const first = renderHook(() => useApp(), { wrapper });
    const second = renderHook(() => useApp(), { wrapper });
    await waitFor(() => {
      expect(first.result.current.start).toBeDefined();
    });
    act(() => {
      first.result.current.openWorkspace.mutate(otherWorkspace.id);
    });
    await waitFor(() => {
      expect(second.result.current.isBusy).toBe(true);
    });
    expect(second.result.current.openWorkspace.isPending).toBe(false);
    open.waiting[0]?.resolve(opened({ workspace: otherWorkspace }));
    await waitFor(() => {
      expect(second.result.current.isBusy).toBe(false);
    });
  });

  it("runs a queued action even when the one before it failed", async () => {
    const select = vi.fn(({ id }: { id: number }) => opened({ selected: id }));
    const { result } = await loaded({
      workspace_open: () => {
        throw commandFailure("WorkspaceNotFound", "That workspace is not in the workspace folder.");
      },
      snapshot_select: select,
    });
    act(() => {
      result.current.openWorkspace.mutate("gone");
      result.current.selectSnapshot.mutate(1);
    });
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ id: 1 });
    });
    await waitFor(() => {
      expect(result.current.isBusy).toBe(false);
    });
    expect(result.current.start?.open?.selected).toBe(1);
  });
});

describe("useApp: renaming", () => {
  it("renames the workspace it was asked to rename while that one is open", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { result } = await loaded({ workspace_rename: rename });
    await act(() =>
      result.current.renameWorkspace.mutateAsync({ id: workspace().id, name: "Area 9" }),
    );
    expect(rename).toHaveBeenCalledWith({ name: "Area 9" });
    await waitFor(() => {
      expect(result.current.start?.open?.workspace.name).toBe("Area 9");
    });
  });

  it("sends nothing when the workspace it was asked to rename is no longer the open one", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { result } = await loaded({ workspace_rename: rename });
    let failure: unknown;
    await act(async () => {
      await result.current.renameWorkspace
        .mutateAsync({ id: otherWorkspace.id, name: "Area 9" })
        .catch((error: unknown) => {
          failure = error;
        });
    });
    expect(rename).not.toHaveBeenCalled();
    expect(failure).toMatchObject({ kind: "WorkspaceChanged" });
    expect(result.current.start?.open?.workspace.name).toBe("Unit 573 piping");
  });

  it("checks which workspace is open when its turn comes, not when it was asked", async () => {
    const open = held<WorkspaceOpen>();
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { result } = await loaded({ workspace_open: open.handler, workspace_rename: rename });
    let failure: unknown;
    act(() => {
      result.current.openWorkspace.mutate(otherWorkspace.id);
      // Asked while Unit 573 piping is still open, but another workspace is being opened first.
      result.current.renameWorkspace.mutate(
        { id: workspace().id, name: "Area 9" },
        {
          onError: (error) => {
            failure = error;
          },
        },
      );
    });
    await waitFor(() => {
      expect(open.handler).toHaveBeenCalledTimes(1);
    });
    open.waiting[0]?.resolve(opened({ workspace: otherWorkspace }));
    await waitFor(() => {
      expect(failure).toMatchObject({ kind: "WorkspaceChanged" });
    });
    expect(rename).not.toHaveBeenCalled();
    expect(result.current.start?.open?.workspace.name).toBe("Tank farm");
  });
});

describe("useApp: importing", () => {
  const request = {
    target: { kind: "Existing", id: otherWorkspace.id },
    taken_at: "2026-10-14T08:00:00",
    date_edited: false,
    replace: null,
  } as const;
  const imported = (into = otherWorkspace): ImportDone => {
    const open = opened({ workspace: { ...into, snapshot_count: 6 } });
    const snapshot = open.snapshots.at(-1);
    if (!snapshot) throw new Error("The fixture has no snapshot.");
    return { open, snapshot };
  };

  it("writes the workspace the import opened into the start, and tells each phase", async () => {
    const heard: ImportPhase[] = [];
    const { result } = await loaded({
      import_commit: (args) => {
        args.onProgress.onmessage("Checking");
        args.onProgress.onmessage("Storing");
        return imported();
      },
    });
    act(() => {
      result.current.importCommit.mutate({
        request,
        onProgress: (phase) => heard.push(phase),
      });
    });
    await waitFor(() => {
      expect(result.current.start?.open?.workspace.id).toBe(otherWorkspace.id);
    });
    expect(heard).toEqual(["Checking", "Storing"]);
    // The entry of the list is the workspace as the import left it.
    expect(
      result.current.start?.list.workspaces.find((entry) => entry.id === otherWorkspace.id)
        ?.snapshot_count,
    ).toBe(6);
  });

  it("is one of the ordered actions: every reader sees it as pending, and what follows waits", async () => {
    const commit = held<ImportDone>();
    const select = vi.fn(({ id }: { id: number }) =>
      opened({ workspace: otherWorkspace, selected: id }),
    );
    const { result } = await loaded({ import_commit: commit.handler, snapshot_select: select });
    act(() => {
      result.current.importCommit.mutate({ request, onProgress: () => undefined });
      result.current.selectSnapshot.mutate(1);
    });
    await waitFor(() => {
      expect(commit.handler).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(select).not.toHaveBeenCalled();
    expect(result.current.isBusy).toBe(true);

    commit.waiting[0]?.resolve(imported());
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ id: 1 });
    });
    await waitFor(() => {
      expect(result.current.isBusy).toBe(false);
    });
  });

  it("sends no rename for the wrong workspace when an undo of a rename follows a commit at once", async () => {
    const commit = held<ImportDone>();
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { result } = await loaded({ import_commit: commit.handler, workspace_rename: rename });
    const errors: unknown[] = [];

    // The import goes into another workspace; the undo of an earlier rename of the workspace
    // that is open now is asked for before the import has answered.
    act(() => {
      result.current.importCommit.mutate({ request, onProgress: () => undefined });
      result.current.renameWorkspace.mutate(
        { id: workspace().id, name: "Unit 573 piping" },
        { onError: (error) => errors.push(error) },
      );
    });
    await waitFor(() => {
      expect(commit.handler).toHaveBeenCalledTimes(1);
    });
    expect(rename).not.toHaveBeenCalled();

    commit.waiting[0]?.resolve(imported());
    await waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    // The rename's turn came after the import had opened the other workspace: it sent nothing.
    expect(rename).not.toHaveBeenCalled();
    expect(errors[0]).toMatchObject({ kind: "WorkspaceChanged" });
    expect(result.current.start?.open?.workspace).toMatchObject({
      id: otherWorkspace.id,
      name: otherWorkspace.name,
    });
  });

  it("lists a workspace the import created, and reads the folder again", async () => {
    const created = workspace({ id: "d4e5f60718293041", name: "Unit 600", snapshot_count: 1 });
    const start = openStart();
    const list = vi
      .fn()
      .mockReturnValue({ ...start.list, workspaces: [...start.list.workspaces, created] });
    const { result } = await loaded({
      import_commit: () => imported(created),
      workspace_list: list,
    });
    list.mockClear();
    act(() => {
      result.current.importCommit.mutate({
        request: { ...request, target: { kind: "New", name: "Unit 600" } },
        onProgress: () => undefined,
      });
    });
    await waitFor(() => {
      expect(result.current.start?.open?.workspace.id).toBe(created.id);
    });
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(1);
    });
    expect(result.current.start?.list.workspaces.map((entry) => entry.id)).toContain(created.id);
  });

  it("leaves the start as it was when the import fails", async () => {
    const { result } = await loaded({
      import_commit: () => {
        throw commandFailure("AlreadyImported", "This file is already imported.");
      },
    });
    act(() => {
      result.current.importCommit.mutate({ request, onProgress: () => undefined });
    });
    await waitFor(() => {
      expect(result.current.importCommit.isError).toBe(true);
    });
    expect(result.current.start?.open?.workspace.id).toBe(workspace().id);
  });
});

describe("useApp: the theme", () => {
  it("keeps the second of two changes when the first fails after the second was asked for", async () => {
    const set = held<Settings>();
    const { result } = await loaded({ settings_set_theme: set.handler });
    act(() => {
      result.current.setTheme.mutate("Light");
      result.current.setTheme.mutate("System");
    });
    // The latest choice shows at once.
    await waitFor(() => {
      expect(result.current.start?.settings.theme).toBe("System");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    // The failure of the first does not take the second away.
    expect(result.current.start?.settings.theme).toBe("System");
    set.waiting[1]?.resolve(settings("System"));
    await waitFor(() => {
      expect(result.current.setTheme.isSuccess).toBe(true);
    });
    expect(result.current.start?.settings.theme).toBe("System");
  });

  it("goes back to the last saved theme when both of two changes fail", async () => {
    const set = held<Settings>();
    const { result } = await loaded({ settings_set_theme: set.handler });
    act(() => {
      result.current.setTheme.mutate("Light");
      result.current.setTheme.mutate("System");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    set.waiting[1]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(result.current.setTheme.isError).toBe(true);
    });
    // Dark is what the settings file holds; Light was never saved.
    expect(result.current.start?.settings.theme).toBe("Dark");
  });

  it("keeps the later choice on screen when the first of two changes succeeds first", async () => {
    const set = held<Settings>();
    const { result } = await loaded({ settings_set_theme: set.handler });
    act(() => {
      result.current.setTheme.mutate("Light");
      result.current.setTheme.mutate("System");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.resolve(settings("Light"));
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    expect(result.current.start?.settings.theme).toBe("System");
    // Light is saved now, so that is where a failure of the second goes back to.
    set.waiting[1]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(result.current.setTheme.isError).toBe(true);
    });
    expect(result.current.start?.settings.theme).toBe("Light");
  });
});
