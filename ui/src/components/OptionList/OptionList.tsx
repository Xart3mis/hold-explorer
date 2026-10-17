import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { ListBox, ListBoxItem, Text } from "react-aria-components";
import { formatCount } from "../../text/format";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Spinner } from "../Spinner/Spinner";
import styles from "./OptionList.module.css";

export interface Option {
  /** What `onSelectionChange` reports for the option. */
  key: string;
  /** The name of the option. */
  label: string;
  /**
   * How much the option would keep. It is written with its thousands separated, at the trailing
   * edge. An option with a count of 0 is written in the muted ink and can still be chosen.
   */
  count?: number;
}

export interface OptionListProps {
  /** What the options are: "Discipline values". */
  "aria-label": string;
  /** `multiple` ticks any number of options; `single` holds one, and choosing it again clears it. */
  selectionMode: "single" | "multiple";
  options: readonly Option[];
  /** The keys of the options that are ticked. */
  selectedKeys: readonly string[];
  /** Called with the keys that are ticked after a change, in the order they were ticked. */
  onSelectionChange: (keys: string[]) => void;
  /**
   * The options are being read. Without options that is a first read, and the list says so in
   * their place. With options it is a re-read: they stay, dimmed, and can still be ticked.
   */
  isLoading?: boolean;
  /** What the list says when it has no option: what is absent. */
  emptyText: string;
  /** A line under the list that does not scroll with it: what the list leaves out. */
  footer?: ReactNode;
  className?: string | undefined;
}

/**
 * A list of values to choose from, each with the count of what it would keep. The list is one
 * stop for Tab: the arrow keys move through the options, and Space or Enter ticks and unticks
 * the one the keyboard is on. It has no search field of its own; what holds it narrows it.
 */
export function OptionList({
  selectionMode,
  options,
  selectedKeys,
  onSelectionChange,
  isLoading = false,
  emptyText,
  footer,
  className,
  ...props
}: OptionListProps) {
  const reading = isLoading && options.length === 0;
  return (
    <div className={cx(styles.root, className)}>
      <ListBox
        aria-label={props["aria-label"]}
        selectionMode={selectionMode}
        selectedKeys={selectedKeys}
        // Escape belongs to what holds the list, a popover that closes on it, and never unticks.
        escapeKeyBehavior="none"
        onSelectionChange={(chosen) => {
          onSelectionChange(
            chosen === "all" ? options.map((option) => option.key) : [...chosen].map(String),
          );
        }}
        items={options}
        // An option is drawn again when the kind of choice changes: its mark is another one.
        dependencies={[selectionMode]}
        // The component library passes on neither of these two, so they are set where it draws.
        render={(domProps) => (
          <div
            {...domProps}
            aria-busy={isLoading ? "true" : undefined}
            data-stale={isLoading && !reading ? "" : undefined}
          />
        )}
        renderEmptyState={() =>
          reading ? (
            <span className={styles.note}>
              <Spinner />
              {t("common.loading")}
            </span>
          ) : (
            <span className={styles.note}>{emptyText}</span>
          )
        }
        className={cx(styles.list)}
      >
        {(option) => (
          <ListBoxItem
            id={option.key}
            textValue={option.label}
            data-zero={option.count === 0 ? "" : undefined}
            className={cx(styles.option)}
          >
            {({ isSelected }) => (
              <>
                <span
                  data-part="mark"
                  data-mark={selectionMode === "multiple" ? "box" : "circle"}
                  className={styles.mark}
                >
                  {!isSelected ? null : selectionMode === "multiple" ? (
                    <Icon icon={Check} className={styles.check} />
                  ) : (
                    <span className={styles.dot} />
                  )}
                </span>
                <Text slot="label" className={styles.label}>
                  {option.label}
                </Text>
                {option.count === undefined ? null : (
                  <Text slot="description" data-part="count" className={styles.count}>
                    {formatCount(option.count)}
                  </Text>
                )}
              </>
            )}
          </ListBoxItem>
        )}
      </ListBox>
      {footer === undefined ? null : <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
