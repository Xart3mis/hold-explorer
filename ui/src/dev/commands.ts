// Answers the commands from fixtures, so the app's pages can be opened in a plain browser. For
// development only; see ui/src/dev/app.tsx.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { AppStart } from "../bindings/AppStart";
import type { CommandError } from "../bindings/CommandError";
import type { ImportDraft } from "../bindings/ImportDraft";
import type { SnapshotInfo } from "../bindings/SnapshotInfo";
import type { Theme } from "../bindings/Theme";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";

/** What `pnpm check:dist` looks for: this module must never be part of a build. */
const MARKER = "hx-dev-commands";

/** The states the development page can start in. */
export const DEV_STATES = [
  "first-run",
  "workspaces",
  "open",
  "older",
  "list-error",
  "warning",
] as const;
export type DevState = (typeof DEV_STATES)[number];

export function isDevState(value: string): value is DevState {
  return DEV_STATES.some((state) => state === value);
}

const FOLDER = "/home/ada/.local/share/hold-explorer/workspaces";

function failure(kind: string, message: string): Error & CommandError {
  return Object.assign(new Error(message), { kind });
}

function later<T>(milliseconds: number, answer: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try {
        resolve(answer());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, milliseconds);
  });
}

function snapshot(id: number, takenAt: string, rows: number, open: number): SnapshotInfo {
  return {
    id,
    taken_at: takenAt,
    date_source: "FileName",
    file_name: `Holds_${takenAt.slice(0, 10)}.xlsx`,
    content_hash: String(id).padStart(64, "0"),
    imported_at: "2026-10-07T09:12:00",
    limited: false,
    row_count: rows,
    open_count: open,
  };
}

const fourSnapshots: SnapshotInfo[] = [
  snapshot(1, "2026-09-16T08:00:00", 9300, 5390),
  snapshot(2, "2026-09-23T08:00:00", 9412, 5241),
  snapshot(3, "2026-09-30T14:05:00", 9518, 5127),
  snapshot(4, "2026-10-07T08:00:00", 9634, 5042),
];

const unit573: WorkspaceView = {
  id: "a1b2c3d4e5f60718",
  name: "Unit 573 piping",
  project_numbers: ["5359-200"],
  created_at: "2026-09-16T07:55:00",
  snapshot_count: 4,
  latest_taken_at: "2026-10-07T08:00:00",
};

const tankFarm: WorkspaceView = {
  id: "b2c3d4e5f6071829",
  name: "Tank farm",
  project_numbers: ["5360-110"],
  created_at: "2026-08-03T10:20:00",
  snapshot_count: 11,
  latest_taken_at: "2026-09-23T07:30:00",
};

const offsites: WorkspaceView = {
  id: "c3d4e5f607182930",
  name: "Offsites and utilities, phase 2",
  project_numbers: ["5359-310", "5359-320"],
  created_at: "2026-10-01T15:42:00",
  snapshot_count: 0,
  latest_taken_at: null,
};

const draft: ImportDraft = {
  file: {
    file_name: "Holds_2026-10-14.xlsx",
    content_hash: "f".repeat(64),
    sheet_name: "Holds",
    sheets: ["Info", "Holds"],
    headers: ["Line ID", "Remark"],
    preview: [["78B01-573-4434-FW-001", "HOLD FOR 577-PR-400"]],
    auto_map: { fields: { LineId: 0, Remark: 1 }, extras: [] },
    error_cells: 0,
    row_count: 9702,
  },
  proposed: { fields: { LineId: 0, Remark: 1 }, extras: [] },
  missing_required: [],
  used_saved_mapping: false,
};

interface World {
  start: AppStart;
  /** What each workspace holds, by id. */
  snapshots: Map<string, SnapshotInfo[]>;
  /** Whether the workspaces folder can be read. */
  folderReadable: boolean;
}

function world(state: DevState, theme: Theme): World {
  const snapshots = new Map<string, SnapshotInfo[]>([
    [unit573.id, fourSnapshots],
    [tankFarm.id, fourSnapshots.slice(0, 2)],
    [offsites.id, []],
  ]);
  const start: AppStart = {
    version: "0.1.0",
    settings: { theme, workspace_dir: null, last_workspace: null },
    list: { workspaces: [], unreadable: [], folder: FOLDER },
    list_error: null,
    open: null,
  };
  const opened = (selected: number, warning: CommandError | null): WorkspaceOpen => ({
    workspace: unit573,
    snapshots: fourSnapshots,
    selected,
    warning,
  });
  const all = [offsites, tankFarm, unit573];

  switch (state) {
    case "first-run":
      break;
    case "workspaces":
      start.list.workspaces = all;
      start.list.unreadable = [
        {
          file_name: "d4e5f60718293041.holdx-ws",
          path: `${FOLDER}/d4e5f60718293041.holdx-ws`,
          kind: "NewerSchema",
          message:
            "This workspace was written by a newer version of Hold Explorer (schema 9; this version reads up to schema 3). Update Hold Explorer to open it.",
        },
      ];
      break;
    case "open":
      start.list.workspaces = all;
      start.open = opened(4, null);
      break;
    case "older":
      start.list.workspaces = all;
      start.open = opened(3, null);
      break;
    case "warning":
      start.list.workspaces = all;
      start.open = opened(4, {
        kind: "Settings",
        message:
          "The workspace is open, but Hold Explorer could not remember it for the next start. The settings file /home/ada/.config/hold-explorer/settings.json could not be written (permission denied). Check that you may write to that folder.",
      });
      break;
    case "list-error":
      start.list.folder = "/mnt/projects/5359/hold-explorer";
      start.list_error = {
        kind: "Io",
        message:
          "The workspaces folder could not be read (permission denied). Check that the drive is connected and that you may read the folder, then try again.",
      };
      break;
  }
  return { start, snapshots, folderReadable: state !== "list-error" };
}

