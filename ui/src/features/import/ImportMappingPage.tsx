import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { keys } from "../../api/keys";
import { IMPORT_PATH } from "../../app/destinations";
import { Page } from "../../app/shell/Page";
import type { Field } from "../../bindings/Field";
import {
  Button,
  DataTable,
  Notice,
  SectionTitle,
  Select,
  type DataTableColumn,
  textChars,
  type SelectOption,
} from "../../components";
import { formatCount, formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { useImportDraft } from "./draft";
import { columnLabel, fieldLabel, FIELDS, orderFields, type Fields } from "./fields";
import styles from "./Import.module.css";
import { ImportProblem } from "./ImportProblem";
import { ReopenFile, useLeaveImport } from "./leave";
import { IMPORT_REVIEW_PATH, IMPORT_SHEET_PATH } from "./start";

/** The choice of an optional field that no column supplies. No column has this id. */
const NONE = "none";

/** How much of a first value an option shows; a remark may run to several lines. */
const SAMPLE_LENGTH = 36;

/** The first value of a column that is not blank, cut to the length an option has room for. */
function sampleOf(preview: readonly (readonly string[])[], column: number): string | undefined {
  for (const row of preview) {
    const value = row[column]?.trim() ?? "";
    if (value === "") continue;
    return value.length > SAMPLE_LENGTH ? `${value.slice(0, SAMPLE_LENGTH - 1)}…` : value;
  }
  return undefined;
}

/** The field a column supplies, when it supplies one. */
function fieldOf(fields: Fields, column: number): Field | undefined {
  return FIELDS.find((field) => fields[field] === column);
}

interface PreviewRow {
  key: string;
  cells: readonly string[];
}

/** The most room a value of the preview is given, in characters: a line that is read at a glance. */
const VALUE_CHARS = 64;

/** How many rows of the preview show before it scrolls. */
const PREVIEW_ROWS = { maxRows: 8 } as const;

/**
 * The room a column of the preview needs, in characters: its longest value among the rows shown.
 * A line ID is written in the monospace and given all of its room; any other value is counted
 * as text, and cut past a line that is read at a glance. The table itself keeps a column as wide
 * as its header.
 */
function roomOf(
  preview: readonly (readonly string[])[],
  column: number,
  isLineId: boolean,
): number {
  const room = (value: string) => (isLineId ? value.length : textChars(value));
  const longest = Math.max(1, ...preview.map((row) => room(row[column] ?? "")));
  return isLineId ? longest : Math.min(longest, VALUE_CHARS);
}

/** The key of a row of the preview. */
function previewKey(row: PreviewRow): string {
  return row.key;
}

/**
 * The first rows of the file as a table, each column under its header and the field it
 * supplies. It depends on the file and the mapping alone and is rendered again only for another
 * of either: the page above it renders at every choice and while the review is on its way, and
 * none of that changes a row.
 */
const Preview = memo(function Preview({
  headers,
  preview,
  fields,
}: {
  headers: readonly string[];
  preview: readonly (readonly string[])[];
  fields: Fields;
}) {
  const columns = useMemo(
    () =>
      headers.map((_, column): DataTableColumn<PreviewRow> => {
        const owner = fieldOf(fields, column);
        const header = columnLabel(headers, column);
        return {
          // The table keeps its columns and its rows by one set of keys, so each kind has its own.
          id: `column-${String(column)}`,
          header:
            owner === undefined
              ? header
              : t("import.mapping.previewMapped", { header, field: fieldLabel(owner) }),
          // A line ID is written whole, as an identifier is. Any other value is cut at the end
          // once it is longer than a line that can be read at a glance.
          ...(owner === "LineId"
            ? { kind: "identifier" as const, cell: (row: PreviewRow) => row.cells[column] ?? "" }
            : {
                cell: (row: PreviewRow) => (
                  <span className={styles.previewValue}>{row.cells[column] ?? ""}</span>
                ),
              }),
          isRowHeader: column === 0,
          // A column that supplies no field is written in the quieter ink.
          isSupporting: owner === undefined,
          // As wide as the longest of its values that are shown needs: the table scrolls
          // sideways, nothing is squeezed. A line ID is given all of its room; any other value
          // at most a line that can be read at a glance. The last column takes what is left of
          // the line as well.
          size:
            column === headers.length - 1
              ? { flex: 1, minChars: roomOf(preview, column, owner === "LineId") }
              : { chars: roomOf(preview, column, owner === "LineId") },
        };
      }),
    [headers, preview, fields],
  );
  const rows = useMemo(
    () => preview.map((cells, index): PreviewRow => ({ key: `row-${String(index)}`, cells })),
    [preview],
  );
  return (
    <DataTable
      aria-label={t("import.mapping.preview")}
      columns={columns}
      rows={rows}
      rowKey={previewKey}
      height={PREVIEW_ROWS}
    />
  );
});

/**
 * The mapping step: one select per field, the required ones first, each offering the columns of
 * the file with their header and their first value; under them the first rows of the file. A
 * column supplies one field only. "Continue" reads the file with the mapping and opens the
 * review; until every required field has a column it waits, and the page says for which.
 *
 * The fields and the actions keep the width of a form. The preview is a table, and a table is
 * not capped: it takes the width of the content area, so a full export of fifteen columns
 * scrolls sideways only where the window ends.
 */
export function ImportMappingPage() {
  const { draft, choices, choose, from, others, sentWith } = useImportDraft();
  const client = useQueryClient();
  const navigate = useNavigate();
  const cancel = useLeaveImport();
  const [arrivedWithFile] = useState(draft !== undefined);
  // What the page has to say about the last change: a column that moved, a mapping that was reset.
  const [said, setSaid] = useState<string | null>(null);
  // Whether the mapping was changed since the page was opened.
  const [isChanged, setChanged] = useState(false);
  const blockedId = useId();

  const fields: Fields = choices.fields ?? draft?.proposed.fields ?? {};

  const review = useMutation({
    mutationFn: () => api.importReview(fields),
    onSuccess: (found) => {
      client.setQueryData(keys.importReview, found);
      void navigate(IMPORT_REVIEW_PATH, { state: { from } });
    },
  });

  if (draft === undefined) return arrivedWithFile ? null : <ReopenFile from={from} />;

  const { file } = draft;
  const { headers, preview } = file;
  // While the file is read or the import is cancelled, the other buttons wait: only the one that
  // was pressed shows the spinner.
  const busy = review.isPending || cancel.isPending;

  // Another mapping is another reading of the file: what was reviewed before no longer holds.
  const change = (next: Fields) => {
    client.removeQueries({ queryKey: keys.importReview });
    review.reset();
    setChanged(true);
    choose({ fields: next });
  };

  const assign = (field: Field, id: string) => {
    const column = id === NONE ? undefined : Number(id);
    const previous = column === undefined ? undefined : fieldOf(fields, column);
    const next: Fields = {};
    for (const other of FIELDS) {
      const held = fields[other];
      if (other !== field && other !== previous && held !== undefined) next[other] = held;
    }
    if (column !== undefined) next[field] = column;
    change(next);
    setSaid(
      column !== undefined && previous !== undefined && previous !== field
        ? t("import.mapping.moved", {
            column: columnLabel(headers, column),
            field: fieldLabel(field),
            previous: fieldLabel(previous),
          })
        : null,
    );
  };

  const optionsFor = (field: Field, isRequired: boolean): SelectOption[] => {
    const columns = headers.map((_, column): SelectOption => {
      const owner = fieldOf(fields, column);
      const detail =
        owner !== undefined && owner !== field
          ? t("import.mapping.usedBy", { field: fieldLabel(owner) })
          : sampleOf(preview, column);
      return {
        id: String(column),
        label: columnLabel(headers, column),
        ...(detail === undefined ? {} : { detail }),
      };
    });
    return isRequired ? columns : [{ id: NONE, label: t("import.mapping.none") }, ...columns];
  };

  const select = (field: Field, isRequired: boolean) => {
    const column = fields[field];
    const isMissing = isRequired && column === undefined;
    return (
      <div key={field} data-field={field}>
        <Select
          label={
            isRequired
              ? t("import.mapping.requiredLabel", { field: fieldLabel(field) })
              : fieldLabel(field)
          }
          options={optionsFor(field, isRequired)}
          selectedKey={column === undefined ? (isRequired ? null : NONE) : String(column)}
          placeholder={t("import.mapping.placeholder")}
          isRequired={isRequired}
          isInert={busy}
          onSelectionChange={(id) => {
            assign(field, id);
          }}
          {...(isMissing ? { errorMessage: t("import.mapping.missing") } : {})}
        />
      </div>
    );
  };

  const ordered = orderFields(draft.required);
  const missing = ordered.required.filter((field) => fields[field] === undefined);
  // The review could not read the file for want of required columns, and led back here. It is
  // said whether or not this page finds a field without a column: the review may have missed
  // one the page takes for mapped. It was said of the mapping the page opened with, so it goes
  // once that mapping was changed and every required field has a column.
  const sentBack =
    sentWith?.kind === "MissingColumns" && (missing.length > 0 || !isChanged) ? sentWith : null;

  return (
    <Page
      title={t("import.mapping.title")}
      description={t("import.mapping.description", { file: file.file_name })}
      // The fields keep the width of a form; the preview is a table and takes the content area.
      width="full"
      breadcrumb={{
        ancestors: [
          {
            label: t("import.title"),
            onPress: () => {
              void navigate(IMPORT_PATH, { state: { from } });
            },
          },
        ],
      }}
    >
      <div className={styles.page}>
        <div data-part="mapping-form" className={styles.form}>
          {others > 0 ? (
            <Notice tone="info">{t("import.severalDropped", { count: others + 1 })}</Notice>
          ) : null}

          {sentBack === null ? null : (
            <div data-kind={sentBack.kind}>
              <Notice tone="warning" title={t("import.mapping.sentBackTitle")}>
                {sentBack.message}
              </Notice>
            </div>
          )}

          {draft.used_saved_mapping ? (
            <Notice tone="info" title={t("import.mapping.savedTitle")}>
              {t("import.mapping.savedText")}
            </Notice>
          ) : null}

          {file.sheets.length > 1 ? (
            <div className={styles.line}>
              <span className={styles.text}>
                {t("import.mapping.sheet", { sheet: file.sheet_name })}
              </span>
              <Button
                variant="quiet"
                isInert={busy}
                onPress={() => {
                  void navigate(IMPORT_SHEET_PATH, { state: { from } });
                }}
              >
                {t("import.chooseSheet")}
              </Button>
            </div>
          ) : null}

          <section className={styles.section}>
            <SectionTitle level={2}>{t("import.mapping.required")}</SectionTitle>
            <div className={styles.fields}>
              {ordered.required.map((field) => select(field, true))}
            </div>
          </section>

          <section className={styles.section}>
            <SectionTitle level={2}>{t("import.mapping.optional")}</SectionTitle>
            <p className={styles.text}>{t("import.mapping.optionalHelp")}</p>
            <div className={styles.fields}>
              {ordered.optional.map((field) => select(field, false))}
            </div>
          </section>

          {said === null ? null : <Notice tone="info">{said}</Notice>}

          {review.isError ? (
            <ImportProblem error={asCommandError(review.error)} general="import.mapping.error" />
          ) : null}
          {cancel.isError ? (
            <Notice tone="danger" title={t("import.cancelError")}>
              {asCommandError(cancel.error).message}
            </Notice>
          ) : null}

          <div className={styles.section}>
            <div className={styles.actions}>
              <Button
                variant="primary"
                isDisabled={missing.length > 0}
                reservesPendingSpace
                isPending={review.isPending}
                isInert={cancel.isPending}
                {...(missing.length > 0 ? { "aria-describedby": blockedId } : {})}
                onPress={() => {
                  setSaid(null);
                  review.mutate();
                }}
              >
                {t("import.mapping.continue")}
              </Button>
              <Button
                isInert={busy}
                onPress={() => {
                  change(file.auto_map.fields);
                  setSaid(t("import.mapping.resetDone"));
                }}
              >
                {t("import.mapping.reset")}
              </Button>
              <Button
                variant="quiet"
                reservesPendingSpace
                isPending={cancel.isPending}
                isInert={review.isPending}
                onPress={() => {
                  cancel.mutate({ to: from, file: draft.file.content_hash });
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
            {/* Why Continue waits. A disabled button cannot be reached by Tab, so the reason is
              announced when it changes: the region is always there, and what it holds changes. */}
            <div id={blockedId} role="status" data-part="continue-status">
              {missing.length === 0 ? null : (
                <p className={styles.text}>
                  {t("import.mapping.blocked", { fields: formatList(missing.map(fieldLabel)) })}
                </p>
              )}
            </div>
          </div>
        </div>

        <section className={styles.section}>
          <SectionTitle level={2}>{t("import.mapping.preview")}</SectionTitle>
          <p className={styles.text}>
            {preview.length === 0
              ? t("import.mapping.previewEmpty")
              : t("import.mapping.previewCaption", {
                  count: file.row_count,
                  shown: formatCount(preview.length),
                })}
          </p>
          {preview.length === 0 ? null : (
            <Preview headers={headers} preview={preview} fields={fields} />
          )}
        </section>
      </div>
    </Page>
  );
}
