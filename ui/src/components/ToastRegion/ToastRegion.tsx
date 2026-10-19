import { CircleCheck, Info, X, type LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { durationToken } from "../../design/token-values";
import { t } from "../../text/i18n";
import { Button, IconButton } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import styles from "./ToastRegion.module.css";

/**
 * The most toasts shown at once. A newer toast pushes out the oldest one that offers no undo. One
 * that carries an undo is never pushed out, so for a moment there can be more.
 */
const MAX_TOASTS = 3;

/** How a toast is found on the page: by this part name, and by the id of its item. */
const TOAST = '[data-part="toast"]';

export interface ToastAction {
  /** The label of the action, for example "Undo". */
  label: string;
  /**
   * Called once, when the action is pressed, or, for the undo of a toast, when `Ctrl+Z` is typed
   * while the toast is the newest.
   */
  onAction: () => void;
  /**
   * Whether the action undoes what was done. Only an undo is run by `Ctrl+Z`, and only a toast
   * whose action is an undo is never pushed out by a newer one. Any other action, such as "Open
   * file", is run by its button only.
   */
  isUndo?: boolean;
}

export interface ToastOptions {
  /** What was done, in one sentence. */
  message: string;
  /** An action on what was done. This is how undo is offered. */
  action?: ToastAction;
  /**
   * A second action, after the first and quieter in order only: "Show in folder" beside "Open
   * file". `Ctrl+Z` never runs it. Given only with `action`.
   */
  secondaryAction?: ToastAction;
  /** An icon that says how it went. A failure that needs reading is a notice, not a toast. */
  tone?: "info" | "success";
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => string;
  /** Removes a toast before its time. */
  dismiss: (id: string) => void;
}

interface ToastItem extends ToastOptions {
  id: string;
  leaving: boolean;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Shows toasts. Only inside a `ToastRegion`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error(
      "useToast was called outside a ToastRegion, so there is nowhere to show a toast. " +
        "Render the component inside AppProviders, or inside a ToastRegion in a test.",
    );
  }
  return api;
}

const icons: Record<NonNullable<ToastOptions["tone"]>, LucideIcon> = {
  info: Info,
  success: CircleCheck,
};

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

export interface ToastProps extends ToastOptions {
  /** The id of the toast in its region, by which the region finds it on the page. */
  id?: string;
  /** The toast is fading out. */
  isLeaving?: boolean;
  onAction?: () => void;
  onSecondaryAction?: () => void;
  onDismiss: () => void;
  /** Called with true while the pointer is on the toast or the focus is inside it. */
  onHold?: (held: boolean) => void;
  /** Called when the fade-out has ended. */
  onLeft?: () => void;
}

