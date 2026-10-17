import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button as RacButton, Focusable } from "react-aria-components";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./FilterChip.module.css";

// Stand-ins for the field and the value in the sentence of the catalog: two characters of the
// private use area, which no text of the app holds. The sentence is taken whole, so a translation
// may put its parts in another order, and is cut where the stand-ins are.
const FIELD = "\uE000";
const VALUE = "\uE001";

/**
 * What a chip reads, as the catalog orders it: the field name in the quieter ink, and the value
 * with the words that belong to it ("is not") in the ink of a value.
 */
function reading(field: string, value: string, isNegated: boolean): ReactNode[] {
  const sentence = t(isNegated ? "filterChip.isNot" : "filterChip.is", {
    field: FIELD,
    value: VALUE,
  });
  return sentence.split(/([\uE000\uE001])/).map((part, index) => {
    if (part === FIELD) {
      return (
        <span key={index} className={styles.field}>
          {field}
        </span>
      );
    }
    return part === VALUE ? value : part;
  });
}

/** What a chip says of the dialog the screen opens for it: that it opens one, and whether it is open. */
function opens(isExpanded: boolean | undefined) {
  return isExpanded === undefined
    ? {}
    : { "aria-haspopup": "dialog" as const, "aria-expanded": isExpanded };
}

export interface FilterChipProps {
  /** The name of the field that is filtered: "Discipline". */
  field: string;
  /** What it is filtered to, as text: "Civil", "Civil, Piping", "Civil +3". */
  value: string;
  /** The filter keeps what does not match: the chip reads "is not". */
  isNegated?: boolean;
  /** Opens the filter, to change it. */
  onPress: () => void;
  /** Removes the filter. Its remove button, Backspace, and Delete call it. */
  onRemove: () => void;
  /**
   * Whether what it opens is open, when the screen holds that. A chip that is the trigger of a
   * `Popover` is told by the popover and takes no value here.
   */
  isExpanded?: boolean;
  /**
   * The filters cannot be changed for the moment. The chip takes no focus and no press and has
   * no remove button. Its X stays as a picture, so the chip keeps its width and nothing beside
   * it moves; the bar says why.
   */
  isDisabled?: boolean;
  className?: string | undefined;
}

/**
 * One active filter: a pill that holds two controls. The field and the value are a button that
 * opens the filter; the X after them removes it. Backspace or Delete removes it as well, from
 * either of the two. It can be the trigger of a `Popover`: only its first button opens the popover.
 */
export function FilterChip({
  field,
  value,
  isNegated = false,
  onPress,
  onRemove,
  isExpanded,
  isDisabled = false,
  className,
}: FilterChipProps) {
  const remove = t("filterChip.remove", { field });
  return (
    <span
      data-part="filter-chip"
      data-disabled={isDisabled ? "" : undefined}
      className={cx(styles.chip, className)}
    >
      <RacButton
        isDisabled={isDisabled}
        onPress={onPress}
        {...opens(isExpanded)}
        onKeyDown={(event) => {
          if (event.key === "Backspace" || event.key === "Delete") onRemove();
          else event.continuePropagation();
        }}
        className={cx(styles.body)}
      >
        <span className={styles.text}>{reading(field, value, isNegated)}</span>
      </RacButton>
      {isDisabled ? (
        // The X without its button: the same circle in the same place, and nothing to press.
        <span aria-hidden="true" data-part="filter-chip-x" className={styles.remove}>
          <Icon icon={X} />
        </span>
      ) : (
        <Tooltip text={remove}>
          {/*
            A plain button, on purpose. A button of the component library takes the press of
            whatever the chip is the trigger of, and the X would open the popover it stands
            beside. This one hears its own click and nothing else.
          */}
          <Focusable>
            <button
              type="button"
              aria-label={remove}
              onClick={onRemove}
              // The keys that remove the chip do so from either of its two controls.
              onKeyDown={(event) => {
                if (event.key === "Backspace" || event.key === "Delete") onRemove();
              }}
              className={styles.remove}
            >
              <Icon icon={X} />
            </button>
          </Focusable>
        </Tooltip>
      )}
    </span>
  );
}

export interface AddFilterChipProps {
  /** Opens the list of fields to filter by. */
  onPress: () => void;
  /** Whether what it opens is open, when the screen holds that; see `FilterChip`. */
  isExpanded?: boolean;
  /** The filters cannot be changed for the moment. */
  isDisabled?: boolean;
  className?: string | undefined;
}

/** The pill that adds a filter. It can be the trigger of a `Popover`. */
export function AddFilterChip({
  onPress,
  isExpanded,
  isDisabled = false,
  className,
}: AddFilterChipProps) {
  return (
    <RacButton
      isDisabled={isDisabled}
      onPress={onPress}
      {...opens(isExpanded)}
      data-part="add-filter-chip"
      className={cx(styles.add, className)}
    >
      <Icon icon={Plus} />
      {t("filterChip.add")}
    </RacButton>
  );
}