/**
 * Makes the commands, the file dialog, and the file manager answer from fixtures, in the given
 * state. Returns the marker of the development page. A dragged file is played from the console:
 * `hxDev.enter(["/exports/Holds.xlsx"])`, `hxDev.leave()`, `hxDev.drop([...])`.
 */
export function installDevCommands(state: DevState, theme: Theme): string {
  const { start, snapshots, folderReadable } = world(state, theme);
  let nextId = 1;

  const open = (workspace: WorkspaceView): WorkspaceOpen => {
    const held = snapshots.get(workspace.id) ?? [];
    const opened = {
      workspace,
      snapshots: held,
      selected: held.at(-1)?.id ?? null,
      warning: null,
    };
    start.open = opened;
    return opened;
  };

  const create = (name: string, held: SnapshotInfo[]): WorkspaceOpen => {
    const workspace: WorkspaceView = {
      id: `e${String(nextId).padStart(15, "0")}`,
      name: name.trim() === "" ? "Workspace" : name.trim(),
      project_numbers: [],
      created_at: "2026-10-12T10:00:00",
      snapshot_count: held.length,
      latest_taken_at: held.at(-1)?.taken_at ?? null,
    };
    nextId += 1;
    snapshots.set(workspace.id, held);
    start.list.workspaces = [...start.list.workspaces, workspace].sort((a, b) =>
      a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
    );
    return open(workspace);
  };

  const text = (payload: unknown, key: string): string => {
    const value = (payload as Record<string, unknown> | undefined)?.[key];
    return typeof value === "string" ? value : "";
  };

  const answers: Record<string, (payload: unknown) => unknown> = {
    app_start: () => start,
    settings_set_theme: (payload) => {
      const chosen = text(payload, "theme");
      if (chosen === "Dark" || chosen === "Light" || chosen === "System") {
        start.settings = { ...start.settings, theme: chosen };
      }
      return start.settings;
    },
    workspace_list: () => {
      if (!folderReadable) throw failure("Io", start.list_error?.message ?? "");
      return start.list;
    },
    workspace_create: (payload) => {
      const name = text(payload, "name");
      if (name.toLowerCase().includes("fail")) {
        throw failure(
          "Io",
          `The workspace file could not be created in ${FOLDER} (the disk is full). Free some space, then create the workspace again.`,
        );
      }
      return later(400, () => create(name, []));
    },
    workspace_open: (payload) => {
      const id = text(payload, "id");
      const workspace = start.list.workspaces.find((candidate) => candidate.id === id);
      if (!workspace) {
        throw failure(
          "WorkspaceNotFound",
          "That workspace is not in the workspace folder. It may have been moved or deleted; choose a workspace from the list, or create a new one.",
        );
      }
      return later(300, () => open(workspace));
    },
    workspace_rename: (payload) => {
      const name = text(payload, "name");
      if (!start.open)
        throw failure("NoWorkspace", "No workspace is open. Open a workspace first.");
      if (name.toLowerCase().includes("fail")) {
        throw failure(
          "Io",
          "The workspace file could not be written (it is read-only). Remove the write protection from the file, then rename the workspace again.",
        );
      }
      const renamed = { ...start.open.workspace, name };
      start.open = { ...start.open, workspace: renamed };
      start.list.workspaces = start.list.workspaces.map((workspace) =>
        workspace.id === renamed.id ? renamed : workspace,
      );
      return later(300, () => renamed);
    },
    snapshot_select: (payload) => {
      const id = (payload as { id?: unknown } | undefined)?.id;
      if (!start.open || typeof id !== "number") {
        throw failure("NoWorkspace", "No workspace is open. Open a workspace first.");
      }
      start.open = { ...start.open, selected: id };
      return later(250, () => start.open);
    },
    demo_create: () => later(2200, () => create("Demo", fourSnapshots)),
    import_open: (payload) => {
      const path = text(payload, "path");
      return later(1500, () => {
        if (path.includes("missing")) {
          throw failure(
            "NotFound",
            `The file ${path} was not found. It may have been moved or renamed; choose the file again.`,
          );
        }
        return draft;
      });
    },
    import_cancel: () => null,
    overview: () => null,
    "plugin:dialog|open": () => "/home/ada/exports/Holds_2026-10-14.xlsx",
    "plugin:opener|reveal_item_in_dir": () => null,
  };

  mockWindows("main");
  mockIPC(
    (command, payload) => {
      const answer = answers[command];
      if (!answer) {
        throw failure("Internal", `The development page has no answer for the command ${command}.`);
      }
      // A command's answer crosses the boundary as a copy. Handing out the fixture itself would
      // let a later change to the fixture reach what the interface already holds.
      return Promise.resolve(answer(payload)).then((result) => structuredClone(result));
    },
    { shouldMockEvents: true },
  );

  // The drag of a file, played by hand: the mocked window passes the event on to its listeners.
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__: { invoke: (command: string, payload: unknown) => Promise<unknown> };
    }
  ).__TAURI_INTERNALS__;
  const send = (event: string, payload: unknown) =>
    internals.invoke("plugin:event|emit", { event, payload });
  const position = { x: 0, y: 0 };
  Object.assign(window, {
    hxDev: {
      enter: (paths: string[]) => send("tauri://drag-enter", { paths, position }),
      leave: () => send("tauri://drag-leave", null),
      drop: (paths: string[]) => send("tauri://drag-drop", { paths, position }),
    },
  });

  return MARKER;
}
