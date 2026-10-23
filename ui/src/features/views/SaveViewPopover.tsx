import { BookmarkPlus } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { asCommandError } from "../../api/error";
import { useStart } from "../../app/actions/start";
import { viewsOf } from "../../app/actions/views";
import { destinations } from "../../app/destinations";
import { useFilters } from "../../app/filters/state";
import { useShell } from "../../app/shell/context";
import type { SavedView } from "../../bindings/SavedView";
import { Button, Popover, TextField } from "../../components";
import { t } from "../../text/i18n";
import { chipsOf } from "../filters/chips";
import { useViewActions } from "./actions";
import { useRememberFilters, viewAddress, withinLimit } from "./apply";
import styles from "./SaveViewPopover.module.css";

/** The kind of the refusal of a name another view has. */
const NAME_TAKEN = "ViewNameTaken";

/** Why the last save was refused, and the view that has the name, when that was the reason. */
interface Refusal {
  message: string;
  taken: { view: SavedView; index: number } | null;
}

/** The name proposed for the screen shown: its destination, and the value of the first chip. */
function proposedName(pathname: string, chip: string | undefined): string {
  const destination = destinations.find((held) => held.path === pathname);
  const page = destination === undefined ? "" : t(`destinations.name.${destination.id}`);
  return withinLimit(chip === undefined ? page : t("views.proposed", { page, value: chip }));
}

/** What the popover holds: the name, and Save. */
function SaveViewForm({ close }: { close: () => void }) {
  const { start } = useShell();
  const { filters, spec } = useFilters();
  const location = useLocation();
  const { saveView, remove, done } = useViewActions();
  const remember = useRememberFilters();
  const workspace = start.open?.workspace.id ?? null;
  const views = viewsOf(start);
  const [name, setName] = useState(() =>
    proposedName(location.pathname, chipsOf(filters)[0]?.value),
  );
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [isSaving, setSaving] = useState(false);
  // The proposed name is selected once, as the field takes the focus on opening.
  const selected = useRef(false);

  const save = () => {
    if (workspace === null || isSaving) return;
    const before = new Set(views.map((view) => view.id));
    const typed = name;
    setSaving(true);
    void saveView
      .mutateAsync({
        workspace,
        name: typed,
        address: viewAddress(location.pathname, location.search),
        filters: spec,
      })
      .then(
        (list) => {
          setSaving(false);
          const saved = list.find((view) => !before.has(view.id));
          if (saved !== undefined) remember(workspace, saved.id, filters);
          close();
          done(t("views.saved", { name: saved?.name ?? typed.trim() }));
        },
        (failure: unknown) => {
          setSaving(false);
          const error = asCommandError(failure);
          // The view that has the name, as the list on screen holds it, which "Replace it" deletes.
          const wanted = typed.trim().toLowerCase();
          const index = views.findIndex((view) => view.name.toLowerCase() === wanted);
          const view = views[index];
          setRefusal({
            message: error.message,
            taken: error.kind === NAME_TAKEN && view !== undefined ? { view, index } : null,
          });
        },
      );
  };

  const replace = (taken: { view: SavedView; index: number }) => {
    if (workspace === null) return;
    setSaving(true);
    remove(workspace, taken.view, taken.index, {
      onDone: save,
      // The other view is still there, and so is this one's name: Save and Replace it can be
      // pressed again. The toast says why.
      onFailed: () => {
        setSaving(false);
      },
    });
  };

  return (
    <div className={styles.form}>
      <TextField
        label={t("views.name")}
        value={name}
        onChange={(value) => {
          setName(value);
          setRefusal(null);
        }}
        isReadOnly={isSaving}
        {...(refusal === null ? {} : { errorMessage: refusal.message })}
        onFocus={(event) => {
          if (selected.current) return;
          selected.current = true;
          event.target.select();
        }}
        onKeyDown={(event) => {
          // Every other key goes on: Escape to the popover, which closes, Ctrl+K to the palette.
          if (event.key !== "Enter") {
            event.continuePropagation();
            return;
          }
          event.preventDefault();
          save();
        }}
      />
      <div className={styles.buttons}>
        {refusal?.taken == null ? null : (
          <Button
            variant="quiet"
            isInert={isSaving}
            onPress={() => {
              if (refusal.taken !== null) replace(refusal.taken);
            }}
          >
            {t("views.replace")}
          </Button>
        )}
        <Button isPending={isSaving} reservesPendingSpace onPress={save}>
          {t("views.saveButton")}
        </Button>
      </div>
    </div>
  );
}

/** How the popover of the filter bar that is shown opens; `null` while no filter bar is shown. */
let openShown: (() => void) | null = null;
const watchers = new Set<() => void>();

function putOpener(open: (() => void) | null): void {
  openShown = open;
  for (const watcher of watchers) watcher();
}

function watchOpener(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

/**
 * Opens the Save view popover of the filter bar that is shown, as a press on "Save view" does: the
 * focus is on "Save view" first, so it goes back there when the popover closes. Returns whether
 * there was one: a page without a filter bar has none. The command palette's "Save view" calls it.
 */
export function openSaveView(): boolean {
  if (openShown === null) return false;
  openShown();
  return true;
}

/** Whether a filter bar with "Save view" is shown, so that `openSaveView` opens its popover. */
export function useHasSaveView(): boolean {
  return useSyncExternalStore(
    watchOpener,
    () => openShown !== null,
    () => false,
  );
}

/**
 * "Save view" at the trailing end of the filter bar, and the popover it opens (DESIGN.md, "Save
 * view popover"): the screen shown, its selection left out, and the filters, saved in the open
 * workspace under a name. It is inert while an action on the workspace runs. `openSaveView` opens
 * it from elsewhere.
 */
export function SaveViewPopover() {
  const { isBusy } = useStart();
  const [isOpen, setOpen] = useState(false);
  const triggerId = useId();
  // Nothing can be saved while the workspace may change, so the popover closes for as long.
  if (isBusy && isOpen) setOpen(false);
  useEffect(() => {
    const open = () => {
      document.getElementById(triggerId)?.focus();
      setOpen(true);
    };
    putOpener(open);
    return () => {
      if (openShown === open) putOpener(null);
    };
  }, [triggerId]);
  return (
    <Popover
      aria-label={t("views.saveTitle")}
      placement="bottom end"
      isOpen={isOpen}
      onOpenChange={(open) => {
        setOpen(open && !isBusy);
      }}
      trigger={
        <Button
          id={triggerId}
          variant="quiet"
          icon={BookmarkPlus}
          isInert={isBusy}
          data-part="save-view"
        >
          {t("views.save")}
        </Button>
      }
    >
      {(close) => <SaveViewForm close={close} />}
    </Popover>
  );
}
