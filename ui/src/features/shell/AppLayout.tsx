import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { RouterProvider } from "react-aria-components";
import { Outlet, useHref, useLocation, useNavigate, type NavigateOptions } from "react-router";
import { useIsMutating } from "@tanstack/react-query";
import { asCommandError } from "../../api/error";
import { fileName } from "../../api/files";
import { keys } from "../../api/keys";
import { onFileDrag } from "../../api/window";
import { IMPORT_PATH, OVERVIEW_PATH, WELCOME_PATH, type Destination } from "../../app/destinations";
import { formatDateTime } from "../../app/format";
import { t } from "../../app/i18n";
import { useApp } from "../../app/useApp";
import type { AppStart } from "../../bindings/AppStart";
import { Button, ErrorState, Notice, Skeleton, VisuallyHidden } from "../../components";
import { connectImportStart, readImportLocation, startImport } from "../import/start";
import { ShellContext } from "./context";
import type { ShellProblem } from "./problem";
import { shortcutBindings, useShortcuts } from "./shortcuts";
import styles from "./Shell.module.css";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

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

interface ShellProps {
  start: AppStart;
  destinations: readonly Destination[];
}

/** The shell once the application start is known. */
function LoadedShell({ start, destinations }: ShellProps) {
  const { selectSnapshot } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const problemId = useId();
  // Another workspace or another snapshot is being opened: the page that is there stays, dimmed.
  const isSwitching = useIsMutating({ mutationKey: keys.switching }) > 0;
  const [dragged, setDragged] = useState<readonly string[] | null>(null);
  const [problem, setProblem] = useState<ShellProblem | null>(null);
  const [dismissedWarning, setDismissedWarning] = useState<string | null>(null);

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

  // The toast region is rendered beside the layout. It learns from the root element where the
  // content area starts; see app.css.
  const hasSidebar = open !== null;
  useEffect(() => {
    if (!hasSidebar) return;
    const root = document.documentElement;
    root.setAttribute("data-sidebar", "");
    return () => {
      root.removeAttribute("data-sidebar");
    };
  }, [hasSidebar]);

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
      if (first !== undefined) void startImport(first, others.length);
    }).then(
      (unlisten) => {
        if (gone) unlisten();
        else stop = unlisten;
      },
      () => {
        // The window gives no drag events here, as in a plain browser. The file dialog remains.
      },
    );
    return () => {
      gone = true;
      stop?.();
    };
  }, []);

  const bindings = useMemo(
    () =>
      shortcutBindings(destinations, {
        open: (path) => void navigate(path),
        startImport: () => void startImport(),
      }),
    [destinations, navigate],
  );
  useShortcuts(bindings);

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
  const shell = useMemo(() => ({ start, dragged, arrivedAt }), [start, dragged, arrivedAt]);

  return (
    <ShellContext value={shell}>
      <div className={styles.layout}>
        <TopBar
          start={start}
          destinations={destinations}
          renameErrorId={problem?.kind === "rename" ? problemId : undefined}
          onProblem={setProblem}
        />
        {hasSidebar ? <Sidebar destinations={destinations} /> : null}
        <main className={styles.content}>
          {problem !== null || warning !== null || older !== null ? (
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
                      isPending={selectSnapshot.isPending}
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
          <div data-stale={isSwitching ? "" : undefined} className={styles.scroll}>
            {/* A page is built anew for each address, so nothing of the page before keeps the focus. */}
            <Outlet key={pathname} />
          </div>
          {dragged === null ? null : <DropFrame paths={dragged} />}
        </main>
      </div>
    </ShellContext>
  );
}

/**
 * The shell: the top bar, the sidebar, and the page. It shows skeletons while the application
 * start is loaded for the first time, and the error with a retry when that fails. The page is
 * rendered once the start is known.
 */
export function AppLayout({ destinations }: { destinations: readonly Destination[] }) {
  const { start, error, reload, isReloading } = useApp();
  const navigate = useNavigate();

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
