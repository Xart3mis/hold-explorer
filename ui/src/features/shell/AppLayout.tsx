import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RouterProvider } from "react-aria-components";
import { Outlet, useHref, useLocation, useNavigate, type NavigateOptions } from "react-router";
import { useIsMutating } from "@tanstack/react-query";
import { asCommandError } from "../../api/error";
import { fileName } from "../../api/files";
import { keys } from "../../api/keys";
import { inApp, onFileDrag } from "../../api/window";
import { useSelectionFollowsView } from "../../app/actions/selection";
import { useSnapshotActions } from "../../app/actions/snapshots";
import { useStart } from "../../app/actions/start";
import { IMPORT_PATH, OVERVIEW_PATH, WELCOME_PATH, type Destination } from "../../app/destinations";
import { searchWithSelection } from "../../app/selection";
import { ShellContext, type ShellNotice, type ShellReport } from "../../app/shell/context";
import type { AppStart } from "../../bindings/AppStart";
import { Button, ErrorState, Notice, Skeleton, VisuallyHidden } from "../../components";
import { formatDateTime } from "../../text/format";
import { t } from "../../text/i18n";
import { DetailPanel } from "../detail/DetailPanel";
import { ViewActionsProvider } from "../views/actions";
import { createDetailFocus, DetailFocusContext, useSelection } from "../detail/selection";
import { connectImportStart, readImportLocation, startImport } from "../import/start";
import { CommandPalette } from "../palette/CommandPalette";
import type { ShellProblem } from "./problem";
import { shortcutBindings, usePaletteShortcut, useShortcuts } from "./shortcuts";
import styles from "./Shell.module.css";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { TopBarSlotProvider } from "./topBarSlot";
import { useSidebarForm, useWindowMark, useWindowSize } from "./window";

