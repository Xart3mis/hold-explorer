import { Check, ChevronDown, ChevronUp, OctagonAlert } from "lucide-react";
import {
  Button as RacButton,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as RacSelect,
  SelectValue,
  Text,
} from "react-aria-components";
import { lengthToken } from "../../design/token-values";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Spinner } from "../Spinner/Spinner";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./Select.module.css";

export interface SelectOption {
  id: string;
  /** The name of the option. */
  label: string;
  /** A second, quieter text after the label: an example value, a count. */
  detail?: string;
  isDisabled?: boolean;
}

export interface SelectProps {
  /** The visible label. */
  label: string;
  options: readonly SelectOption[];
  /** The id of the chosen option, when the screen holds the choice. */
  selectedKey?: string | null;
  /** The id of the option chosen at first, when the select holds the choice itself. */
  defaultSelectedKey?: string;
  /** Called with the id of the option that was chosen. */
  onSelectionChange?: (id: string) => void;
  /** Shown while nothing is chosen. */
  placeholder?: string;
  /** The helper line under the select. */
  description?: string;
  /** What is wrong and what to choose. While set, the select is in error. */
  errorMessage?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  /** Shows the spinner in place of the chevron while the options are read. */
  isPending?: boolean;
  /** The name of the value in a form. */
  name?: string;
  className?: string | undefined;
}

/**
 * A select drawn by the app: a trigger in the shape of a text field and a list that opens under
 * it, so it looks the same on Windows and Linux. Arrow keys move, Enter chooses, Escape closes,
 * and typing jumps to a match.
 */
export function Select({
  label,
  options,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  placeholder,
  description,
  errorMessage,
  isDisabled = false,
  isRequired = false,
  isPending = false,
  name,
  className,
}: SelectProps) {
  const invalid = errorMessage !== undefined && errorMessage !== "";
  const offset = lengthToken("--space-1");
  // Said to assistive technology after the helper line or after the error, whichever shows.
  const loading = isPending ? (
    <>
      {" "}
      <VisuallyHidden>{t("common.loading")}</VisuallyHidden>
    </>
  ) : null;
  return (
    <RacSelect
      {...(selectedKey === undefined ? {} : { value: selectedKey })}
      {...(defaultSelectedKey === undefined ? {} : { defaultValue: defaultSelectedKey })}
      {...(name === undefined ? {} : { name })}
      onChange={(key) => {
        if (typeof key === "string") onSelectionChange?.(key);
      }}
      placeholder={placeholder ?? t("select.placeholder")}
      isDisabled={isDisabled}
      isRequired={isRequired}
      isInvalid={invalid}
      className={cx(styles.field, className)}
    >
      {({ isOpen }) => (
        <>
          <Label className={cx(styles.label)}>{label}</Label>
          <RacButton className={cx(styles.trigger)}>
            <SelectValue className={cx(styles.value)}>
              {({ selectedText, isPlaceholder, defaultChildren }) =>
                isPlaceholder ? defaultChildren : selectedText
              }
            </SelectValue>
            {isPending ? (
              <Spinner className={styles.indicator} />
            ) : (
              <Icon icon={isOpen ? ChevronUp : ChevronDown} className={styles.indicator} />
            )}
          </RacButton>
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
          <Popover
            className={cx(styles.popover)}
            style={{ zIndex: "var(--z-dropdown)" }}
            {...(offset === null ? {} : { offset })}
          >
            <ListBox className={cx(styles.list)} items={options}>
              {(option) => (
                <ListBoxItem
                  id={option.id}
                  textValue={option.label}
                  isDisabled={option.isDisabled === true}
                  className={cx(styles.option)}
                >
                  {({ isSelected }) => (
                    <>
                      <span className={styles.optionLabel}>{option.label}</span>
                      {option.detail === undefined ? null : (
                        <span className={styles.detail}>{option.detail}</span>
                      )}
                      {isSelected ? <Icon icon={Check} className={styles.check} /> : null}
                    </>
                  )}
                </ListBoxItem>
              )}
            </ListBox>
          </Popover>
        </>
      )}
    </RacSelect>
  );
}
