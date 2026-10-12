import {
  ChartBarDecreasing,
  Flag,
  History,
  LayoutGrid,
  List,
  Settings,
  SlidersHorizontal,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "react-router";
import type { Destination, DestinationId } from "../../app/destinations";
import { t } from "../../text/i18n";
import { cx } from "../../components/cx";
import { NavItem } from "./NavItem";
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

function Group({ items, isLast }: { items: readonly Destination[]; isLast: boolean }) {
  const { pathname } = useLocation();
  return (
    <ul className={cx(styles.group, isLast && styles.groupEnd)}>
      {items.map((destination) => (
        <li key={destination.id}>
          <NavItem
            href={destination.path}
            label={t(`destinations.name.${destination.id}`)}
            icon={destinationIcons[destination.id]}
            isCurrent={pathname === destination.path}
            {...(destination.shortcut === undefined ? {} : { shortcut: destination.shortcut })}
            {...(destination.available ? {} : { tag: t("destinations.soon") })}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The destinations of the list, in its order and in its two groups: what the snapshot holds, then,
 * set apart at the bottom, the setup. A destination that is not built yet looks and behaves like
 * the others, except for the Soon tag after its label.
 */
export function Sidebar({ destinations }: { destinations: readonly Destination[] }) {
  return (
    <nav aria-label={t("destinations.label")} className={styles.sidebar}>
      <Group items={destinations.filter(({ group }) => group === "data")} isLast={false} />
      <Group items={destinations.filter(({ group }) => group === "setup")} isLast />
    </nav>
  );
}
