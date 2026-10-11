// The only module that imports `invoke`: command names and argument keys are written here once.
import { invoke } from "@tauri-apps/api/core";
import type { AppStart } from "../bindings/AppStart";
import type { Settings } from "../bindings/Settings";
import type { Theme } from "../bindings/Theme";
import type { WorkspaceListView } from "../bindings/WorkspaceListView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";

/** Every command: its argument object (keys as the command names them) and what it returns. */
interface CommandMap {
  app_start: { args: Record<string, never>; result: AppStart };
  settings_set_theme: { args: { theme: Theme }; result: Settings };
  workspace_list: { args: Record<string, never>; result: WorkspaceListView };
  workspace_create: { args: { name: string }; result: WorkspaceOpen };
  workspace_open: { args: { id: string }; result: WorkspaceOpen };
  workspace_rename: { args: { name: string }; result: WorkspaceView };
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
};
