// The actions on the saved views as the sidebar and the filter bar use them, made once for the
// shell: the mutations, the toast of a delete with its Undo, and the toast of a failure. They
// live as long as the shell does, so an Undo offered from a popover that has closed is still put
// away when another workspace opens.
import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { asCommandError } from "../../api/error";
import { keys } from "../../api/keys";
import { useSavedViews } from "../../app/actions/views";
import { useShell } from "../../app/shell/context";
import type { AppStart } from "../../bindings/AppStart";
import type { SavedView } from "../../bindings/SavedView";
import { useToast } from "../../components";
import { t } from "../../text/i18n";

/** What a delete calls when it is over: once the view is gone, or when it could not be deleted. */
export interface DeleteCallbacks {
  onDone?: () => void;
  onFailed?: () => void;
}

export interface ViewActions {
  /** The mutations of ui/src/app/actions/views.ts, made once. */
  saveView: ReturnType<typeof useSavedViews>["saveView"];
  renameView: ReturnType<typeof useSavedViews>["renameView"];
  /**
   * Moves a view one place up (`-1`) or down (`1`), from where the list holds it when this is
   * called; nothing past either end. Resolves once the list has answered.
   */
  move: (workspace: string, id: number, by: -1 | 1) => Promise<void>;
  /** Deletes a view at once and offers to put it back where it was, with an Undo. */
  remove: (workspace: string, view: SavedView, index: number, callbacks?: DeleteCallbacks) => void;
  /** Says that something failed, in the words of the command, in a toast that stays. */
  failed: (error: unknown) => void;
  /** Says what was done. */
  done: (message: string) => void;
}

const ViewActionsContext = createContext<ViewActions | null>(null);

/** The actions on the saved views. Only inside `ViewActionsProvider`, which the shell holds. */
export function useViewActions(): ViewActions {
  const actions = use(ViewActionsContext);
  if (actions === null) {
    throw new Error(
      "useViewActions was called outside a ViewActionsProvider, so there is nothing to act with. " +
        "Render the component inside the shell (AppLayout), which provides it.",
    );
  }
  return actions;
}

/** Makes the actions on the saved views once, for everything inside the shell. */
export function ViewActionsProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const toast = useToast();
  const { start } = useShell();
  const { saveView, renameView, deleteView, restoreView, moveView } = useSavedViews();
  const workspace = start.open?.workspace.id ?? null;

  // The Undo toasts offered, by the workspace they belong to: another workspace puts them away.
  const offered = useRef<{ toast: string; workspace: string }[]>([]);
  useEffect(() => {
    for (const held of offered.current) {
      if (held.workspace !== workspace) toast.dismiss(held.toast);
    }
    offered.current = offered.current.filter((held) => held.workspace === workspace);
  }, [workspace, toast]);

  const failed = useCallback(
    (error: unknown) => {
      toast.show({ message: asCommandError(error).message, tone: "danger" });
    },
    [toast],
  );

  const done = useCallback(
    (message: string) => {
      toast.show({ message, tone: "success" });
    },
    [toast],
  );

  const remove = useCallback(
    (owner: string, view: SavedView, index: number, callbacks: DeleteCallbacks = {}) => {
      // Each call answers on its own promise: two deletes in a row each get their toast.
      void deleteView.mutateAsync({ workspace: owner, id: view.id }).then(
        () => {
          callbacks.onDone?.();
          const shown = toast.show({
            message: t("views.deleted", { name: view.name }),
            action: {
              label: t("common.undo"),
              isUndo: true,
              onAction: () => {
                offered.current = offered.current.filter((held) => held.toast !== shown);
                void restoreView.mutateAsync({ workspace: owner, view, index }).catch(failed);
              },
            },
          });
          offered.current = [...offered.current, { toast: shown, workspace: owner }];
        },
        (error: unknown) => {
          callbacks.onFailed?.();
          failed(error);
        },
      );
    },
    [deleteView, restoreView, toast, failed],
  );

  const move = useCallback(
    async (owner: string, id: number, by: -1 | 1) => {
      // The place is read now, from the list as it was last answered, not from a render.
      const views = client.getQueryData<AppStart>(keys.start)?.open?.views ?? [];
      const at = views.findIndex((view) => view.id === id);
      const to = at + by;
      if (at === -1 || to < 0 || to >= views.length) return;
      // The index counts the places of the list once the view is taken out of it.
      await moveView.mutateAsync({ workspace: owner, id, index: to });
    },
    [client, moveView],
  );

  const value = useMemo(
    () => ({ saveView, renameView, move, remove, failed, done }),
    [saveView, renameView, move, remove, failed, done],
  );
  return <ViewActionsContext value={value}>{children}</ViewActionsContext>;
}
