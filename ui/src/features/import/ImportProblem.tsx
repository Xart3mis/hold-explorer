import type { ReactNode } from "react";
import { t, type MessageKey } from "../../app/i18n";
import type { CommandError } from "../../bindings/CommandError";
import { Notice } from "../../components";

/** What failed, in the words of the import flow, by the kind of the error. */
const titles: Record<string, MessageKey> = {
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
  WorkspaceNotFound: "import.error.WorkspaceNotFound",
  NoDraft: "import.error.NoDraft",
  Dialog: "import.error.Dialog",
};

export interface ImportProblemProps {
  /** What the failed command returned. */
  error: CommandError;
  /** The title for a kind that has none of its own: what the page was doing when it failed. */
  general: MessageKey;
  /** Quiet buttons that act on the error. */
  actions?: ReactNode;
}

/**
 * An error of the import flow, on the page where it occurred: a title by the kind of the error,
 * then the command's own message, unchanged, which says why and how to fix it.
 */
export function ImportProblem({ error, general, actions }: ImportProblemProps) {
  return (
    <div data-kind={error.kind}>
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
