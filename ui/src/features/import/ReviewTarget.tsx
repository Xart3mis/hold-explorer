import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { formatDate, formatDateTime, formatTime } from "../../app/format";
import { t } from "../../app/i18n";
import type { CommandError } from "../../bindings/CommandError";
import type { ImportReview } from "../../bindings/ImportReview";
import type { SnapshotInfo } from "../../bindings/SnapshotInfo";
import type { TargetCheck } from "../../bindings/TargetCheck";
import { Button, Notice, Select, TextField, type SelectOption } from "../../components";
import { cx } from "../../components/cx";
import { NEW_WORKSPACE, type ImportChoices } from "./draft";
import styles from "./Import.module.css";
import { ImportProblem } from "./ImportProblem";
import type { TargetState } from "./review";

/** The choice that keeps every snapshot of the day. No snapshot has this id. */
const KEEP = "keep";

export interface ReviewTargetProps {
  review: ImportReview;
  target: TargetState;
  /** The id of the workspace that is open now, when one is. */
  openId: string | undefined;
  /** The snapshot date the workspace is checked for; `null` while the date cannot be read. */
  moment: string | null;
  /** What the workspace would meet, once it has been checked for this date. */
  check: TargetCheck | undefined;
  /** Why the workspace could not be checked. */
  checkError: CommandError | null;
  isChecking: boolean;
  onCheckAgain: () => void;
  /** The snapshot of the same day that is to be replaced; `null` to keep them all. */
  replace: number | null;
  /** Leaves the import for the workspace that already has the file. */
  onOpen: (workspace: string) => void;
  isOpening: boolean;
  onChoose: (chosen: Partial<ImportChoices>) => void;
  /**
   * Where the name of a new workspace is written at every key, as its field holds it. The page
   * is not rendered again for a key, so the import reads the name there when it is sent. It
   * holds a name only while one is typed and not left: once the field is left, or is gone, it
   * holds nothing, and the name is the one the page was given.
   */
  typedNameRef: RefObject<string | null>;
  /** An import is running: nothing can be changed. */
  isDisabled: boolean;
  /** What else the page has to say under the target. */
  children?: ReactNode;
}

function holdsOf(snapshot: SnapshotInfo): string {
  return t("snapshots.holds", { count: snapshot.row_count });
}

/**
 * Where the snapshot goes: a workspace that exists, or a new one, and what that workspace
 * already has against the file. A workspace that holds the same file blocks the import and is
 * offered to open; snapshots of the same day are listed, and are all kept unless the user
 * chooses to replace one, which the choice itself says cannot be undone.
 *
 * The name of a new workspace takes effect when its field is left or Enter is pressed in it, not
 * at every key, as the snapshot date does: a key in the field renders this section and nothing
 * else of the page. One thing the page hears at once, because it says it at once: that the name
 * is missing, or no longer is.
 */
