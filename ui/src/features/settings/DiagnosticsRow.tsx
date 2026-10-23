import { useMutation } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { Button, Notice, useToast } from "../../components";
import { t } from "../../text/i18n";
import styles from "./SettingsPage.module.css";

/**
 * Copy diagnostics, in About: one button that has Rust build the text and put it on the
 * clipboard. A toast says "Copied"; a failure (the clipboard refused) is shown in place, under
 * the button, in the words of the command.
 */
export function DiagnosticsRow({ isWaiting }: { isWaiting: boolean }) {
  const toast = useToast();
  const copy = useMutation({
    mutationFn: () => api.diagnosticsCopy(),
    onSuccess: () => {
      toast.show({ message: t("settings.diagnosticsCopied"), tone: "success" });
    },
  });
  return (
    // Inert, as the other rows are, while the workspaces folder changes.
    <div className={styles.row} inert={isWaiting}>
      <div className={styles.value}>
        <span className={styles.label}>{t("settings.diagnostics")}</span>
        <span className={styles.help}>{t("settings.diagnosticsHelp")}</span>
      </div>
      <div className={styles.buttons}>
        <Button
          icon={Copy}
          isPending={copy.isPending}
          onPress={() => {
            copy.mutate();
          }}
        >
          {t("settings.diagnosticsCopy")}
        </Button>
      </div>
      {copy.isError ? (
        <Notice tone="danger" title={t("settings.diagnosticsError")}>
          {asCommandError(copy.error).message}
        </Notice>
      ) : null}
    </div>
  );
}
