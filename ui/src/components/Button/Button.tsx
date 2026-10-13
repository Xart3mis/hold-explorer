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

interface ButtonBase extends Base {
  /**
   * `primary` for the one main action of a region, on the app or the panel surface only;
   * `secondary` (the default) for the others; `quiet` for actions inside a notice, a toast, or a
   * row; `danger` only where the action destroys something and cannot be undone.
   */
  variant?: ButtonVariant;
  /**
   * While true the button waits for an action that another control started and that this one
   * would conflict with. It shows no spinner and keeps its icon, its colors, its width, and its
   * place in the Tab order; it ignores presses and is announced as busy. The spinner is on the
   * control that started the action, and on that one alone. `isPending` comes first: a button
   * that is given both shows the spinner.
   */
  isInert?: boolean;
  /** The label: a verb that names the action. */
  children: ReactNode;
  className?: string | undefined;
}

/** A button that never waits for its own action. */
interface NeverPending {
  /** An icon before the label. */
  icon?: LucideIcon;
  isPending?: never;
  /** The room of the spinner, for a button that only ever waits for another control. */
  reservesPendingSpace?: boolean;
}

/** A button with an icon that can become pending: the spinner takes the place of the icon. */
interface PendingWithIcon {
  /** An icon before the label. While the button is pending the spinner stands in its place. */
  icon: LucideIcon;
  /**
   * While true the button shows the spinner in place of its icon, keeps its label, its colors,
   * and its width, ignores presses, and is announced as busy.
   */
  isPending: boolean;
  /** Not needed beside an icon, and without effect there. */
  reservesPendingSpace?: boolean;
}

/**
 * A button without an icon that can become pending. It has to say whether it keeps the room of
 * the spinner free, because its width changes when the spinner arrives otherwise.
 */
interface PendingWithoutIcon {
  icon?: never;
  /**
   * While true the button shows the spinner before its label, keeps its label and its colors,
   * ignores presses, and is announced as busy.
   */
  isPending: boolean;
  /**
   * `true` keeps the room of the spinner free at rest, half on each side of the label, so the
   * spinner arrives without changing the width. The button is then wider at rest than its label
   * needs, which is why the room is asked for by name and is not a side effect of `isPending`.
   * `false` says that the button may grow when it becomes pending: only where nothing beside it
   * moves when it does.
   */
  reservesPendingSpace: boolean;
}

/**
 * A button never waits, or waits with an icon, or waits without one and says whether it keeps
 * room for the spinner. Passing `isPending` to a button without an icon and leaving
 * `reservesPendingSpace` out is a type error.
 */
export type ButtonProps = ButtonBase & (NeverPending | PendingWithIcon | PendingWithoutIcon);

/** A button. It names its action with a verb. */
export function Button({
  variant = "secondary",
  icon,
  isPending,
  reservesPendingSpace,
  isInert,
  children,
  className,
  ...props
}: ButtonProps) {
  const pending = isPending === true;
  const inert = !pending && isInert === true;
  const busy = pending || inert;
  return (
    <RacButton
      {...props}
      // The component library's pending button is what both states need: it keeps the focus and
      // its look, and no press reaches it.
      isPending={busy}
      data-variant={variant}
      data-inert={inert ? "" : undefined}
      data-reserve={reservesPendingSpace === true && icon === undefined ? "" : undefined}
      className={cx(styles.button, className)}
      render={(domProps) => <button {...domProps} aria-busy={busy ? "true" : undefined} />}
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
