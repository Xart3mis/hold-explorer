import type { ReactElement } from "react";
import { Popover } from "../../components";
import { t } from "../../text/i18n";
import { fieldName, type FilterField } from "./chips";
import styles from "./FilterBar.module.css";

export interface FilterPickerProps {
  /** The control that opens it: the chip of a filter, or the chip that adds one. */
  trigger: ReactElement;
  /** The field it is opened for; `null` when it is opened to add a filter. */
  field: FilterField | null;
}

/**
 * The popover a chip and "Add filter" open. It names the field it was opened for, and is named
 * after it for assistive technology. Escape or a press outside closes it and gives the focus back
 * to the control that opened it.
 */
export function FilterPicker({ trigger, field }: FilterPickerProps) {
  const title = field === null ? t("filters.picker.add") : fieldName(field);
  return (
    <Popover
      trigger={trigger}
      aria-label={
        field === null ? title : t("filters.picker.filterBy", { field: fieldName(field) })
      }
    >
      <p className={styles.pickerTitle}>{title}</p>
    </Popover>
  );
}
