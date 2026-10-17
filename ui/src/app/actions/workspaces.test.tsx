import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import { held, loaded } from "../../test/actions";
import { opened, otherWorkspace, workspace } from "../../test/fixtures";
import { useWorkspaceActions } from "./workspaces";

describe("renaming the open workspace", () => {
  it("renames the workspace it was asked to rename while that one is open", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { result } = await loaded(useWorkspaceActions, { workspace_rename: rename });
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
    const { result } = await loaded(useWorkspaceActions, { workspace_rename: rename });
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
    const { result } = await loaded(useWorkspaceActions, {
      workspace_open: open.handler,
      workspace_rename: rename,
    });
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
