import { act, waitFor } from "@testing-library/react";
import { useNavigate } from "react-router";
import { describe, expect, it } from "vitest";
import type { WorkspaceView } from "../../bindings/WorkspaceView";
import { held, loaded } from "../../test/actions";
import { opened, otherWorkspace, workspace } from "../../test/fixtures";
import { useDemo } from "./demo";
import { useSnapshotActions } from "./snapshots";
import { useWorkspaceActions } from "./workspaces";

const useActions = () => ({ ...useWorkspaceActions(), ...useSnapshotActions(), ...useDemo() });
const handlers = {
  snapshot_select: ({ id }: { id: number }) => opened({ selected: id }),
  workspace_open: () => opened({ workspace: otherWorkspace }),
  workspace_create: () => opened({ workspace: otherWorkspace, snapshots: [], selected: null }),
  demo_create: () => opened({ workspace: otherWorkspace }),
};

describe("the selection of the detail panel when the view changes", () => {
  it("drops a hold, and keeps a line, when another snapshot is selected", async () => {
    const hold = await loaded(useActions, handlers, "/lines?rows=holds&hold=3&single=1");
    await act(() => hold.result.current.selectSnapshot.mutateAsync(1));
    await waitFor(() => {
      expect(hold.result.current.search).toBe("?rows=holds&single=1");
    });
    hold.unmount();
    const line = await loaded(useActions, handlers, "/lines?line=78B01-573-04400-FW&single=1");
    await act(() => line.result.current.selectSnapshot.mutateAsync(1));
    expect(line.result.current.search).toBe("?line=78B01-573-04400-FW&single=1");
  });

  it.each([
    ["opened", (actions: ReturnType<typeof useActions>) => actions.openWorkspace.mutateAsync("x")],
    [
      "created",
      (actions: ReturnType<typeof useActions>) => actions.createWorkspace.mutateAsync("Area 9"),
    ],
    [
      "built as the demo",
      (actions: ReturnType<typeof useActions>) => actions.openDemo.mutateAsync(),
    ],
  ])("drops a line and a hold when another workspace is %s", async (_, act_) => {
    for (const selected of ["line=78B01-573-04400-FW", "hold=3"]) {
      const hook = await loaded(useActions, handlers, `/lines?rows=holds&${selected}&single=1`);
      await act(() => act_(hook.result.current));
      await waitFor(() => {
        expect(hook.result.current.search).toBe("?rows=holds&single=1");
      });
      hook.unmount();
    }
  });

  it("keeps the hash and what was passed with the address when it drops a hold", async () => {
    const hook = await loaded(useActions, handlers, {
      pathname: "/lines",
      search: "?rows=holds&hold=3",
      hash: "#notes",
      state: { from: "overview" },
    });
    await act(() => hook.result.current.selectSnapshot.mutateAsync(1));
    await waitFor(() => {
      expect(hook.result.current.search).toBe("?rows=holds");
    });
    expect(hook.result.current.location.hash).toBe("#notes");
    expect(hook.result.current.location.state).toEqual({ from: "overview" });
  });

  it("drops the selection when the action is asked for, from the address it is asked at", async () => {
    // A rename runs; the selection of another snapshot waits its turn behind it.
    const rename = held<WorkspaceView>();
    const hook = await loaded(
      () => ({ ...useActions(), navigate: useNavigate() }),
      { ...handlers, workspace_rename: rename.handler },
      "/lines?rows=holds&hold=3",
    );
    act(() => {
      hook.result.current.renameWorkspace.mutate({ id: workspace().id, name: "Area 9" });
      hook.result.current.selectSnapshot.mutate(1);
    });
    // The hold is gone at once, before the selection is sent.
    await waitFor(() => {
      expect(hook.result.current.search).toBe("?rows=holds");
    });
    // The user goes elsewhere meanwhile, and stays there when the selection's turn comes.
    act(() => {
      void hook.result.current.navigate("/overview");
    });
    await act(async () => {
      rename.waiting[0]?.resolve({ ...workspace(), name: "Area 9" });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(hook.result.current.start?.open?.selected).toBe(1);
    });
    expect(hook.result.current.location.pathname).toBe("/overview");
  });
});
