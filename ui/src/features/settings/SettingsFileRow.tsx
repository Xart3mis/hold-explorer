import { useId, useState } from "react";
import { asCommandError, type AppError } from "../../api/error";
import { showInFolder } from "../../api/window";
import { Button, Notice } from "../../components";
import { t } from "../../text/i18n";
import styles from "./SettingsPage.module.css";

/**
 * The settings file, in About: its path as the Rust side gives it, and "Show in folder". The
 * button names the file in its accessible name, since the folder row above has a "Show in
 * folder" of its own. A file that cannot be shown (it is written at the first save) says why.
 */
export function SettingsFileRow({ path }: { path: string }) {
  const labelId = useId();
  const [error, setError] = useState<AppError | null>(null);
  return (
    <div className={styles.row}>
      <div className={styles.value}>
        <span id={labelId} className={styles.label}>
          {t("settings.settingsFile")}
        </span>
        <span className={styles.path}>{path}</span>
        <span className={styles.help}>{t("settings.settingsFileHelp")}</span>
      </div>
      <div className={styles.buttons}>
        <Button
          aria-label={t("settings.settingsFileShow")}
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
          title={t("settings.settingsFileError")}
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
