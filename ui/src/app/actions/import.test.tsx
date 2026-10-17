import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ImportDone } from "../../bindings/ImportDone";
import type { ImportPhase } from "../../bindings/ImportPhase";
import { held, loaded } from "../../test/actions";
import { opened, openStart, otherWorkspace, workspace } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { useImportCommit } from "./import";
import { useSnapshotActions } from "./snapshots";
import { useWorkspaceActions } from "./workspaces";

/** The commit of an import, and the actions these tests ask for beside it. */
const useActions = () => ({
  ...useImportCommit(),
  ...useWorkspaceActions(),
  ...useSnapshotActions(),
});

describe("committing an import", () => {
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
    const { result } = await loaded(useActions, {
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
    const { result } = await loaded(useActions, {
      import_commit: commit.handler,
      snapshot_select: select,
    });
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
    const { result } = await loaded(useActions, {
      import_commit: commit.handler,
      workspace_rename: rename,
    });
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
    const { result } = await loaded(useActions, {
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
    const { result } = await loaded(useActions, {
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
