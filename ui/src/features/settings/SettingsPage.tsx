import { useId, useState } from "react";
import { asCommandError } from "../../api/error";
import { showInFolder } from "../../api/window";
import { t } from "../../text/i18n";
import { useApp } from "../../app/useApp";
import type { CommandError } from "../../bindings/CommandError";
import type { Theme } from "../../bindings/Theme";
import { Button, Notice, Select, type SelectOption } from "../../components";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import styles from "./SettingsPage.module.css";

const THEMES: readonly Theme[] = ["Dark", "Light", "System"];

function isTheme(value: string): value is Theme {
  return THEMES.some((theme) => theme === value);
}

/**
 * Settings: the theme, applied at once and saved; the folder the workspaces are kept in, with a
 * way to show it; and the version of the app.
 */
export function SettingsPage() {
  const { start } = useShell();
  const { setTheme } = useApp();
  const [folderError, setFolderError] = useState<CommandError | null>(null);
  const folderLabelId = useId();

  const themes: SelectOption[] = [
    { id: "Dark", label: t("settings.themeDark") },
    { id: "Light", label: t("settings.themeLight") },
    { id: "System", label: t("settings.themeSystem") },
  ];
  const folder = start.list.folder;

  return (
    <Page title={t("destinations.name.settings")} width="form">
      <div className={styles.form}>
        <div className={styles.row}>
          <Select
            label={t("settings.theme")}
            description={t("settings.themeHelp")}
            options={themes}
            selectedKey={start.settings.theme}
            isPending={setTheme.isPending}
            onSelectionChange={(id) => {
              if (isTheme(id) && id !== start.settings.theme) setTheme.mutate(id);
            }}
            className={styles.theme}
          />
          {setTheme.isError ? (
            <Notice tone="danger" title={t("settings.themeError")}>
              {asCommandError(setTheme.error).message}
            </Notice>
          ) : null}
        </div>

        <div className={styles.row}>
          <div className={styles.value}>
            <span id={folderLabelId} className={styles.label}>
              {t("settings.folder")}
            </span>
            <span className={styles.path}>{folder}</span>
            <span className={styles.help}>{t("settings.folderHelp")}</span>
          </div>
          <div>
            <Button
              aria-describedby={folderLabelId}
              onPress={() => {
                setFolderError(null);
                showInFolder(folder).catch((error: unknown) => {
                  setFolderError(asCommandError(error));
                });
              }}
            >
              {t("common.showInFolder")}
            </Button>
          </div>
          {folderError === null ? null : (
            <Notice
              tone="danger"
              title={t("shell.folderError")}
              onDismiss={() => {
                setFolderError(null);
              }}
            >
              {folderError.message}
            </Notice>
          )}
        </div>

        <div className={styles.row}>
          <div className={styles.value}>
            <span className={styles.label}>{t("settings.version")}</span>
            <span className={styles.version}>{start.version}</span>
          </div>
        </div>
      </div>
    </Page>
  );
}
