// Typecheck only (never run): each api function returns the generated type.
import type { CommandError } from "../bindings/CommandError";
import type { AppStart } from "../bindings/AppStart";
import type { Settings } from "../bindings/Settings";
import type { WorkspaceListView } from "../bindings/WorkspaceListView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportDraft } from "../bindings/ImportDraft";
import type { ImportReview } from "../bindings/ImportReview";
import type { OverviewView } from "../bindings/OverviewView";
import type { TargetCheck } from "../bindings/TargetCheck";
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
  Check<Equal<ReturnType<typeof api.importOpen>, Promise<ImportDraft>>>,
  Check<Equal<ReturnType<typeof api.importChooseSheet>, Promise<ImportDraft>>>,
  Check<Equal<ReturnType<typeof api.importReview>, Promise<ImportReview>>>,
  Check<Equal<ReturnType<typeof api.importCheckTarget>, Promise<TargetCheck>>>,
  Check<Equal<ReturnType<typeof api.importCommit>, Promise<ImportDone>>>,
  Check<Equal<ReturnType<typeof api.importCancel>, Promise<null>>>,
  Check<Equal<ReturnType<typeof api.snapshotSelect>, Promise<WorkspaceOpen>>>,
  Check<Equal<ReturnType<typeof api.overview>, Promise<OverviewView | null>>>,
  Check<Equal<ReturnType<typeof api.demoCreate>, Promise<WorkspaceOpen>>>,
  Check<Equal<AppStart["list_error"], CommandError | null>>,
  Check<Equal<WorkspaceOpen["warning"], CommandError | null>>,
];

// A wrong argument is a type error.
// @ts-expect-error a theme is one of the generated names
void (undefined as unknown as typeof api).setTheme("Blue");
