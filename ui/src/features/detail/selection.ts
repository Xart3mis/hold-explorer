import { createContext, useCallback, useContext, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { searchWithSelection, selectionOf, type Selection } from "../../app/selection";

export type { Selection } from "../../app/selection";

/**
 * The selection the address names, and functions that give the address with another selection
 * or none. Only the parts `line` and `hold` are read and written; every other part of the address
 * stays as it is. The address is replaced, not pushed: a row chosen is not a step to go back to.
 */
export function useSelection(): {
  selection: Selection;
  select: (next: Selection) => void;
  close: () => void;
} {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const selection = useMemo(() => selectionOf(search), [search]);
  const select = useCallback(
    (next: Selection) => {
      void navigate({ pathname, search: searchWithSelection(search, next) }, { replace: true });
    },
    [navigate, pathname, search],
  );
  const close = useCallback(() => {
    select(null);
  }, [select]);
  return { selection, select, close };
}

/**
 * Where the focus goes as the detail panel opens and closes, shared by the panel and the page
 * that opens it. The shell holds one for as long as it is shown.
 */
export interface DetailFocus {
  /**
   * Asks the panel to take the focus to its heading when it next shows another selection: for a
   * selection made from the keyboard, or from inside the panel, whose control is then gone.
   */
  askForHeading: () => void;
  /** Whether the heading was asked for; asking is forgotten once it is answered. */
  takeHeadingAsk: () => boolean;
  /** Takes the focus to the heading of the panel that is open, when one is. */
  focusHeading: () => void;
  /** The panel says how its heading takes the focus while it is open; `null` when it closes. */
  setHeading: (focus: (() => void) | null) => void;
  /** Gives the focus back to the row that opened the panel, or to its table when that row is gone. */
  giveBack: () => void;
  /** The page whose table opens the panel says how the focus goes back; `null` when it goes. */
  setGiveBack: (giveBack: (() => void) | null) => void;
}

/** A new holder of the focus of the detail panel, for the shell. */
export function createDetailFocus(): DetailFocus {
  let asked = false;
  let heading: (() => void) | null = null;
  let back: (() => void) | null = null;
  return {
    askForHeading: () => {
      asked = true;
    },
    takeHeadingAsk: () => {
      const was = asked;
      asked = false;
      return was;
    },
    focusHeading: () => {
      heading?.();
    },
    setHeading: (focus) => {
      heading = focus;
    },
    giveBack: () => {
      back?.();
    },
    setGiveBack: (giveBack) => {
      back = giveBack;
    },
  };
}

export const DetailFocusContext = createContext<DetailFocus | null>(null);

/** The focus of the detail panel, for the panel and for a page inside the shell. */
export function useDetailFocus(): DetailFocus {
  const focus = useContext(DetailFocusContext);
  if (focus === null) {
    throw new Error(
      "useDetailFocus was called outside the shell, which holds the focus of the detail panel. " +
        "Render the page through the routes of ui/src/app/router.tsx.",
    );
  }
  return focus;
}
