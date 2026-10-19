import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
  type ReactPortal,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Shell.module.css";

interface TopBarSlotValue {
  /** The element of the top bar the page's Export menu is rendered into, once the bar is there. */
  element: HTMLElement | null;
  setElement: (element: HTMLElement | null) => void;
  /** The pages that fill the slot, in the order they mounted; the last one is shown. */
  claims: readonly string[];
  claim: (id: string) => () => void;
}

const NO_SLOT: TopBarSlotValue = {
  element: null,
  setElement: () => undefined,
  claims: [],
  claim: () => () => undefined,
};

const TopBarSlotContext = createContext<TopBarSlotValue>(NO_SLOT);

/** Holds what the page and the top bar share: the element of the slot and who fills it. */
export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState<readonly string[]>([]);
  const claim = useCallback((id: string) => {
    setClaims((current) => [...current, id]);
    return () => {
      setClaims((current) => current.filter((other) => other !== id));
    };
  }, []);
  const value = useMemo(() => ({ element, setElement, claims, claim }), [element, claims, claim]);
  return <TopBarSlotContext value={value}>{children}</TopBarSlotContext>;
}

/**
 * Where a page's Export menu stands in the top bar, beside Import. It holds the menu of the page
 * that is shown, or else `fallback`, the unavailable button. Place it between the snapshot
 * selector and Import.
 */
export function TopBarExportSlot({ fallback }: { fallback: ReactNode }) {
  const { setElement, claims } = use(TopBarSlotContext);
  return (
    <>
      <span ref={setElement} className={styles.exportSlot} />
      {claims.length === 0 ? fallback : null}
    </>
  );
}

/**
 * Where a page puts its Export menu: rendered into the top bar, beside Import, while the page
 * is shown. Only one page is shown at a time; the last mounted wins. The page claims the slot
 * before the browser paints, so the unavailable button never shows in front of a menu.
 */
export function TopBarExport({ children }: { children: ReactNode }): ReactPortal | null {
  const { element, claims, claim } = use(TopBarSlotContext);
  const id = useId();
  useLayoutEffect(() => claim(id), [claim, id]);
  if (element === null || claims.at(-1) !== id) return null;
  return createPortal(children, element);
}
