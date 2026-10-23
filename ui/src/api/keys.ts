import type { ViewRef } from "../bindings/ViewRef";

/** Cache keys for what commands return; one place, so a key is spelled once. */
export const keys = {
  start: ["app", "start"] as const,
  workspaces: ["workspaces"] as const,
  /**
   * The actions that change the open workspace or its selection: open, create, rename, select a
   * snapshot, build the demo. They run one after another, and while any of them runs or waits,
   * every control that starts one of them shows it.
   */
  workspaceAction: ["app", "workspace"] as const,
  /**
   * Those of them that change what every page shows: another workspace, another snapshot. While
   * one runs, the shell keeps the page that was there, dimmed.
   */
  switching: ["app", "workspace", "switching"] as const,
  /** The one of them that selects another snapshot of the open workspace. */
  selectingSnapshot: ["app", "workspace", "switching", "snapshot"] as const,
  /** The others: a new workspace, another name, the demo. */
  changing: ["app", "workspace", "changing"] as const,
  /**
   * Where the change of the workspaces folder is: checked, offered, moving, done, or failed. Kept
   * here and not in a page, so that the page that comes back after a press of the sidebar shows it.
   */
  folderChange: ["settings", "folder"] as const,
  /**
   * What the check for a newer release found, once after the start: the `UpdateNotice`, or `null`
   * when there is nothing to tell or the notice was put away.
   */
  update: ["app", "update"] as const,
  /** The file that is open for import: the `ImportDraft` the pages of the import flow share. */
  importDraft: ["import", "draft"] as const,
  /** What the review of that file found: the `ImportReview` of the last mapping it was read with. */
  importReview: ["import", "review"] as const,
  /** What the user has chosen in the import flow so far: the mapping, the date, the target. */
  importChoices: ["import", "choices"] as const,
  /** Every check of a workspace for the file that is open. */
  importChecks: ["import", "check"] as const,
  /** What importing into a workspace at a date would meet. */
  importCheck: (workspace: string, takenAt: string) =>
    ["import", "check", workspace, takenAt] as const,
  /** Everything that was read for a snapshot in view, of whatever workspace: the prefix of those keys. */
  snapshots: ["snapshot"] as const,
  /**
   * One reading for one view: `name` says what was read, `params` what else the answer depends on,
   * such as the filter. The command answers for the workspace that is open and the snapshot that
   * is selected, so both are part of the key: another workspace or another snapshot is another
   * reading. `null` stands for a workspace without snapshots, and for no workspace at all.
   *
   * Only `useSnapshotQuery` and `useSnapshotPages` (ui/src/app/view.ts) build such a key: they
   * send the same view to the command, so the two cannot differ.
   */
  snapshot: (view: ViewRef | null, name: string, params: readonly unknown[] = []) =>
    ["snapshot", view?.workspace_id ?? null, view?.snapshot_id ?? null, name, ...params] as const,
  /**
   * The same for a reading that is kept a page at a time (`useSnapshotPages`). What is kept under
   * it is the list of the pages, not one answer, so it must never be the key of a plain reading:
   * the marker after the name keeps the two apart, also for the same name and params.
   */
  snapshotPages: (view: ViewRef | null, name: string, params: readonly unknown[] = []) =>
    [
      "snapshot",
      view?.workspace_id ?? null,
      view?.snapshot_id ?? null,
      name,
      { pages: true },
      ...params,
    ] as const,
  /** The filters of every workspace, as the user has set them in this session: the prefix of those keys. */
  filters: ["filters"] as const,
  /**
   * The filters of one workspace. They are not what a command returned: the user set them, and
   * they are kept here for the session so that every data screen shows the same ones.
   */
  workspaceFilters: (workspaceId: string) => ["filters", workspaceId] as const,
  /**
   * The filters, with the labels their values were picked under, that each saved view was saved
   * or last applied with in this session: the prefix of those keys. A saved view keeps the keys
   * of its values only; these give a chip back the label it had.
   */
  viewFilters: ["views", "filters"] as const,
  /** Those of one saved view of one workspace. */
  savedViewFilters: (workspaceId: string, viewId: number) =>
    ["views", "filters", workspaceId, viewId] as const,
  /** One reading of a file for import. `visit` tells one arrival on the import page from the next. */
  importOpen: (path: string, visit: string) => ["import", "open", path, visit] as const,
};