/** One toast: what was done, an action, and a close button. `ToastRegion` shows and times it. */
export function Toast({
  id,
  message,
  action,
  secondaryAction,
  tone,
  isLeaving = false,
  onAction,
  onSecondaryAction,
  onDismiss,
  onHold,
  onLeft,
}: ToastProps) {
  const element = useRef<HTMLDivElement>(null);
  const messageId = useId();
  const hovered = useRef(false);
  const focused = useRef(false);
  const hold = (next: { hovered?: boolean; focused?: boolean }) => {
    hovered.current = next.hovered ?? hovered.current;
    focused.current = next.focused ?? focused.current;
    onHold?.(hovered.current || focused.current);
  };

  // A toast that leaves fades out first. Where nothing animates, it has already left.
  useEffect(() => {
    if (!isLeaving) return;
    const node = element.current;
    const animations = node && "getAnimations" in node ? node.getAnimations() : [];
    if (animations.length === 0) {
      onLeft?.();
      return;
    }
    let current = true;
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (current) onLeft?.();
    });
    return () => {
      current = false;
    };
  }, [isLeaving, onLeft]);

  return (
    <div
      ref={element}
      // A toast takes the focus in one case only: the toast that held it has gone, and this one
      // is next. It is a group named by its message, so what has the focus can be said. The
      // region makes it focusable for that moment, and it stops being so when the focus leaves:
      // a click on its text must not give it the focus, which would hold its timer.
      role="group"
      aria-labelledby={messageId}
      data-part="toast"
      data-toast-id={id}
      data-leaving={isLeaving ? "" : undefined}
      className={styles.toast}
      onPointerEnter={() => {
        hold({ hovered: true });
      }}
      onPointerLeave={() => {
        hold({ hovered: false });
      }}
      onFocus={() => {
        hold({ focused: true });
      }}
      onBlur={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.removeAttribute("tabindex");
        if (!event.currentTarget.contains(event.relatedTarget)) hold({ focused: false });
      }}
    >
      {tone === undefined ? null : (
        <span data-tone={tone} className={styles.icon}>
          <Icon icon={icons[tone]} />
        </span>
      )}
      <span id={messageId} className={styles.message}>
        {message}
      </span>
      {action === undefined ? null : (
        <Button
          variant="quiet"
          className={styles.action}
          {...(onAction === undefined ? {} : { onPress: onAction })}
        >
          {action.label}
        </Button>
      )}
      {action === undefined || secondaryAction === undefined ? null : (
        <Button
          variant="quiet"
          className={styles.action}
          {...(onSecondaryAction === undefined ? {} : { onPress: onSecondaryAction })}
        >
          {secondaryAction.label}
        </Button>
      )}
      <IconButton icon={X} label={t("common.dismiss")} onPress={onDismiss} />
    </div>
  );
}

interface TimedToastProps {
  item: ToastItem;
  onAction: (id: string, which: "action" | "secondaryAction") => void;
  onDismiss: (id: string) => void;
  onLeft: (id: string) => void;
}

