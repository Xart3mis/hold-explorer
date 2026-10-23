import { Bookmark, Ellipsis, OctagonAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input, Link, TextField as RacTextField } from "react-aria-components";
import { useLocation } from "react-router";
import { asCommandError } from "../../api/error";
import { useStart } from "../../app/actions/start";
import { viewsOf } from "../../app/actions/views";
import { useFilters } from "../../app/filters/state";
import { useShell } from "../../app/shell/context";
import type { SavedView } from "../../bindings/SavedView";
import { Icon, IconMenuButton, MenuItem, MenuSection, Tooltip } from "../../components";
import { cx } from "../../components/cx";
import { useIsCut } from "../../components/useIsCut";
import { t } from "../../text/i18n";
import { useViewActions } from "./actions";
import { isCurrentView, useApplyView } from "./apply";
import styles from "./Views.module.css";

/** How the rename field was left: by its own keys, or by the focus going elsewhere. */
type Leaving = "keys" | "focus";

interface RenameFieldProps {
  name: string;
  isPending: boolean;
  /** Why the last save was refused, while what was typed then is still in the field. */
  error: { typed: string; message: string } | null;
  onSave: (typed: string, leaving: Leaving) => void;
  onCancel: (leaving: Leaving) => void;
}

/**
 * The name of a view as a field, in the place of its item. Enter saves and Escape cancels; the
 * focus leaving saves a changed name and closes an untouched one, as the workspace's name does.
 */
function RenameField({ name, isPending, error, onSave, onCancel }: RenameFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [value, setValue] = useState(name);
  // The mark of a refused name goes once the name is edited: it said why that one was refused.
  const isInvalid = error !== null && error.typed === value;

  // The field takes the focus with the name selected, ready to be typed over.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <div className={styles.rename}>
      <RacTextField
        aria-label={t("views.nameLabel")}
        {...(isInvalid ? { "aria-describedby": errorId } : {})}
        value={value}
        onChange={setValue}
        isInvalid={isInvalid}
        isReadOnly={isPending}
        className={cx(styles.renameField)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!isPending) onSave(value, "keys");
          } else if (event.key === "Escape") {
            event.preventDefault();
            if (!isPending) onCancel("keys");
          } else {
            // The keys the field does not use go on to the shortcuts of the app.
            event.continuePropagation();
          }
        }}
        onBlur={() => {
          if (isPending) return;
          if (value.trim() === name || value === error?.typed) onCancel("focus");
          else onSave(value, "focus");
        }}
      >
        <Input ref={input} className={cx(styles.renameInput)} />
      </RacTextField>
      {isInvalid ? (
        <p id={errorId} className={styles.renameError}>
          <Icon icon={OctagonAlert} />
          <span>{error.message}</span>
        </p>
      ) : null}
    </div>
  );
}

interface ViewItemProps {
  view: SavedView;
  index: number;
  count: number;
  isCurrent: boolean;
  isBusy: boolean;
  onApply: (view: SavedView) => void;
  /** Deletes the view; the item says where the focus goes once it is gone. */
  onDelete: (view: SavedView, index: number) => void;
  /** Renames the view; resolves once the list has answered, rejects with the refusal. */
  onRename: (view: SavedView, name: string) => Promise<unknown>;
  /** Moves the view one place up or down. */
  onMove: (view: SavedView, by: -1 | 1) => void;
}

/** One saved view in the full sidebar: its name, which applies it, and the menu of what it can do. */
function ViewItem({
  view,
  index,
  count,
  isCurrent,
  isBusy,
  onApply,
  onDelete,
  onRename,
  onMove,
}: ViewItemProps) {
  const item = useRef<HTMLLIElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const isCut = useIsCut(label, view.name);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<{ typed: string; message: string } | null>(null);
  // Whether the focus goes back to the menu button as the field closes: unless it was taken away.
  const focusBack = useRef(false);
  const wasRenaming = useRef(false);
  useEffect(() => {
    if (wasRenaming.current && !renaming && focusBack.current) {
      item.current?.querySelector<HTMLElement>("[data-part='view-menu-slot'] button")?.focus();
    }
    wasRenaming.current = renaming;
  }, [renaming]);

  const close = (leaving: Leaving) => {
    focusBack.current = leaving === "keys";
    setError(null);
    setRenaming(false);
  };

  const save = (typed: string, leaving: Leaving) => {
    const name = typed.trim();
    if (name === view.name) {
      close(leaving);
      return;
    }
    setSaving(true);
    void onRename(view, name).then(
      () => {
        setSaving(false);
        close(leaving);
      },
      (failure: unknown) => {
        setSaving(false);
        // The field stays, with what was typed, beside the reason: said there, and only there,
        // also when the focus had left it.
        setError({ typed, message: asCommandError(failure).message });
      },
    );
  };

  if (renaming) {
    return (
      <li ref={item} className={styles.item}>
        <RenameField
          name={view.name}
          isPending={isSaving}
          error={error}
          onSave={save}
          onCancel={close}
        />
      </li>
    );
  }

  return (
    <li
      ref={item}
      data-view-id={view.id}
      data-current={isCurrent ? "" : undefined}
      data-open={isMenuOpen ? "" : undefined}
      className={styles.item}
    >
      <Tooltip text={view.name} isDisabled={!isCut} placement="end">
        <Link
          // It has no address of its own to follow: applying the view sets the filters first.
          onPress={() => {
            if (!isBusy) onApply(view);
          }}
          data-part="view-link"
          data-view-id={view.id}
          className={cx(styles.link)}
          render={(domProps) => (
            <span
              {...domProps}
              aria-current={isCurrent ? "true" : undefined}
              aria-disabled={isBusy ? "true" : undefined}
              aria-busy={isBusy ? "true" : undefined}
            />
          )}
        >
          <Icon icon={Bookmark} />
          <span ref={label} className={styles.label}>
            {view.name}
          </span>
        </Link>
      </Tooltip>
      <span data-part="view-menu-slot" className={styles.menuSlot}>
        <IconMenuButton
          icon={Ellipsis}
          label={t("views.actions", { name: view.name })}
          placement="bottom end"
          onOpenChange={setMenuOpen}
          className={styles.menuButton}
        >
          <MenuItem
            id="rename"
            isDisabled={isBusy}
            onAction={() => {
              setError(null);
              setRenaming(true);
            }}
          >
            {t("views.rename")}
          </MenuItem>
          <MenuItem
            id="up"
            isDisabled={isBusy || index === 0}
            onAction={() => {
              onMove(view, -1);
            }}
          >
            {t("views.moveUp")}
          </MenuItem>
          <MenuItem
            id="down"
            isDisabled={isBusy || index === count - 1}
            onAction={() => {
              onMove(view, 1);
            }}
          >
            {t("views.moveDown")}
          </MenuItem>
          <MenuItem
            id="delete"
            isDisabled={isBusy}
            onAction={() => {
              onDelete(view, index);
            }}
          >
            {t("views.delete")}
          </MenuItem>
        </IconMenuButton>
      </span>
    </li>
  );
}

