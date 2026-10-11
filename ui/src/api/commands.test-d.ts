// Typecheck only (never run): each api function returns the generated type.
import type { CommandError } from "../bindings/CommandError";
import type { AppStart } from "../bindings/AppStart";
import type { Settings } from "../bindings/Settings";
import type { WorkspaceListView } from "../bindings/WorkspaceListView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";
import type { api } from "./commands";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Check<T extends true> = T;

export type Checks = [
  Check<Equal<ReturnType<typeof api.appStart>, Promise<AppStart>>>,
  Check<Equal<ReturnType<typeof api.setTheme>, Promise<Settings>>>,
  Check<Equal<ReturnType<typeof api.workspaceList>, Promise<WorkspaceListView>>>,
  Check<Equal<ReturnType<typeof api.workspaceCreate>, Promise<WorkspaceOpen>>>,
  Check<Equal<ReturnType<typeof api.workspaceOpen>, Promise<WorkspaceOpen>>>,
  Check<Equal<ReturnType<typeof api.workspaceRename>, Promise<WorkspaceView>>>,
  Check<Equal<AppStart["list_error"], CommandError | null>>,
  Check<Equal<WorkspaceOpen["warning"], CommandError | null>>,
];

// A wrong argument is a type error.
// @ts-expect-error a theme is one of the generated names
void (undefined as unknown as typeof api).setTheme("Blue");
