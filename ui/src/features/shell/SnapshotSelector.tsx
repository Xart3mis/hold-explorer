import { asCommandError } from "../../api/error";
import { formatDate, formatDateTime } from "../../app/format";
import { t } from "../../app/i18n";
import { useApp } from "../../app/useApp";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import { MenuButton, MenuItem, MenuSection } from "../../components";
import type { ShellProblem } from "./problem";

export interface SnapshotSelectorProps {
  /** The open workspace: its snapshots, oldest first, and the one in view. */
  open: WorkspaceOpen;
  /** Says what went wrong, for the shell to show under the top bar; `null` takes it back. */
  onProblem: (problem: ShellProblem | null) => void;
}

/**
 * The snapshot selector of the top bar: the date of the snapshot in view, and a menu of every
 * snapshot, newest first, with its date, time, and number of holds, and whether it is a limited
 * one. The one in view is marked.
 */
export function SnapshotSelector({ open, onProblem }: SnapshotSelectorProps) {
  const { selectSnapshot, isBusy } = useApp();
  const selected = open.snapshots.find((snapshot) => snapshot.id === open.selected);
  // The command lists the snapshots oldest first; the menu starts with the newest.
  const newestFirst = [...open.snapshots].reverse();
  if (selected === undefined) return null;

  return (
    <MenuButton
      label={t("snapshots.trigger", { date: formatDate(selected.taken_at) })}
      menuLabel={t("snapshots.menu")}
      isPending={isBusy}
      align="end"
    >
      <MenuSection
        title={t("snapshots.list")}
        selectedKey={String(selected.id)}
        onSelectionChange={(id) => {
          selectSnapshot.mutate(Number(id), {
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
