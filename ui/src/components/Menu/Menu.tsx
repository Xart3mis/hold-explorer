import { Check, ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";
import {
  Button as RacButton,
  Header,
  Menu as RacMenu,
  MenuItem as RacMenuItem,
  MenuSection as RacMenuSection,
  MenuTrigger,
  type MenuItemProps as RacMenuItemProps,
  Popover,
  Separator,
  SubmenuTrigger,
  Text,
} from "react-aria-components";
import { lengthToken } from "../../design/token-values";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Spinner } from "../Spinner/Spinner";
import styles from "./Menu.module.css";

export interface MenuButtonProps {
  /** What the button shows: the current value, or the name of what the menu holds. */
  label: string;
  /** The accessible name, when the label alone does not say what the button is. It contains the label. */
  "aria-label"?: string;
  /** The name of the menu. */
  menuLabel: string;
  /** An icon before the label. */
  icon?: LucideIcon;
  /** The action the menu started is running: the spinner takes the place of the chevron. */
  isPending?: boolean;
  /**
   * An action that another control started is running, and one of this menu would conflict with
   * it: the button keeps its chevron and its look, opens nothing, and is announced as busy.
   * `isPending` comes first.
   */
  isInert?: boolean;
  /** Which edge of the button the menu lines up with. */
  align?: "start" | "end";
  /**
   * The button starts a row of content: it is moved out by its own leading padding and border,
   * so its label starts on the line of what stands above and below it.
   */
  isFlush?: boolean;
  /** The button, so a screen can give it the focus back after what the menu started is over. */
  triggerRef?: Ref<HTMLButtonElement>;
  /** The items: `MenuItem`, `MenuSection`, `MenuSeparator`. */
  children: ReactNode;
  className?: string | undefined;
}

/**
 * A quiet button that opens a menu under itself. Enter, Space, or the down arrow opens it; the
 * arrow keys move, Enter chooses, Escape closes and gives the focus back to the button; typing
 * jumps to a match. The menu is the same overlay as the list of a select.
 */
export function MenuButton({
  label,
  menuLabel,
  icon,
  isPending = false,
  isInert = false,
  align = "start",
  isFlush = false,
  triggerRef,
  children,
  className,
  ...props
}: MenuButtonProps) {
  const offset = lengthToken("--space-1");
  const inert = !isPending && isInert;
  const busy = isPending || inert;
  return (
    <MenuTrigger>
      <RacButton
        {...(triggerRef === undefined ? {} : { ref: triggerRef })}
        {...(props["aria-label"] === undefined ? {} : { "aria-label": props["aria-label"] })}
        isPending={busy}
        data-inert={inert ? "" : undefined}
        data-flush={isFlush ? "" : undefined}
        className={cx(styles.trigger, className)}
        render={(domProps) => <button {...domProps} aria-busy={busy ? "true" : undefined} />}
      >
        {icon ? <Icon icon={icon} /> : null}
        <span className={styles.triggerLabel}>{label}</span>
        {isPending ? <Spinner /> : <Icon icon={ChevronDown} className={styles.chevron} />}
      </RacButton>
      <Popover
        placement={align === "end" ? "bottom end" : "bottom start"}
        className={cx(styles.popover)}
        style={{ zIndex: "var(--z-dropdown)" }}
        {...(offset === null ? {} : { offset })}
      >
        <RacMenu
          aria-label={menuLabel}
          className={cx(styles.menu)}
          // The menu carries its own name. Left alone it would take the text of its button, which
          // is a value ("Unit 573 piping") and does not say what the menu holds.
          render={(domProps) => <div {...domProps} aria-labelledby={undefined} />}
        >
          {children}
        </RacMenu>
      </Popover>
    </MenuTrigger>
  );
}

export interface MenuItemProps {
  /** The key of the item. In a section that holds a choice it is what `onSelectionChange` reports. */
  id: string;
  /** The label of the item: a name, or a verb for an action. */
  children: string;
  /** A second, quieter text after the label: a count, a size. It describes the item. */
  detail?: string;
  /**
   * The keyboard shortcut that does what the item does, as `aria-keyshortcuts` takes it
   * (`Control+E`). The item tells assistive technology of it; the detail shows it.
   */
  keyShortcuts?: string;
  /** Called when the item is chosen. */
  onAction?: () => void;
  isDisabled?: boolean;
}