export function ReviewTarget({
  review,
  target,
  openId,
  moment,
  check,
  checkError,
  isChecking,
  onCheckAgain,
  replace,
  onOpen,
  isOpening,
  onChoose,
  typedNameRef,
  isDisabled,
  children,
}: ReviewTargetProps) {
  const project = review.project_no;
  // The name as it is being typed, until the field is left: the page works with what was last left.
  const [typing, setTyping] = useState<string | null>(null);
  // What is typed is kept in two places, here for the field and in the ref for the page, and
  // they are always set together.
  const setTyped = (value: string | null) => {
    setTyping(value);
    typedNameRef.current = value;
  };
  const leaveName = () => {
    if (typing === null) return;
    setTyped(null);
    onChoose({ newName: typing });
  };
  // A field that is gone shows no name, so none is typed.
  const hasNameField = target.isNew;
  useEffect(() => {
    if (!hasNameField) return;
    return () => {
      typedNameRef.current = null;
    };
  }, [hasNameField, typedNameRef]);
  const matching = new Set(review.target.matching.map((workspace) => workspace.id));

  const options: SelectOption[] = review.target.all.map((workspace) => {
    const isOpen = workspace.id === openId;
    const matches = project !== null && matching.has(workspace.id);
    const detail = matches
      ? t(isOpen ? "import.review.target.optionOpenMatch" : "import.review.target.optionMatch", {
          project,
        })
      : isOpen
        ? t("import.review.target.optionOpen")
        : undefined;
    return {
      id: workspace.id,
      label: workspace.name,
      ...(detail === undefined ? {} : { detail }),
    };
  });
  options.push({ id: NEW_WORKSPACE, label: t("import.review.target.new") });

  const { workspace } = target;
  const name = workspace?.name ?? "";
  const addsProject =
    workspace !== undefined &&
    project !== null &&
    workspace.project_numbers.length > 0 &&
    !workspace.project_numbers.includes(project);

  const already = check?.already_imported ?? null;
  // The same file is the whole story; what else the day holds matters only for another file.
  const sameDay = already === null ? (check?.same_day ?? []) : [];
  const replaced = sameDay.find((snapshot) => snapshot.id === replace);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t("import.review.target.title")}</h2>

      <Select
        label={t("import.review.target.label")}
        placeholder={t("import.review.target.placeholder")}
        options={options}
        selectedKey={target.id}
        isDisabled={isDisabled}
        isPending={isChecking}
        onSelectionChange={(id) => {
          setTyped(null);
          // Another workspace has other snapshots: what was to be replaced belongs to this one.
          onChoose({ target: id, replace: null });
        }}
        className={styles.narrow}
      />

      {target.isNew ? (
        <TextField
          label={t("import.review.target.newName")}
          description={t("import.review.target.newHelp")}
          placeholder={t("workspaces.namePlaceholder")}
          value={typing ?? target.name}
          isDisabled={isDisabled}
          onChange={(value) => {
            const before = typing ?? target.name;
            setTyped(value);
            // Whether Import waits for a name is said on the page as soon as it changes.
            if ((value.trim() === "") !== (before.trim() === "")) onChoose({ newName: value });
          }}
          onBlur={leaveName}
          onKeyDown={(event) => {
            if (event.key === "Enter") leaveName();
            else event.continuePropagation();
          }}
          className={styles.narrow}
        />
      ) : null}

      {addsProject ? (
        <p className={styles.text}>
          {t("import.review.target.addsProject", { workspace: name, project })}
        </p>
      ) : null}

      {checkError === null ? null : (
        <ImportProblem
          error={checkError}
          general="import.error.check"
          actions={
            <Button variant="quiet" isPending={isChecking} onPress={onCheckAgain}>
              {t("common.retry")}
            </Button>
          }
        />
      )}

      {workspace !== undefined && moment !== null && checkError === null && check === undefined ? (
        <p className={styles.caption}>{t("import.review.target.checking", { workspace: name })}</p>
      ) : null}

      {workspace === undefined || already === null ? null : (
        <Notice
          tone="warning"
          title={t("import.review.target.alreadyTitle", { workspace: name })}
          actions={
            <Button
              variant="quiet"
              isPending={isOpening}
              isDisabled={isDisabled}
              onPress={() => {
                onOpen(workspace.id);
              }}
            >
              {workspace.id === openId
                ? t("import.review.target.toOverview")
                : t("import.review.target.openIt", { workspace: name })}
            </Button>
          }
        >
          {t("import.review.target.alreadyText", {
            date: formatDateTime(already.taken_at),
            file: already.file_name,
          })}
        </Notice>
      )}

      {workspace === undefined || moment === null || sameDay.length === 0 ? null : (
        <>
          <p className={cx(styles.text, styles.textPrimary)}>
            {t("import.review.target.sameDay", {
              count: sameDay.length,
              workspace: name,
              date: formatDate(moment),
            })}
          </p>
          <ul className={styles.plain}>
            {sameDay.map((snapshot) => (
              <li key={snapshot.id}>
                {t("import.review.target.sameDayItem", {
                  time: formatTime(snapshot.taken_at),
                  file: snapshot.file_name,
                  holds: holdsOf(snapshot),
                })}
              </li>
            ))}
          </ul>
          <Select
            label={t("import.review.target.sameDayLabel")}
            options={[
              {
                id: KEEP,
                label: t(
                  sameDay.length === 1
                    ? "import.review.target.keepBoth"
                    : "import.review.target.keepAll",
                ),
              },
              ...sameDay.map((snapshot): SelectOption => ({
                id: String(snapshot.id),
                label: t("import.review.target.replace", {
                  time: formatTime(snapshot.taken_at),
                }),
                detail: snapshot.file_name,
              })),
            ]}
            selectedKey={replaced === undefined ? KEEP : String(replaced.id)}
            isDisabled={isDisabled}
            onSelectionChange={(id) => {
              onChoose({ replace: id === KEEP ? null : Number(id) });
            }}
            className={styles.narrow}
          />
          {replaced === undefined ? null : (
            <Notice tone="danger">
              {t("import.review.target.replaceText", {
                date: formatDateTime(replaced.taken_at),
                workspace: name,
                holds: holdsOf(replaced),
                file: replaced.file_name,
              })}
            </Notice>
          )}
        </>
      )}

      {workspace !== undefined &&
      moment !== null &&
      check !== undefined &&
      already === null &&
      sameDay.length === 0 ? (
        <p className={styles.caption}>
          {t("import.review.target.fresh", { workspace: name, date: formatDate(moment) })}
        </p>
      ) : null}

      {children}
    </section>
  );
}