/** A toast with its timer. The timer runs for the toast timeout and waits while the toast is held. */
function TimedToast({ item, onAction, onDismiss, onLeft }: TimedToastProps) {
  const { id } = item;
  const [held, setHeld] = useState(false);
  const remaining = useRef<number | null>(null);

  useEffect(() => {
    if (held || item.leaving) return;
    remaining.current ??= durationToken("--timeout-toast");
    // Without the token stylesheet there is no timeout to keep, and the toast stays until closed.
    if (remaining.current === null) return;
    const started = Date.now();
    const timer = window.setTimeout(() => {
      onDismiss(id);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      if (remaining.current !== null) {
        remaining.current = Math.max(0, remaining.current - (Date.now() - started));
      }
    };
  }, [held, item.leaving, id, onDismiss]);

  const left = useCallback(() => {
    onLeft(id);
  }, [id, onLeft]);

  return (
    <Toast
      id={id}
      message={item.message}
      {...(item.action === undefined ? {} : { action: item.action })}
      {...(item.secondaryAction === undefined ? {} : { secondaryAction: item.secondaryAction })}
      {...(item.tone === undefined ? {} : { tone: item.tone })}
      isLeaving={item.leaving}
      onAction={() => {
        onAction(id, "action");
      }}
      onSecondaryAction={() => {
        onAction(id, "secondaryAction");
      }}
      onDismiss={() => {
        onDismiss(id);
      }}
      onHold={setHeld}
      onLeft={left}
    />
  );
}

/**
 * Gives its children `useToast()` and shows the toasts: at the bottom left of the content area
 * (the layout says where that is, with `--toast-inset-inline-start` on the root element), three
 * at most unless each carries an action, newest at the bottom. A toast never takes focus when it
 * appears. It is announced politely, and its buttons are reached by Tab, in the order the toasts
 * appeared. When the toast that holds the focus goes, the focus moves to the next toast, or back
 * to where it was before the toasts took it.
 */
export function ToastRegion({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // The toasts as they are now, also between a change and the render that shows it: two changes
  // in a row each start from what the one before left.
  const latest = useRef(items);
  const nextId = useRef(0);
  // The toasts whose action has run, so one toast never runs its action twice.
  const acted = useRef(new Set<string>());
  const stack = useRef<HTMLDivElement>(null);
  // What had the focus before it entered the toasts.
  const cameFrom = useRef<HTMLElement | null>(null);

  const change = useCallback((next: ToastItem[]) => {
    latest.current = next;
    setItems(next);
  }, []);

  /**
   * Before toasts go: when one of them holds the focus, the focus moves to the toast after it,
   * or to the one before it, of those that stay. The toast itself takes it, not one of its
   * buttons, so a key that is pressed twice does not act on a second toast. With no toast left,
   * the focus goes back to where it was before it entered the toasts.
   */
  const moveFocusFrom = useCallback((going: readonly string[]) => {
    const active = document.activeElement;
    const all = [...(stack.current?.querySelectorAll<HTMLElement>(TOAST) ?? [])];
    const holder = all.find((toast) => toast.contains(active));
    if (holder === undefined || !going.includes(holder.dataset.toastId ?? "")) return;
    const stays = (toast: HTMLElement) =>
      !toast.hasAttribute("data-leaving") && !going.includes(toast.dataset.toastId ?? "");
    const at = all.indexOf(holder);
    const next = all.slice(at + 1).find(stays) ?? all.slice(0, at).reverse().find(stays);
    if (next !== undefined) {
      next.tabIndex = -1;
      next.focus();
    } else if (cameFrom.current?.isConnected === true) cameFrom.current.focus();
    // No toast stays and where the focus came from is gone: the focus falls to the page, as it
    // does whenever what held it leaves, and the next Tab starts from the top.
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      moveFocusFrom([id]);
      change(latest.current.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    },
    [change, moveFocusFrom],
  );

  const remove = useCallback(
    (id: string) => {
      acted.current.delete(id);
      change(latest.current.filter((item) => item.id !== id));
    },
    [change],
  );

  const show = useCallback(
    (options: ToastOptions) => {
      nextId.current += 1;
      const id = `toast-${String(nextId.current)}`;
      const staying = latest.current.filter((item) => !item.leaving);
      // The new toast needs a place: the oldest toasts without an undo give theirs up.
      const going: string[] = [];
      for (const item of staying) {
        if (staying.length - going.length < MAX_TOASTS) break;
        if (item.action?.isUndo !== true) going.push(item.id);
      }
      // A toast that was already leaving goes now as well.
      const gone = latest.current.filter((item) => item.leaving || going.includes(item.id));
      moveFocusFrom(gone.map((item) => item.id));
      for (const item of gone) acted.current.delete(item.id);
      change([
        ...staying.filter((item) => !going.includes(item.id)),
        { ...options, id, leaving: false },
      ]);
      return id;
    },
    [change, moveFocusFrom],
  );

  /** Runs one action of a toast, once for the toast whichever it is, and then removes the toast. */
  const act = useCallback(
    (id: string, which: "action" | "secondaryAction") => {
      const item = latest.current.find((candidate) => candidate.id === id);
      const action = item?.[which];
      if (!item || !action || item.leaving || acted.current.has(id)) return;
      acted.current.add(id);
      action.onAction();
      dismiss(id);
    },
    [dismiss],
  );

  // Ctrl+Z triggers the undo of the newest toast: its first action, when that is an undo. A text
  // field keeps its own undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey || event.altKey || isTextEntry(event.target)) return;
      const newest = latest.current.filter((item) => !item.leaving).at(-1);
      if (newest?.action?.isUndo !== true) return;
      event.preventDefault();
      act(newest.id, "action");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [act]);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label={t("toast.region")}
        className={styles.region}
        onFocus={(event) => {
          // The focus came in from the page: that is where it goes back to.
          const from = event.relatedTarget;
          if (from instanceof HTMLElement && !event.currentTarget.contains(from)) {
            cameFrom.current = from;
          }
        }}
      >
        <div
          ref={stack}
          role="status"
          aria-live="polite"
          aria-atomic="false"
          className={styles.stack}
        >
          {items.map((item) => (
            <TimedToast
              key={item.id}
              item={item}
              onAction={act}
              onDismiss={dismiss}
              onLeft={remove}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