/**
 * The element of an item that has a keyboard shortcut. The component library passes no
 * `aria-keyshortcuts` through, so the element is given it here; an item is a link only when it
 * has an address, which no item of this menu has, and either is given it the same way.
 */
function withKeyShortcuts(keyShortcuts: string): Pick<RacMenuItemProps, "render"> {
  return {
    render: (domProps) =>
      "href" in domProps ? (
        <a {...domProps} aria-keyshortcuts={keyShortcuts}>
          {domProps.children}
        </a>
      ) : (
        <div {...domProps} aria-keyshortcuts={keyShortcuts} />
      ),
  };
}

/** One item of a menu. In a section that holds a choice, the chosen item carries a check mark. */
export function MenuItem({
  id,
  children,
  detail,
  keyShortcuts,
  onAction,
  isDisabled = false,
}: MenuItemProps) {
  return (
    <RacMenuItem
      id={id}
      {...(keyShortcuts === undefined ? {} : withKeyShortcuts(keyShortcuts))}
      textValue={children}
      isDisabled={isDisabled}
      className={cx(styles.item)}
      {...(onAction === undefined ? {} : { onAction })}
    >
      {({ isSelected }) => (
        <>
          <Text slot="label" className={styles.itemLabel}>
            {children}
          </Text>
          {detail === undefined ? null : (
            <Text slot="description" className={styles.detail}>
              {detail}
            </Text>
          )}
          {isSelected ? <Icon icon={Check} className={styles.check} /> : null}
        </>
      )}
    </RacMenuItem>
  );
}

export interface MenuSectionProps {
  /** The name of the group, shown above its items. */
  title: string;
  /**
   * The key of the chosen item. Giving it, `null` included, makes the section hold a choice: its
   * items are told to assistive technology as a set of which one is checked.
   */
  selectedKey?: string | null;
  /** Called with the key of another item that was chosen. The chosen item itself reports nothing. */
  onSelectionChange?: (id: string) => void;
  children: ReactNode;
}

/** A named group of items. */
export function MenuSection({ title, selectedKey, onSelectionChange, children }: MenuSectionProps) {
  const choice =
    selectedKey === undefined
      ? {}
      : {
          selectionMode: "single" as const,
          disallowEmptySelection: true,
          selectedKeys: selectedKey === null ? [] : [selectedKey],
          onSelectionChange: (chosen: "all" | Set<string | number>) => {
            if (chosen === "all") return;
            const [key] = chosen;
            if (key !== undefined && String(key) !== selectedKey) onSelectionChange?.(String(key));
          },
        };
  return (
    <RacMenuSection {...choice} className={cx(styles.section)}>
      <Header className={styles.sectionTitle}>{title}</Header>
      {children}
    </RacMenuSection>
  );
}

/** A hairline between two groups of items. */
export function MenuSeparator() {
  return <Separator className={cx(styles.separator)} />;
}

export interface MenuSubmenuProps {
  /** The key of the item that opens the submenu. */
  id: string;
  /** The label of that item, which names the submenu as well: what its items have in common. */
  label: string;
  /** The items of the submenu: `MenuItem`. */
  children: ReactNode;
}

/**
 * An item that opens a menu of its own beside the menu it stands in, for one action that applies
 * to one of several things ("Chart as PNG" to one of four charts). A press, Enter, Space, or the
 * arrow toward the submenu opens it with the focus on its first item; the arrow back, or Escape,
 * closes it and gives the focus back to the item. Choosing in it closes every menu. It opens
 * after a pause under the pointer as well, never by that alone.
 */
export function MenuSubmenu({ id, label, children }: MenuSubmenuProps) {
  const offset = lengthToken("--space-1");
  return (
    <SubmenuTrigger>
      <RacMenuItem id={id} textValue={label} className={cx(styles.item)}>
        <Text slot="label" className={styles.itemLabel}>
          {label}
        </Text>
        <Icon icon={ChevronRight} className={styles.submenuChevron} />
      </RacMenuItem>
      <Popover
        placement="end top"
        className={cx(styles.popover)}
        style={{ zIndex: "var(--z-dropdown)" }}
        // The submenu lines up with its item: its first item stands level with the one it opens from.
        {...(offset === null ? {} : { offset, crossOffset: -offset })}
      >
        <RacMenu aria-label={label} className={cx(styles.menu)}>
          {children}
        </RacMenu>
      </Popover>
    </SubmenuTrigger>
  );
}
