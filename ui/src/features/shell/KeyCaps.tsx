import { formatShortcut } from "./shortcuts";
import styles from "./KeyCaps.module.css";

/**
 * A shortcut as key caps, one `kbd` for each key. Decoration: the item or the row it stands in
 * names the shortcut to assistive technology.
 */
export function KeyCaps({ shortcut }: { shortcut: string }) {
  const parts = formatShortcut(shortcut).split("+");
  return (
    <kbd aria-hidden="true" className={styles.keys}>
      {parts.map((part, index) => (
        <kbd key={index} className={styles.key}>
          {part === "" ? "+" : part}
        </kbd>
      ))}
    </kbd>
  );
}
