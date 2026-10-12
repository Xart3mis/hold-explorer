import type { ReactElement, ReactNode } from "react";
import { createHashRouter, Navigate, RouterProvider, type RouteObject } from "react-router";
import { ComingSoon } from "../features/coming-soon/ComingSoon";
import { ImportEntryPage } from "../features/import/ImportEntryPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { AppLayout } from "../features/shell/AppLayout";
import { useShell } from "../features/shell/context";
import { NotFoundPage } from "../features/shell/NotFoundPage";
import { WelcomePage } from "../features/welcome/WelcomePage";
import {
  destinations,
  IMPORT_PATH,
  OVERVIEW_PATH,
  WELCOME_PATH,
  type Destination,
  type DestinationId,
} from "./destinations";

/** The page of each destination that is built. One that is not built needs no entry. */
export type DestinationPages = Partial<Record<DestinationId, ReactElement>>;

export const destinationPages: DestinationPages = {
  overview: <OverviewPage />,
  settings: <SettingsPage />,
};

/** The destinations that show something while no workspace is open. */
const WITHOUT_WORKSPACE: ReadonlySet<DestinationId> = new Set<DestinationId>(["settings"]);

/** Where the app opens: Overview when a workspace was reopened, the welcome page otherwise. */
function StartPage() {
  const { start } = useShell();
  return <Navigate to={start.open === null ? WELCOME_PATH : OVERVIEW_PATH} replace />;
}

/** A page that shows what a workspace holds. Without a workspace it leads to the welcome page. */
function NeedsWorkspace({ children }: { children: ReactNode }) {
  const { start } = useShell();
  return start.open === null ? <Navigate to={WELCOME_PATH} replace /> : children;
}

/**
 * The routes of the app, built from the destination list. A destination that the list marks as
 * built shows its page; any other shows its coming soon screen. The welcome page, Settings, and
 * the import page are reachable with and without a workspace; every other destination needs one.
 */
export function appRoutes(
  list: readonly Destination[] = destinations,
  pages: DestinationPages = destinationPages,
): RouteObject[] {
  return [
    {
      path: "/",
      element: <AppLayout destinations={list} />,
      children: [
        { index: true, element: <StartPage /> },
        { path: WELCOME_PATH, element: <WelcomePage /> },
        ...list.map((destination): RouteObject => {
          const page = destination.available ? pages[destination.id] : undefined;
          if (destination.available && page === undefined) {
            throw new Error(
              `The destination ${destination.id} is marked as available but has no page. ` +
                "Give it one in destinationPages of ui/src/app/router.tsx.",
            );
          }
          const element = page ?? <ComingSoon destination={destination.id} />;
          return {
            path: destination.path,
            element: WITHOUT_WORKSPACE.has(destination.id) ? (
              element
            ) : (
              <NeedsWorkspace>{element}</NeedsWorkspace>
            ),
          };
        }),
        { path: IMPORT_PATH, element: <ImportEntryPage /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ];
}

// The app is served from the Tauri protocol, not from a web server, so the address of a page is
// kept in the fragment of the one document.
const router = createHashRouter(appRoutes());

/** The app on its router. */
export function AppRouter() {
  return <RouterProvider router={router} />;
}
