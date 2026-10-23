// Command names and argument keys are written here once. This module and workspace-commands.ts,
// which holds the commands that change the view, are the only ones that import `invoke`.
import { Channel, invoke } from "@tauri-apps/api/core";
import type { AppStart } from "../bindings/AppStart";
import type { BlockerDetail } from "../bindings/BlockerDetail";
import type { CopyFormat } from "../bindings/CopyFormat";
import type { Density } from "../bindings/Density";
import type { Dim } from "../bindings/Dim";
import type { ExportPhase } from "../bindings/ExportPhase";
import type { ExportRequest } from "../bindings/ExportRequest";
import type { ExportSaved } from "../bindings/ExportSaved";
import type { Field } from "../bindings/Field";
import type { FilterLabel } from "../bindings/FilterLabel";
import type { FilterOptions } from "../bindings/FilterOptions";
import type { FilterSpec } from "../bindings/FilterSpec";
import type { FoldedMatrix } from "../bindings/FoldedMatrix";
import type { FolderCheck } from "../bindings/FolderCheck";
import type { FolderMoved } from "../bindings/FolderMoved";
import type { Group } from "../bindings/Group";
import type { GroupDetail } from "../bindings/GroupDetail";
import type { HoldQuery } from "../bindings/HoldQuery";
import type { HoldRef } from "../bindings/HoldRef";
import type { HoldsView } from "../bindings/HoldsView";
import type { ImportCommit } from "../bindings/ImportCommit";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportDraft } from "../bindings/ImportDraft";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { ImportReview } from "../bindings/ImportReview";
import type { LineDetail } from "../bindings/LineDetail";
import type { LinePage } from "../bindings/LinePage";
import type { LineQuery } from "../bindings/LineQuery";
import type { OverviewView } from "../bindings/OverviewView";
import type { SaveFormat } from "../bindings/SaveFormat";
import type { SavedView } from "../bindings/SavedView";
import type { SearchResults } from "../bindings/SearchResults";
import type { Settings } from "../bindings/Settings";
import type { SolveView } from "../bindings/SolveView";
import type { TargetCheck } from "../bindings/TargetCheck";
import type { TargetChoice } from "../bindings/TargetChoice";
import type { Theme } from "../bindings/Theme";
import type { UpdateNotice } from "../bindings/UpdateNotice";
import type { ValuePage } from "../bindings/ValuePage";
import type { ViewRef } from "../bindings/ViewRef";
import type { WorkspaceListView } from "../bindings/WorkspaceListView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";

/** A mapping: each field to the zero-based column that supplies it. */
type Fields = Partial<Record<Field, number>>;

/** The channel that carries the progress of `import_commit`. */
type Progress = Channel<ImportPhase>;

/** The channel that carries the progress of `export_save`. */
type ExportProgress = Channel<ExportPhase>;

/** Every command: its argument object (keys as the command names them) and what it returns. */
interface CommandMap {
  app_start: { args: Record<string, never>; result: AppStart };
  settings_set_theme: { args: { theme: Theme }; result: Settings };
  settings_set_density: { args: { density: Density }; result: Settings };
  settings_set_author_name: { args: { name: string }; result: Settings };
  settings_set_update_check: { args: { enabled: boolean }; result: Settings };
  check_workspace_folder: { args: { path: string | null }; result: FolderCheck };
  set_workspace_folder: { args: { path: string | null; moveFiles: boolean }; result: FolderMoved };
  workspace_list: { args: Record<string, never>; result: WorkspaceListView };
  workspace_create: { args: { name: string }; result: WorkspaceOpen };
  workspace_open: { args: { id: string }; result: WorkspaceOpen };
  workspace_rename: { args: { name: string }; result: WorkspaceView };
  save_view: {
    args: { workspace: string; name: string; address: string; filters: FilterSpec };
    result: SavedView[];
  };
  rename_view: {
    args: { workspace: string; id: number; name: string };
    result: SavedView[];
  };
  delete_view: { args: { workspace: string; id: number }; result: SavedView[] };
  restore_view: {
    args: { workspace: string; view: SavedView; index: number };
    result: SavedView[];
  };
  move_view: { args: { workspace: string; id: number; index: number }; result: SavedView[] };
  import_open: { args: { path: string }; result: ImportDraft };
  import_choose_sheet: { args: { sheet: string }; result: ImportDraft };
  import_review: { args: { fields: Fields | null }; result: ImportReview };
  import_check_target: { args: { target: TargetChoice; takenAt: string }; result: TargetCheck };
  import_commit: { args: { request: ImportCommit; onProgress: Progress }; result: ImportDone };
  import_cancel: { args: { contentHash: string | null }; result: null };
  snapshot_select: { args: { id: number }; result: WorkspaceOpen };
  overview: { args: { spec: FilterSpec; view: ViewRef }; result: OverviewView | null };
  demo_create: { args: Record<string, never>; result: WorkspaceOpen };
  filter_options: { args: { spec: FilterSpec; view: ViewRef }; result: FilterOptions };
  filter_labels: { args: { spec: FilterSpec; view: ViewRef }; result: FilterLabel[] };
  filter_values: {
    args: { spec: FilterSpec; dim: Dim; search: string; view: ViewRef };
    result: ValuePage;
  };
  search: { args: { view: ViewRef; query: string }; result: SearchResults };
  lines: {
    args: { spec: FilterSpec; query: LineQuery; offset: number; view: ViewRef };
    result: LinePage;
  };
  holds: { args: { spec: FilterSpec; query: HoldQuery; view: ViewRef }; result: HoldsView };
  line_detail: { args: { lineId: string; view: ViewRef }; result: LineDetail | null };
  hold_detail: { args: { position: number; view: ViewRef }; result: HoldRef | null };
  workspace_current: { args: Record<string, never>; result: WorkspaceOpen | null };
  breakdown: { args: { spec: FilterSpec; dim: Dim; view: ViewRef }; result: Group[] };
  matrix: {
    args: { spec: FilterSpec; rowDim: Dim; colDim: Dim; view: ViewRef };
    result: FoldedMatrix;
  };
  solve_order: { args: { spec: FilterSpec; view: ViewRef }; result: SolveView };
  blocker_detail: {
    args: { spec: FilterSpec; key: string; view: ViewRef };
    result: BlockerDetail | null;
  };
  group_detail: {
    args: { spec: FilterSpec; dim: Dim; key: string; view: ViewRef };
    result: GroupDetail | null;
  };
  export_save: {
    args: {
      request: ExportRequest;
      format: SaveFormat;
      path: string;
      view: ViewRef;
      onProgress: ExportProgress;
    };
    result: ExportSaved;
  };
  export_copy: {
    args: { request: ExportRequest; format: CopyFormat; view: ViewRef };
    result: null;
  };
  export_open: { args: { path: string }; result: null };
  diagnostics_copy: { args: Record<string, never>; result: string };
  update_check: { args: Record<string, never>; result: UpdateNotice | null };
  update_skip: { args: { version: string }; result: Settings };
  open_release_page: { args: { version: string }; result: null };
}

