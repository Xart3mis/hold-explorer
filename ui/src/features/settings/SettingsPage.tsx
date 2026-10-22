import { useEffect, useRef, useState } from "react";
import { asCommandError } from "../../api/error";
import { useAuthorNameSetting } from "../../app/actions/authorName";
import { useDensitySetting } from "../../app/actions/density";
import { useWorkspaceFolder } from "../../app/actions/folder";
import { useThemeSetting } from "../../app/actions/theme";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import type { Density } from "../../bindings/Density";
import type { Theme } from "../../bindings/Theme";
import { Notice, Select, TextField, type SelectOption } from "../../components";
import { t } from "../../text/i18n";
import { FolderRow } from "./FolderRow";
import styles from "./SettingsPage.module.css";

const THEMES: readonly Theme[] = ["Dark", "Light", "System"];

function isTheme(value: string): value is Theme {
  return THEMES.some((theme) => theme === value);
}

const DENSITIES: readonly Density[] = ["Comfortable", "Compact"];

function isDensity(value: string): value is Density {
  return DENSITIES.some((density) => density === value);
}

/**
 * Settings: the theme and the density, applied at once and saved; the name notes are signed
 * with, saved when the field is left or Enter is pressed; the folder the workspaces are kept in,
 * with a way to show it and to change it; and the version of the app. While the folder changes,
 * the other settings are inert, and the folder row says so.
 */
export function SettingsPage() {
  const { start } = useShell();
  const { setTheme } = useThemeSetting();
  const { setDensity } = useDensitySetting();
  const { setAuthorName } = useAuthorNameSetting();
  const folder = useWorkspaceFolder();
  // The other settings wait while the workspaces folder changes.
  const waiting = folder.change?.step === "moving";

  // What is typed in the name field, and the name last sent to be saved (null: none that holds).
  // The field is saved on blur and on Enter, so pressing the sidebar, which remounts this page,
  // saves it on the way out; the saved name is then shown by the page that replaces this one.
  const savedName = start.settings.author_name;
  const [draft, setDraft] = useState(savedName);
  const asked = useRef<string | null>(savedName);
  const focused = useRef(false);
  useEffect(() => {
    asked.current = savedName;
    if (!focused.current) setDraft(savedName);
  }, [savedName]);
  const saveName = () => {
    const name = draft.trim();
    // The text shows the name as it is kept: trimmed.
    setDraft(name);
    if (name === asked.current) return;
    asked.current = name;
    setAuthorName.mutate(name, {
      onSuccess: (settings) => {
        // The text shows the name as it was saved (trimmed), unless more was typed meanwhile.
        setDraft((typed) => (typed.trim() === settings.author_name ? settings.author_name : typed));
      },
      onError: () => {
        asked.current = null;
      },
    });
  };

  const themes: SelectOption[] = [
    { id: "Dark", label: t("settings.themeDark") },
    { id: "Light", label: t("settings.themeLight") },
    { id: "System", label: t("settings.themeSystem") },
  ];
  const densities: SelectOption[] = [
    { id: "Comfortable", label: t("settings.densityComfortable") },
    { id: "Compact", label: t("settings.densityCompact") },
  ];

  return (
    <Page title={t("destinations.name.settings")} width="form">
      <div className={styles.form}>
        <div className={styles.row} inert={waiting}>
          <Select
            label={t("settings.theme")}
            description={t("settings.themeHelp")}
            options={themes}
            selectedKey={start.settings.theme}
            isPending={setTheme.isPending}
            onSelectionChange={(id) => {
              if (isTheme(id) && id !== start.settings.theme) setTheme.mutate(id);
            }}
            className={styles.choice}
          />
          {setTheme.isError ? (
            <Notice tone="danger" title={t("settings.themeError")}>
              {asCommandError(setTheme.error).message}
            </Notice>
          ) : null}
        </div>

        <div className={styles.row} inert={waiting}>
          <Select
            label={t("settings.density")}
            description={t("settings.densityHelp")}
            options={densities}
            selectedKey={start.settings.density}
            isPending={setDensity.isPending}
            onSelectionChange={(id) => {
              if (isDensity(id) && id !== start.settings.density) setDensity.mutate(id);
            }}
            className={styles.choice}
          />
          {setDensity.isError ? (
            <Notice tone="danger" title={t("settings.densityError")}>
              {asCommandError(setDensity.error).message}
            </Notice>
          ) : null}
        </div>

        <div className={styles.row} inert={waiting}>
          <TextField
            label={t("settings.authorName")}
            description={t("settings.authorNameHelp")}
            {...(setAuthorName.isError
              ? { errorMessage: asCommandError(setAuthorName.error).message }
              : {})}
            isPending={setAuthorName.isPending}
            autoComplete="off"
            value={draft}
            onChange={setDraft}
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
              saveName();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) saveName();
            }}
            className={styles.name}
          />
        </div>

        <FolderRow start={start} folder={folder} />

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
