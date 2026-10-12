import { memo, useMemo } from "react";
import { formatCount } from "../../app/format";
import { t, type MessageKey } from "../../app/i18n";
import type { ImportReview } from "../../bindings/ImportReview";
import type { SkipKind } from "../../bindings/SkipKind";
import type { SkippedRow } from "../../bindings/SkippedRow";
import type { WarningKind } from "../../bindings/WarningKind";
import { DataTable, type DataTableColumn } from "../../components";
import { Details } from "./Details";
import styles from "./Import.module.css";

/** Why a row was skipped, by its kind. */
const reasons: Record<SkipKind, MessageKey> = {
  BlankLineId: "import.review.skip.BlankLineId",
  UnreadableDate: "import.review.skip.UnreadableDate",
};

/** What a kind of warning is called, and what the app did about it. */
const warnings: Record<WarningKind, { title: MessageKey; text: MessageKey }> = {
  UnreadableReleaseDate: {
    title: "import.review.warning.UnreadableReleaseDate.title",
    text: "import.review.warning.UnreadableReleaseDate.text",
  },
  UnrecognizedReleased: {
    title: "import.review.warning.UnrecognizedReleased.title",
    text: "import.review.warning.UnrecognizedReleased.text",
  },
  AssumedDateOrder: {
    title: "import.review.warning.AssumedDateOrder.title",
    text: "import.review.warning.AssumedDateOrder.text",
  },
  ErrorCells: {
    title: "import.review.warning.ErrorCells.title",
    text: "import.review.warning.ErrorCells.text",
  },
  DuplicateHeader: {
    title: "import.review.warning.DuplicateHeader.title",
    text: "import.review.warning.DuplicateHeader.text",
  },
  UnreadableSize: {
    title: "import.review.warning.UnreadableSize.title",
    text: "import.review.warning.UnreadableSize.text",
  },
  UnreadableId: {
    title: "import.review.warning.UnreadableId.title",
    text: "import.review.warning.UnreadableId.text",
  },
  DuplicateId: {
    title: "import.review.warning.DuplicateId.title",
    text: "import.review.warning.DuplicateId.text",
  },
  UnreadableReportDate: {
    title: "import.review.warning.UnreadableReportDate.title",
    text: "import.review.warning.UnreadableReportDate.text",
  },
};

/**
 * Everything the import did not take as written: the rows it left out and what it changed or
 * assumed. The counts and what the app did are on the page at once; the rows and the examples
 * are one press away, in the same place. A file with nothing of the kind says so.
 *
 * It depends on the review alone and is rendered again only for another review: its table may
 * hold two hundred rows, and what the user chooses or types elsewhere on the page changes none
 * of them.
 */
export const ReviewFindings = memo(function ReviewFindings({ review }: { review: ImportReview }) {
  const { skipped, skipped_count: skippedCount, warnings: groups } = review;
  const skippedColumns = useMemo(
    (): DataTableColumn<SkippedRow>[] => [
      {
        id: "row",
        header: t("import.review.columnRow"),
        kind: "number",
        isRowHeader: true,
        // A row is named as the file numbers it, without separators.
        cell: (row) => String(row.row_number),
      },
      {
        id: "reason",
        header: t("import.review.columnReason"),
        cell: (row) => t(reasons[row.kind]),
        width: "max-content",
      },
      {
        id: "value",
        header: t("import.review.columnValue"),
        // The value is the text of the file, written as an identifier is: exactly, in the monospace.
        kind: "identifier",
        isSupporting: true,
        cell: (row) => row.value ?? t("import.review.blank"),
        width: "minmax(0, 1fr)",
      },
    ],
    [],
  );
  if (skippedCount === 0 && groups.length === 0) {
    return <p className={styles.text}>{t("import.review.clean")}</p>;
  }
  return (
    <div className={styles.detailsList}>
      {skippedCount === 0 ? (
        <p className={styles.detailsNone}>{t("import.review.skippedNone")}</p>
      ) : (
        <Details
          level={3}
          title={t("import.review.skipped", { count: skippedCount })}
          text={t("import.review.skippedHelp")}
        >
          <div className={styles.tableBox}>
            <DataTable
              aria-label={t("import.review.skippedTable")}
              columns={skippedColumns}
              rows={skipped}
              rowKey={(row) => String(row.row_number)}
            />
          </div>
          {skipped.length < skippedCount ? (
            <p className={styles.caption}>
              {t("import.review.skippedShown", {
                shown: formatCount(skipped.length),
                count: skippedCount,
              })}
            </p>
          ) : null}
        </Details>
      )}

      {groups.length === 0 ? (
        <p className={styles.detailsNone}>{t("import.review.warningsNone")}</p>
      ) : (
        groups.map((group) => {
          const title = t(warnings[group.kind].title);
          return (
            <Details
              key={group.kind}
              level={3}
              title={title}
              count={t("import.review.times", { count: group.count })}
              text={t(warnings[group.kind].text)}
            >
              <ul
                aria-label={t("import.review.examplesOf", { kind: title })}
                className={styles.sentences}
              >
                {group.examples.map((example, index) => (
                  // An example has no id; its place in the list is what tells it from the next.
                  <li key={index}>{example.detail}</li>
                ))}
              </ul>
              {group.examples.length < group.count ? (
                <p className={styles.caption}>
                  {t("import.review.examplesShown", {
                    shown: formatCount(group.examples.length),
                    count: group.count,
                  })}
                </p>
              ) : null}
            </Details>
          );
        })
      )}
    </div>
  );
});
