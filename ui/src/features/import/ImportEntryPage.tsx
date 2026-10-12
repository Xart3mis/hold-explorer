import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { fileName, IMPORT_EXTENSIONS } from "../../api/files";
import { keys } from "../../api/keys";
import { OVERVIEW_PATH, WELCOME_PATH } from "../../app/destinations";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import { Button, DropZone, Notice, Progress } from "../../components";
import { formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { openDraft, useImportDraft } from "./draft";
import styles from "./ImportEntryPage.module.css";
import { ImportProblem } from "./ImportProblem";
import { useLeaveImport } from "./leave";
import { PageToCome } from "./PageToCome";
import { nextStep, readImportLocation, startImport } from "./start";

/**
 * The entry of the import flow. It opens the file it was given, shows that the file is being
 * read, and passes on: to the review when the file can be read as it is, to the mapping step when
 * a required field has no column. A file that cannot be opened is shown with what happened and
 * how to fix it, and with a way to choose another file. Opened without a file, it offers to
 * choose one, and names the file that is still open for import when there is one.
 */
export function ImportEntryPage() {
  const { start, dragged } = useShell();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { draft: open } = useImportDraft();

  const home = start.open === null ? WELCOME_PATH : OVERVIEW_PATH;
  const {
    path,
    from,
    others,
    reopen,
    error: dialogError,
  } = readImportLocation(location.state, home);

  // Every arrival on this page reads the file anew: the file may have changed since, and the
  // draft the Rust side keeps is the one of the last reading.
  const reading = useQuery({
    queryKey: keys.importOpen(path ?? "", location.key),
    queryFn: () => api.importOpen(path ?? ""),
    enabled: path !== undefined,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const draft = reading.isPlaceholderData ? undefined : reading.data;

  const cancel = useLeaveImport();
  // Cancel was pressed. The Rust side takes one command at a time, so a cancel that is asked for
  // while the file is still being read is answered after the read: the read may well finish
  // first. A cancel that was asked for wins all the same, and the flow does not move on.
  const [cancelRequested, setCancelRequested] = useState(false);

  useEffect(() => {
    if (draft === undefined || cancelRequested) return;
    openDraft(client, draft);
    // The entry page is replaced, so going back does not read the file a second time.
    // What was said about the files that came with this one is said again where the file opens:
    // a file that is read at once would otherwise take the notice with it.
    void navigate(nextStep(draft), { replace: true, state: { from, others } });
  }, [draft, cancelRequested, client, navigate, from, others]);

  const failure = dialogError ?? (reading.isError ? asCommandError(reading.error) : null);
  // The file that is being read: the one the page was given, unless reading it has failed.
  const readingPath = failure === null ? path : undefined;
  const first = dragged?.[0];
  // A file that was opened before and is still open, while this page reads no other.
  const stillOpen = path === undefined && failure === null ? open : undefined;

  return (
    <Page title={t("import.title")} width="form">
      <div className={styles.page}>
        {others > 0 ? (
          <Notice tone="info">{t("import.severalDropped", { count: others + 1 })}</Notice>
        ) : null}

        {reopen === true && path === undefined && stillOpen === undefined ? (
          <Notice tone="info" title={t("import.reopen.title")}>
            {t("import.reopen.text")}
          </Notice>
        ) : null}

        {stillOpen === undefined ? null : (
          <Notice
            tone="info"
            actions={
              <Button
                variant="quiet"
                onPress={() => {
                  void navigate(nextStep(stillOpen), { state: { from } });
                }}
              >
                {t("import.continue")}
              </Button>
            }
          >
            {t("import.stillOpen", { file: stillOpen.file.file_name })}
          </Notice>
        )}

        {failure === null ? null : <ImportProblem error={failure} general="import.error.other" />}

        {readingPath === undefined ? null : (
          <div aria-busy="true" className={styles.reading}>
            <Progress
              label={t("import.reading", { file: fileName(readingPath) })}
              className={styles.progress}
            />
            <PageToCome />
          </div>
        )}

        {path === undefined && failure === null ? (
          <DropZone
            title={t("welcome.dropTitle")}
            text={t("welcome.dropText")}
            chooseLabel={t("welcome.openFile")}
            fileTypes={formatList(IMPORT_EXTENSIONS)}
            onChoose={() => {
              void startImport();
            }}
            {...(first === undefined
              ? {}
              : { active: { title: t("shell.dropTitle"), text: fileName(first) } })}
          />
        ) : null}

        {cancel.isError ? (
          <Notice tone="danger" title={t("import.cancelError")}>
            {asCommandError(cancel.error).message}
          </Notice>
        ) : null}

        <div className={styles.actions}>
          {failure === null ? null : (
            <Button
              onPress={() => {
                void startImport();
              }}
            >
              {t("import.chooseAnother")}
            </Button>
          )}
          {/* Beside another action Cancel is the quiet one; alone it is an ordinary button. */}
          <Button
            variant={failure === null ? "secondary" : "quiet"}
            isPending={cancel.isPending}
            onPress={() => {
              setCancelRequested(true);
              cancel.mutate(from, {
                // The import goes on as if Cancel had not been pressed, and the page says why.
                onError: () => {
                  setCancelRequested(false);
                },
              });
            }}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Page>
  );
}
