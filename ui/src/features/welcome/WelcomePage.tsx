import { useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { asCommandError } from "../../api/error";
import { fileName, IMPORT_EXTENSIONS } from "../../api/files";
import { showInFolder } from "../../api/window";
import { useDemo } from "../../app/actions/demo";
import { useStart } from "../../app/actions/start";
import { useWorkspaceActions } from "../../app/actions/workspaces";
import { OVERVIEW_PATH } from "../../app/destinations";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import type { CommandError } from "../../bindings/CommandError";
import type { WorkspaceView } from "../../bindings/WorkspaceView";
import {
  Button,
  DataTable,
  DropZone,
  Notice,
  Progress,
  Tag,
  type DataTableColumn,
} from "../../components";
import { formatCount, formatDate, formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { startImport } from "../import/start";
import { NewWorkspaceForm } from "../workspaces/NewWorkspaceForm";
import styles from "./WelcomePage.module.css";

/** Where "Show in folder" was pressed, so its error shows beside what was pressed. */
type FolderError = { at: "folder" | "files"; error: CommandError } | null;

/**
 * The welcome page: where the app opens while no workspace is open, and where the workspaces are
 * listed. It offers the ways in: a workspace to open, a file to import, by dropping it or by
 * choosing it, a new workspace, and the demo workspace. Workspace files that cannot be read are
 * listed apart with the reason, and never keep the rest of the page from working.
 */
export function WelcomePage() {
  const { start, dragged } = useShell();
  const { openWorkspace, refreshWorkspaces } = useWorkspaceActions();
  const { openDemo } = useDemo();
  const { isBusy } = useStart();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const newButtonId = useId();
  const demoTitleId = useId();
  const unreadableTitleId = useId();
  const [opening, setOpening] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<FolderError>(null);

  const { workspaces, unreadable, folder } = start.list;
  const isCreating = params.has("new");
  const first = dragged?.[0];

  const toOverview = () => {
    void navigate(OVERVIEW_PATH);
  };

  const open = (id: string) => {
    // One action on the workspaces at a time: while one runs, a row starts nothing.
    if (isBusy) return;
    setOpening(id);
    openWorkspace.mutate(id, { onSuccess: toOverview });
  };

  const show = (at: "folder" | "files", path: string) => {
    setFolderError(null);
    showInFolder(path).catch((error: unknown) => {
      setFolderError({ at, error: asCommandError(error) });
    });
  };

  const folderNotice = (at: "folder" | "files") =>
    folderError?.at === at ? (
      <Notice
        tone="danger"
        title={t("shell.folderError")}
        onDismiss={() => {
          setFolderError(null);
        }}
      >
        {folderError.error.message}
      </Notice>
    ) : null;

  const columns: DataTableColumn<WorkspaceView>[] = [
    {
      id: "name",
      header: t("workspaces.columnName"),
      isRowHeader: true,
      cell: (workspace) => (
        <span className={styles.name}>
          <span className={styles.nameText}>{workspace.name}</span>
          {workspace.id === start.open?.workspace.id ? (
            <>
              {" "}
              <Tag>{t("workspaces.openTag")}</Tag>
            </>
          ) : null}
        </span>
      ),
    },
    {
      id: "snapshots",
      header: t("workspaces.columnSnapshots"),
      kind: "number",
      cell: (workspace) => formatCount(workspace.snapshot_count),
    },
    {
      id: "latest",
      header: t("workspaces.columnLatest"),
      isSupporting: true,
      width: "max-content",
      cell: (workspace) =>
        workspace.latest_taken_at === null
          ? t("common.noValue")
          : formatDate(workspace.latest_taken_at),
    },
  ];

  const importZone = (
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
  );

  return (
    <Page
      title={t("workspaces.title")}
      description={
        workspaces.length === 0 ? t("workspaces.descriptionFirst") : t("workspaces.descriptionSome")
      }
      actions={
        <Button
          id={newButtonId}
          onPress={() => {
            setParams({ new: "1" }, { replace: true });
          }}
        >
          {t("workspaces.new")}
        </Button>
      }
      width="form"
    >
      <div className={styles.sections}>
        {start.list_error === null ? null : (
          <div className={styles.stack}>
            <Notice
              tone="danger"
              title={t("workspaces.listError")}
              actions={
                <>
                  <Button
                    variant="quiet"
                    reservesPendingSpace
                    isPending={refreshWorkspaces.isPending}
                    onPress={() => {
                      refreshWorkspaces.mutate();
                    }}
                  >
                    {t("common.retry")}
                  </Button>
                  <Button
                    variant="quiet"
                    onPress={() => {
                      show("folder", folder);
                    }}
                  >
                    {t("common.showInFolder")}
                  </Button>
                </>
              }
            >
              <span className={styles.errorFolder}>
                {t("workspaces.listErrorFolder", { folder })}
              </span>
              <span className={styles.errorText}>{start.list_error.message}</span>
            </Notice>
            {folderNotice("folder")}
          </div>
        )}

        {isCreating ? (
          <NewWorkspaceForm
            onCreated={toOverview}
            onCancel={() => {
              // The button that opened the form takes the focus back.
              document.getElementById(newButtonId)?.focus();
              setParams({}, { replace: true });
            }}
          />
        ) : null}

        {workspaces.length === 0 ? null : (
          <div className={styles.stack}>
            {openWorkspace.isError ? (
              <Notice tone="danger" title={t("workspaces.openError")}>
                {asCommandError(openWorkspace.error).message}
              </Notice>
            ) : null}
            <DataTable
              aria-label={t("workspaces.table")}
              columns={columns}
              rows={workspaces}
              rowKey={(workspace) => workspace.id}
              selectedKey={openWorkspace.isPending ? opening : null}
              onSelectionChange={open}
              rowActions={(workspace) => (
                <Button
                  variant="quiet"
                  reservesPendingSpace
                  // The spinner is on the row that is being opened; the others wait without one.
                  isPending={openWorkspace.isPending && opening === workspace.id}
                  isInert={isBusy}
                  onPress={() => {
                    open(workspace.id);
                  }}
                >
                  {t("workspaces.open")}
                </Button>
              )}
            />
          </div>
        )}

        {importZone}

        <section aria-labelledby={demoTitleId} className={styles.stack}>
          <h2 id={demoTitleId} className={styles.title}>
            {t("welcome.demoTitle")}
          </h2>
          <p className={styles.text}>{t("welcome.demoText")}</p>
          <div>
            <Button
              reservesPendingSpace
              isPending={openDemo.isPending}
              isInert={isBusy}
              onPress={() => {
                openDemo.mutate(undefined, { onSuccess: toOverview });
              }}
            >
              {t("welcome.demoOpen")}
            </Button>
          </div>
          {openDemo.isPending ? (
            <Progress label={t("welcome.demoBuilding")} className={styles.progress} />
          ) : null}
          {openDemo.isError ? (
            <Notice tone="danger" title={t("welcome.demoError")}>
              {asCommandError(openDemo.error).message}
            </Notice>
          ) : null}
        </section>

        {unreadable.length === 0 ? null : (
          <section aria-labelledby={unreadableTitleId} className={styles.stack}>
            <h2 id={unreadableTitleId} className={styles.title}>
              {t("workspaces.unreadableTitle")}
            </h2>
            <p className={styles.text}>{t("workspaces.unreadableText")}</p>
            {folderNotice("files")}
            <ul className={styles.files}>
              {unreadable.map((file) => (
                <li key={file.path} data-kind={file.kind} className={styles.file}>
                  <div className={styles.fileText}>
                    <span className={styles.fileName}>{file.file_name}</span>
                    <span className={styles.fileReason}>{file.message}</span>
                  </div>
                  <Button
                    variant="quiet"
                    onPress={() => {
                      show("files", file.path);
                    }}
                  >
                    {t("common.showInFolder")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Page>
  );
}
