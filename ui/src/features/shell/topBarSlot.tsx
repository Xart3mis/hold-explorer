import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useId,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type ReactPortal,
  type RefObject,
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
  /** The export the page shown offers to run, as its `Ctrl+E` does; `null` while it offers none. */
  exportView: (() => void) | null;
  /** A page offers its export, until the function it is given back is called. */
  offerExport: (offer: ExportOffer) => () => void;
}

/** An export a page offers, by the page that offers it. */
interface ExportOffer {
  id: string;
  run: () => void;
}

const NO_SLOT: TopBarSlotValue = {
  element: null,
  setElement: () => undefined,
  claims: [],
  claim: () => () => undefined,
  exportView: null,
  offerExport: () => () => undefined,
};

/** Outside the shell's provider there is no slot, and `TopBarExport` renders nothing, by design. */
const TopBarSlotContext = createContext<TopBarSlotValue>(NO_SLOT);

/**
 * Holds what the page and the top bar share: the element of the slot and who fills it, and the
 * export the page offers, which the command palette runs.
 */
export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState<readonly string[]>([]);
  const [offers, setOffers] = useState<readonly ExportOffer[]>([]);
  const claim = useCallback((id: string) => {
    setClaims((current) => [...current, id]);
    return () => {
      setClaims((current) => current.filter((other) => other !== id));
    };
  }, []);
  const offerExport = useCallback((offer: ExportOffer) => {
    setOffers((current) => [...current, offer]);
    return () => {
      setOffers((current) => current.filter((other) => other.id !== offer.id));
    };
  }, []);
  // As for the slot, the page mounted last is the one shown.
  const exportView = offers.at(-1)?.run ?? null;
  const value = useMemo(
    () => ({ element, setElement, claims, claim, exportView, offerExport }),
    [element, claims, claim, exportView, offerExport],
  );
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

/**
 * Offers the export of the page shown while `isOn`: the command palette's "Export this view" runs
 * what `run` holds when it is chosen. `useExportShortcut` calls it, so the palette offers the
 * export exactly where `Ctrl+E` works.
 */
export function useOfferExport(isOn: boolean, run: RefObject<(() => void) | null>): void {
  const { offerExport } = use(TopBarSlotContext);
  const id = useId();
  useEffect(() => {
    if (!isOn) return undefined;
    return offerExport({
      id,
      run: () => {
        run.current?.();
      },
    });
  }, [isOn, offerExport, id, run]);
}

/** The export the page shown offers, as its `Ctrl+E` runs it; `null` where `Ctrl+E` does nothing. */
export function usePageExport(): (() => void) | null {
  return use(TopBarSlotContext).exportView;
}
