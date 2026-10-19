import type { ReactNode, Ref } from "react";
import type { AppError } from "../../api/error";
import { Notice } from "../../components";
import { t, type MessageKey } from "../../text/i18n";
import styles from "./Import.module.css";

/** What failed, in the words of the import flow, by the kind of the error. */
const titles: Partial<Record<AppError["kind"], MessageKey>> = {
  NotFound: "import.error.NotFound",
  Unreadable: "import.error.Unreadable",
  EmptyFile: "import.error.EmptyFile",
  NoDataSheet: "import.error.NoDataSheet",
  SheetNotFound: "import.error.SheetNotFound",
  MissingColumns: "import.error.MissingColumns",
  Empty: "import.error.Empty",
  NoHolds: "import.error.NoHolds",
  AlreadyImported: "import.error.AlreadyImported",
  SnapshotDateOutOfRange: "import.error.SnapshotDateOutOfRange",
  SnapshotNotFound: "import.error.SnapshotNotFound",
  ReplaceNotOffered: "import.error.ReplaceNotOffered",
  WorkspaceNotFound: "import.error.WorkspaceNotFound",
  NoDraft: "import.error.NoDraft",
  Dialog: "import.error.Dialog",
};

export interface ImportProblemProps {
  /** What the failed command returned. */
  error: AppError;
  /** The title for a kind that has none of its own: what the page was doing when it failed. */
  general: MessageKey;
  /** Quiet buttons that act on the error. */
  actions?: ReactNode;
  /**
   * Makes the error something the page can move the focus to, and gives the page its element.
   * A page does that when the control that had the focus went away with what failed: the user
   * is then at the error, which says what happened and how to fix it, and Tab goes on from it.
   */
  focusRef?: Ref<HTMLDivElement>;
}

/**
 * An error of the import flow, on the page where it occurred: a title by the kind of the error,
 * then the command's own message, unchanged, which says why and how to fix it.
 */
export function ImportProblem({ error, general, actions, focusRef }: ImportProblemProps) {
  return (
    <div
      data-kind={error.kind}
      {...(focusRef === undefined
        ? {}
        : { ref: focusRef, tabIndex: -1, className: styles.focusTarget })}
    >
      <Notice
        tone="danger"
        title={t(titles[error.kind] ?? general)}
        {...(actions === undefined ? {} : { actions })}
      >
        {error.message}
      </Notice>
    </div>
  );
}