declare module "react-aria-components" {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

/** The top bar before anything is known: the name of the app, and blocks where its controls go. */
function BareTopBar({ isLoading }: { isLoading: boolean }) {
  return (
    <header className={styles.topbar}>
      <span className={styles.appName}>{t("app.name")}</span>
      {isLoading ? (
        <div aria-hidden="true" className={styles.loadingBar}>
          <Skeleton width="16ch" />
          <Skeleton width="10ch" />
        </div>
      ) : null}
    </header>
  );
}

/** The first load of the app: skeletons in the shape of the shell. */
function LoadingShell() {
  return (
    <div className={styles.layout}>
      <BareTopBar isLoading />
      <main aria-busy="true" className={styles.content}>
        <div className={styles.scroll}>
          <VisuallyHidden elementType="h1">{t("app.name")}</VisuallyHidden>
          <VisuallyHidden role="status">{t("shell.loading")}</VisuallyHidden>
          <div aria-hidden="true" className={styles.loadingPage}>
            <span className={styles.loadingTitle}>
              <Skeleton width="14ch" />
            </span>
            {["72%", "64%", "68%", "40%"].map((width) => (
              <span key={width} className={styles.loadingLine}>
                <Skeleton width={width} />
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/** The application start failed: what happened, why, how to fix it, and a way to try again. */
function FailedShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.layout}>
      <BareTopBar isLoading={false} />
      <main className={styles.content}>
        <div className={styles.scroll}>
          <VisuallyHidden elementType="h1">{t("app.name")}</VisuallyHidden>
          <div className={styles.loadingPage}>{children}</div>
        </div>
      </main>
    </div>
  );
}

/** The window-wide drop target, shown while a file is dragged anywhere over the window. */
function DropFrame({ paths }: { paths: readonly string[] }) {
  const first = paths[0];
  return (
    <div data-part="drop-frame" className={styles.dropFrame}>
      <p className={styles.dropTitle}>{t("shell.dropTitle")}</p>
      {first === undefined ? null : <p className={styles.dropFile}>{fileName(first)}</p>}
    </div>
  );
}

const NO_SEARCHES: ReadonlyMap<string, string> = new Map();

interface ShellProps {
  start: AppStart;
  destinations: readonly Destination[];
}

/** The shell once the application start is known. */
function LoadedShell({ start, destinations }: ShellProps) {
  const { selectSnapshot } = useSnapshotActions();
  const { isBusy } = useStart();
  const navigate = useNavigate();
  const location = useLocation();
  const problemId = useId();
  // Another workspace or another snapshot is being opened: the page that is there stays, dimmed.
  const isSwitching = useIsMutating({ mutationKey: keys.switching }) > 0;
  const [dragged, setDragged] = useState<readonly string[] | null>(null);
  const [problem, setProblem] = useState<ShellProblem | null>(null);
  // What the shell was asked to say with `notify`: nothing failed, and the user should know.
  const [notice, setNotice] = useState<ShellNotice | null>(null);
  const [dismissedWarning, setDismissedWarning] = useState<string | null>(null);
  const [dismissedSettings, setDismissedSettings] = useState<string | null>(null);
  // Why files cannot be dropped on this window, when the window refused to say when one is.
  const [dropProblem, setDropProblem] = useState<string | null>(null);
  // Where the focus goes as the detail panel opens and closes; see ui/src/features/detail/.
  const [detailFocus] = useState(createDetailFocus);
  const { selection } = useSelection();
  // In a small window the panel lies over the right edge of the content; from a medium one on it
  // sits beside it.
  const isWide = useWindowSize() !== "small";
  const [sidebarForm, setSidebarForm] = useSidebarForm();

  // The page the app opened on, and whether it has been left since.
  const arrival = useRef<{ first: string | null; left: boolean }>({ first: null, left: false });
  const arrivedAt = useCallback((path: string) => {
    const seen = arrival.current;
    seen.first ??= path;
    if (seen.first === path && !seen.left) return false;
    seen.left = true;
    return true;
  }, []);

  const open = start.open;
  const home = open === null ? WELCOME_PATH : OVERVIEW_PATH;
  useSelectionFollowsView(open);

  // The address each destination last had in this session, without a selection: the sidebar and
  // the shortcuts open a destination there (DESIGN.md, "Sidebar item"). Forgotten when another
  // workspace opens, since the addresses name values of the one before.
  const workspaceId = open?.workspace.id ?? null;
  const [visited, setVisited] = useState<{
    workspace: typeof workspaceId;
    searches: ReadonlyMap<string, string>;
  }>({ workspace: workspaceId, searches: new Map() });
  const isDestination = destinations.some((destination) => destination.path === location.pathname);
  const leftAt = searchWithSelection(location.search, null);
  const searches = visited.workspace === workspaceId ? visited.searches : NO_SEARCHES;
  if (
    visited.workspace !== workspaceId ||
    (isDestination && searches.get(location.pathname) !== leftAt)
  ) {
    const next = new Map(searches);
    if (isDestination) next.set(location.pathname, leftAt);
    setVisited({ workspace: workspaceId, searches: next });
  }
  const addressOf = useCallback((path: string) => `${path}${searches.get(path) ?? ""}`, [searches]);

  // A second press on the destination that is shown returns it to its default address: the page
  // is drawn anew, so its selected rows and its scroll are gone, and the address it is opened at
  // from now on is its own (the filters belong to the workspace, and stay). The count is what
  // the page is keyed by besides its path.
  const [restarts, setRestarts] = useState(0);
  const scrolled = useRef<HTMLDivElement>(null);
  const restart = useCallback(() => {
    setRestarts((count) => count + 1);
  }, []);
  useLayoutEffect(() => {
    if (restarts > 0 && scrolled.current !== null) scrolled.current.scrollTop = 0;
  }, [restarts]);

  // The toast region is rendered beside the layout. It learns from the root element where the
  // content area starts: after the sidebar, or after its rail; see app.css.
  const hasSidebar = open !== null;
  useEffect(() => {
    if (!hasSidebar) return;
    const root = document.documentElement;
    root.setAttribute("data-sidebar", sidebarForm === "rail" ? "rail" : "");
    return () => {
      root.removeAttribute("data-sidebar");
    };
  }, [hasSidebar, sidebarForm]);

  // Every way of starting an import ends here: the import page, opened with the file and with
  // the address to return to. An import started from inside the import flow keeps the address
  // the first one was started from.
  const { pathname } = location;
  const state: unknown = location.state;
  useEffect(
    () =>
      connectImportStart((request) => {
        const from = pathname.startsWith(IMPORT_PATH)
          ? readImportLocation(state, home).from
          : pathname;
        void navigate(IMPORT_PATH, { state: { ...request, from } });
      }),
    [navigate, pathname, state, home],
  );

  // A file dragged over the window shows the drop target; a file dropped starts an import.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let gone = false;
    onFileDrag((event) => {
      if (event.type === "enter") {
        setDragged(event.paths);
        return;
      }
      setDragged(null);
      if (event.type !== "drop") return;
      const [first, ...others] = event.paths;
      if (first === undefined) return;
      startImport(first, others.length).catch((error: unknown) => {
        setProblem({
          kind: "action",
          title: t("import.startError"),
          message: asCommandError(error).message,
        });
      });
    }).then(
      (unlisten) => {
        if (gone) unlisten();
        else stop = unlisten;
      },
      (error: unknown) => {
        // A plain browser has no window that gives drag events, and nothing to say about it. In
        // the app the user is told, with the reason: a file dropped here would do nothing.
        if (!gone && inApp()) setDropProblem(asCommandError(error).message);
      },
    );
    return () => {
      gone = true;
      stop?.();
    };
  }, []);

  // A destination opens where it was left, and the one shown is drawn anew at its own address,
  // as its sidebar item does: for the shortcuts and the command palette.
  const openDestination = useCallback(
    (path: string) => {
      if (path !== pathname) {
        void navigate(addressOf(path));
        return;
      }
      restart();
      void navigate(path);
    },
    [navigate, addressOf, pathname, restart],
  );
  const bindings = useMemo(
    () =>
      shortcutBindings(destinations, {
        open: openDestination,
        startImport: () => void startImport(),
        hasWorkspace: hasSidebar,
      }),
    [destinations, openDestination, hasSidebar],
  );
  useShortcuts(bindings);

  // The command palette: Ctrl+K opens it from anywhere, and closes it.
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  usePaletteShortcut(
    useCallback(() => {
      setPaletteOpen((isOpen) => !isOpen);
    }, []),
  );

  // The detail panel shows while the address of a data destination selects a line, a hold, or a
  // blocker, and there is a snapshot to read it from.
  const isDataPage = destinations.some(
    (destination) =>
      destination.group === "data" && destination.available && destination.path === pathname,
  );
  const detail = isDataPage && open?.selected != null ? selection : null;

  const selected = open?.snapshots.find((snapshot) => snapshot.id === open.selected);
  // The command lists the snapshots oldest first, so the last one is the newest.
  const newest = open?.snapshots.at(-1);
  // An older snapshot is in view: the one that is selected, and the newest to go back to.
  const older =
    selected !== undefined && newest !== undefined && selected.id !== newest.id
      ? { selected, newest }
      : null;
  const warning =
    open?.warning != null && open.warning.message !== dismissedWarning ? open.warning : null;
  // What went wrong with the settings file at start, until it is dismissed.
  const settingsProblem =
    start.settings_problem !== null && start.settings_problem.message !== dismissedSettings
      ? start.settings_problem
      : null;
  const report = useCallback(({ title, error }: ShellReport) => {
    setProblem({ kind: "action", title, message: error.message });
  }, []);
  const shell = useMemo(
    () => ({ start, dragged, arrivedAt, report, notify: setNotice }),
    [start, dragged, arrivedAt, report],
  );

  return (
    <ShellContext value={shell}>
      <ViewActionsProvider>
        <DetailFocusContext value={detailFocus}>
          <TopBarSlotProvider>
            <div
              data-detail={detail === null ? undefined : isWide ? "beside" : "overlay"}
              className={styles.layout}
            >
              <TopBar
                start={start}
                destinations={destinations}
                renameErrorId={problem?.kind === "rename" ? problemId : undefined}
                onProblem={setProblem}
              />
              {hasSidebar ? (
                <Sidebar
                  destinations={destinations}
                  addressOf={addressOf}
                  onRestart={restart}
                  form={sidebarForm}
                  onFormChange={setSidebarForm}
                />
              ) : null}
              <main className={styles.content}>
                {problem !== null ||
                notice !== null ||
                settingsProblem !== null ||
                dropProblem !== null ||
                warning !== null ||
                older !== null ? (
                  <div className={styles.notices}>
                    {problem === null ? null : (
                      <div id={problemId}>
                        <Notice
                          tone="danger"
                          title={problem.title}
                          onDismiss={() => {
                            setProblem(null);
                          }}
                        >
                          {problem.message}
                        </Notice>
                      </div>
                    )}
                    {notice === null ? null : (
                      <Notice
                        tone="info"
                        title={notice.title}
                        onDismiss={() => {
                          setNotice(null);
                        }}
                      >
                        {notice.text}
                      </Notice>
                    )}
                    {settingsProblem === null ? null : (
                      <Notice
                        tone="warning"
                        title={t("shell.settingsProblem")}
                        onDismiss={() => {
                          setDismissedSettings(settingsProblem.message);
                        }}
                      >
                        {settingsProblem.message}
                      </Notice>
                    )}
                    {dropProblem === null ? null : (
                      <Notice
                        tone="warning"
                        title={t("shell.dropUnavailable")}
                        onDismiss={() => {
                          setDropProblem(null);
                        }}
                      >
                        <span className={styles.noticeLine}>{dropProblem}</span>
                        <span className={styles.noticeLine}>{t("shell.dropUnavailableHelp")}</span>
                      </Notice>
                    )}
                    {warning === null ? null : (
                      <Notice
                        tone="warning"
                        title={t("workspaces.warningTitle")}
                        onDismiss={() => {
                          setDismissedWarning(warning.message);
                        }}
                      >
                        {warning.message}
                      </Notice>
                    )}
                    {older === null ? null : (
                      <Notice
                        tone="info"
                        actions={
                          <Button
                            variant="quiet"
                            reservesPendingSpace
                            isPending={selectSnapshot.isPending}
                            isInert={isBusy}
                            onPress={() => {
                              selectSnapshot.mutate(older.newest.id, {
                                onSuccess: () => {
                                  setProblem(null);
                                },
                                onError: (error) => {
                                  setProblem({
                                    kind: "action",
                                    title: t("snapshots.selectError"),
                                    message: asCommandError(error).message,
                                  });
                                },
                              });
                            }}
                          >
                            {t("snapshots.toNewest")}
                          </Button>
                        }
                      >
                        {t("snapshots.older", { date: formatDateTime(older.selected.taken_at) })}
                      </Notice>
                    )}
                  </div>
                ) : null}
                <div
                  ref={scrolled}
                  data-stale={isSwitching ? "" : undefined}
                  className={styles.scroll}
                >
                  {/* A page is built anew for each address, so nothing of the page before keeps the focus. */}
                  <Outlet key={`${pathname}#${String(restarts)}`} />
                </div>
                {dragged === null ? null : <DropFrame paths={dragged} />}
              </main>
              {detail === null ? null : (
                <DetailPanel selection={detail} className={styles.detail} />
              )}
            </div>
            <CommandPalette
              isOpen={isPaletteOpen}
              onOpenChange={setPaletteOpen}
              destinations={destinations}
              openDestination={openDestination}
              onRestart={restart}
              onProblem={setProblem}
            />
          </TopBarSlotProvider>
        </DetailFocusContext>
      </ViewActionsProvider>
    </ShellContext>
  );
}

/**
 * The shell: the top bar, the sidebar, and the page. It shows skeletons while the application
 * start is loaded for the first time, and the error with a retry when that fails. The page is
 * rendered once the start is known.
 */
export function AppLayout({ destinations }: { destinations: readonly Destination[] }) {
  const { start, error, reload, isReloading } = useStart();
  const navigate = useNavigate();
  // What adapts to the window reads its size from the root element; see DESIGN.md.
  useWindowMark(useWindowSize());

  if (start === undefined) {
    if (error === null) return <LoadingShell />;
    return (
      <FailedShell>
        <ErrorState
          error={error}
          title={t("shell.startError")}
          onRetry={reload}
          isRetrying={isReloading}
        />
      </FailedShell>
    );
  }
  return (
    // Links of the component library open their address through the router of the app.
    <RouterProvider navigate={(path, options) => void navigate(path, options)} useHref={useHref}>
      <LoadedShell start={start} destinations={destinations} />
    </RouterProvider>
  );
}
