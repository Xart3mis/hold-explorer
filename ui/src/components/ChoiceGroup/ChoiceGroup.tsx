import { Label, RadioButton, RadioField, RadioGroup, Text } from "react-aria-components";
import { cx } from "../cx";
import styles from "./ChoiceGroup.module.css";

export interface Choice {
  /** What `onChange` reports when the option is chosen. */
  value: string;
  /** The name of the option. */
  label: string;
  /** One line under the label that says what choosing it does. It describes the option. */
  description?: string;
}

export interface ChoiceGroupProps {
  /** The visible label of the group: what is being chosen. */
  label: string;
  /** The value of the chosen option. One option is always chosen. */
  value: string;
  /** Called with the value of another option that was chosen. */
  onChange: (value: string) => void;
  /** A few options that are all worth seeing at once. More than five are a select. */
  options: readonly Choice[];
  /**
   * `vertical` (the default) puts the options one under the other. `horizontal` puts two or
   * three options with short labels and no description in a row.
   */
  orientation?: "vertical" | "horizontal";
  /** Nothing can be chosen. The reason is given in text beside the group. */
  isDisabled?: boolean;
  className?: string | undefined;
}

/**
 * One choice out of a few, as radios. The group is one stop for Tab, on the chosen option; the
 * arrow keys move to the next or the previous option and choose it. A choice applies at once.
 */
export function ChoiceGroup({
  label,
  value,
  onChange,
  options,
  orientation = "vertical",
  isDisabled = false,
  className,
}: ChoiceGroupProps) {
  return (
    <RadioGroup
      value={value}
      onChange={onChange}
      orientation={orientation}
      isDisabled={isDisabled}
      className={cx(styles.group, className)}
    >
      <Label className={cx(styles.label)}>{label}</Label>
      <div className={styles.options}>
        {options.map((option) => (
          <RadioField key={option.value} value={option.value} className={cx(styles.field)}>
            <RadioButton className={cx(styles.radio)}>
              {({ isSelected }) => (
                <>
                  <span className={styles.circle} data-part="circle">
                    {isSelected ? <span className={styles.dot} /> : null}
                  </span>
                  <span>{option.label}</span>
                </>
              )}
            </RadioButton>
            {option.description === undefined ? null : (
              <Text slot="description" className={cx(styles.description)}>
                {option.description}
              </Text>
            )}
          </RadioField>
        ))}
      </div>
    </RadioGroup>
  );
}
