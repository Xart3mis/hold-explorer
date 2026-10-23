import { CircleCheck, Info, OctagonAlert, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../../text/i18n";
import { IconButton } from "../Button/Button";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import styles from "./Notice.module.css";

export type NoticeTone = "info" | "success" | "warning" | "danger";

const icons: Record<NoticeTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: OctagonAlert,
};

export interface NoticeProps {
  tone: NoticeTone;
  /** A short statement of what happened. */
  title?: string;
  /**
   * The id of the title, for a region around the notice that is named by it. The title can then
   * take the focus (`tabIndex` -1), so the keyboard can be moved to the notice and its ring sits
   * on the title.
   */
  titleId?: string | undefined;
  /** The message: why, and what to do. */
  children: ReactNode;
  /** Quiet buttons or links that act on the message. */
  actions?: ReactNode;
  /** Shows a close button that calls this. */
  onDismiss?: () => void;
  className?: string | undefined;
}

/**
 * A message that belongs to a place on the page and stays until it no longer applies. The tone
 * is carried by an icon, a tint, and the words, never by the color alone. A danger notice is
 * announced at once, the others politely.
 */
export function Notice({
  tone,
  title,
  titleId,
  children,
  actions,
  onDismiss,
  className,
}: NoticeProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      data-tone={tone}
      className={cx(styles.notice, className)}
    >
      <Icon icon={icons[tone]} className={styles.icon} />
      <div className={styles.body}>
        {title === undefined ? null : (
          <strong
            id={titleId}
            tabIndex={titleId === undefined ? undefined : -1}
            className={styles.title}
          >
            {title}
          </strong>
        )}
        <span className={styles.message}>{children}</span>
      </div>
      {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      {onDismiss === undefined ? null : (
        <IconButton
          icon={X}
          label={t("common.dismiss")}
          onPress={onDismiss}
          className={styles.dismiss}
        />
      )}
    </div>
  );
}
