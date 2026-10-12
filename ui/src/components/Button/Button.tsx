import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button as RacButton, type ButtonProps as RacButtonProps } from "react-aria-components";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Spinner } from "../Spinner/Spinner";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

type Base = Omit<RacButtonProps, "children" | "className" | "style" | "isPending">;

export interface ButtonProps extends Base {
  /**
   * `primary` for the one main action of a region, on the app or the panel surface only;
   * `secondary` (the default) for the others; `quiet` for actions inside a notice, a toast, or a
   * row; `danger` only where the action destroys something and cannot be undone.
   */
  variant?: ButtonVariant;
  /** An icon before the label. */
  icon?: LucideIcon;
  /**
   * While true the button shows the spinner in place of its icon, keeps its label, its colors, and
   * its width, ignores presses, and is announced as busy.
   *
   * Passing the property at all, `false` included, says that the button can become pending. A
   * button without an icon then keeps the room of the spinner free at rest, half on each side of
   * its label, so the spinner arrives without changing the width. It is therefore wider at rest
   * than a button that is never given the property. Leave the property out for a button that
   * never waits; give it an icon to have no reserved room.
   */
  isPending?: boolean;
  /** The label: a verb that names the action. */
  children: ReactNode;
  className?: string | undefined;
}

/** A button. It names its action with a verb. */
export function Button({
  variant = "secondary",
  icon,
  isPending,
  children,
  className,
  ...props
}: ButtonProps) {
  const pending = isPending === true;
  return (
    <RacButton
      {...props}
      isPending={pending}
      data-variant={variant}
      data-reserve={isPending !== undefined && icon === undefined ? "" : undefined}
      className={cx(styles.button, className)}
      render={(domProps) => <button {...domProps} aria-busy={pending ? "true" : undefined} />}
    >
      {pending ? <Spinner /> : icon ? <Icon icon={icon} /> : null}
      <span className={styles.label}>{children}</span>
    </RacButton>
  );
}

export interface IconButtonProps extends Omit<Base, "aria-label" | "aria-labelledby"> {
  /** The icon that stands for the action. */
  icon: LucideIcon;
  /** The name of the action: the accessible name of the button and the text of its tooltip. */
  label: string;
  variant?: ButtonVariant;
  isPending?: boolean;
  className?: string | undefined;
}

/** A square button that shows an icon only. Its label is its accessible name and its tooltip. */
export function IconButton({
  icon,
  label,
  variant = "quiet",
  isPending,
  className,
  ...props
}: IconButtonProps) {
  const pending = isPending === true;
  return (
    <Tooltip text={label}>
      <RacButton
        {...props}
        isPending={pending}
        aria-label={label}
        data-variant={variant}
        data-icon-only=""
        className={cx(styles.button, className)}
        render={(domProps) => <button {...domProps} aria-busy={pending ? "true" : undefined} />}
      >
        {pending ? <Spinner /> : <Icon icon={icon} />}
      </RacButton>
    </Tooltip>
  );
}
