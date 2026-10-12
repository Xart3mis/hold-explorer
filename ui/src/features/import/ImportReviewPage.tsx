import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { keys } from "../../api/keys";
import { IMPORT_PATH, OVERVIEW_PATH } from "../../app/destinations";
import { formatCount, formatDateTime } from "../../app/format";
import { t, type MessageKey } from "../../app/i18n";
import { useApp } from "../../app/useApp";
import type { ImportCommit } from "../../bindings/ImportCommit";
import type { ImportDraft } from "../../bindings/ImportDraft";
import type { ImportPhase } from "../../bindings/ImportPhase";
import type { ImportReview } from "../../bindings/ImportReview";
import { Button, Notice, Progress, StatTile, StatTileGroup, useToast } from "../../components";
import { cx } from "../../components/cx";
import { useShell } from "../shell/context";
import { Page } from "../shell/Page";
import { Details } from "./Details";
import { clearImport, useImportDraft, type ImportChoices } from "./draft";
import { ALL_FIELDS, columnLabel, fieldLabel } from "./fields";
import styles from "./Import.module.css";
import { ImportProblem } from "./ImportProblem";
import { ReopenFile, useLeaveImport } from "./leave";
import { PageToCome } from "./PageToCome";
import { readDate, readTarget } from "./review";
import { ReviewDate } from "./ReviewDate";
import { ReviewFindings } from "./ReviewFindings";
import { ReviewTarget } from "./ReviewTarget";
import { IMPORT_MAPPING_PATH, IMPORT_SHEET_PATH, startImport } from "./start";

/** What a limited file lacks, in a sentence, by the fields no column supplies. */
function limitedText(review: ImportReview): MessageKey {
  const noId = review.mapping.fields.SourceId === undefined;
  const noReleased = review.mapping.fields.Released === undefined;
  if (noId && noReleased) return "import.review.limitedBoth";
  if (noId) return "import.review.limitedNoId";
  if (noReleased) return "import.review.limitedNoReleased";
  return "import.review.limitedOther";
}

interface ReviewedProps {
  draft: ImportDraft;
  review: ImportReview;
  from: string;
  choices: ImportChoices;
  choose: (chosen: Partial<ImportChoices>) => void;
}

