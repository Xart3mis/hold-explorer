import type { LucideIcon } from "lucide-react";
import { Link } from "react-aria-components";
import { Icon, Tag, Tooltip } from "../../components";
import { cx } from "../../components/cx";
import { ariaKeyShortcuts, formatShortcut } from "./shortcuts";
import styles from "./Shell.module.css";

export interface NavItemProps {
  /** The address the item opens. */
  href: string;
  label: string;
  icon: LucideIcon;
  /** The item names the page that is shown. */
  isCurrent: boolean;
  /** The shortcut that opens the same address, shown in the item's tooltip. */
  shortcut?: string;
  /** A quiet tag after the label, such as "Soon". It is part of the item's accessible name. */
  tag?: string;
  /** The side the tooltip shows on: beside an item of the sidebar, under one of the top bar. */
  tooltipPlacement?: "end" | "bottom";
}

/**
 * A destination as the sidebar lists it: a link with an icon and a label, marked while its page
 * is shown. It is never disabled. Its tooltip repeats the label and gives the shortcut.
 */
export function NavItem({
  href,
  label,
  icon,
  isCurrent,
  shortcut,
  tag,
  tooltipPlacement = "end",
}: NavItemProps) {
  const link = (
    <Link
      href={href}
      className={cx(styles.navItem)}
      render={(domProps) =>
        "href" in domProps ? (
          <a
            {...domProps}
            aria-current={isCurrent ? "page" : undefined}
            aria-keyshortcuts={shortcut === undefined ? undefined : ariaKeyShortcuts(shortcut)}
          >
            {domProps.children}
          </a>
        ) : (
          <span {...domProps} />
        )
      }
    >
      <Icon icon={icon} />
      <span className={styles.navLabel}>{label}</span>
      {tag === undefined ? null : (
        <>
          {/* A space, so the name reads "Lines Soon" and not as one word. It takes no room. */}{" "}
          <Tag className={styles.tag}>{tag}</Tag>
        </>
      )}
    </Link>
  );
  if (shortcut === undefined) return link;
  return (
    <Tooltip text={label} shortcut={formatShortcut(shortcut)} placement={tooltipPlacement}>
      {link}
    </Tooltip>
  );
}
