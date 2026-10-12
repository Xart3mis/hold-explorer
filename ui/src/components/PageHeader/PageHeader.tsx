import type { ReactNode, Ref } from "react";
import { Breadcrumb, type BreadcrumbAncestor } from "../Breadcrumb/Breadcrumb";
import { cx } from "../cx";
import styles from "./PageHeader.module.css";

export interface PageHeaderBreadcrumb {
  /**
   * The pages above this one, from the destination down, each with its label and where it leads.
   * A destination has none, and then no breadcrumb is shown.
   */
  ancestors: readonly BreadcrumbAncestor[];
  /** The label of this page in the trail. The page title unless another is given. */
  current?: string;
}

export interface PageHeaderProps {
  /** The page title: the name of the destination or of the step. One per page. */
  title: string;
  /** One line under the title. */
  description?: string;
  /** Page actions, as buttons, at the trailing edge, level with the title. */
  actions?: ReactNode;
  /** The trail of a page below a destination, shown above the title. */
  breadcrumb?: PageHeaderBreadcrumb;
  /** The title element, so a page can move focus to it after navigation. */
  titleRef?: Ref<HTMLHeadingElement>;
  className?: string | undefined;
}

/**
 * The head of a page: a breadcrumb when the page lies below a destination, its title, an
 * optional description, and its actions. It has no border and no background; tabs or a filter
 * bar sit directly under it. The title is known before the data is and never shows a skeleton.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  titleRef,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx(styles.header, className)}>
      {breadcrumb === undefined ? null : (
        <Breadcrumb ancestors={breadcrumb.ancestors} current={breadcrumb.current ?? title} />
      )}
      <div className={styles.row}>
        <div className={styles.text}>
          <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
            {title}
          </h1>
          {description === undefined ? null : <p className={styles.description}>{description}</p>}
        </div>
        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
