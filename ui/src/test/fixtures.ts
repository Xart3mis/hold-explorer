import type { AppStart } from "../bindings/AppStart";
import type { ColumnMap } from "../bindings/ColumnMap";
import type { ImportDraft } from "../bindings/ImportDraft";
import type { SnapshotInfo } from "../bindings/SnapshotInfo";
import type { UnreadableView } from "../bindings/UnreadableView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";

/** A workspace as the commands describe one. */
export function workspace(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    id: "a1b2c3d4e5f60718",
    name: "Unit 573 piping",
    project_numbers: ["5359-200"],
    created_at: "2026-09-01T08:00:00",
    snapshot_count: 2,
    latest_taken_at: "2026-10-07T08:00:00",
    ...overrides,
  };
}

/** A snapshot of 9,300 holds unless another count is given. */
export function snapshot(
  id: number,
  takenAt: string,
  overrides: Partial<SnapshotInfo> = {},
): SnapshotInfo {
  return {
    id,
    taken_at: takenAt,
    date_source: "FileName",
    file_name: `Holds_${takenAt.slice(0, 10)}.xlsx`,
    content_hash: String(id).padStart(64, "0"),
    imported_at: "2026-10-07T09:00:00",
    limited: false,
    row_count: 9300,
    open_count: 5042,
    ...overrides,
  };
}

/** The two snapshots of the workspace the tests open, oldest first, as the commands send them. */
export const twoSnapshots: SnapshotInfo[] = [
  snapshot(1, "2026-09-30T14:05:00", { row_count: 9120 }),
  snapshot(2, "2026-10-07T08:00:00", { row_count: 9300 }),
];

/** An open workspace with two snapshots, the newest selected. */
export function opened(overrides: Partial<WorkspaceOpen> = {}): WorkspaceOpen {
  return {
    workspace: workspace(),
    snapshots: twoSnapshots,
    selected: 2,
    views: [],
    warning: null,
    ...overrides,
  };
}

export const otherWorkspace = workspace({
  id: "b2c3d4e5f6071829",
  name: "Tank farm",
  project_numbers: ["5360-110"],
  snapshot_count: 5,
  latest_taken_at: "2026-09-23T07:30:00",
});

export const unreadable: UnreadableView = {
  file_name: "c3d4e5f607182930.holdx-ws",
  path: "/home/ada/.local/share/hold-explorer/workspaces/c3d4e5f607182930.holdx-ws",
  kind: "NewerSchema",
  message:
    "This workspace was written by a newer version of Hold Explorer (schema 9; this build reads up to 3). Update Hold Explorer to open it.",
};

/** What `app_start` returns. Nothing is open and the folder is empty unless the test says so. */
export function startState(overrides: Partial<AppStart> = {}): AppStart {
  return {
    version: "0.1.0",
    settings: {
      theme: "Dark",
      density: "Comfortable",
      author_name: "",
      workspace_dir: null,
      last_workspace: null,
    },
    list: {
      workspaces: [],
      unreadable: [],
      folder: "/home/ada/.local/share/hold-explorer/workspaces",
    },
    list_error: null,
    open: null,
    settings_problem: null,
    ...overrides,
  };
}

/** A start with the default workspace open and listed, together with one other workspace. */
export function openStart(overrides: Partial<AppStart> = {}): AppStart {
  const base = startState();
  return {
    ...base,
    list: { ...base.list, workspaces: [otherWorkspace, workspace()] },
    open: opened(),
    ...overrides,
  };
}

/** A file opened for import. Its required fields are all covered unless the test names some. */
export function draft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  const map: ColumnMap = { fields: {}, extras: [] };
  return {
    file: {
      file_name: "Holds_2026-10-07.xlsx",
      content_hash: "f".repeat(64),
      sheet_name: "Holds",
      sheets: ["Info", "Holds"],
      headers: ["Line ID", "Remark"],
      preview: [["78B01-573-4434-FW-001", "HOLD FOR 577-PR-400"]],
      auto_map: map,
      error_cells: 0,
      row_count: 9300,
    },
    proposed: map,
    required: ["LineId", "Remark", "HoldType"],
    missing_required: [],
    used_saved_mapping: false,
    ...overrides,
  };
}
