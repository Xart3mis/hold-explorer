import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import { searchForAnotherSnapshot, searchForAnotherWorkspace } from "../selection";

/**
 * What the actions that change the view do to the selection of the detail panel, as the view is
 * asked for, before anything of the other view can be read: another snapshot takes out a hold,
 * whose position names another hold there or none; another workspace takes out a line, a hold,
 * and a blocker. Every other part of the address stays, its hash and what was passed with it
 * included. The address is the one the action is asked at: call these when it is asked for
 * (`onAsk`).
 */
export function useLeaveSelection(): { forSnapshot: () => void; forWorkspace: () => void } {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname, search, hash } = location;
  // What was passed with the address, of whatever kind, is passed on as it came.
  const state: unknown = location.state;
  const go = (next: string | null) => {
    if (next !== null) void navigate({ pathname, search: next, hash }, { replace: true, state });
  };
  return {
    forSnapshot: () => {
      go(searchForAnotherSnapshot(search));
    },
    forWorkspace: () => {
      go(searchForAnotherWorkspace(search));
    },
  };
}

/**
 * The same rule for whatever changes the view on screen, kept by the shell: whenever the open
 * workspace or the selected snapshot of the cached start changes, a hold, or for another
 * workspace a line and a blocker as well, is taken out of the address that is shown then. The
 * actions above have done so already when they were asked for; this also covers what changes the
 * view without being asked for at that address: an import that ends while the user is on another
 * page, and the start brought in step with the Rust side after a view was refused five times.
 */
export function useSelectionFollowsView(open: WorkspaceOpen | null): void {
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = open?.workspace.id ?? null;
  const snapshot = open?.selected ?? null;
  const shown = useRef({ workspace, snapshot });
  useEffect(() => {
    const before = shown.current;
    if (before.workspace === workspace && before.snapshot === snapshot) return;
    shown.current = { workspace, snapshot };
    const { pathname, search, hash } = location;
    const state: unknown = location.state;
    const next =
      before.workspace === workspace
        ? searchForAnotherSnapshot(search)
        : searchForAnotherWorkspace(search);
    if (next !== null) void navigate({ pathname, search: next, hash }, { replace: true, state });
  }, [workspace, snapshot, location, navigate]);
}