/** The review once the file has been read: what was found, the date, the target, and Import. */
function Reviewed({ draft, review, from, choices, choose }: ReviewedProps) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { start } = useShell();
  const { importCommit, openWorkspace } = useApp();
  const cancel = useLeaveImport();
  const [phase, setPhase] = useState<ImportPhase | null>(null);
  // Whether the page is still shown when a commit that it started comes back.
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  const { file } = draft;
  const date = readDate(review.detected, choices);
  const target = readTarget(review, choices);
  const { workspace } = target;
  const committing = importCommit.isPending;

  // The workspace is asked what it has against the file whenever the target or the date that
  // was last left changes. A new workspace has nothing to meet.
  const checkable = workspace !== undefined && date.moment !== null;
  const checking = useQuery({
    queryKey: keys.importCheck(workspace?.id ?? "", date.moment ?? ""),
    queryFn: () =>
      api.importCheckTarget({ kind: "Existing", id: workspace?.id ?? "" }, date.moment ?? ""),
    enabled: checkable,
    staleTime: 0,
    gcTime: 0,
  });
  // The answer for another workspace or another date is not an answer for this one.
  const answered = checkable && !checking.isPlaceholderData;
  const check = answered ? checking.data : undefined;
  const checkError = answered && checking.isError ? asCommandError(checking.error) : null;

  const already = check?.already_imported ?? null;
  const sameDay = already === null ? (check?.same_day ?? []) : [];
  const replaced = sameDay.find((snapshot) => snapshot.id === choices.replace);
  const mustConfirm = review.date_needs_confirmation && review.detected !== null && !date.edited;
  const workspaceName = target.isNew ? target.name.trim() : (workspace?.name ?? "");

  // Why Import waits. Each reason is on the page beside the button, not in a tooltip.
  const reasons: string[] = [];
  if (date.moment === null) reasons.push(t("import.review.blocked.date"));
  else if (mustConfirm && !choices.confirmed) reasons.push(t("import.review.blocked.confirm"));
  if (target.id === null) reasons.push(t("import.review.blocked.target"));
  else if (target.isNew) {
    if (workspaceName === "") reasons.push(t("import.review.blocked.name"));
  } else if (date.moment !== null) {
    if (checkError !== null) reasons.push(t("import.review.blocked.check"));
    else if (check === undefined) reasons.push(t("import.review.blocked.checking"));
    else if (already !== null) reasons.push(t("import.review.blocked.already"));
  }

  // A choice that is made after a failed import answers it: its error no longer applies.
  const decide = (chosen: Partial<ImportChoices>) => {
    if (importCommit.isError) importCommit.reset();
    choose(chosen);
  };

  const commit = () => {
    if (date.moment === null || target.id === null) return;
    const request: ImportCommit = {
      target: target.isNew
        ? { kind: "New", name: workspaceName }
        : { kind: "Existing", id: target.id },
      taken_at: date.moment,
      date_edited: date.edited,
      replace: replaced?.id ?? null,
    };
    setPhase(null);
    // The promise is answered whether or not this page is still shown, so an import that
    // finishes after the user has gone elsewhere still says what it did.
    importCommit.mutateAsync({ request, onProgress: setPhase }).then(
      (done) => {
        clearImport(client);
        const said = {
          workspace: done.open.workspace.name,
          holds: t("snapshots.holds", { count: done.snapshot.row_count }),
          open: formatCount(done.snapshot.open_count),
        };
        toast.show({
          tone: "success",
          message:
            replaced === undefined
              ? t("import.review.done", said)
              : t("import.review.doneReplaced", {
                  ...said,
                  replaced: formatDateTime(replaced.taken_at),
                }),
        });
        if (shown.current) void navigate(OVERVIEW_PATH, { replace: true });
      },
      () => {
        // The failure is the mutation's error, shown below. What the workspace holds may be
        // what made it fail, so it is asked again.
        if (shown.current && checkable) void checking.refetch();
      },
    );
  };

  const openIt = (id: string) => {
    if (start.open?.workspace.id === id) {
      cancel.mutate(OVERVIEW_PATH);
      return;
    }
    // Opening a workspace drops the draft on the Rust side as well.
    openWorkspace.mutate(id, {
      onSuccess: () => {
        clearImport(client);
        void navigate(OVERVIEW_PATH);
      },
    });
  };

  const progress =
    phase === null
      ? t("import.review.phase.waiting")
      : phase === "Reading"
        ? t("import.review.phase.Reading", { file: file.file_name })
        : t(`import.review.phase.${phase}`, { workspace: workspaceName });

  return (
    <div className={styles.page}>
      {review.limited ? (
        <Notice tone="warning" title={t("import.review.limitedTitle")}>
          {t(limitedText(review))}
        </Notice>
      ) : null}

      <StatTileGroup aria-label={t("import.review.figures")}>
        <StatTile label={t("import.review.holds")} value={formatCount(review.row_count)} />
        <StatTile label={t("import.review.open")} value={formatCount(review.open_count)} />
        <StatTile label={t("import.review.released")} value={formatCount(review.released_count)} />
      </StatTileGroup>

      <div>
        <ul aria-label={t("import.review.facts")} className={styles.ruled}>
          <li className={styles.ruledRow}>
            <span className={styles.ruledLabel}>{t("import.review.file")}</span>
            <span className={cx(styles.ruledValue, styles.fileName)}>{review.file_name}</span>
          </li>
          {file.sheets.length === 0 ? null : (
            <li className={styles.ruledRow}>
              <span className={styles.ruledLabel}>{t("import.review.sheet")}</span>
              <span className={styles.ruledValue}>{file.sheet_name}</span>
              {file.sheets.length > 1 ? (
                <span className={styles.ruledEnd}>
                  <Button
                    variant="quiet"
                    isDisabled={committing}
                    onPress={() => {
                      void navigate(IMPORT_SHEET_PATH, { state: { from } });
                    }}
                  >
                    {t("import.chooseSheet")}
                  </Button>
                </span>
              ) : null}
            </li>
          )}
          <li className={styles.ruledRow}>
            <span className={styles.ruledLabel}>{t("import.review.project")}</span>
            <span
              className={styles.ruledValue}
              data-absent={review.project_no === null ? "" : undefined}
            >
              {review.project_no ?? t("import.review.projectNone")}
            </span>
          </li>
        </ul>
        <Details
          level={2}
          title={t("import.review.columnsShow")}
          action={
            <Button
              variant="quiet"
              isDisabled={committing}
              onPress={() => {
                void navigate(IMPORT_MAPPING_PATH, { state: { from } });
              }}
            >
              {t("import.review.changeMapping")}
            </Button>
          }
        >
          <ul aria-label={t("import.review.columnsList")} className={styles.ruled}>
            {ALL_FIELDS.map((field) => {
              const column = review.mapping.fields[field];
              return (
                <li key={field} className={styles.ruledRow}>
                  <span className={styles.ruledLabel}>{fieldLabel(field)}</span>
                  <span
                    className={styles.ruledValue}
                    data-absent={column === undefined ? "" : undefined}
                  >
                    {column === undefined
                      ? t("import.review.columnsNone")
                      : columnLabel(file.headers, column)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Details>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("import.review.findings")}</h2>
        <ReviewFindings review={review} />
      </section>

      <ReviewDate
        review={review}
        date={date}
        confirmed={choices.confirmed}
        onChoose={decide}
        isDisabled={committing}
      />

      <ReviewTarget
        review={review}
        target={target}
        openId={start.open?.workspace.id}
        moment={date.moment}
        check={check}
        checkError={checkError}
        isChecking={checkable && checking.isFetching}
        onCheckAgain={() => {
          void checking.refetch();
        }}
        replace={replaced?.id ?? null}
        onOpen={openIt}
        isOpening={cancel.isPending || openWorkspace.isPending}
        onChoose={decide}
        isDisabled={committing}
      >
        {openWorkspace.isError ? (
          <Notice tone="danger" title={t("workspaces.openError")}>
            {asCommandError(openWorkspace.error).message}
          </Notice>
        ) : null}
      </ReviewTarget>

      {importCommit.isError ? (
        <ImportProblem error={asCommandError(importCommit.error)} general="import.error.commit" />
      ) : null}
      {cancel.isError ? (
        <Notice tone="danger" title={t("import.cancelError")}>
          {asCommandError(cancel.error).message}
        </Notice>
      ) : null}

      {committing ? (
        <div className={styles.section}>
          <Progress label={progress} className={styles.progress} />
          <p className={styles.text}>{t("import.review.running")}</p>
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.actions}>
            <Button variant="primary" isDisabled={reasons.length > 0} onPress={commit}>
              {t("import.review.import")}
            </Button>
            <Button
              variant="quiet"
              isPending={cancel.isPending}
              onPress={() => {
                cancel.mutate(from);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
          {reasons.length === 0 ? null : (
            <ul className={styles.reasons}>
              {reasons.map((reason) => (
                <li key={reason} className={styles.text}>
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The import review: what the file holds and everything the import did not take as written, the
 * snapshot date with where it is from, and the workspace the snapshot goes to. Reached without a
 * review, it asks for one with the mapping that was chosen, or the proposed one. "Import" stores
 * the snapshot and opens Overview on it.
 */
export function ImportReviewPage() {
  const { draft, choices, choose, from, others } = useImportDraft();
  const client = useQueryClient();
  const navigate = useNavigate();
  const cancel = useLeaveImport();
  const [arrivedWithFile] = useState(draft !== undefined);

  const reading = useQuery({
    queryKey: keys.importReview,
    queryFn: () => api.importReview(choices.fields),
    enabled: draft !== undefined,
  });
  const failure = reading.isError ? asCommandError(reading.error) : null;
  const failed = failure?.kind;

  useEffect(() => {
    if (failed === "NoDraft") {
      // The Rust side has no file open any more: it has to be opened again.
      clearImport(client);
      void navigate(IMPORT_PATH, { replace: true, state: { from, reopen: true } });
    } else if (failed === "MissingColumns") {
      // The mapping page marks the fields that have no column.
      void navigate(IMPORT_MAPPING_PATH, { replace: true, state: { from } });
    }
  }, [failed, client, navigate, from]);

  if (draft === undefined) return arrivedWithFile ? null : <ReopenFile from={from} />;

  const review = reading.data;
  const trail = {
    ancestors: [
      {
        label: t("import.title"),
        onPress: () => {
          void navigate(IMPORT_PATH, { state: { from } });
        },
      },
    ],
    current: t("import.review.crumb"),
  };

  return (
    <Page title={t("import.review.title")} width="form" breadcrumb={trail}>
      {others > 0 ? (
        <Notice tone="info" className={styles.above}>
          {t("import.severalDropped", { count: others + 1 })}
        </Notice>
      ) : null}
      {review !== undefined ? (
        <Reviewed draft={draft} review={review} from={from} choices={choices} choose={choose} />
      ) : (
        <div className={styles.page}>
          {failure === null ? (
            <div aria-busy="true" className={styles.section}>
              <Progress
                label={t("import.review.loading", { file: draft.file.file_name })}
                className={styles.progress}
              />
              <PageToCome />
            </div>
          ) : failed === "NoDraft" || failed === "MissingColumns" ? null : (
            <ImportProblem error={failure} general="import.error.review" />
          )}
          {cancel.isError ? (
            <Notice tone="danger" title={t("import.cancelError")}>
              {asCommandError(cancel.error).message}
            </Notice>
          ) : null}
          <div className={styles.actions}>
            {failure === null ? null : (
              <>
                <Button
                  onPress={() => {
                    void navigate(IMPORT_MAPPING_PATH, { state: { from } });
                  }}
                >
                  {t("import.review.changeMapping")}
                </Button>
                <Button
                  onPress={() => {
                    void startImport();
                  }}
                >
                  {t("import.chooseAnother")}
                </Button>
              </>
            )}
            <Button
              variant={failure === null ? "secondary" : "quiet"}
              isPending={cancel.isPending}
              onPress={() => {
                cancel.mutate(from);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
