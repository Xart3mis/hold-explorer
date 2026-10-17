import { OctagonAlert } from "lucide-react";
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as RacTextField,
  type TextFieldProps as RacTextFieldProps,
} from "react-aria-components";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Spinner } from "../Spinner/Spinner";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./TextField.module.css";

type Base = Omit<RacTextFieldProps, "children" | "className" | "style" | "isInvalid">;

export interface TextFieldProps extends Base {
  /** The visible label. A field always has one; the placeholder is never the label. */
  label: string;
  /** The helper line under the field. */
  description?: string;
  /**
   * What is wrong and what to type. While set, the field is in error and this message replaces
   * the helper line.
   */
  errorMessage?: string;
  /** An example of a value, shown while the field is empty. */
  placeholder?: string;
  /** Shows the spinner at the trailing edge. The field stays editable. */
  isPending?: boolean;
  className?: string | undefined;
}

/** A single-line text field with its label above and its helper line or error below. */
export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  isPending = false,
  className,
  ...props
}: TextFieldProps) {
  const invalid = errorMessage !== undefined && errorMessage !== "";
  // Said to assistive technology after the helper line or after the error, whichever shows.
  const loading = isPending ? (
    <>
      {" "}
      <VisuallyHidden>{t("common.loading")}</VisuallyHidden>
    </>
  ) : null;
  return (
    <RacTextField {...props} isInvalid={invalid} className={cx(styles.field, className)}>
      <Label className={cx(styles.label)}>{label}</Label>
      <span className={styles.control} data-pending={isPending ? "" : undefined}>
        <Input
          className={cx(styles.input)}
          {...(placeholder === undefined ? {} : { placeholder })}
        />
        {isPending ? <Spinner className={styles.spinner} /> : null}
      </span>
      {invalid ? (
        <FieldError className={cx(styles.error)}>
          <Icon icon={OctagonAlert} />
          <span>{errorMessage}</span>
          {loading}
        </FieldError>
      ) : description !== undefined || isPending ? (
        <Text slot="description" className={cx(styles.description)}>
          {description}
          {loading}
        </Text>
      ) : null}
    </RacTextField>
  );
}
