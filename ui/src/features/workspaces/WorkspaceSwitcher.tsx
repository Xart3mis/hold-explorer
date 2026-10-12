import { useEffect, useId, useRef, useState } from "react";
import { Input, TextField as RacTextField } from "react-aria-components";
import { useLocation, useNavigate } from "react-router";
import { asCommandError } from "../../api/error";
import { OVERVIEW_PATH, WELCOME_PATH, type Destination } from "../../app/destinations";
import { t } from "../../app/i18n";
import { useApp } from "../../app/useApp";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../../bindings/WorkspaceView";
import {
  MenuButton,
  MenuItem,
  MenuSection,
  MenuSeparator,
  Spinner,
  useToast,
  VisuallyHidden,
} from "../../components";
import { cx } from "../../components/cx";
import type { ShellProblem } from "../shell/problem";
import styles from "./WorkspaceSwitcher.module.css";

/** The address that opens the welcome page with the form for a new workspace. */
export const NEW_WORKSPACE_PATH = `${WELCOME_PATH}?new=1`;

interface RenameFieldProps {
  /** The name the workspace has. */
  name: string;
  isPending: boolean;
  /** The id of what says why the last try failed, when it did. */
  errorId: string | undefined;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/**
 * The name of the workspace as a field, in the place of the switcher. Enter saves, Escape cancels,
 * as in a cell of a spreadsheet. Leaving the field with the name untouched cancels as well; a name
 * that was changed stays in the field until one of the two keys decides.
 */
function RenameField({ name, isPending, errorId, onSave, onCancel }: RenameFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [value, setValue] = useState(name);

  // The field takes the focus with the old name selected, ready to be typed over.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <span className={styles.rename} data-pending={isPending ? "" : undefined}>
      <RacTextField
        aria-label={t("workspaces.nameLabel")}
        aria-describedby={errorId === undefined ? hintId : `${hintId} ${errorId}`}
        value={value}
        onChange={setValue}
        isInvalid={errorId !== undefined}
        isReadOnly={isPending}
        className={cx(styles.renameField)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!isPending) onSave(value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            if (!isPending) onCancel();
          }
        }}
        onBlur={() => {
          if (!isPending && value === name && errorId === undefined) onCancel();
        }}
      >
        <Input ref={input} className={cx(styles.renameInput)} />
      </RacTextField>
      <VisuallyHidden id={hintId}>{t("workspaces.renameHint")}</VisuallyHidden>
      {isPending ? <Spinner className={styles.renameSpinner} /> : null}
    </span>
  );
}

export interface WorkspaceSwitcherProps {
  /** The workspace that is open. */
  open: WorkspaceOpen;
  /** Every readable workspace of the folder in use, in the order the command lists them. */
  workspaces: readonly WorkspaceView[];
  /** The destinations: opening another workspace keeps the user on a destination, and on no other page. */
  destinations: readonly Destination[];
  /** The id of the notice that shows the shell's problem, while the problem is a failed rename. */
  renameErrorId: string | undefined;
  /** Says what went wrong, for the shell to show under the top bar; `null` takes it back. */
  onProblem: (problem: ShellProblem | null) => void;
}

/**
 * The workspace switcher of the top bar: the name of the open workspace, and a menu with the
 * other workspaces to open, "Rename workspace", "New workspace", and "All workspaces". A rename
 * edits the name in place and offers Undo in a toast; a new workspace is named in a form on the
 * welcome page.
 */
export function WorkspaceSwitcher({
  open,
  workspaces,
  destinations,
  renameErrorId,
  onProblem,
}: WorkspaceSwitcherProps) {
  const { openWorkspace, renameWorkspace } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const trigger = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const wasRenaming = useRef(false);

  // Once the field has given its place back, the focus returns to the switcher.
  useEffect(() => {
    if (wasRenaming.current && !renaming) trigger.current?.focus();
    wasRenaming.current = renaming;
  }, [renaming]);

  const name = open.workspace.name;
  const others = workspaces.filter((workspace) => workspace.id !== open.workspace.id);

  const renameFailed = (error: unknown) => {
    onProblem({
      kind: "rename",
      title: t("workspaces.renameError"),
      message: asCommandError(error).message,
    });
  };

  const save = (typed: string) => {
    const next = typed.trim();
    if (next === "") {
      onProblem({
        kind: "rename",
        title: t("workspaces.renameError"),
        message: t("workspaces.nameMissing"),
      });
      return;
    }
    if (next === name) {
      onProblem(null);
      setRenaming(false);
      return;
    }
    renameWorkspace.mutate(next, {
      onSuccess: (renamed) => {
        onProblem(null);
        setRenaming(false);
        toast.show({
          message: t("workspaces.renamed", { name: renamed.name }),
          action: {
            label: t("common.undo"),
            onAction: () => {
              // Undo renames back through the same command.
              renameWorkspace.mutate(name, {
                onSuccess: (restored) => {
                  toast.show({ message: t("workspaces.renamedBack", { name: restored.name }) });
                },
                onError: renameFailed,
              });
            },
          },
        });
      },
      // The field stays in edit mode, with what was typed, beside the reason.
      onError: renameFailed,
    });
  };

  if (renaming) {
    return (
      <RenameField
        name={name}
        isPending={renameWorkspace.isPending}
        errorId={renameErrorId}
        onSave={save}
        onCancel={() => {
          onProblem(null);
          setRenaming(false);
        }}
      />
    );
  }

  const openOther = (id: string) => {
    openWorkspace.mutate(id, {
      onSuccess: () => {
        onProblem(null);
        // Another workspace has the same destinations. Any other page belongs to what was open.
        if (!destinations.some((destination) => destination.path === pathname)) {
          void navigate(OVERVIEW_PATH);
        }
      },
      onError: (error) => {
        onProblem({
          kind: "action",
          title: t("workspaces.openError"),
          message: asCommandError(error).message,
        });
      },
    });
  };

  return (
    <MenuButton
      label={name}
      aria-label={t("workspaces.switcherName", { name })}
      menuLabel={t("workspaces.switcher")}
      isPending={openWorkspace.isPending || renameWorkspace.isPending}
      triggerRef={trigger}
      className={styles.trigger}
    >
      {others.length === 0 ? null : (
        <>
          <MenuSection title={t("workspaces.others")}>
            {others.map((workspace) => (
              <MenuItem
                key={workspace.id}
                id={workspace.id}
                detail={t("workspaces.snapshotCount", { count: workspace.snapshot_count })}
                onAction={() => {
                  openOther(workspace.id);
                }}
              >
                {workspace.name}
              </MenuItem>
            ))}
          </MenuSection>
          <MenuSeparator />
        </>
      )}
      <MenuItem
        id="rename"
        onAction={() => {
          onProblem(null);
          setRenaming(true);
        }}
      >
        {t("workspaces.rename")}
      </MenuItem>
      <MenuItem
        id="new"
        onAction={() => {
          void navigate(NEW_WORKSPACE_PATH);
        }}
      >
        {t("workspaces.new")}
      </MenuItem>
      <MenuItem
        id="all"
        onAction={() => {
          void navigate(WELCOME_PATH);
        }}
      >
        {t("workspaces.all")}
      </MenuItem>
    </MenuButton>
  );
}
