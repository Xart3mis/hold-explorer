import { useId, useState } from "react";
import { asCommandError, type AppError } from "../../api/error";
import { showInFolder } from "../../api/window";
import { Button, Notice } from "../../components";
import { t } from "../../text/i18n";
import styles from "./SettingsPage.module.css";

/**
 * The folder of the crash logs, in About: its path as the Rust side gives it, and "Show in
 * folder". The button names the folder in its accessible name, since the other rows have a "Show
 * in folder" of their own. A folder that cannot be shown (it is made at the first crash) says why.
 */
export function LogsFolderRow({ path, isWaiting }: { path: string; isWaiting: boolean }) {
  const labelId = useId();
  const [error, setError] = useState<AppError | null>(null);
  return (
    // Inert, as the other rows are, while the workspaces folder changes.
    <div className={styles.row} inert={isWaiting}>
      <div className={styles.value}>
        <span id={labelId} className={styles.label}>
          {t("settings.logsFolder")}
        </span>
        <span className={styles.path}>{path}</span>
        <span className={styles.help}>{t("settings.logsFolderHelp")}</span>
      </div>
      <div className={styles.buttons}>
        <Button
          aria-label={t("settings.logsFolderShow")}
          aria-describedby={labelId}
          onPress={() => {
            setError(null);
            showInFolder(path).catch((failure: unknown) => {
              setError(asCommandError(failure));
            });
          }}
        >
          {t("common.showInFolder")}
        </Button>
      </div>
      {error === null ? null : (
        <Notice
          tone="danger"
          title={t("settings.logsFolderError")}
          onDismiss={() => {
            setError(null);
          }}
        >
          {error.message}
        </Notice>
      )}
    </div>
  );
}
