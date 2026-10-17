import { useEffect, useRef, type ReactElement, type ReactNode, type RefObject } from "react";
import { Dialog, DialogTrigger, Popover as RacPopover } from "react-aria-components";
import { lengthToken } from "../../design/token-values";
import { cx } from "../cx";
import styles from "./Popover.module.css";

interface SharedProps {
  /** What the popover is for: "Filter by discipline". It is the name of the dialog. */
  "aria-label": string;
  /** Where it opens while there is room: under the trigger, lined up with its leading or trailing edge. */
  placement?: "bottom start" | "bottom end";
  /**
   * What it holds, in one word, when that is replaced while it is open: the list of fields by
   * the editor of a field. The focus is taken into the new content as it is on opening.
   */
  contentKey?: string;
  /** What the popover holds, or a function that is handed the way to close it. */
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string | undefined;
}

interface TriggeredProps extends SharedProps {
  /**
   * The control that opens the popover: a button of this library, a `FilterChip`, or an
   * `AddFilterChip`. It says that it opens something, and whether that is open.
   */
  trigger: ReactElement;
  /** Whether it is open, when the screen holds that. */
  isOpen?: boolean;
  /** Called when it opens or closes: by its trigger, by Escape, by a press outside. */
  onOpenChange?: (isOpen: boolean) => void;
}

interface AnchoredProps extends SharedProps {
  /**
   * What it stands under, when one of several controls opens it: an element the screen places,
   * and may leave where the control was when the popover opened, so that the popover keeps its
   * place while what is chosen in it moves the control. The screen then holds whether it is
   * open, and says so on the control that opened it.
   */
  anchor: RefObject<Element | null>;
  isOpen: boolean;
  /** Called when it closes: by Escape, by a press outside. */
  onOpenChange: (isOpen: boolean) => void;
}

export type PopoverProps = TriggeredProps | AnchoredProps;

/** The kinds of `input` that text is not typed into: marks, buttons, and what is not shown. */
const NOT_TEXT = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Whether text is typed into the element: a text area, or an input of a kind that takes text. */
function takesText(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (element.disabled) return false;
  return element instanceof HTMLTextAreaElement || !NOT_TEXT.has(element.type);
}

/**
 * The item of the first list a popover holds that the keyboard starts on: its ticked option, or
 * its first item. A list is an option list or a menu. An item is drawn with its key; the line an
 * empty list shows in its place is not an item, although the component library gives it the
 * role of one.
 */
function firstItem(held: HTMLElement): HTMLElement | null {
  const list = held.querySelector("[role='listbox'], [role='menu']");
  if (list === null) return null;
  return (
    list.querySelector<HTMLElement>("[role='option'][data-key][aria-selected='true']") ??
    list.querySelector<HTMLElement>("[role='option'][data-key], [role='menuitem'][data-key]")
  );
}

/**
 * What a popover holds. When it opens, the first field in it takes the focus: a popover with a
 * field is opened to type in it. A field is where text is typed; the hidden input of a checkbox
 * or of a radio is not one. Without a field, the first list it holds takes the focus, on its
 * ticked option or its first item: a popover that is a list is opened to choose from it. Without
 * either, the popover itself has the focus.
 *
 * The same holds when what the popover holds is replaced while it is open (`contentKey`): what
 * had the focus is gone then, and the focus is taken into the new content by the same rule.
 *
 * The component library draws the items of a list a moment after the list itself. Until they
 * are there the popover has the focus, and the list takes it when its items arrive, as long as
 * nothing else inside has taken it meanwhile.
 */
function Body({ children }: { children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const held = body.current;
    if (held === null) return;
    const entries = held.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    );
    const field = [...entries].find(takesText);
    if (field !== undefined) {
      field.focus();
      return;
    }
    const dialog = held.closest<HTMLElement>("[role='dialog']");
    /** Whether the focus is still where opening left it: on the popover, or outside it. */
    const isWaiting = () =>
      document.activeElement === dialog || !held.contains(document.activeElement);
    const toList = () => {
      const item = firstItem(held);
      if (item !== null && isWaiting()) item.focus();
      return item !== null;
    };
    if (toList()) return;
    const arrival = new MutationObserver(() => {
      if (toList() || !isWaiting()) arrival.disconnect();
    });
    arrival.observe(held, { childList: true, subtree: true });
    if (isWaiting()) dialog?.focus();
    // Giving the popover the focus can itself draw the items.
    if (toList()) arrival.disconnect();
    return () => {
      arrival.disconnect();
    };
  }, []);
  return (
    <div ref={body} className={styles.body}>
      {children}
    </div>
  );
}

/**
 * A small surface that opens from a control and holds controls of its own. Opening moves the
 * focus into it, to the first field it holds, or to the first list, or to the popover itself
 * when it holds neither; Tab stays inside; Escape or a press outside closes it and gives the
 * focus back to the control that had it. It is not a modal: the page behind stays as it is.
 *
 * It is opened by its `trigger`, or by the screen, which then says with `anchor` what it stands
 * under.
 */
export function Popover(props: PopoverProps) {
  const {
    placement = "bottom start",
    isOpen,
    onOpenChange,
    contentKey,
    children,
    className,
  } = props;
  const offset = lengthToken("--space-1");
  const anchored = "anchor" in props;
  const overlay = (
    <RacPopover
      placement={placement}
      className={cx(styles.popover, className)}
      style={{ zIndex: "var(--z-dropdown)" }}
      {...(offset === null ? {} : { offset })}
      {...(anchored ? { triggerRef: props.anchor, isOpen: props.isOpen, onOpenChange } : {})}
    >
      <Dialog aria-label={props["aria-label"]} className={cx(styles.dialog)}>
        {({ close }) => (
          <Body key={contentKey}>
            {typeof children !== "function"
              ? children
              : // Without a trigger there is nothing that closes it but the screen.
                children(
                  anchored
                    ? () => {
                        props.onOpenChange(false);
                      }
                    : close,
                )}
          </Body>
        )}
      </Dialog>
    </RacPopover>
  );
  if (anchored) return overlay;
  return (
    <DialogTrigger
      {...(isOpen === undefined ? {} : { isOpen })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {props.trigger}
      {overlay}
    </DialogTrigger>
  );
}
