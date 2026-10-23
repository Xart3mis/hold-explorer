import type { LucideIcon } from "lucide-react";
import { Link } from "react-aria-components";
import { Icon, Tag, Tooltip, VisuallyHidden } from "../../components";
import { cx } from "../../components/cx";
import { t } from "../../text/i18n";
import { ariaKeyShortcuts, formatShortcut } from "./shortcuts";
import styles from "./Shell.module.css";

export interface NavItemProps {
  /** The address the item opens. */
  href: string;
  label: string;
  icon: LucideIcon;
  /** The item names the page that is shown. */
  isCurrent: boolean;
  /** Pressing the item of the page that is shown: the page is drawn anew, as the address is reached. */
  onRestart?: () => void;
  /** The shortcut that opens the same address, shown in the item's tooltip. */
  shortcut?: string;
  /** A quiet tag after the label, such as "Soon". It is part of the item's accessible name. */
  tag?: string;
  /** The side the tooltip shows on: beside an item of the sidebar, under one of the top bar. */
  tooltipPlacement?: "end" | "bottom";
  /**
   * The item stands in the sidebar's rail: its icon shows alone, its label and tag stay in its
   * accessible name, and its tooltip shows them in text, on focus at once and on hover.
   */
  isRail?: boolean;
}

/**
 * A destination as the sidebar lists it: a link with an icon and a label, marked while its page
 * is shown. It is never disabled. Its tooltip repeats the label and gives the shortcut; in the
 * rail, where the label does not show, every item has one, and it names the tag as well.
 */
export function NavItem({
  href,
  label,
  icon,
  isCurrent,
  onRestart,
  shortcut,
  tag,
  tooltipPlacement = "end",
  isRail = false,
}: NavItemProps) {
  const link = (
    <Link
      href={href}
      {...(onRestart === undefined ? {} : { onPress: onRestart })}
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
      {isRail ? (
        // In the rail the label and the tag are not shown, and stay the name of the item.
        <VisuallyHidden>{tag === undefined ? label : `${label} ${tag}`}</VisuallyHidden>
      ) : (
        <>
          <span className={styles.navLabel}>{label}</span>
          {tag === undefined ? null : (
            <>
              {/* A space, so the name reads "Lines Soon" and not as one word. It takes no room. */}{" "}
              <Tag className={styles.tag}>{tag}</Tag>
            </>
          )}
        </>
      )}
    </Link>
  );
  if (shortcut === undefined && !isRail) return link;
  const text =
    isRail && tag !== undefined ? t("destinations.withTag", { name: label, tag }) : label;
  return (
    <Tooltip
      text={text}
      {...(shortcut === undefined ? {} : { shortcut: formatShortcut(shortcut) })}
      placement={tooltipPlacement}
    >
      {link}
    </Tooltip>
  );
}
