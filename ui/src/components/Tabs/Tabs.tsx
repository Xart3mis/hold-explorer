import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  Tab as RacTab,
  TabList as RacTabList,
  TabPanel as RacTabPanel,
  Tabs as RacTabs,
} from "react-aria-components";
import { cx } from "../cx";
import styles from "./Tabs.module.css";

export interface TabsProps {
  /** The id of the selected tab, when the screen holds the selection. */
  selectedKey?: string;
  /** The id of the tab selected at first, when the tabs hold the selection themselves. */
  defaultSelectedKey?: string;
  /** Called with the id of the tab that was selected. */
  onSelectionChange?: (id: string) => void;
  /** A `TabList` and one `TabPanel` for each tab. */
  children: ReactNode;
  className?: string | undefined;
}

/** Tabs: a tab list and the panel of the selected tab. Left and right arrows move between tabs. */
export function Tabs({
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  children,
  className,
}: TabsProps) {
  return (
    <RacTabs
      {...(selectedKey === undefined ? {} : { selectedKey })}
      {...(defaultSelectedKey === undefined ? {} : { defaultSelectedKey })}
      onSelectionChange={(key) => {
        if (typeof key === "string") onSelectionChange?.(key);
      }}
      className={cx(styles.tabs, className)}
    >
      {children}
    </RacTabs>
  );
}

export interface TabListProps {
  /** What the tabs choose between. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** The tabs. */
  children: ReactNode;
  className?: string | undefined;
}

/**
 * The row of tabs, with the indicator of the selected tab on its bottom edge. The indicator is as
 * wide as the row and is moved and scaled to the selected tab by a transform; its size is never
 * animated.
 */
export function TabList({ children, className, ...props }: TabListProps) {
  const row = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = row.current;
    const mark = indicator.current;
    if (!element || !mark) return;

    let placed = false;
    const place = () => {
      const selected = element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      const width = element.offsetWidth;
      if (!selected || width === 0) {
        mark.removeAttribute("data-placed");
        placed = false;
        return;
      }
      const transform = `translateX(${String(selected.offsetLeft)}px) scaleX(${String(selected.offsetWidth / width)})`;
      if (placed) {
        mark.style.transform = transform;
        return;
      }
      // The first placement is not a state change, so it does not travel from the edge of the row.
      mark.style.transition = "none";
      mark.style.transform = transform;
      mark.setAttribute("data-placed", "");
      mark.getBoundingClientRect();
      mark.style.transition = "";
      placed = true;
    };

    const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    const watchSizes = () => {
      sizes?.disconnect();
      sizes?.observe(element);
      for (const tab of element.querySelectorAll('[role="tab"]')) sizes?.observe(tab);
    };
    const changes = new MutationObserver((records) => {
      if (records.some((record) => record.type === "childList")) watchSizes();
      place();
    });
    changes.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected"],
    });
    watchSizes();
    place();
    return () => {
      changes.disconnect();
      sizes?.disconnect();
    };
  }, []);

  return (
    <div ref={row} className={cx(styles.row, className)}>
      <RacTabList {...props} className={cx(styles.list)}>
        {children}
      </RacTabList>
      <span ref={indicator} aria-hidden="true" className={styles.indicator} />
    </div>
  );
}

export interface TabProps {
  /** The id of the tab and of its panel. */
  id: string;
  /** The label. */
  children: ReactNode;
  /** A disabled tab cannot be selected. The page says why, in text. */
  isDisabled?: boolean;
  className?: string | undefined;
}

/** One tab of a tab list. */
export function Tab({ id, children, isDisabled, className }: TabProps) {
  return (
    <RacTab id={id} isDisabled={isDisabled === true} className={cx(styles.tab, className)}>
      {children}
    </RacTab>
  );
}

export interface TabPanelProps {
  /** The id of the tab it belongs to. */
  id: string;
  children: ReactNode;
  className?: string | undefined;
}

/** The content of one tab. Its loading and error states are its own, not the tab's. */
export function TabPanel({ id, children, className }: TabPanelProps) {
  return (
    <RacTabPanel id={id} className={cx(styles.panel, className)}>
      {children}
    </RacTabPanel>
  );
}
