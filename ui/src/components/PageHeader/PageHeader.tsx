import { ArrowLeft } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Link } from "react-aria-components";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import styles from "./PageHeader.module.css";

export interface PageHeaderBack {
  /** Where the link leads, as a verb phrase: "Back to review". */
  label: string;
  /** The address it opens. */
  href?: string;
  /** Called when it is activated, for a step that is not an address. */
  onPress?: () => void;
}

export interface PageHeaderProps {
  /** The page title: the name of the destination or of the step. One per page. */
  title: string;
  /** One line under the title. */
  description?: string;
  /** Page actions, as buttons, at the trailing edge. */
  actions?: ReactNode;
  /** A link back to the step before, above the title. */
  back?: PageHeaderBack;
  /** The title element, so a page can move focus to it after navigation. */
  titleRef?: Ref<HTMLHeadingElement>;
  className?: string | undefined;
}

/**
 * The head of a page: its title, an optional description, and its actions. It has no border and
 * no background; tabs or a filter bar sit directly under it. The title is known before the data
 * is and never shows a skeleton.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  titleRef,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx(styles.header, className)}>
      <div className={styles.text}>
        {back === undefined ? null : (
          <Link
            className={cx(styles.back)}
            {...(back.href === undefined ? {} : { href: back.href })}
            {...(back.onPress === undefined ? {} : { onPress: back.onPress })}
          >
            <Icon icon={ArrowLeft} />
            {back.label}
          </Link>
        )}
        <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        {description === undefined ? null : <p className={styles.description}>{description}</p>}
      </div>
      {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
