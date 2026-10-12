import { CircleCheck, Info, X, type LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { t } from "../../app/i18n";
import { durationToken } from "../../design/token-values";
import { Button, IconButton } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import styles from "./ToastRegion.module.css";

/** The most toasts shown at once. A newer toast pushes the oldest out. */
const MAX_TOASTS = 3;

export interface ToastAction {
  /** The label of the action, for example "Undo". */
  label: string;
  /** Called once, when the action is pressed or `Ctrl+Z` is typed while the toast is the newest. */
  onAction: () => void;
}

export interface ToastOptions {
  /** What was done, in one sentence. */
  message: string;
  /** An action on what was done. This is how undo is offered. */
  action?: ToastAction;
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
  /** The toast is fading out. */
  isLeaving?: boolean;
  onAction?: () => void;
  onDismiss: () => void;
  /** Called with true while the pointer is on the toast or the focus is inside it. */
  onHold?: (held: boolean) => void;
  /** Called when the fade-out has ended. */
  onLeft?: () => void;
}

/** One toast: what was done, an action, and a close button. `ToastRegion` shows and times it. */
export function Toast({
  message,
  action,
  tone,
  isLeaving = false,
  onAction,
  onDismiss,
  onHold,
  onLeft,
}: ToastProps) {
  const element = useRef<HTMLDivElement>(null);
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
      data-part="toast"
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
        if (!event.currentTarget.contains(event.relatedTarget)) hold({ focused: false });
      }}
    >
      {tone === undefined ? null : (
        <span data-tone={tone} className={styles.icon}>
          <Icon icon={icons[tone]} />
        </span>
      )}
      <span className={styles.message}>{message}</span>
      {action === undefined ? null : (
        <Button
          variant="quiet"
          className={styles.action}
          {...(onAction === undefined ? {} : { onPress: onAction })}
        >
          {action.label}
        </Button>
      )}
      <IconButton icon={X} label={t("common.dismiss")} onPress={onDismiss} />
    </div>
  );
}

interface TimedToastProps {
  item: ToastItem;
  onAction: (id: string) => void;
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
      message={item.message}
      {...(item.action === undefined ? {} : { action: item.action })}
      {...(item.tone === undefined ? {} : { tone: item.tone })}
      isLeaving={item.leaving}
      onAction={() => {
        onAction(id);
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
 * (the layout says where that is, with `--toast-inset-inline-start` on the root element), at
 * most three, newest at the bottom. A toast never takes focus. It is announced politely, and
 * its buttons are reached by Tab.
 */
export function ToastRegion({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const latest = useRef(items);
  const nextId = useRef(0);
  // The toasts whose action has run, so one toast never runs its action twice.
  const acted = useRef(new Set<string>());

  useEffect(() => {
    latest.current = items;
  }, [items]);

  const dismiss = useCallback((id: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    acted.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    const id = `toast-${String(nextId.current)}`;
    setItems((current) => {
      const staying = current.filter((item) => !item.leaving);
      const pushedOut = staying.length - (MAX_TOASTS - 1);
      const kept = pushedOut > 0 ? staying.slice(pushedOut) : staying;
      return [...kept, { ...options, id, leaving: false }];
    });
    return id;
  }, []);

  const act = useCallback(
    (id: string) => {
      const item = latest.current.find((candidate) => candidate.id === id);
      if (!item?.action || item.leaving || acted.current.has(id)) return;
      acted.current.add(id);
      item.action.onAction();
      dismiss(id);
    },
    [dismiss],
  );

  // Ctrl+Z triggers the action of the newest toast. A text field keeps its own undo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey || event.altKey || isTextEntry(event.target)) return;
      const newest = latest.current.filter((item) => !item.leaving).at(-1);
      if (!newest?.action) return;
      event.preventDefault();
      act(newest.id);
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
      <div role="region" aria-label={t("toast.region")} className={styles.region}>
        <div role="status" aria-live="polite" aria-atomic="false" className={styles.stack}>
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
