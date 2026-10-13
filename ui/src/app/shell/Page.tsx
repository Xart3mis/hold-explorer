import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import { durationToken } from "../../design/token-values";
import { PageHeader, type PageHeaderProps } from "../../components";
import { t } from "../../text/i18n";
import { useShell } from "./context";
import styles from "./Page.module.css";

export interface PageProps extends Omit<PageHeaderProps, "titleRef" | "className"> {
  /**
   * How wide the page may get: `form` for a form or a page of text, `content` for Overview and
   * History, `full` (the default) for a page whose table fills the content area.
   */
  width?: "form" | "content" | "full";
  /**
   * What stands between the header and the content, across the whole content area whatever the
   * width of the page: the filter bar of a data screen. A page without one leaves it out.
   */
  bar?: ReactNode;
  children?: ReactNode;
}

/**
 * Moves the focus to the title again if it has fallen to the document body, and to nothing else:
 * a control that the user or the page focused keeps the focus.
 */
function refocus(title: HTMLElement | null): void {
  const active = document.activeElement;
  if (title !== null && (active === null || active === document.body)) title.focus();
}

/**
 * A page of the shell: its header, then its bar when it has one, then its content. When a navigation opens the page, the focus
 * moves to its title, so a keyboard user and a screen reader start at the top of what changed,
 * and the title of the document names the page and the app. A field of the page that asked for
 * the focus, such as the name field of a form the page was opened for, keeps it. The page the app
 * opens on leaves the focus where a window starts: nobody navigated yet.
 *
 * A page is often opened from a menu, and the menu gives the focus back to its button while it
 * closes. When that button is gone, or the two happen in the other order, the focus lands on
 * the document body after the title had it. So the page looks again on the next frame, and once
 * more when a menu has had the time to close, and takes the focus back to its title if it is on
 * the body. After that it watches no longer: a focus that is lost later is left where it is.
 */
export function Page({ width = "full", bar, children, ...header }: PageProps) {
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

    const again = () => {
      refocus(title.current);
    };
    const frame = window.requestAnimationFrame(again);
    // No overlay takes longer than this to open or to close, and the focus moves on the frame
    // after it has closed.
    const exit = durationToken("--duration-base") ?? 0;
    const late = window.setTimeout(() => {
      window.requestAnimationFrame(again);
    }, exit);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(late);
    };
  }, [pathname, arrivedAt]);

  return (
    <div ref={page} data-part="page" data-width={width} className={styles.page}>
      <PageHeader {...header} titleRef={title} />
      {bar === undefined ? null : (
        <div data-part="page-bar" className={styles.bar}>
          {bar}
        </div>
      )}
      {children}
    </div>
  );
}
