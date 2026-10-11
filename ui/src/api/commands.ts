// The only module that imports `invoke`: command names and argument keys are written here once.
import { Channel, invoke } from "@tauri-apps/api/core";
import type { AppStart } from "../bindings/AppStart";
import type { Field } from "../bindings/Field";
import type { FilterSpec } from "../bindings/FilterSpec";
import type { ImportCommit } from "../bindings/ImportCommit";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportDraft } from "../bindings/ImportDraft";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { ImportReview } from "../bindings/ImportReview";
import type { OverviewView } from "../bindings/OverviewView";
import type { Settings } from "../bindings/Settings";
import type { TargetCheck } from "../bindings/TargetCheck";
import type { TargetChoice } from "../bindings/TargetChoice";
import type { Theme } from "../bindings/Theme";
import type { WorkspaceListView } from "../bindings/WorkspaceListView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";

/** A mapping: each field to the zero-based column that supplies it. */
type Fields = Partial<Record<Field, number>>;

/** The channel that carries the progress of `import_commit`. */
type Progress = Channel<ImportPhase>;

/** Every command: its argument object (keys as the command names them) and what it returns. */
interface CommandMap {
  app_start: { args: Record<string, never>; result: AppStart };
  settings_set_theme: { args: { theme: Theme }; result: Settings };
  workspace_list: { args: Record<string, never>; result: WorkspaceListView };
  workspace_create: { args: { name: string }; result: WorkspaceOpen };
  workspace_open: { args: { id: string }; result: WorkspaceOpen };
  workspace_rename: { args: { name: string }; result: WorkspaceView };
  import_open: { args: { path: string }; result: ImportDraft };
  import_choose_sheet: { args: { sheet: string }; result: ImportDraft };
  import_review: { args: { fields: Fields | null }; result: ImportReview };
  import_check_target: { args: { target: TargetChoice; takenAt: string }; result: TargetCheck };
  import_commit: { args: { request: ImportCommit; onProgress: Progress }; result: ImportDone };
  import_cancel: { args: Record<string, never>; result: null };
  snapshot_select: { args: { id: number }; result: WorkspaceOpen };
  overview: { args: { spec: FilterSpec }; result: OverviewView | null };
  demo_create: { args: Record<string, never>; result: WorkspaceOpen };
}

export type CommandName = keyof CommandMap;
export type ArgsOf<K extends CommandName> = CommandMap[K]["args"];
export type ResultOf<K extends CommandName> = CommandMap[K]["result"];

function call<K extends CommandName>(name: K, args: ArgsOf<K>): Promise<ResultOf<K>> {
  return invoke<ResultOf<K>>(name, args);
}

/** One typed function per command. A rejection carries a `CommandError`; see `asCommandError`. */
export const api = {
  appStart: () => call("app_start", {}),
  setTheme: (theme: Theme) => call("settings_set_theme", { theme }),
  workspaceList: () => call("workspace_list", {}),
  workspaceCreate: (name: string) => call("workspace_create", { name }),
  workspaceOpen: (id: string) => call("workspace_open", { id }),
  workspaceRename: (name: string) => call("workspace_rename", { name }),
  importOpen: (path: string) => call("import_open", { path }),
  importChooseSheet: (sheet: string) => call("import_choose_sheet", { sheet }),
  /** Reviews the draft with the given field-to-column mapping, or with the proposed one. */
  importReview: (fields: Fields | null) => call("import_review", { fields }),
  importCheckTarget: (target: TargetChoice, takenAt: string) =>
    call("import_check_target", { target, takenAt }),
  /** Commits the draft; `onProgress` hears each phase as it starts. */
  importCommit: (request: ImportCommit, onProgress: (phase: ImportPhase) => void) => {
    const channel = new Channel<ImportPhase>();
    channel.onmessage = onProgress;
    return call("import_commit", { request, onProgress: channel });
  },
  importCancel: () => call("import_cancel", {}),
  snapshotSelect: (id: number) => call("snapshot_select", { id }),
  /** The Overview of the selected snapshot; `null` when the workspace has no snapshot. */
  overview: (spec: FilterSpec) => call("overview", { spec }),
  demoCreate: () => call("demo_create", {}),
};
