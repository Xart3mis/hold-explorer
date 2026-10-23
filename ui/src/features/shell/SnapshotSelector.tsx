import { useIsMutating } from "@tanstack/react-query";
import { asCommandError } from "../../api/error";
import { useSnapshotActions } from "../../app/actions/snapshots";
import { useStart } from "../../app/actions/start";
import { actionKey } from "../../app/view";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import { MenuButton, MenuItem, MenuSection } from "../../components";
import { formatDate, formatDateTime } from "../../text/format";
import { t } from "../../text/i18n";
import type { ShellProblem } from "./problem";

export interface SnapshotSelectorProps {
  /** The open workspace: its snapshots, oldest first, and the one in view. */
  open: WorkspaceOpen;
  /** Says what went wrong, for the shell to show under the top bar; `null` takes it back. */
  onProblem: (problem: ShellProblem | null) => void;
}

/** The control a selection asked for through `useSelectSnapshot` belongs to. */
const SNAPSHOT_SELECTOR = "snapshot-selector";

/**
 * The way the snapshot selector selects a snapshot, for it and for the command palette: the
 * action on the workspace, with its failure said by `onProblem` and taken back once a selection
 * works. The selection belongs to the selector, whichever of the two asks for it: `isPending` is
 * true while any selection asked for through this hook runs, so the selector shows the spinner
 * also for a snapshot chosen in the palette.
 */
export function useSelectSnapshot(onProblem: (problem: ShellProblem | null) => void) {
  const { selectSnapshot } = useSnapshotActions(SNAPSHOT_SELECTOR);
  const running = useIsMutating({ mutationKey: actionKey("selecting", SNAPSHOT_SELECTOR) });
  const select = (id: number) => {
    selectSnapshot.mutate(id, {
      onSuccess: () => {
        onProblem(null);
      },
      onError: (error) => {
        onProblem({
          kind: "action",
          title: t("snapshots.selectError"),
          message: asCommandError(error).message,
        });
      },
    });
  };
  return { select, isPending: running > 0 };
}

/**
 * The snapshot selector of the top bar: the date of the snapshot in view, and a menu of every
 * snapshot, newest first, with its date, time, and number of holds, and whether it is a limited
 * one. The one in view is marked. It shows the spinner while a snapshot chosen here is being
 * selected; while another control's action on the workspace runs, it waits without one.
 */
export function SnapshotSelector({ open, onProblem }: SnapshotSelectorProps) {
  const { select, isPending } = useSelectSnapshot(onProblem);
  const { isBusy } = useStart();
  const selected = open.snapshots.find((snapshot) => snapshot.id === open.selected);
  // The command lists the snapshots oldest first; the menu starts with the newest.
  const newestFirst = [...open.snapshots].reverse();
  if (selected === undefined) return null;

  return (
    <MenuButton
      label={t("snapshots.trigger", { date: formatDate(selected.taken_at) })}
      menuLabel={t("snapshots.menu")}
      isPending={isPending}
      isInert={isBusy}
      align="end"
    >
      <MenuSection
        title={t("snapshots.list")}
        selectedKey={String(selected.id)}
        onSelectionChange={(id) => {
          select(Number(id));
        }}
      >
        {newestFirst.map((snapshot) => (
          <MenuItem
            key={snapshot.id}
            id={String(snapshot.id)}
            // A limited snapshot is said to be one, quietly, where its holds are counted.
            detail={t(snapshot.limited ? "snapshots.holdsLimited" : "snapshots.holds", {
              count: snapshot.row_count,
            })}
          >
            {formatDateTime(snapshot.taken_at)}
          </MenuItem>
        ))}
      </MenuSection>
    </MenuButton>
  );
}
