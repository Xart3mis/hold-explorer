// Typecheck only (never run): each function of a command returns the generated type.
import type { CommandError } from "../bindings/CommandError";
import type { AppStart } from "../bindings/AppStart";
import type { Settings } from "../bindings/Settings";
import type { WorkspaceListView } from "../bindings/WorkspaceListView";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../bindings/WorkspaceView";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportDraft } from "../bindings/ImportDraft";
import type { ImportReview } from "../bindings/ImportReview";
import type { BlockerDetail } from "../bindings/BlockerDetail";
import type { FoldedMatrix } from "../bindings/FoldedMatrix";
import type { Group } from "../bindings/Group";
import type { GroupDetail } from "../bindings/GroupDetail";
import type { SolveView } from "../bindings/SolveView";
import type { FilterOptions } from "../bindings/FilterOptions";
import type { HoldRef } from "../bindings/HoldRef";
import type { HoldsView } from "../bindings/HoldsView";
import type { LineDetail } from "../bindings/LineDetail";
import type { LinePage } from "../bindings/LinePage";
import type { OverviewView } from "../bindings/OverviewView";
import type { TargetCheck } from "../bindings/TargetCheck";
import type { ValuePage } from "../bindings/ValuePage";
import type { api } from "./commands";
import type { workspaceApi } from "./workspace-commands";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Check<T extends true> = T;

export type Checks = [
  Check<Equal<ReturnType<typeof workspaceApi.appStart>, Promise<AppStart>>>,
  Check<Equal<ReturnType<typeof api.setTheme>, Promise<Settings>>>,
  Check<Equal<ReturnType<typeof api.workspaceList>, Promise<WorkspaceListView>>>,
  Check<Equal<ReturnType<typeof workspaceApi.workspaceCreate>, Promise<WorkspaceOpen>>>,
  Check<Equal<ReturnType<typeof workspaceApi.workspaceOpen>, Promise<WorkspaceOpen>>>,
  Check<Equal<ReturnType<typeof workspaceApi.workspaceRename>, Promise<WorkspaceView>>>,
  Check<Equal<ReturnType<typeof api.importOpen>, Promise<ImportDraft>>>,
  Check<Equal<ReturnType<typeof api.importChooseSheet>, Promise<ImportDraft>>>,
  Check<Equal<ReturnType<typeof api.importReview>, Promise<ImportReview>>>,
  Check<Equal<ReturnType<typeof api.importCheckTarget>, Promise<TargetCheck>>>,
  Check<Equal<ReturnType<typeof workspaceApi.importCommit>, Promise<ImportDone>>>,
  Check<Equal<ReturnType<typeof api.importCancel>, Promise<null>>>,
  Check<Equal<ReturnType<typeof workspaceApi.snapshotSelect>, Promise<WorkspaceOpen>>>,
  Check<Equal<ReturnType<typeof api.overview>, Promise<OverviewView | null>>>,
  Check<Equal<ReturnType<typeof workspaceApi.demoCreate>, Promise<WorkspaceOpen>>>,
  Check<Equal<ReturnType<typeof api.filterOptions>, Promise<FilterOptions>>>,
  Check<Equal<ReturnType<typeof api.filterValues>, Promise<ValuePage>>>,
  Check<Equal<ReturnType<typeof api.lines>, Promise<LinePage>>>,
  Check<Equal<ReturnType<typeof api.holds>, Promise<HoldsView>>>,
  Check<Equal<ReturnType<typeof api.lineDetail>, Promise<LineDetail | null>>>,
  Check<Equal<ReturnType<typeof api.holdDetail>, Promise<HoldRef | null>>>,
  Check<Equal<ReturnType<typeof api.workspaceCurrent>, Promise<WorkspaceOpen | null>>>,
  Check<Equal<ReturnType<typeof api.breakdown>, Promise<Group[]>>>,
  Check<Equal<ReturnType<typeof api.matrix>, Promise<FoldedMatrix>>>,
  Check<Equal<ReturnType<typeof api.solveOrder>, Promise<SolveView>>>,
  Check<Equal<ReturnType<typeof api.blockerDetail>, Promise<BlockerDetail | null>>>,
  Check<Equal<ReturnType<typeof api.groupDetail>, Promise<GroupDetail | null>>>,
  Check<Equal<AppStart["list_error"], CommandError | null>>,
  Check<Equal<WorkspaceOpen["warning"], CommandError | null>>,
];

// A wrong argument is a type error.
// @ts-expect-error a theme is one of the generated names
void (undefined as unknown as typeof api).setTheme("Blue");

// A command that changes the view is not among the functions of `api`: a feature cannot send one.
type OnlyInWorkspaceApi<Name extends keyof typeof workspaceApi> = Name extends keyof typeof api
  ? false
  : true;
export type Apart = Check<OnlyInWorkspaceApi<keyof typeof workspaceApi>>;
