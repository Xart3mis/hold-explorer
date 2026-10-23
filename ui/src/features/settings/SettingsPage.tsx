import { useEffect, useId, useRef, useState } from "react";
import { asCommandError } from "../../api/error";
import { useAuthorNameSetting } from "../../app/actions/authorName";
import { useDensitySetting } from "../../app/actions/density";
import { useWorkspaceFolder } from "../../app/actions/folder";
import { useThemeSetting } from "../../app/actions/theme";
import { useUpdateCheckSetting } from "../../app/actions/update";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import type { Density } from "../../bindings/Density";
import type { Theme } from "../../bindings/Theme";
import {
  Checkbox,
  Notice,
  SectionTitle,
  Select,
  TextField,
  type SelectOption,
} from "../../components";
import { t } from "../../text/i18n";
import { DiagnosticsRow } from "./DiagnosticsRow";
import { FolderRow } from "./FolderRow";
import { LogsFolderRow } from "./LogsFolderRow";
import { SettingsFileRow } from "./SettingsFileRow";
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
 * with, saved when the field is left or Enter is pressed; whether a newer release is looked for
 * at start, applied at once and saved; then About: the version of the app, the
 * folder the workspaces are kept in, with a way to show it and to change it, and the settings
 * file and the logs folder, each with a way to show it, and Copy diagnostics. While the folder
 * changes, the other settings are inert, and the folder row says so.
 */
export function SettingsPage() {
  const { start } = useShell();
  const { setTheme } = useThemeSetting();
  const { setDensity } = useDensitySetting();
  const { setAuthorName } = useAuthorNameSetting();
  const { setUpdateCheck } = useUpdateCheckSetting();
  const updateHelpId = useId();
  const folder = useWorkspaceFolder();
  const aboutId = useId();
  // The other settings wait while the workspaces folder changes.
  const waiting = folder.change?.step === "moving";

  // What is typed in the name field, and the name last sent to be saved (null: none that holds).
  // The field is saved on blur and on Enter, so pressing the sidebar, which remounts this page,
  // saves it on the way out; the saved name is then shown by the page that replaces this one.
  const savedName = start.settings.author_name;
  const [draft, setDraft] = useState(savedName);
  const asked = useRef<string | null>(savedName);
  const focused = useRef(false);
  // What is typed, for the save when the page goes while the field has the focus: a Ctrl
  // shortcut leaves the page from the field, and a field that is removed may get no blur.
  const typed = useRef(draft);
  useEffect(() => {
    typed.current = draft;
  });
  // The name last refused while the page was there: its reason is shown under the field, so
  // leaving does not send it again (and no toast repeats the reason). Any other text is sent. It
  // is forgotten once a name is saved or the text is edited.
  const refused = useRef<string | null>(null);
  const { mutate: sendName } = setAuthorName;
  useEffect(
    () => () => {
      const name = typed.current.trim();
      if (name !== asked.current && name !== refused.current) sendName(name);
    },
    [sendName],
  );
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
        refused.current = null;
        // The text shows the name as it was saved (trimmed), unless more was typed meanwhile.
        setDraft((typed) => (typed.trim() === settings.author_name ? settings.author_name : typed));
      },
      onError: () => {
        asked.current = null;
        refused.current = name;
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
            onChange={(text) => {
              refused.current = null;
              setDraft(text);
            }}
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
              saveName();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) saveName();
              // The keys the field does not use go on to the shortcuts of the app.
              else event.continuePropagation();
            }}
            className={styles.name}
          />
        </div>

        <div className={styles.row} inert={waiting}>
          <Checkbox
            isSelected={start.settings.update_check}
            aria-describedby={updateHelpId}
            onChange={(enabled) => {
              setUpdateCheck.mutate(enabled);
            }}
          >
            {t("settings.updateCheck")}
          </Checkbox>
          <span id={updateHelpId} className={styles.help}>
            {t("settings.updateCheckHelp")}
          </span>
          {setUpdateCheck.isError ? (
            <Notice tone="danger" title={t("settings.updateCheckError")}>
              {asCommandError(setUpdateCheck.error).message}
            </Notice>
          ) : null}
        </div>

        <section aria-labelledby={aboutId} className={[styles.row, styles.about].join(" ")}>
          <SectionTitle level={2} id={aboutId}>
            {t("settings.about")}
          </SectionTitle>
          <div className={styles.row} inert={waiting}>
            <div className={styles.value}>
              <span className={styles.label}>{t("settings.version")}</span>
              <span className={styles.version}>{start.version}</span>
            </div>
          </div>

          <FolderRow start={start} folder={folder} />

          <SettingsFileRow path={start.settings_file} isWaiting={waiting} />

          <LogsFolderRow path={start.logs_folder} isWaiting={waiting} />

          <DiagnosticsRow isWaiting={waiting} />
        </section>
      </div>
    </Page>
  );
}
