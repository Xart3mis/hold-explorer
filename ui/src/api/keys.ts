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
  /** The others: a new workspace, another name, the demo. */
  changing: ["app", "workspace", "changing"] as const,
  /** The file that is open for import: the `ImportDraft` the pages of the import flow share. */
  importDraft: ["import", "draft"] as const,
  /** One reading of a file for import. `visit` tells one arrival on the import page from the next. */
  importOpen: (path: string, visit: string) => ["import", "open", path, visit] as const,
};
