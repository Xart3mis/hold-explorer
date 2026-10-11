import { describe, expect, it } from "vitest";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportReview } from "../bindings/ImportReview";
import type { OverviewView } from "../bindings/OverviewView";
import type { WorkspaceView } from "../bindings/WorkspaceView";
import { mockCommands } from "../test/ipc";
import { api } from "./commands";
import { openHoldsFilter } from "./filter";

const workspace: WorkspaceView = {
  id: "0123456789abcdef",
  name: "A",
  project_numbers: [],
  created_at: "2026-10-07T08:00:00",
  snapshot_count: 0,
  latest_taken_at: null,
};

const review: ImportReview = {
  file_name: "holds.csv",
  project_no: null,
  detected: null,
  date_needs_confirmation: true,
  row_count: 0,
  open_count: 0,
  released_count: 0,
  limited: false,
  skipped_count: 0,
  skipped: [],
  warning_count: 0,
  warnings: [],
  mapping: { fields: {}, extras: [] },
  target: { suggested: null, matching: [], all: [] },
};

const done: ImportDone = {
  open: { workspace, snapshots: [], selected: null, warning: null },
  snapshot: {
    id: 1,
    taken_at: "2026-10-07T08:00:00",
    date_source: "User",
    file_name: "holds.csv",
    content_hash: "00",
    imported_at: "2026-10-07T08:00:00",
    limited: false,
    row_count: 0,
    open_count: 0,
  },
};

describe("the import commands", () => {
  it("passes the arguments by the keys the commands name", async () => {
    let check: unknown;
    let reviewArgs: unknown;
    mockCommands({
      import_check_target: (args) => {
        check = args;
        return { already_imported: null, same_day: [] };
      },
      import_review: (args) => {
        reviewArgs = args;
        return review;
      },
    });
    await api.importCheckTarget({ kind: "New", name: "A" }, "2026-10-07T08:00:00");
    await api.importReview({ LineId: 1 });
    await api.importReview(null);
    expect(check).toEqual({
      target: { kind: "New", name: "A" },
      takenAt: "2026-10-07T08:00:00",
    });
    expect(reviewArgs).toEqual({ fields: null });
  });

  it("builds the progress channel itself and hands each phase to the callback", async () => {
    const heard: ImportPhase[] = [];
    mockCommands({
      import_commit: (args) => {
        expect(args.request.replace).toBeNull();
        for (const phase of ["Reading", "Done"] as const) {
          args.onProgress.onmessage(phase);
        }
        return done;
      },
    });
    const result = await api.importCommit(
      {
        target: { kind: "New", name: "A" },
        taken_at: "2026-10-07T08:00:00",
        date_edited: false,
        replace: null,
      },
      (phase) => heard.push(phase),
    );
    expect(heard).toEqual(["Reading", "Done"]);
    expect(result).toEqual(done);
  });
});

describe("the snapshot commands", () => {
  const overview: OverviewView = {
    snapshot: done.snapshot,
    is_latest: true,
    summary: {
      holds: 0,
      lines: 0,
      single_hold_lines: 0,
      median_age_days: null,
      median_duration_days: null,
    },
    by_discipline: [],
    by_hold_type: [],
  };

  it("sends the complete open-holds filter to the overview", async () => {
    let sent: unknown;
    mockCommands({
      overview: (args) => {
        sent = args;
        return overview;
      },
    });
    expect(await api.overview(openHoldsFilter())).toEqual(overview);
    expect(sent).toEqual({
      spec: {
        status: "Open",
        fields: [],
        text: "",
        age_bands: [],
        created: { from: null, to: null },
        released: { from: null, to: null },
        size_mismatch: null,
      },
    });
  });

  it("passes the snapshot id and answers the workspace", async () => {
    let sent: unknown;
    mockCommands({
      snapshot_select: (args) => {
        sent = args;
        return done.open;
      },
      demo_create: () => done.open,
    });
    expect(await api.snapshotSelect(3)).toEqual(done.open);
    expect(sent).toEqual({ id: 3 });
    expect(await api.demoCreate()).toEqual(done.open);
  });
});
