import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Breadcrumb as RacBreadcrumb, Breadcrumbs, Link } from "react-aria-components";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./Breadcrumb.module.css";

/**
 * A page above the current one. It says where it leads in one of two ways, so the trail is not
 * tied to a router: `onPress` is called when the link is activated, and `href` makes it a real
 * link to that address. Give at least one; with both, `onPress` runs and the address is followed.
 */
export type BreadcrumbAncestor = {
  /** The title of the page it leads to. */
  label: string;
} & ({ href: string; onPress?: () => void } | { href?: string; onPress: () => void });

export interface BreadcrumbProps {
  /** The pages above the current one, from the destination down. None: no breadcrumb. */
  ancestors: readonly BreadcrumbAncestor[];
  /** The label of the current page: its title. */
  current: string;
  className?: string | undefined;
}

/** Whether the text of an element is cut by its box, kept true to the element's size. */
function useIsCut(element: React.RefObject<HTMLElement | null>): boolean {
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const sizes = new ResizeObserver(() => {
      setCut(node.scrollWidth > node.clientWidth);
    });
    sizes.observe(node);
    return () => {
      sizes.disconnect();
    };
  }, [element]);
  return cut;
}

/** One ancestor: a link. When the trail is too long and its label is cut, a tooltip gives it in full. */
function Ancestor({ ancestor }: { ancestor: BreadcrumbAncestor }) {
  const link = useRef<HTMLAnchorElement>(null);
  const cut = useIsCut(link);
  return (
    <Tooltip text={ancestor.label} isDisabled={!cut}>
      <Link
        ref={link}
        className={cx(styles.link)}
        {...(ancestor.href === undefined ? {} : { href: ancestor.href })}
        {...(ancestor.onPress === undefined ? {} : { onPress: ancestor.onPress })}
      >
        {ancestor.label}
      </Link>
    </Tooltip>
  );
}

/**
 * The way back up from a page that lies below a destination: its ancestors as links, then the
 * current page as text. A page without ancestors shows nothing, because a trail of one item
 * would only repeat the title. The trail stays on one line; when it does not fit, the ancestors
 * are cut first and the current page last, and no item is ever left out.
 */
export function Breadcrumb({ ancestors, current, className }: BreadcrumbProps) {
  if (ancestors.length === 0) return null;
  return (
    <nav aria-label={t("breadcrumb.label")} className={cx(styles.trail, className)}>
      <Breadcrumbs
        className={cx(styles.list)}
        // How many ancestors there are, for the stylesheet to work out what they leave of the line.
        style={{ "--trail-ancestors": ancestors.length } as CSSProperties}
        // The landmark carries the name; the list inside it needs none of its own.
        render={(domProps) => <ol {...domProps} aria-label={undefined} />}
      >
        {ancestors.map((ancestor, index) => (
          <RacBreadcrumb
            key={`${String(index)} ${ancestor.label}`}
            id={`ancestor-${String(index)}`}
            data-part="ancestor"
            className={cx(styles.item)}
          >
            <Ancestor ancestor={ancestor} />
            <Icon icon={ChevronRight} className={styles.separator} />
          </RacBreadcrumb>
        ))}
        <RacBreadcrumb id="current" data-part="current" className={cx(styles.item)}>
          <span aria-current="page" className={styles.current}>
            {current}
          </span>
        </RacBreadcrumb>
      </Breadcrumbs>
    </nav>
  );
}
