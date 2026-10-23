import { Check, ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
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
import { IconButton } from "../Button/Button";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Spinner } from "../Spinner/Spinner";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
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
  /**
   * The menu has nothing to act on and will not have until something outside changes (the Export
   * menu of a workspace without a snapshot): the button is greyed, keeps the focus so that its
   * description can be reached, opens nothing, and is announced as unavailable (`aria-disabled`),
   * not as busy, since nothing is running. `isPending` and `isInert` come first.
   */
  isUnavailable?: boolean;
  /**
   * Why the button is unavailable, for assistive technology: its accessible description, used only
   * while `isUnavailable`. It is not shown, since nothing is told by hover alone.
   */
  description?: string;
  /** Which edge of the button the menu lines up with. */
  align?: "start" | "end";
  /**
   * How the button looks: `quiet` (the default) has no border; `secondary` is outlined like a
   * secondary button, for a menu button that stands among buttons in the top bar.
   */
  variant?: "quiet" | "secondary";
  /**
   * The button starts a row of content: it is moved out by its own leading padding and border,
   * so its label starts on the line of what stands above and below it.
   */
  isFlush?: boolean;
  /** The button, so a screen can give it the focus back after what the menu started is over. */
  triggerRef?: Ref<HTMLButtonElement>;
  /**
   * A popover that an item of the menu opened stands under the button: the button keeps its open
   * look and says that what it opened is expanded, as it does while its menu is open.
   */
  isExpanded?: boolean;
  /** The items: `MenuItem`, `MenuSection`, `MenuSeparator`. None while the button is unavailable. */
  children?: ReactNode;
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
  isUnavailable = false,
  description,
  align = "start",
  variant = "quiet",
  isFlush = false,
  triggerRef,
  isExpanded = false,
  children,
  className,
  ...props
}: MenuButtonProps) {
  const inert = !isPending && isInert;
  const unavailable = !isPending && !inert && isUnavailable;
  // Busy means an action runs: not so for a button that is unavailable.
  const busy = isPending || inert;
  // A hook cannot be called conditionally; an id that no description uses costs nothing.
  const descriptionId = useId();
  const described = unavailable && description !== undefined;
  return (
    <MenuTrigger>
      <RacButton
        {...(triggerRef === undefined ? {} : { ref: triggerRef })}
        {...(props["aria-label"] === undefined ? {} : { "aria-label": props["aria-label"] })}
        isPending={busy || unavailable}
        data-inert={inert ? "" : undefined}
        data-unavailable={unavailable ? "" : undefined}
        data-flush={isFlush ? "" : undefined}
        data-variant={variant}
        className={cx(styles.trigger, className)}
        render={(domProps) => (
          <button
            {...domProps}
            aria-busy={busy ? "true" : undefined}
            aria-describedby={described ? descriptionId : undefined}
            {...(isExpanded ? { "aria-expanded": true } : {})}
          />
        )}
      >
        {icon ? <Icon icon={icon} /> : null}
        <span className={styles.triggerLabel}>{label}</span>
        {isPending ? <Spinner /> : <Icon icon={ChevronDown} className={styles.chevron} />}
      </RacButton>
      {described ? <VisuallyHidden id={descriptionId}>{description}</VisuallyHidden> : null}
      <MenuOverlay
        placement={align === "end" ? "bottom end" : "bottom start"}
        label={menuLabel}
        // The menu carries its own name. Left alone it would take the text of its button, which
        // is a value ("Unit 573 piping") and does not say what the menu holds.
        isNamedApart
      >
        {children}
      </MenuOverlay>
    </MenuTrigger>
  );
}

interface MenuOverlayProps {
  placement: "bottom start" | "bottom end" | "end top";
  /** The name of the menu. */
  label: string;
  /**
   * The menu is named by `label` alone, not by its button: a button that shows a value would
   * otherwise name it.
   */
  isNamedApart?: boolean;
  children?: ReactNode;
}

/** The overlay of a menu button: the popover, `--space-1` from its button, and the menu in it. */
function MenuOverlay({ placement, label, isNamedApart = false, children }: MenuOverlayProps) {
  const offset = lengthToken("--space-1");
  return (
    <Popover
      placement={placement}
      className={cx(styles.popover)}
      style={{ zIndex: "var(--z-dropdown)" }}
      {...(offset === null ? {} : { offset })}
    >
      <RacMenu
        aria-label={label}
        className={cx(styles.menu)}
        {...(isNamedApart
          ? { render: (domProps) => <div {...domProps} aria-labelledby={undefined} /> }
          : {})}
      >
        {children}
      </RacMenu>
    </Popover>
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
        // The submenu lines up with its item: its first item stands level with the one it opens
        // from.
        {...(offset === null ? {} : { offset, crossOffset: -offset })}
      >
        <RacMenu aria-label={label} className={cx(styles.menu)}>
          {children}
        </RacMenu>
      </Popover>
    </SubmenuTrigger>
  );
}

export interface IconMenuButtonProps {
  /** The icon that stands for what the menu holds. */
  icon: LucideIcon;
  /** The name of the button: its accessible name and the text of its tooltip. */
  label: string;
  /** The name of the menu. */
  menuLabel: string;
  /**
   * Where the menu opens while there is room: under the button, lined up with one of its edges,
   * or beside it on the trailing side, its first item level with the button.
   */
  placement?: "bottom start" | "bottom end" | "end top";
  /** Called when the menu opens or closes. */
  onOpenChange?: (isOpen: boolean) => void;
  /** The items: `MenuItem`, `MenuSection`, `MenuSeparator`. */
  children: ReactNode;
  className?: string | undefined;
}

/**
 * A quiet icon-only button that opens a menu: the menu of an item of a list, where a labelled
 * button has no room. It has the name and the tooltip of an icon button, and the menu is that of
 * `MenuButton`, with the same keys.
 */
export function IconMenuButton({
  icon,
  label,
  menuLabel,
  placement = "bottom start",
  onOpenChange,
  children,
  className,
}: IconMenuButtonProps) {
  return (
    <MenuTrigger {...(onOpenChange === undefined ? {} : { onOpenChange })}>
      <IconButton icon={icon} label={label} className={className} />
      {/* The menu is named by its button, whose name is the label. */}
      <MenuOverlay placement={placement} label={menuLabel}>
        {children}
      </MenuOverlay>
    </MenuTrigger>
  );
}
