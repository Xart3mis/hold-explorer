import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import { t } from "../../app/i18n";
import { PageHeader, type PageHeaderProps } from "../../components";
import { useShell } from "./context";
import styles from "./Shell.module.css";

export interface PageProps extends Omit<PageHeaderProps, "titleRef" | "className"> {
  /**
   * How wide the page may get: `form` for a form or a page of text, `content` for Overview and
   * History, `full` (the default) for a page whose table fills the content area.
   */
  width?: "form" | "content" | "full";
  children?: ReactNode;
}

/**
 * A page of the shell: its header, then its content. When a navigation opens the page, the focus
 * moves to its title, so a keyboard user and a screen reader start at the top of what changed,
 * and the title of the document names the page and the app. A field of the page that asked for
 * the focus, such as the name field of a form the page was opened for, keeps it. The page the app
 * opens on leaves the focus where a window starts: nobody navigated yet.
 */
export function Page({ width = "full", children, ...header }: PageProps) {
  const page = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const { pathname } = useLocation();
  const { arrivedAt } = useShell();

  useEffect(() => {
    document.title = t("app.documentTitle", { page: header.title });
  }, [header.title]);

  useEffect(() => {
    if (!arrivedAt(pathname)) return;
    const active = document.activeElement;
    if (active !== null && active !== title.current && page.current?.contains(active) === true) {
      return;
    }
    title.current?.focus();
  }, [pathname, arrivedAt]);

  return (
    <div ref={page} data-part="page" data-width={width} className={styles.page}>
      <PageHeader {...header} titleRef={title} />
      {children}
    </div>
  );
}
