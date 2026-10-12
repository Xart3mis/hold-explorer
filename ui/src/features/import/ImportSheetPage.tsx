import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { IMPORT_PATH } from "../../app/destinations";
import { Page } from "../../app/shell/Page";
import { Button, Notice } from "../../components";
import { t } from "../../text/i18n";
import { openDraft, useImportDraft } from "./draft";
import styles from "./Import.module.css";
import { ImportProblem } from "./ImportProblem";
import { ReopenFile, useLeaveImport } from "./leave";
import { nextStep } from "./start";

/**
 * The sheets of the workbook that is open for import, with the one that was read marked. Reading
 * another sheet replaces the draft, and the flow continues as it does for a file that was just
 * opened. A text file, or a workbook with one sheet, has nothing to choose here, and says so.
 */
export function ImportSheetPage() {
  const { draft, from } = useImportDraft();
  const client = useQueryClient();
  const navigate = useNavigate();
  const cancel = useLeaveImport();
  // Whether a file was open when the page was reached. One that goes later was dropped on purpose.
  const [arrivedWithFile] = useState(draft !== undefined);

  const choose = useMutation({
    mutationFn: (sheet: string) => api.importChooseSheet(sheet),
    onSuccess: (chosen) => {
      openDraft(client, chosen);
      void navigate(nextStep(chosen), { replace: true, state: { from } });
    },
  });

  if (draft === undefined) return arrivedWithFile ? null : <ReopenFile from={from} />;

  const { file } = draft;
  const sheets = file.sheets.length > 1 ? file.sheets : [];

  return (
    <Page
      title={t("import.sheet.title")}
      description={t("import.sheet.description", { file: file.file_name })}
      width="form"
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
        {sheets.length === 0 ? (
          <p className={styles.text}>{t("import.sheet.none")}</p>
        ) : (
          <ul
            aria-label={t("import.sheet.list", { file: file.file_name })}
            className={styles.ruled}
          >
            {sheets.map((sheet) => {
              const inUse = sheet === file.sheet_name;
              return (
                <li key={sheet} className={styles.ruledRow}>
                  <span className={styles.ruledValue}>{sheet}</span>
                  <span className={styles.ruledEnd}>
                    {inUse ? (
                      <>
                        <span className={styles.count}>
                          {t("import.sheet.rows", { count: file.row_count })}
                        </span>
                        <span className={styles.tag}>{t("import.sheet.inUse")}</span>
                      </>
                    ) : (
                      <Button
                        aria-label={t("import.sheet.useNamed", { sheet })}
                        isPending={choose.isPending && choose.variables === sheet}
                        isDisabled={choose.isPending && choose.variables !== sheet}
                        onPress={() => {
                          choose.mutate(sheet);
                        }}
                      >
                        {t("import.sheet.use")}
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {choose.isError ? (
          <ImportProblem error={asCommandError(choose.error)} general="import.error.sheet" />
        ) : null}
        {cancel.isError ? (
          <Notice tone="danger" title={t("import.cancelError")}>
            {asCommandError(cancel.error).message}
          </Notice>
        ) : null}

        <div className={styles.actions}>
          <Button
            isDisabled={choose.isPending}
            onPress={() => {
              void navigate(nextStep(draft), { state: { from } });
            }}
          >
            {t("import.sheet.keep", { sheet: file.sheet_name })}
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
      </div>
    </Page>
  );
}
