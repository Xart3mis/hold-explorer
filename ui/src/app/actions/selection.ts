import { useNavigate, useLocation } from "react-router";
import { searchForAnotherSnapshot, searchForAnotherWorkspace } from "../selection";

/**
 * What the actions that change the view do to the selection of the detail panel, as the view is
 * asked for, before anything of the other view can be read: another snapshot takes out a hold,
 * whose position names another hold there or none; another workspace takes out a line and a
 * hold. Every other part of the address stays. The address is the one the action was asked at.
 */
export function useLeaveSelection(): { forSnapshot: () => void; forWorkspace: () => void } {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const go = (next: string | null) => {
    if (next !== null) void navigate({ pathname, search: next }, { replace: true });
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
