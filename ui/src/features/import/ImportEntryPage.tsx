import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { fileName } from "../../api/files";
import { keys } from "../../api/keys";
import { OVERVIEW_PATH, WELCOME_PATH } from "../../app/destinations";
import { t, type MessageKey } from "../../app/i18n";
import type { CommandError } from "../../bindings/CommandError";
import { Button, DropZone, Notice, Progress, Skeleton } from "../../components";
import { useShell } from "../shell/context";
import { Page } from "../shell/Page";
import styles from "./ImportEntryPage.module.css";
import { IMPORT_MAPPING_PATH, IMPORT_REVIEW_PATH, readImportLocation, startImport } from "./start";

/** What failed, in the words of the page, by the kind of the error. */
const titles: Record<string, MessageKey> = {
  NotFound: "import.error.NotFound",
  Unreadable: "import.error.Unreadable",
  EmptyFile: "import.error.EmptyFile",
  NoDataSheet: "import.error.NoDataSheet",
  Dialog: "import.error.Dialog",
};

function titleOf(error: CommandError): string {
  return t(titles[error.kind] ?? "import.error.other");
}

/** The first-load state: blocks in the shape of the review to come, its figures and its rows. */
function PageToCome() {
  return (
    <div aria-hidden="true" className={styles.shape}>
      <div className={styles.figures}>
        {["9ch", "7ch", "11ch"].map((width) => (
          <div key={width} className={styles.figure}>
            <span className={styles.line}>
              <Skeleton width={width} />
            </span>
            <Skeleton variant="stat" />
          </div>
        ))}
      </div>
      {["58%", "74%", "66%", "49%"].map((width) => (
        <span key={width} className={styles.row}>
          <Skeleton width={width} />
        </span>
      ))}
    </div>
  );
}

/**
 * The entry of the import flow. It opens the file it was given, shows that the file is being
 * read, and passes on: to the review when the file can be read as it is, to the mapping step when
 * a required field has no column. A file that cannot be opened is shown with what happened and
 * how to fix it, and with a way to choose another file. Opened without a file, it offers to
 * choose one.
 */
export function ImportEntryPage() {
  const { start, dragged } = useShell();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();

  const home = start.open === null ? WELCOME_PATH : OVERVIEW_PATH;
  const { path, from, others, error: dialogError } = readImportLocation(location.state, home);

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

  useEffect(() => {
    if (draft === undefined) return;
    client.setQueryData(keys.importDraft, draft);
    const next = draft.missing_required.length === 0 ? IMPORT_REVIEW_PATH : IMPORT_MAPPING_PATH;
    // The entry page is replaced, so going back does not read the file a second time.
    void navigate(next, { replace: true, state: { from } });
  }, [draft, client, navigate, from]);

  const cancel = useMutation({
    mutationFn: () => api.importCancel(),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.importDraft });
      void navigate(from);
    },
  });

  const failure = dialogError ?? (reading.isError ? asCommandError(reading.error) : null);
  // The file that is being read: the one the page was given, unless reading it has failed.
  const readingPath = failure === null ? path : undefined;
  const first = dragged?.[0];

  return (
    <Page title={t("import.title")} width="form">
      <div className={styles.page}>
        {others > 0 ? (
          <Notice tone="info">{t("import.severalDropped", { count: others + 1 })}</Notice>
        ) : null}

        {failure === null ? null : (
          <div data-kind={failure.kind}>
            <Notice tone="danger" title={titleOf(failure)}>
              {failure.message}
            </Notice>
          </div>
        )}

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
            fileTypes={t("welcome.fileTypes")}
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
              cancel.mutate();
            }}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Page>
  );
}
