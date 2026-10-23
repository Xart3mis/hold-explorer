/**
 * The actions on the saved views of the open workspace: save, rename, delete, restore, and move.
 * Each command names the workspace it is meant for and refuses another (`WorkspaceNotFound`), and
 * answers the whole list in sidebar order, which is written into the cached start as the views
 * of that workspace. See ui/src/app/actions/start.ts.
 *
 * They are not actions on the view (`workspaceAction()`): none of them opens a workspace or
 * selects a snapshot, so nothing that is read for the snapshot in view has to wait for them, and
 * a workspace that is opened meanwhile is not touched, since the command names the one it is
 * for. They run one after another among themselves, in the order they were asked for, so an Undo
 * of a delete that comes before the delete has answered still finds the view gone.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/commands";
import { keys } from "../../api/keys";
import type { AppStart } from "../../bindings/AppStart";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { SavedView } from "../../bindings/SavedView";
import { changeStart } from "./start";

/** The one queue the saved-view commands wait in. */
const VIEWS_SCOPE = { id: "saved-views" };

/** A view to save: the workspace it is saved in, its name, the address, and the filters. */
export interface ViewToSave {
  workspace: string;
  name: string;
  address: string;
  filters: FilterSpec;
}

/** A view of a workspace, by its id. */
export interface ViewOf {
  workspace: string;
  id: number;
}

/** A deleted view to put back at its place in the list. */
export interface ViewToRestore {
  workspace: string;
  view: SavedView;
  index: number;
}

/** The saved views of the open workspace, in sidebar order; none without one. */
export function viewsOf(start: AppStart | undefined): readonly SavedView[] {
  return start?.open?.views ?? [];
}

/**
 * The actions on the saved views. Each writes the list its command answered into the cached
 * start, as the views of the workspace it named, while that workspace is the open one.
 */
export function useSavedViews() {
  const client = useQueryClient();
  const keep = (workspace: string, views: SavedView[]) => {
    changeStart(client, (start) =>
      start.open?.workspace.id === workspace ? { ...start, open: { ...start.open, views } } : start,
    );
  };
  const options = <Variables extends { workspace: string }>(
    mutationFn: (variables: Variables) => Promise<SavedView[]>,
  ) => ({
    mutationKey: keys.savedViews,
    scope: VIEWS_SCOPE,
    mutationFn,
    onSuccess: (views: SavedView[], { workspace }: Variables) => {
      keep(workspace, views);
    },
  });

  const saveView = useMutation(
    options(({ workspace, name, address, filters }: ViewToSave) =>
      api.saveView(workspace, name, address, filters),
    ),
  );
  const renameView = useMutation(
    options(({ workspace, id, name }: ViewOf & { name: string }) =>
      api.renameView(workspace, id, name),
    ),
  );
  const deleteView = useMutation(
    options(({ workspace, id }: ViewOf) => api.deleteView(workspace, id)),
  );
  const restoreView = useMutation(
    options(({ workspace, view, index }: ViewToRestore) => api.restoreView(workspace, view, index)),
  );
  const moveView = useMutation(
    options(({ workspace, id, index }: ViewOf & { index: number }) =>
      api.moveView(workspace, id, index),
    ),
  );

  return { saveView, renameView, deleteView, restoreView, moveView };
}
