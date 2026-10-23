import { BookmarkPlus } from "lucide-react";
import { useRef, useState } from "react";
import { useLocation } from "react-router";
import { asCommandError } from "../../api/error";
import { useStart } from "../../app/actions/start";
import { useSavedViews, viewsOf } from "../../app/actions/views";
import { destinations } from "../../app/destinations";
import { useFilters } from "../../app/filters/state";
import { useShell } from "../../app/shell/context";
import type { SavedView } from "../../bindings/SavedView";
import { Button, Popover, TextField } from "../../components";
import { t } from "../../text/i18n";
import { chipsOf } from "../filters/chips";
import { useRememberFilters, useViewToasts, viewAddress, withinLimit } from "./apply";
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
  const { saveView } = useSavedViews();
  const { remove, toast } = useViewToasts();
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
          toast.show({
            message: t("views.saved", { name: saved?.name ?? typed.trim() }),
            tone: "success",
          });
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
    remove(workspace, taken.view, taken.index, save);
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
          if (event.key !== "Enter") return;
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

/**
 * "Save view" at the trailing end of the filter bar, and the popover it opens (DESIGN.md, "Save
 * view popover"): the screen shown, its selection left out, and the filters, saved in the open
 * workspace under a name. It is inert while an action on the workspace runs.
 */
export function SaveViewPopover() {
  const { isBusy } = useStart();
  const [isOpen, setOpen] = useState(false);
  // Nothing can be saved while the workspace may change, so the popover closes for as long.
  if (isBusy && isOpen) setOpen(false);
  return (
    <Popover
      aria-label={t("views.saveTitle")}
      placement="bottom end"
      isOpen={isOpen}
      onOpenChange={(open) => {
        setOpen(open && !isBusy);
      }}
      trigger={
        <Button variant="quiet" icon={BookmarkPlus} isInert={isBusy} data-part="save-view">
          {t("views.save")}
        </Button>
      }
    >
      {(close) => <SaveViewForm close={close} />}
    </Popover>
  );
}
