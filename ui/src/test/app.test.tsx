import { describe, expect, it } from "vitest";
import { api } from "../api/commands";
import { openHoldsFilter } from "../api/filter";
import { workspaceApi } from "../api/workspace-commands";
import type { LineQuery } from "../bindings/LineQuery";
import { renderApp } from "./app";
import { opened, openStart, workspace } from "./fixtures";
import { overviewOf } from "./overview";

const query: LineQuery = {
  sort: "HoldsDesc",
  reverse: false,
  single_hold_only: false,
  size_mismatch_only: false,
};

describe("renderApp's own answers", () => {
  it("answer for the view the mocked Rust side holds, and refuse another as it does", async () => {
    renderApp({
      start: openStart(),
      pages: { overview: <p />, lines: <p />, settings: <p /> },
      handlers: { snapshot_select: ({ id }) => opened({ selected: id }) },
    });
    const at = (snapshot: number) => ({ workspace_id: workspace().id, snapshot_id: snapshot });
    const lines = (snapshot: number) => api.lines(openHoldsFilter(), query, 0, at(snapshot));
    await expect(lines(2)).resolves.toBeDefined();
    await expect(lines(1)).rejects.toMatchObject({ kind: "ViewChanged" });
    await expect(api.holdDetail(0, at(1))).rejects.toMatchObject({ kind: "ViewChanged" });

    // A command that selects another snapshot moves what the mock holds with it.
    await workspaceApi.snapshotSelect(1);
    await expect(lines(1)).resolves.toBeDefined();
    await expect(lines(2)).rejects.toMatchObject({ kind: "ViewChanged" });
    // The overview is the one of the snapshot the mock holds now, not of the start's.
    const now = overviewOf(opened({ selected: 1 }));
    expect(now).not.toEqual(overviewOf(openStart().open));
    await expect(api.overview(openHoldsFilter(), at(1))).resolves.toEqual(now);
  });
});
