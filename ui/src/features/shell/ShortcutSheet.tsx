import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button, VisuallyHidden } from "../../components";
import { cx } from "../../components/cx";
import { t, type MessageKey } from "../../text/i18n";
import { KeyCaps } from "./KeyCaps";
import { ariaKeyShortcuts, MODAL_ATTRIBUTE, SHORTCUTS, type ShortcutEntry } from "./shortcuts";
import styles from "./ShortcutSheet.module.css";

/** The groups of the sheet, in order, with the catalog key of each heading. */
const GROUPS: readonly { id: ShortcutEntry["group"]; heading: MessageKey }[] = [
  { id: "go", heading: "shortcuts.group.go" },
  { id: "actions", heading: "shortcuts.group.actions" },
  { id: "tables", heading: "shortcuts.group.tables" },
  { id: "panel", heading: "shortcuts.group.panel" },
];

/** A shortcut written out for assistive technology: "Control plus 1". */
function spoken(shortcut: string): string {
  return ariaKeyShortcuts(shortcut)
    .split("+")
    .join(` ${t("shortcuts.plus")} `);
}

/**
 * The title and the Close button, which takes the focus once the modal has noted where the focus
 * was, as the palette's field does: an effect runs after that note is taken.
 */
function Header({ onClose }: { onClose: () => void }) {
  const header = useRef<HTMLDivElement>(null);
  useEffect(() => {
    header.current?.querySelector("button")?.focus();
  }, []);
  return (
    <div ref={header} className={styles.header}>
      <Heading slot="title" className={cx(styles.title)}>
        {t("shortcuts.title")}
      </Heading>
      <Button icon={X} onPress={onClose}>
        {t("shortcuts.close")}
      </Button>
    </div>
  );
}

export interface ShortcutSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * The shortcut sheet (DESIGN.md, "Shortcut sheet"): a modal that lists every shortcut of the app,
 * grouped, from the one registry (`SHORTCUTS`). It closes on Escape and gives the focus back
 * where it was. The shell holds it, and whether it is open; `?` opens it.
 */
export function ShortcutSheet({ isOpen, onOpenChange }: ShortcutSheetProps) {
  // Where the focus was when the sheet opened: it goes back there when the sheet closes.
  const returnTo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const active = document.activeElement;
    returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [isOpen]);
  useEffect(() => {
    if (isOpen) return undefined;
    const back = returnTo.current;
    returnTo.current = null;
    if (back === null) return undefined;
    // The modal gives the focus back as well, when it can; it is given back here when nothing
    // has taken it by then.
    const frame = window.requestAnimationFrame(() => {
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost && back.isConnected) back.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={cx(styles.scrim)}
      {...{ [MODAL_ATTRIBUTE]: "" }}
    >
      <Modal className={cx(styles.modal)}>
        <Dialog className={cx(styles.dialog)}>
          {({ close }) => (
            <>
              <Header onClose={close} />
              <div className={styles.groups}>
                {GROUPS.map((group) => (
                  <section key={group.id} className={styles.group}>
                    <h3 className={styles.heading}>{t(group.heading)}</h3>
                    <ul className={styles.list}>
                      {SHORTCUTS.filter((entry) => entry.group === group.id).map((entry) => (
                        <li key={`${entry.shortcut}:${entry.label}`} className={styles.row}>
                          <span className={styles.label}>{t(entry.label as MessageKey)}</span>
                          <KeyCaps shortcut={entry.shortcut} />
                          <VisuallyHidden>{spoken(entry.shortcut)}</VisuallyHidden>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
