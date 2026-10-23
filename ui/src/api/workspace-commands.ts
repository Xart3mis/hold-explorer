// The commands that change the view: which workspace is open and which snapshot is selected. The
// application start is one of them, because asking for it makes the Rust side start over.
//
// Only the modules of ui/src/app/ import this module, and the lint rules refuse it to every other.
// The application start is asked for by the start query (ui/src/app/query.ts), once, when the
// page loads. Every other command here is sent as an action made with `workspaceAction()`
// (ui/src/app/view.ts), so the actions run one after another and nothing is read for the snapshot
// in view meanwhile.
import { Channel, invoke } from "@tauri-apps/api/core";
import type { ImportCommit } from "../bindings/ImportCommit";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { ArgsOf, ResultOf, WorkspaceCommandName } from "./commands";

function call<K extends WorkspaceCommandName>(name: K, args: ArgsOf<K>): Promise<ResultOf<K>> {
  return invoke<ResultOf<K>>(name, args);
}

/** One typed function per command. A rejection carries a `CommandError`; see `asCommandError`. */
export const workspaceApi = {
  appStart: () => call("app_start", {}),
  workspaceCreate: (name: string) => call("workspace_create", { name }),
  workspaceOpen: (id: string) => call("workspace_open", { id }),
  workspaceRename: (name: string) => call("workspace_rename", { name }),
  snapshotSelect: (id: number) => call("snapshot_select", { id }),
  demoCreate: () => call("demo_create", {}),
  /**
   * Keeps the workspaces in `path` from now on (`null`: the default folder), moving the workspace
   * files there with `moveFiles`. The open workspace is closed and reopened from where it is then.
   */
  setWorkspaceFolder: (path: string | null, moveFiles: boolean) =>
    call("set_workspace_folder", { path, moveFiles }),
  /** Commits the draft; `onProgress` hears each phase as it starts. */
  importCommit: (request: ImportCommit, onProgress: (phase: ImportPhase) => void) => {
    const channel = new Channel<ImportPhase>();
    channel.onmessage = onProgress;
    return call("import_commit", { request, onProgress: channel });
  },
};
