import { Check, Minus, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";
import {
  CheckboxButton,
  CheckboxField,
  FieldError,
  type CheckboxFieldProps,
} from "react-aria-components";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import styles from "./Checkbox.module.css";

type Base = Omit<CheckboxFieldProps, "children" | "className" | "style" | "isInvalid">;

export interface CheckboxProps extends Base {
  /** The label. The whole row is the target. */
  children: ReactNode;
  /** Marks the checkbox as in error. A group gives the reason once, under its last checkbox. */
  isInvalid?: boolean;
  /** What is wrong and what to do, shown under the checkbox. While set, it is in error. */
  errorMessage?: string;
  className?: string | undefined;
}

/** A checkbox with its label. It applies at once, so it has no loading state. */
export function Checkbox({
  children,
  isInvalid,
  errorMessage,
  className,
  ...props
}: CheckboxProps) {
  const hasMessage = errorMessage !== undefined && errorMessage !== "";
  return (
    <CheckboxField
      {...props}
      isInvalid={isInvalid === true || hasMessage}
      className={cx(styles.field, className)}
    >
      <CheckboxButton className={cx(styles.checkbox)}>
        {({ isSelected, isIndeterminate }) => (
          <>
            <span className={styles.box} data-part="box">
              {isIndeterminate ? (
                <Icon icon={Minus} className={styles.mark} />
              ) : isSelected ? (
                <Icon icon={Check} className={styles.mark} />
              ) : null}
            </span>
            <span>{children}</span>
          </>
        )}
      </CheckboxButton>
      {hasMessage ? (
        <FieldError className={cx(styles.error)}>
          <Icon icon={OctagonAlert} />
          <span>{errorMessage}</span>
        </FieldError>
      ) : null}
    </CheckboxField>
  );
}
