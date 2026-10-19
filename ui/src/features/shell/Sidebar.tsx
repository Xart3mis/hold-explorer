import {
  ChartBarDecreasing,
  Flag,
  History,
  LayoutGrid,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  SlidersHorizontal,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import { useLocation } from "react-router";
import { IconButton } from "../../components";
import type { Destination, DestinationId } from "../../app/destinations";
import { cx } from "../../components/cx";
import { t } from "../../text/i18n";
import { NavItem } from "./NavItem";
import type { SidebarForm } from "./window";
import styles from "./Shell.module.css";

/** The icon of each destination, from the one outline set. */
export const destinationIcons: Record<DestinationId, LucideIcon> = {
  overview: LayoutGrid,
  breakdown: ChartBarDecreasing,
  lines: List,
  blockers: Waypoints,
  history: History,
  people: Users,
  "follow-up": Flag,
  rules: SlidersHorizontal,
  settings: Settings,
};

function Group({
  items,
  isLast,
  isRail,
  addressOf,
  onRestart,
}: {
  items: readonly Destination[];
  isLast: boolean;
  isRail: boolean;
  addressOf: (path: string) => string;
  onRestart: () => void;
}) {
  const { pathname } = useLocation();
  return (
    <ul className={cx(styles.group, isLast && styles.groupEnd)}>
      {items.map((destination) => {
        const isCurrent = pathname === destination.path;
        return (
          <li key={destination.id}>
            <NavItem
              // The destination that is shown opens at its own address: pressing it again resets it.
              href={isCurrent ? destination.path : addressOf(destination.path)}
              label={t(`destinations.name.${destination.id}`)}
              icon={destinationIcons[destination.id]}
              isCurrent={isCurrent}
              {...(isCurrent ? { onRestart } : {})}
              isRail={isRail}
              {...(destination.shortcut === undefined ? {} : { shortcut: destination.shortcut })}
              {...(destination.available ? {} : { tag: t("destinations.soon") })}
            />
          </li>
        );
      })}
    </ul>
  );
}

export interface SidebarProps {
  destinations: readonly Destination[];
  /**
   * The address an item opens, from the address of its destination: where the destination was
   * left in this session (DESIGN.md, "Sidebar item").
   */
  addressOf: (path: string) => string;
  /**
   * The destination that is shown was pressed again: its page is drawn anew (its selected rows
   * and scroll are gone). The item itself opens the destination's own address.
   */
  onRestart: () => void;
  /** With the labels, or collapsed to a rail of icons. */
  form: SidebarForm;
  onFormChange: (form: SidebarForm) => void;
}

/**
 * The destinations of the list, in its order and in its two groups: what the snapshot holds, then,
 * set apart at the bottom, the setup. A destination that is not built yet looks and behaves like
 * the others, except for the Soon tag after its label. The last item collapses the sidebar to a
 * rail of icons and expands it again; the names stay for assistive technology and in tooltips.
 */
export function Sidebar({ destinations, addressOf, onRestart, form, onFormChange }: SidebarProps) {
  const id = useId();
  const isRail = form === "rail";
  return (
    <nav id={id} aria-label={t("destinations.label")} data-form={form} className={styles.sidebar}>
      <Group
        items={destinations.filter(({ group }) => group === "data")}
        isLast={false}
        isRail={isRail}
        addressOf={addressOf}
        onRestart={onRestart}
      />
      <Group
        items={destinations.filter(({ group }) => group === "setup")}
        isLast
        isRail={isRail}
        addressOf={addressOf}
        onRestart={onRestart}
      />
      <div className={styles.sidebarToggle}>
        <IconButton
          icon={isRail ? PanelLeftOpen : PanelLeftClose}
          label={t(isRail ? "destinations.expand" : "destinations.collapse")}
          aria-expanded={!isRail}
          aria-controls={id}
          onPress={() => {
            onFormChange(isRail ? "full" : "rail");
          }}
        />
      </div>
    </nav>
  );
}