export type CommandName = keyof CommandMap;
export type ArgsOf<K extends CommandName> = CommandMap[K]["args"];
export type ResultOf<K extends CommandName> = CommandMap[K]["result"];

/**
 * The commands that change the view: which workspace is open and which snapshot is selected. They
 * are not among the functions of `api`; ui/src/api/workspace-commands.ts holds them.
 */
export type WorkspaceCommandName =
  | "app_start"
  | "workspace_create"
  | "workspace_open"
  | "workspace_rename"
  | "snapshot_select"
  | "demo_create"
  | "import_commit"
  | "set_workspace_folder";

function call<K extends Exclude<CommandName, WorkspaceCommandName>>(
  name: K,
  args: ArgsOf<K>,
): Promise<ResultOf<K>> {
  return invoke<ResultOf<K>>(name, args);
}

/**
 * One typed function per command that leaves the view as it is. A rejection carries a
 * `CommandError`; see `asCommandError`.
 */
export const api = {
  setTheme: (theme: Theme) => call("settings_set_theme", { theme }),
  setDensity: (density: Density) => call("settings_set_density", { density }),
  setAuthorName: (name: string) => call("settings_set_author_name", { name }),
  /** Turns the check for a newer release at start on or off. */
  setUpdateCheck: (enabled: boolean) => call("settings_set_update_check", { enabled }),
  /**
   * Checks a folder to keep the workspaces in (`null`: the default one): absolute, not the one in
   * use, and writable, or creatable when missing; nothing is created. Names the workspace files a
   * move to it would take.
   */
  checkWorkspaceFolder: (path: string | null) => call("check_workspace_folder", { path }),
  workspaceList: () => call("workspace_list", {}),
  /**
   * The saved-view commands act on the workspace with this id and reject with the kind
   * `ViewChanged` for another. Each answers the whole list, in sidebar order. Saves the
   * screen's address (its path and query without a selection) with its filters, last in the list.
   */
  saveView: (workspace: string, name: string, address: string, filters: FilterSpec) =>
    call("save_view", { workspace, name, address, filters }),
  renameView: (workspace: string, id: number, name: string) =>
    call("rename_view", { workspace, id, name }),
  deleteView: (workspace: string, id: number) => call("delete_view", { workspace, id }),
  /** Puts a deleted view back with its id at `index` of the list. */
  restoreView: (workspace: string, view: SavedView, index: number) =>
    call("restore_view", { workspace, view, index }),
  /** Moves a view to `index` of the list as it is after the view is taken out; past the end is last. */
  moveView: (workspace: string, id: number, index: number) =>
    call("move_view", { workspace, id, index }),
  importOpen: (path: string) => call("import_open", { path }),
  importChooseSheet: (sheet: string) => call("import_choose_sheet", { sheet }),
  /** Reviews the draft with the given field-to-column mapping, or with the proposed one. */
  importReview: (fields: Fields | null) => call("import_review", { fields }),
  importCheckTarget: (target: TargetChoice, takenAt: string) =>
    call("import_check_target", { target, takenAt }),
  /**
   * Drops the draft of the file with this content hash; another file's draft stays. `null` drops
   * the draft of whatever file is open, for a cancel pressed while a file is still being read.
   */
  importCancel: (contentHash: string | null) => call("import_cancel", { contentHash }),
  /**
   * The Overview of the snapshot in view; `null` when the workspace has no snapshot. `view` names
   * the workspace and the snapshot the interface shows; when the state holds another, the command
   * rejects with the kind `ViewChanged` and answers nothing.
   */
  overview: (spec: FilterSpec, view: ViewRef) => call("overview", { spec, view }),
  /**
   * The data commands below answer for the snapshot in view, like `overview`, and reject with the
   * kind `ViewChanged` when `view` is not what the state holds. The options of the filter bar:
   * the count of the kept holds, the facet counts, the extra columns, and the absent fields.
   */
  filterOptions: (spec: FilterSpec, view: ViewRef) => call("filter_options", { spec, view }),
  /**
   * The label of every value of every field entry of `spec`, as the picker labels it in the
   * snapshot in view; a value the snapshot lacks is labelled with itself.
   */
  filterLabels: (spec: FilterSpec, view: ViewRef) => call("filter_labels", { spec, view }),
  /** The values of one dimension a picker offers, at most 200, whose label contains `search`. */
  filterValues: (spec: FilterSpec, dim: Dim, search: string, view: ViewRef) =>
    call("filter_values", { spec, dim, search, view }),
  /**
   * What `query` finds among every hold of the snapshot, open and released, whatever the filter:
   * at most 8 hits in each group, the groups in the order Lines, Blockers, People, Remarks, Holds.
   */
  search: (view: ViewRef, query: string) => call("search", { view, query }),
  /** At most 200 Lines from `offset`. */
  lines: (spec: FilterSpec, query: LineQuery, offset: number, view: ViewRef) =>
    call("lines", { spec, query, offset, view }),
  /** At most 200 Holds, from `query.offset`. */
  holds: (spec: FilterSpec, query: HoldQuery, view: ViewRef) =>
    call("holds", { spec, query, view }),
  /** The detail of one Line; `null` when the snapshot has no such Line. */
  lineDetail: (lineId: string, view: ViewRef) => call("line_detail", { lineId, view }),
  /** The Hold at this position of the snapshot; `null` past the end. */
  holdDetail: (position: number, view: ViewRef) => call("hold_detail", { position, view }),
  /** The kept holds grouped by one dimension, largest group first. */
  breakdown: (spec: FilterSpec, dim: Dim, view: ViewRef) => call("breakdown", { spec, dim, view }),
  /** The kept holds crossed by two dimensions, each side folded as the core folds it. */
  matrix: (spec: FilterSpec, rowDim: Dim, colDim: Dim, view: ViewRef) =>
    call("matrix", { spec, rowDim, colDim, view }),
  /** The solve order of the kept holds. */
  solveOrder: (spec: FilterSpec, view: ViewRef) => call("solve_order", { spec, view }),
  /** The detail of one blocker among the kept holds; `null` when no kept hold has it. */
  blockerDetail: (spec: FilterSpec, key: string, view: ViewRef) =>
    call("blocker_detail", { spec, key, view }),
  /** One group of a dimension with its first Lines; `null` when the filter keeps none of it. */
  groupDetail: (spec: FilterSpec, dim: Dim, key: string, view: ViewRef) =>
    call("group_detail", { spec, dim, key, view }),
  /** The open workspace with the snapshot that is selected; `null` without one. Changes nothing. */
  workspaceCurrent: () => call("workspace_current", {}),
  /**
   * Saves an export of the view to `path`; `onProgress` hears each phase as it starts. Rejects
   * with the kind `ViewChanged` when `view` is not what the state holds.
   */
  exportSave: (
    request: ExportRequest,
    format: SaveFormat,
    path: string,
    view: ViewRef,
    onProgress: (phase: ExportPhase) => void,
  ) => {
    const channel = new Channel<ExportPhase>();
    channel.onmessage = onProgress;
    return call("export_save", { request, format, path, view, onProgress: channel });
  },
  /** Copies an export of the view to the clipboard. */
  exportCopy: (request: ExportRequest, format: CopyFormat, view: ViewRef) =>
    call("export_copy", { request, format, view }),
  /** Opens a file the app saved in this session; rejects with `NotWritten` for any other. */
  exportOpen: (path: string) => call("export_open", { path }),
  /** Copies the diagnostics text to the clipboard and returns it. */
  diagnosticsCopy: () => call("diagnostics_copy", {}),
  /**
   * Looks for a newer release, when the check is on and none was tried in the last 24 hours.
   * `null` when there is none to tell, also when the check failed: it never rejects for that.
   */
  updateCheck: () => call("update_check", {}),
  /** Skips a version: it is not offered again, a newer one is. */
  updateSkip: (version: string) => call("update_skip", { version }),
  /**
   * Opens the release page of the version the check returned, in the browser. Rejects with
   * `NotOffered` for any other version, and `Open` when the system could not open it.
   */
  openReleasePage: (version: string) => call("open_release_page", { version }),
};
