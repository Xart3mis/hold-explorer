import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { startQuery } from "../../app/query";
import type { AppStart } from "../../bindings/AppStart";
import type { CommandError } from "../../bindings/CommandError";

/** Something that failed, for the shell to show: what failed, and the error of the command. */
export interface ShellReport {
  /** What failed, in a sentence that stands on any page: it names what it is about. */
  title: string;
  /** What the failed command returned. Its message says why, and how to fix it. */
  error: CommandError;
}

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
  /**
   * Shows a failure as the notice of the shell, under the top bar, where it stays on every page
   * until it is dismissed. For what a page has to say when it may no longer be shown: an action
   * it started that fails after the user has gone elsewhere. A failure the page can still show
   * belongs on the page, beside what failed.
   */
  report: (problem: ShellReport) => void;
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
  return { ...shell, start: data ?? shell.start };
}
