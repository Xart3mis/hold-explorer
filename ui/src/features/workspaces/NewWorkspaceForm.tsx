import { useEffect, useRef, useState } from "react";
import { asCommandError } from "../../api/error";
import { t } from "../../app/i18n";
import { useApp } from "../../app/useApp";
import { Button, Notice, TextField } from "../../components";
import styles from "./NewWorkspaceForm.module.css";

export interface NewWorkspaceFormProps {
  /** Called once the workspace is created and open. */
  onCreated: () => void;
  /** Called when the form is closed without creating anything. */
  onCancel: () => void;
}

/**
 * The form that names a new workspace, shown on the page and not in a dialog. Enter or "Create
 * workspace" creates the workspace and opens it; Escape or "Cancel" closes the form. A failed
 * create keeps the form, with the reason and what to do under the field.
 */
export function NewWorkspaceForm({ onCreated, onCancel }: NewWorkspaceFormProps) {
  const { createWorkspace, isBusy } = useApp();
  const [name, setName] = useState("");
  const [isMissing, setMissing] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  // The form was asked for, so its one field takes the focus.
  useEffect(() => {
    form.current?.querySelector("input")?.focus();
  }, []);

  const create = () => {
    const typed = name.trim();
    if (typed === "") {
      setMissing(true);
      return;
    }
    createWorkspace.mutate(typed, { onSuccess: onCreated });
  };

  return (
    <form
      ref={form}
      className={styles.form}
      aria-labelledby="new-workspace-title"
      onSubmit={(event) => {
        event.preventDefault();
        // Another action on the workspaces is on its way: this one waits for the user to ask again.
        if (!isBusy) create();
      }}
    >
      <h2 id="new-workspace-title" className={styles.title}>
        {t("workspaces.new")}
      </h2>
      <TextField
        label={t("workspaces.nameLabel")}
        description={t("workspaces.nameHelp")}
        placeholder={t("workspaces.namePlaceholder")}
        value={name}
        onChange={(value) => {
          setName(value);
          setMissing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else {
            // Enter still reaches the form, which creates the workspace.
            event.continuePropagation();
          }
        }}
        {...(isMissing ? { errorMessage: t("workspaces.nameMissing") } : {})}
        className={styles.field}
      />
      {createWorkspace.isError ? (
        <Notice tone="danger" title={t("workspaces.createError")}>
          {asCommandError(createWorkspace.error).message}
        </Notice>
      ) : null}
      <div className={styles.actions}>
        <Button type="submit" isPending={createWorkspace.isPending} isInert={isBusy}>
          {t("workspaces.create")}
        </Button>
        <Button variant="quiet" onPress={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
