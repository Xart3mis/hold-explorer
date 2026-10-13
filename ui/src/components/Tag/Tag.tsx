import type { LucideIcon } from "lucide-react";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import styles from "./Tag.module.css";

/** A tone that says a state. It is never shown by its color alone, so it comes with an icon. */
export type TagStateTone = "info" | "warning" | "danger" | "success";

export type TagTone = "neutral" | TagStateTone;

interface Base {
  /** The text of the tag: a word or two. */
  children: string;
  className?: string | undefined;
}

interface NeutralTagProps extends Base {
  /** `neutral`, the default, for a plain fact: "Soon", "Limited". */
  tone?: "neutral";
  /** An icon before the text. A neutral tag usually has none. */
  icon?: LucideIcon;
}

interface StateTagProps extends Base {
  /** A state: fill, border, and text take the colors of that state. */
  tone: TagStateTone;
  /** The icon of the state, before the text. A state tag cannot be built without one. */
  icon: LucideIcon;
}

export type TagProps = NeutralTagProps | StateTagProps;

/**
 * A small label on a row or an item. It is not interactive: it takes no focus and keeps its look
 * in every state of what it sits on. Its text is read with that row or item.
 */
export function Tag({ tone = "neutral", icon, children, className }: TagProps) {
  return (
    <span data-part="tag" data-tone={tone} className={cx(styles.tag, className)}>
      {icon === undefined ? null : <Icon icon={icon} />}
      {children}
    </span>
  );
}
