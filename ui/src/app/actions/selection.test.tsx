import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loaded } from "../../test/actions";
import { opened, otherWorkspace } from "../../test/fixtures";
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
});
