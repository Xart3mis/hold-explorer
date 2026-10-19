import { Button, Notice } from "../../components";
import { t } from "../../text/i18n";
import type { CopyExport, SaveExport } from "./run";

/** The kinds of failure of a save that another name puts right. */
const ANOTHER_NAME = new Set(["FileInUse", "Extension"]);

export interface ExportNoticeProps {
  /** The save or the copy whose failure is shown. */
  run: SaveExport | CopyExport;
  className?: string | undefined;
}

/**
 * Why an export failed, as a danger notice that the page shows under its header: what failed,
 * and the message of the command, which says why and what to do. A file another program holds
 * (`FileInUse`) offers "Choose another name" and "Try again"; a name with another extension
 * offers "Choose another name"; a copy the clipboard refused offers "Try again". The notice is
 * dismissed by its close button and replaced by the result of the next export. Nothing is shown
 * while there is no failure.
 */
export function ExportNotice({ run, className }: ExportNoticeProps) {
  const { problem, pendingAction, isRunning } = run;
  if (problem === null) return null;
  // Only a save is written under a name, which another name can put right.
  const chooseAnother = "chooseAnother" in run ? run.chooseAnother : null;
  const isSave = chooseAnother !== null;
  const offersName = chooseAnother !== null && ANOTHER_NAME.has(problem.kind);
  const offersRetry = isSave ? problem.kind === "FileInUse" : problem.kind === "Clipboard";
  const hasActions = offersName || offersRetry;
  return (
    <Notice
      tone="danger"
      title={t(isSave ? "export.saveFailed" : "export.copyFailed")}
      onDismiss={run.dismiss}
      className={className}
      {...(hasActions
        ? {
            actions: (
              <>
                {offersName ? (
                  <Button
                    variant="quiet"
                    isPending={pendingAction === "choose"}
                    reservesPendingSpace={false}
                    isInert={isRunning}
                    onPress={() => void chooseAnother()}
                  >
                    {t("export.chooseAnother")}
                  </Button>
                ) : null}
                {offersRetry ? (
                  <Button
                    variant="quiet"
                    isPending={pendingAction === "retry"}
                    reservesPendingSpace={false}
                    isInert={isRunning}
                    onPress={() => void run.retry()}
                  >
                    {t("common.retry")}
                  </Button>
                ) : null}
              </>
            ),
          }
        : {})}
    >
      {problem.message}
    </Notice>
  );
}
