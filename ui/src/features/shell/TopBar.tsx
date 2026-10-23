import { Layers, Settings, Upload } from "lucide-react";
import { useLocation } from "react-router";
import { WELCOME_PATH, type Destination } from "../../app/destinations";
import type { AppStart } from "../../bindings/AppStart";
import { Button, Tooltip } from "../../components";
import { t } from "../../text/i18n";
import { ExportMenuInert } from "../export/ExportMenu";
import { startImport } from "../import/start";
import { SearchField } from "../search/SearchField";
import { WorkspaceSwitcher } from "../workspaces/WorkspaceSwitcher";
import { NavItem } from "./NavItem";
import type { ShellProblem } from "./problem";
import { formatShortcut, IMPORT_SHORTCUT } from "./shortcuts";
import styles from "./Shell.module.css";
import { SnapshotSelector } from "./SnapshotSelector";
import { TopBarExportSlot } from "./topBarSlot";

export interface TopBarProps {
  start: AppStart;
  destinations: readonly Destination[];
  /** The id of the notice that shows a failed rename, while there is one. */
  renameErrorId: string | undefined;
  onProblem: (problem: ShellProblem | null) => void;
}

/**
 * The top bar, left to right: the name of the app, the workspace switcher, the search field, the
 * snapshot selector, Export, and Import. The search field is there while a snapshot is in view:
 * without one there is nothing to find. The Export menu is the one the page in view puts in the slot
 * (`TopBarExport`); a page with nothing to export leaves the unavailable button there. While no
 * workspace is open there is nothing to switch and no sidebar, so the two pages that exist then,
 * Workspaces and Settings, are listed where the switcher would be.
 */
export function TopBar({ start, destinations, renameErrorId, onProblem }: TopBarProps) {
  const { pathname } = useLocation();
  const settings = destinations.find(({ id }) => id === "settings");
  return (
    <header className={styles.topbar}>
      <span className={styles.appName}>{t("app.name")}</span>
      <div className={styles.topbarStart}>
        {start.open === null ? (
          <nav aria-label={t("shell.navigation")}>
            <ul className={styles.topNav}>
              <li>
                <NavItem
                  href={WELCOME_PATH}
                  label={t("workspaces.title")}
                  icon={Layers}
                  isCurrent={pathname === WELCOME_PATH}
                />
              </li>
              {settings === undefined ? null : (
                <li>
                  <NavItem
                    href={settings.path}
                    label={t("destinations.name.settings")}
                    icon={Settings}
                    isCurrent={pathname === settings.path}
                    tooltipPlacement="bottom"
                    {...(settings.shortcut === undefined ? {} : { shortcut: settings.shortcut })}
                  />
                </li>
              )}
            </ul>
          </nav>
        ) : (
          <WorkspaceSwitcher
            open={start.open}
            workspaces={start.list.workspaces}
            destinations={destinations}
            renameErrorId={renameErrorId}
            onProblem={onProblem}
          />
        )}
      </div>
      {start.open?.selected == null ? null : <SearchField />}
      <div className={styles.topbarEnd}>
        {start.open === null ? null : <SnapshotSelector open={start.open} onProblem={onProblem} />}
        <TopBarExportSlot fallback={<ExportMenuInert description={t("export.menu.notHere")} />} />
        <Tooltip text={t("shell.import")} shortcut={formatShortcut(IMPORT_SHORTCUT)}>
          <Button
            variant="primary"
            icon={Upload}
            onPress={() => {
              void startImport();
            }}
          >
            {t("shell.import")}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
