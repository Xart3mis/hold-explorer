import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import { held, loaded, wrapper } from "../../test/actions";
import { opened, openStart, otherWorkspace } from "../../test/fixtures";
import { commandFailure, mockCommands } from "../../test/ipc";
import { useSnapshotActions } from "./snapshots";
import { useStart } from "./start";
import { useWorkspaceActions } from "./workspaces";

/** The actions these tests start: on the workspaces, and on the snapshots of the open one. */
const useActions = () => ({ ...useWorkspaceActions(), ...useSnapshotActions() });

describe("the actions on the open workspace: their order", () => {
  it("runs the actions that change the open workspace one after another", async () => {
    const open = held<WorkspaceOpen>();
    const select = vi.fn(({ id }: { id: number }) =>
      opened({ workspace: otherWorkspace, selected: id }),
    );
    const { result } = await loaded(useActions, {
      workspace_open: open.handler,
      snapshot_select: select,
    });
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
    const first = renderHook(() => ({ ...useStart(), ...useActions() }), { wrapper });
    const second = renderHook(() => ({ ...useStart(), ...useActions() }), { wrapper });
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
    const { result } = await loaded(useActions, {
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
