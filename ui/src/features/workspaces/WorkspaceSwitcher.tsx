import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input, TextField as RacTextField } from "react-aria-components";
import { useLocation, useNavigate } from "react-router";
import { asCommandError } from "../../api/error";
import { OVERVIEW_PATH, WELCOME_PATH, type Destination } from "../../app/destinations";
import { t } from "../../app/i18n";
import { useApp, WORKSPACE_CHANGED } from "../../app/useApp";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import type { WorkspaceView } from "../../bindings/WorkspaceView";
import {
  IconButton,
  MenuButton,
  MenuItem,
  MenuSection,
  MenuSeparator,
  useToast,
  VisuallyHidden,
} from "../../components";
import { cx } from "../../components/cx";
import type { ShellProblem } from "../shell/problem";
import styles from "./WorkspaceSwitcher.module.css";

/** The address that opens the welcome page with the form for a new workspace. */
export const NEW_WORKSPACE_PATH = `${WELCOME_PATH}?new=1`;

/** How the field was left: by its own keys or its cancel control, or by the focus going elsewhere. */
type Leaving = "keys" | "focus";

interface RenameFieldProps {
  /** The name the workspace has. */
  name: string;
  isPending: boolean;
  /** What was typed when the last save failed. The field is marked invalid while it still says that. */
  failed: string | null;
  /** The id of what says why that save failed, while that is shown. */
  errorId: string | undefined;
  onSave: (name: string, leaving: Leaving) => void;
  onCancel: (leaving: Leaving) => void;
}

/**
 * The name of the workspace as a field, in the place of the switcher. Enter saves and Escape
 * cancels, as in a cell of a spreadsheet, and a cancel control sits beside the field. When the
 * focus goes elsewhere, a changed name is saved, as Enter would save it, and an untouched one
 * closes the field; the focus going to the cancel control is not a reason to save.
 */
function RenameField({ name, isPending, failed, errorId, onSave, onCancel }: RenameFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const cancelId = useId();
  const [value, setValue] = useState(name);
  // The mark of a failed save goes as soon as the name is edited: it described what was typed then.
  const isInvalid = errorId !== undefined && failed !== null && value === failed;

  // The field takes the focus with the old name selected, ready to be typed over.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <span className={styles.rename}>
      <RacTextField
        aria-label={t("workspaces.nameLabel")}
        aria-describedby={isInvalid ? `${hintId} ${errorId}` : hintId}
        value={value}
        onChange={setValue}
        isInvalid={isInvalid}
        isReadOnly={isPending}
        className={cx(styles.renameField)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!isPending) onSave(value, "keys");
          } else if (event.key === "Escape") {
            event.preventDefault();
            if (!isPending) onCancel("keys");
          }
        }}
        onBlur={(event) => {
          if (isPending) return;
          const next: unknown = event.relatedTarget;
          if (next instanceof Element && next.id === cancelId) return;
          if (value.trim() === name) onCancel("focus");
          else onSave(value, "focus");
        }}
      >
        <Input ref={input} className={cx(styles.renameInput)} />
      </RacTextField>
      <VisuallyHidden id={hintId}>{t("workspaces.renameHint")}</VisuallyHidden>
      {/* While the name is saved the control waits with it, and keeps its place. */}
      <IconButton
        id={cancelId}
        icon={X}
        label={t("workspaces.renameCancel")}
        isPending={isPending}
        onPress={() => {
          onCancel("keys");
        }}
      />
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
 *
 * A rename and its Undo belong to the workspace they were started for. The rename command acts
 * on whichever workspace is open, so both name that workspace, the offer to undo is taken away
 * when another workspace is opened, and a name that is being edited is dropped with its field.
 */
export function WorkspaceSwitcher({
  open,
  workspaces,
  destinations,
  renameErrorId,
  onProblem,
}: WorkspaceSwitcherProps) {
  const { openWorkspace, renameWorkspace, isBusy } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const trigger = useRef<HTMLButtonElement>(null);

  const { id, name } = open.workspace;
  // The workspace whose name is being edited. Once another one is open, no name is being edited.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renaming = renamingId === id;
  // What was typed when the last save failed, until the next save or the end of the edit.
  const [failed, setFailed] = useState<string | null>(null);
  // Whether the focus returns to the switcher when the field closes: it does unless the user
  // took it elsewhere.
  const focusBack = useRef(false);
  const wasRenaming = useRef(false);
  useEffect(() => {
    if (wasRenaming.current && !renaming && focusBack.current) trigger.current?.focus();
    wasRenaming.current = renaming;
  }, [renaming]);

  // The offer to undo a rename, and the workspace it belongs to.
  const undo = useRef<{ toast: string; workspace: string } | null>(null);
  useEffect(() => {
    if (undo.current === null || undo.current.workspace === id) return;
    toast.dismiss(undo.current.toast);
    undo.current = null;
  }, [id, toast]);

  const others = workspaces.filter((workspace) => workspace.id !== id);

  const close = (leaving: Leaving) => {
    focusBack.current = leaving === "keys";
    setFailed(null);
    setRenamingId(null);
  };

  const save = (typed: string, leaving: Leaving) => {
    const next = typed.trim();
    if (next === "") {
      setFailed(typed);
      onProblem({
        kind: "rename",
        title: t("workspaces.renameError"),
        message: t("workspaces.nameMissing"),
      });
      return;
    }
    if (next === name) {
      onProblem(null);
      close(leaving);
      return;
    }
    renameWorkspace.mutate(
      { id, name: next },
      {
        onSuccess: (renamed) => {
          onProblem(null);
          close(leaving);
          const shown = toast.show({
            message: t("workspaces.renamed", { name: renamed.name }),
            action: {
              label: t("common.undo"),
              // Undo renames back through the same command, and only the workspace it renamed.
              onAction: () => {
                undo.current = null;
                renameWorkspace.mutate(
                  { id: renamed.id, name },
                  {
                    onSuccess: (restored) => {
                      toast.show({ message: t("workspaces.renamedBack", { name: restored.name }) });
                    },
                    onError: (error) => {
                      const reason = asCommandError(error);
                      // Another workspace is open by now: there is nothing left to undo here.
                      if (reason.kind === WORKSPACE_CHANGED) return;
                      onProblem({
                        kind: "action",
                        title: t("workspaces.renameError"),
                        message: reason.message,
                      });
                    },
                  },
                );
              },
            },
          });
          undo.current = { toast: shown, workspace: renamed.id };
        },
        // The field stays in edit mode, with what was typed, beside the reason.
        onError: (error) => {
          setFailed(typed);
          onProblem({
            kind: "rename",
            title: t("workspaces.renameError"),
            message: asCommandError(error).message,
          });
        },
      },
    );
  };

  if (renaming) {
    return (
      <RenameField
        name={name}
        isPending={renameWorkspace.isPending}
        failed={failed}
        errorId={renameErrorId}
        onSave={save}
        onCancel={(leaving) => {
          onProblem(null);
          close(leaving);
        }}
      />
    );
  }

  const openOther = (other: string) => {
    openWorkspace.mutate(other, {
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
      isPending={openWorkspace.isPending}
      isInert={isBusy}
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
          setFailed(null);
          focusBack.current = false;
          setRenamingId(id);
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
