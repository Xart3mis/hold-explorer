import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { startQuery } from "../../app/query";
import type { AppStart } from "../../bindings/AppStart";

export interface Shell {
  /** The application start, as the actions of `useApp()` have changed it since. */
  start: AppStart;
  /** The paths of the files that are being dragged over the window; `null` while none is. */
  dragged: readonly string[] | null;
  /**
   * A page says that it is shown at this address, and learns whether a navigation brought it
   * there. Opening the app is not a navigation: the page the app opens on leaves the focus at the
   * start of the window, and every page opened after it takes the focus to its title.
   */
  arrivedAt: (pathname: string) => boolean;
}

export const ShellContext = createContext<Shell | null>(null);

/**
 * What the shell knows, for a page inside it. A page is only rendered once the application start
 * is loaded, so the start is always there.
 *
 * The start is read from the query cache by whoever asks, not handed down from the layout. An
 * action writes the new start into the cache and may navigate in the same turn; a page that
 * renders because of the navigation then already sees the new start, for example that a
 * workspace is open now, and does not act on the one the layout rendered with a moment before.
 */
export function useShell(): Shell {
  const shell = useContext(ShellContext);
  const { data } = useQuery(startQuery);
  if (!shell) {
    throw new Error(
      "useShell was called outside the shell, so there is no application start to read. " +
        "Render the page through the routes of ui/src/app/router.tsx.",
    );
  }
  return { start: data ?? shell.start, dragged: shell.dragged, arrivedAt: shell.arrivedAt };
}
