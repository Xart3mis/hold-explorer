import { FolderOpen } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { asCommandError, type AppError } from "../../api/error";
import { chooseFolder, showInFolder } from "../../api/window";
import type { useWorkspaceFolder } from "../../app/actions/folder";
import { useStart } from "../../app/actions/start";
import type { AppStart } from "../../bindings/AppStart";
import type { FolderMoved } from "../../bindings/FolderMoved";
import { Button, Notice, Progress } from "../../components";
import { t } from "../../text/i18n";
import styles from "./SettingsPage.module.css";

export interface FolderRowProps {
  start: AppStart;
  /** The change of the folder, as the page holds it for the other rows as well. */
  folder: ReturnType<typeof useWorkspaceFolder>;
}

/**
 * The workspaces folder: its path, "Change folder", "Use the default folder" when another is in
 * use, and "Show in folder". A folder that was chosen is checked, then offered in a notice in the
 * row: move its workspace files there, leave them where they are, or cancel. While the change
 * runs the row shows its progress; then a notice lists what moved and what was left, and why.
 */
export function FolderRow({ start, folder }: FolderRowProps) {
  const { change, check, move, fail, dismiss } = folder;
  const { isBusy } = useStart();
  const [showError, setShowError] = useState<AppError | null>(null);
  const labelId = useId();
  // The progress and the result are regions named by their own label or title, which takes the
  // focus when the region appears, so the ring sits on a heading.
  const progressLabelId = useId();
  const resultTitleId = useId();
  const path = start.list.folder;
  const isDefault = start.settings.workspace_dir === null;
  const checking = change?.step === "checking";
  const moving = change?.step === "moving";
  // While a folder is checked, offered, or changed, no other is chosen.
  const deciding = checking || moving || change?.step === "offer";

  // The keyboard follows the change: from the choice to the progress, from the progress to the
  // result, and back to "Change folder" when there is nothing more to read.
  const buttons = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const result = useRef<HTMLDivElement>(null);
  /** The label or the title that names a region, which takes the focus for it. */
  const titleOf = (region: HTMLDivElement | null, id: string) =>
    region?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) ?? null;
  const focusChange = () => {
    buttons.current?.querySelector("button")?.focus();
  };
  const step = change?.step;
  const before = useRef(step);
  useEffect(() => {
    const was = before.current;
    before.current = step;
    if (step === "moving" && was === "offer") titleOf(progress.current, progressLabelId)?.focus();
    // A quick answer may come before a render showed the progress: from the offer straight on.
    if ((step === "done" || step === "failed") && was !== undefined && was !== step) {
      const title = titleOf(result.current, resultTitleId);
      if (title) title.focus();
      else focusChange();
    }
  }, [step, progressLabelId, resultTitleId]);
  const putAway = () => {
    dismiss();
    focusChange();
  };

  const chooseOther = () => {
    dismiss();
    chooseFolder().then(
      (chosen) => {
        if (chosen !== null) check.mutate(chosen);
      },
      (error: unknown) => {
        fail({ ...asCommandError(error), kind: "Dialog" });
      },
    );
  };

  return (
    <div className={styles.row}>
      <div className={styles.value}>
        <span id={labelId} className={styles.label}>
          {t("settings.folder")}
        </span>
        <span className={styles.path}>{path}</span>
        <span className={styles.help}>{t("settings.folderHelp")}</span>
      </div>
      <div ref={buttons} className={styles.buttons}>
        <Button
          aria-describedby={labelId}
          icon={FolderOpen}
          isPending={change?.step === "checking" && change.path !== null}
          isInert={isBusy || deciding}
          onPress={chooseOther}
        >
          {t("settings.folderChange")}
        </Button>
        {isDefault ? null : (
          <Button
            aria-describedby={labelId}
            isPending={change?.step === "checking" && change.path === null}
            reservesPendingSpace
            isInert={isBusy || deciding}
            onPress={() => {
              dismiss();
              check.mutate(null);
            }}
          >
            {t("settings.folderDefault")}
          </Button>
        )}
        <Button
          aria-describedby={labelId}
          isInert={moving}
          onPress={() => {
            setShowError(null);
            showInFolder(path).catch((error: unknown) => {
              setShowError(asCommandError(error));
            });
          }}
        >
          {t("common.showInFolder")}
        </Button>
      </div>
      {showError === null ? null : (
        <Notice
          tone="danger"
          title={t("shell.folderError")}
          onDismiss={() => {
            setShowError(null);
          }}
        >
          {showError.message}
        </Notice>
      )}
      {change?.step === "offer" ? (
        <Offer
          from={path}
          to={change.check.path}
          isDefault={change.path === null}
          count={change.check.count}
          onMove={(moveFiles) => {
            move.mutate({ path: change.path, moveFiles });
          }}
          onCancel={putAway}
        />
      ) : null}
      {change?.step === "moving" ? (
        <div
          ref={progress}
          role="group"
          aria-labelledby={progressLabelId}
          className={styles.progress}
        >
          <Progress
            labelId={progressLabelId}
            label={
              !change.choice.moveFiles
                ? t("settings.folderSwitching")
                : change.choice.path === null
                  ? t("settings.folderMovingDefault")
                  : t("settings.folderMoving", { to: change.choice.path })
            }
          />
          <span className={styles.help}>{t("settings.folderWaiting")}</span>
        </div>
      ) : null}
      {change?.step === "done" ? (
        <div ref={result} role="group" aria-labelledby={resultTitleId}>
          <Moved
            moved={change.moved}
            from={change.from}
            titleId={resultTitleId}
            onDismiss={putAway}
          />
        </div>
      ) : null}
      {change?.step === "failed" ? (
        <div ref={result} role="group" aria-labelledby={resultTitleId}>
          <Notice
            tone="danger"
            titleId={resultTitleId}
            title={
              change.error.kind === "Dialog"
                ? t("settings.folderDialogError")
                : t("settings.folderNotChanged")
            }
            onDismiss={putAway}
          >
            {change.error.message}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}

interface OfferProps {
  from: string;
  /** The folder offered, as it was checked. */
  to: string;
  /** Whether that is the default folder. */
  isDefault: boolean;
  /** How many workspace files a move would take. */
  count: number;
  onMove: (moveFiles: boolean) => void;
  onCancel: () => void;
}

/** The choice of what happens to the workspace files: moved, left, or nothing changes. */
function Offer({ from, to, isDefault, count, onMove, onCancel }: OfferProps) {
  const choices = useRef<HTMLSpanElement>(null);
  // The choice is asked for here, so the keyboard is taken to it.
  useEffect(() => {
    choices.current?.querySelector("button")?.focus();
  }, []);
  const nothingToMove = count === 0;
  const title = nothingToMove
    ? t("settings.folderEmptyTitle")
    : isDefault
      ? t("settings.folderMoveDefaultTitle", { count })
      : t("settings.folderMoveTitle", { count });
  const body = nothingToMove
    ? t("settings.folderEmptyBody", { from, to })
    : t("settings.folderMoveBody", { from, to });
  return (
    <Notice tone="info" title={title}>
      <span className={styles.offer}>
        <span>{body}</span>
        <span ref={choices} className={styles.choices}>
          {nothingToMove ? (
            <Button
              variant="quiet"
              onPress={() => {
                onMove(false);
              }}
            >
              {t("settings.folderUse")}
            </Button>
          ) : (
            <>
              <Button
                variant="quiet"
                onPress={() => {
                  onMove(true);
                }}
              >
                {t("settings.folderMoveThem")}
              </Button>
              <Button
                variant="quiet"
                onPress={() => {
                  onMove(false);
                }}
              >
                {t("settings.folderLeaveThem")}
              </Button>
            </>
          )}
          <Button variant="quiet" onPress={onCancel}>
            {t("common.cancel")}
          </Button>
        </span>
      </span>
    </Notice>
  );
}

interface MovedProps {
  moved: FolderMoved;
  /** The folder the change started from. */
  from: string;
  /** The id the title is given, so the region around the notice is named by it. */
  titleId: string;
  onDismiss: () => void;
}

/**
 * What a change did: the files moved, and each file left where it was with the reason. When the
 * open workspace stayed open from the folder before (its file was left there), it says so: the
 * workspace is in no list until its file is moved.
 */
function Moved({ moved, from, titleId, onDismiss }: MovedProps) {
  const to = moved.start.list.folder;
  const open = moved.start.open?.workspace;
  const staysBehind =
    open !== undefined && !moved.start.list.workspaces.some((listed) => listed.id === open.id);
  const title =
    moved.moved.length > 0
      ? t("settings.folderMovedTitle", { count: moved.moved.length, to })
      : moved.left.length > 0
        ? t("settings.folderNoneMoved")
        : t("settings.folderChanged", { to });
  return (
    <Notice
      tone={moved.left.length === 0 ? "success" : "warning"}
      title={title}
      titleId={titleId}
      onDismiss={onDismiss}
    >
      <span className={styles.offer}>
        {moved.moved.length === 0 ? null : (
          <span role="list" aria-label={t("settings.folderMovedList")} className={styles.files}>
            {moved.moved.map((file) => (
              <span role="listitem" key={file} className={styles.file}>
                {file}
              </span>
            ))}
          </span>
        )}
        {moved.left.length === 0 ? null : (
          <>
            <span>{t("settings.folderLeftTitle", { count: moved.left.length })}</span>
            <span role="list" aria-label={t("settings.folderLeftList")} className={styles.files}>
              {moved.left.map((file) => (
                <span role="listitem" key={file.path} className={styles.left}>
                  <span className={styles.file}>{file.file_name}</span>
                  <span>{file.message}</span>
                </span>
              ))}
            </span>
          </>
        )}
        {staysBehind ? (
          <span>{t("settings.folderStaysOpen", { name: open.name, from, to })}</span>
        ) : null}
      </span>
    </Notice>
  );
}
