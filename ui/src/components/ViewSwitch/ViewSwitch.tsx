import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { cx } from "../cx";
import styles from "./ViewSwitch.module.css";

export interface View {
  /** What `onChange` reports when the view is chosen. */
  id: string;
  /** The name of the view: what its rows are. */
  label: string;
}

export interface ViewSwitchProps {
  /** What the views choose between: "Rows to show". */
  "aria-label": string;
  /** Two to four views of the same content. */
  views: readonly View[];
  /** The id of the view in view. One is always chosen. */
  value: string;
  /** Called with the id of another view that was chosen. */
  onChange: (id: string) => void;
  className?: string | undefined;
}

/**
 * Two to four views of one content, such as the lines and the holds of the same table: a row
 * that looks like a tab list, under the page header. It is a choice and not a set of tabs,
 * because every view shows the same place of the page in another way; there is no panel per view.
 * To assistive technology it is a radio group: one stop for Tab, and the arrow keys move to the
 * next or the previous view and choose it.
 */
export function ViewSwitch({ views, value, onChange, className, ...props }: ViewSwitchProps) {
  return (
    <div className={cx(styles.row, className)}>
      <ToggleButtonGroup
        aria-label={props["aria-label"]}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[value]}
        onSelectionChange={(keys) => {
          const [id] = keys;
          if (typeof id === "string" && id !== value) onChange(id);
        }}
        className={cx(styles.list)}
      >
        {views.map((view) => (
          <ToggleButton key={view.id} id={view.id} className={cx(styles.view)}>
            {view.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
