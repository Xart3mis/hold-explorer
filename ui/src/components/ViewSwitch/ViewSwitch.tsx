import { RadioButton, RadioField, RadioGroup } from "react-aria-components";
import { cx } from "../cx";
import { useEnterChooses } from "../enterChooses";
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
 * It is a radio group: one stop for Tab, and the arrow keys move to the next or the previous view
 * and choose it, as they do in any radio group; Space and Enter choose the view that has the focus.
 */
export function ViewSwitch({ views, value, onChange, className, ...props }: ViewSwitchProps) {
  const enterChooses = useEnterChooses();
  return (
    <div className={cx(styles.row, className)}>
      <RadioGroup
        ref={enterChooses}
        aria-label={props["aria-label"]}
        orientation="horizontal"
        value={value}
        onChange={(id) => {
          if (id !== value) onChange(id);
        }}
        className={cx(styles.list)}
      >
        {views.map((view) => (
          <RadioField key={view.id} value={view.id} className={cx(styles.field)}>
            <RadioButton className={cx(styles.view)}>{view.label}</RadioButton>
          </RadioField>
        ))}
      </RadioGroup>
    </div>
  );
}