export interface ViewsSectionProps {
  /** The sidebar is a rail: the section is one button that opens a menu of the views. */
  isRail: boolean;
  /** Draws the page anew, as a second press on its destination does. */
  onRestart: () => void;
}

/**
 * The saved views of the open workspace in the sidebar (DESIGN.md, "Saved views"): a titled list
 * of their names, each of which applies its view and has a menu to rename, move, and delete it;
 * in the rail, one button whose menu lists them.
 */
export function ViewsSection({ isRail, onRestart }: ViewsSectionProps) {
  const { start } = useShell();
  const { isBusy } = useStart();
  const { spec } = useFilters();
  const location = useLocation();
  const apply = useApplyView(onRestart);
  const { remove, failed, renameView, move } = useViewActions();
  const titleId = useId();
  const section = useRef<HTMLDivElement>(null);
  const views = viewsOf(start);
  const workspace = start.open?.workspace.id ?? null;
  if (workspace === null) return null;
  const isCurrent = (view: SavedView) => isCurrentView(view, location, spec);

  if (isRail) {
    const current = views.find(isCurrent);
    return (
      <div data-part="saved-views" className={styles.rail}>
        <IconMenuButton icon={Bookmark} label={t("views.title")} placement="end top">
          {views.length === 0 ? (
            <MenuItem id="empty" isDisabled>
              {t("views.empty")}
            </MenuItem>
          ) : (
            <MenuSection
              title={t("views.title")}
              selectedKey={current === undefined ? null : String(current.id)}
            >
              {views.map((view) => (
                <MenuItem
                  key={view.id}
                  id={String(view.id)}
                  isDisabled={isBusy}
                  onAction={() => {
                    apply(view);
                  }}
                >
                  {view.name}
                </MenuItem>
              ))}
            </MenuSection>
          )}
        </IconMenuButton>
      </div>
    );
  }

  /** Deletes a view; the focus goes to the next view, the one before, or the section. */
  const onDelete = (view: SavedView, index: number) => {
    const next = views[index + 1] ?? views[index - 1];
    remove(workspace, view, index, {
      onDone: () => {
        const target =
          next === undefined
            ? null
            : section.current?.querySelector<HTMLElement>(
                `[data-part='view-link'][data-view-id='${String(next.id)}']`,
              );
        (target ?? section.current)?.focus();
      },
    });
  };

  const onRename = (view: SavedView, name: string) =>
    renameView.mutateAsync({ workspace, id: view.id, name });

  /**
   * Moves a view. The list is drawn again in its new order, which takes the focus from a moved
   * element in a browser: once it is drawn, the menu button of the view has the focus again.
   */
  const onMove = (view: SavedView, by: -1 | 1) => {
    void move(workspace, view.id, by).then(() => {
      window.requestAnimationFrame(() => {
        // Only the focus the move took away is given back: not one the user has put elsewhere.
        const held = document.activeElement;
        const lost = held === null || held === document.body;
        if (!lost && section.current?.contains(held) !== true) return;
        section.current
          ?.querySelector<HTMLElement>(
            `li[data-view-id='${String(view.id)}'] [data-part='view-menu-slot'] button`,
          )
          ?.focus();
      });
    }, failed);
  };

  return (
    <div
      ref={section}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-part="saved-views"
      className={styles.section}
    >
      <span id={titleId} className={styles.title}>
        {t("views.title")}
      </span>
      {views.length === 0 ? (
        <p className={styles.empty}>{t("views.empty")}</p>
      ) : (
        <ul aria-labelledby={titleId} className={styles.list}>
          {views.map((view, index) => (
            <ViewItem
              key={view.id}
              view={view}
              index={index}
              count={views.length}
              isCurrent={isCurrent(view)}
              isBusy={isBusy}
              onApply={apply}
              onDelete={onDelete}
              onRename={onRename}
              onMove={onMove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
