import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { asCommandError } from "../../api/error";
import { exportColumn } from "../../api/plantim";
import { keys } from "../../api/keys";
import { useStart } from "../../app/actions/start";
import { useLabelledFilters } from "../../app/filters/labels";
import { useFilterOptions } from "../../app/filters/options";
import { useFilters } from "../../app/filters/state";
import type { Field } from "../../bindings/Field";
import { AddFilterChip, Button, ErrorState, FilterChip, Skeleton } from "../../components";
import { formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { SaveViewPopover } from "../views/SaveViewPopover";
import { chipsOf, type Chip, type FilterField } from "./chips";
import styles from "./FilterBar.module.css";
import { FilterPicker } from "./FilterPicker";
import { StatusControl } from "./StatusControl";

/** The fields that have no value in a snapshot in which no hold is released. */
const RELEASE_FIELDS: ReadonlySet<Field> = new Set(["Released", "ReleaseRemark", "ReleaseDate"]);

/** What opened the picker, when it was not a chip: "Add filter". No chip has this id. */
const ADD = "add";

/** The picker of the bar: whether it is open, for which field, and what opened it. */
interface Picker {
  isOpen: boolean;
  /** The field whose editor it shows; `null` for the list of fields. */
  field: FilterField | null;
  /** The id of the chip that opened it, or `ADD`. */
  from: string;
  /** Where the control that opened it was, from the top left corner of the bar, in pixels. */
  place: { left: number; top: number; width: number; height: number };
}

const CLOSED: Picker = {
  isOpen: false,
  field: null,
  from: ADD,
  place: { left: 0, top: 0, width: 0, height: 0 },
};

/**
 * The filter bar of a data screen: the status, one chip per active filter, the way to add one,
 * the way to clear them, the number of holds the filters keep, and "Save view". It reads the
 * filters every data screen shares (`useFilters`) and the options of the snapshot in view for
 * them, so it takes no props; a page places it under its header (`bar` of `Page`).
 *
 * A chip and "Add filter" open the one picker of the bar. It stands under the place its control
 * had when it opened and keeps that place: what is ticked in it widens a chip, adds one, or
 * removes the one that opened it, and the picker must not move under the pointer for that.
 *
 * While an action on the workspace runs nothing can be changed, and a short sentence in the place
 * of the total says why; the bar keeps its height and every control its place. A snapshot that
 * has no value in a column of the export is said to lack it, once, under the controls, and one in
 * which no hold is released is said to have none; only the open holds are then offered.
 */
export function FilterBar() {
  const { update, clear } = useFilters();
  // The filters with every value under the label its chip shows.
  const filters = useLabelledFilters();
  const { isBusy } = useStart();
  // Another snapshot is on its way, and nothing else: an action that opens, creates, or changes a
  // workspace makes the bar wait for the workspace, also when a selection waits beside it.
  const actions = useIsMutating({ mutationKey: keys.workspaceAction });
  const selections = useIsMutating({ mutationKey: keys.selectingSnapshot });
  const isSelecting = selections > 0 && selections === actions;
  const options = useFilterOptions();
  const bar = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const [picker, setPicker] = useState(CLOSED);
  // Nothing can be changed while an action runs, so the picker is closed for as long as it does.
  if (isBusy && picker.isOpen) setPicker({ ...picker, isOpen: false });
  // Whether the bar holds the focus, which it can take only while an action runs.
  const [hasFocus, setHasFocus] = useState(false);
  /** Whether the picker was open when the bar was drawn last: its closing gives the focus back. */
  const wasOpen = useRef(false);

  const counted = options.isError ? undefined : options.data;
  // The command says which filters the snapshot cannot apply, and their chips are marked. While
  // the counts cannot be read, which those are is not known: no chip is marked, and the line
  // under the controls says so.
  const chips = chipsOf(filters, counted?.inactive);
  const hasInactive = chips.some((chip) => chip.isInactive);
  const isUnknown = options.isError && chips.length > 0;
  // What is shown was counted for the filters, the snapshot, or the workspace of before.
  const isStale = counted !== undefined && options.isPlaceholderData;
  const absent = counted?.absent ?? [];
  // No hold of the snapshot is released: its file had no column that says so, or none is yet.
  const noReleased = absent.includes("Released");
  // What the sentence about the holds says is not said again as columns without values.
  const missing = noReleased ? absent.filter((field) => !RELEASE_FIELDS.has(field)) : absent;
  const reason = !isBusy ? "" : t(isSelecting ? "filters.busySnapshot" : "filters.busyWorkspace");

  /** "Add filter": where the focus goes when the control that had it is gone. */
  const addFilter = () =>
    bar.current?.querySelector<HTMLElement>("[data-part='add-filter-chip']") ?? null;

  // The chip that opened the picker is there for as long as its filter has a value.
  const fromChip = picker.from !== ADD && chips.some((chip) => chip.id === picker.from);
  /** The control that says it has the picker open: the one that opened it, or "Add filter" once that chip is gone. */
  const expanded = !picker.isOpen ? null : fromChip ? picker.from : ADD;

  /** Opens the picker under a control, for the field of a chip or, without one, to add a filter. */
  const open = (field: FilterField | null, from: string, control: Element | null | undefined) => {
    const origin = bar.current?.getBoundingClientRect();
    const at = control?.getBoundingClientRect();
    if (origin === undefined || at === undefined) return;
    setPicker({
      isOpen: true,
      field,
      from,
      place: {
        left: at.left - origin.left,
        top: at.top - origin.top,
        width: at.width,
        height: at.height,
      },
    });
  };

  // A picker that closes gives the focus back to the chip of its field, which may have gone and
  // come back as another element while it was open, or to "Add filter" when it was opened there
  // or its chip is gone, as when a chip is removed. Closed because an action started, it gives
  // the focus to the bar, since every control in it is disabled then.
  const isOpen = picker.isOpen && !isBusy;
  const { from } = picker;
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const held = bar.current;
    if (held === null) return;
    if (isBusy) {
      held.focus();
      return;
    }
    const index = chips.findIndex((chip) => chip.id === from);
    const pill = held.querySelectorAll("[data-part='filter-chip']")[index];
    (pill?.querySelector<HTMLElement>("button") ?? addFilter())?.focus();
  });

  /**
   * Removes a filter. The focus moves to the chip after it, or to "Add filter" when it was the
   * last, before the chip goes: whatever takes the focus is there before and after.
   */
  const remove = (chip: Chip, index: number) => {
    const after = bar.current?.querySelectorAll("[data-part='filter-chip']")[index + 1];
    const next = after?.querySelector<HTMLElement>("button");
    (next ?? addFilter())?.focus();
    update(chip.remove);
  };

  return (
    <div
      ref={bar}
      role="group"
      aria-label={t("filters.bar")}
      // It holds the focus while an action runs that closed its picker, and keeps it after the
      // action until the focus moves on. At rest it is no target: a click on it draws no ring.
      tabIndex={isBusy || hasFocus ? -1 : undefined}
      onFocus={(event) => {
        if (event.target === event.currentTarget) setHasFocus(true);
      }}
      onBlur={(event) => {
        if (event.target === event.currentTarget) setHasFocus(false);
      }}
      data-part="filter-bar"
      className={styles.bar}
    >
      <div className={styles.row}>
        <div className={styles.controls}>
          <StatusControl
            status={filters.status}
            onChange={(status) => {
              update((current) => ({ ...current, status }));
            }}
            facets={counted?.facets}
            // Whether the snapshot has released holds is known once its counts are there.
            hasReleased={counted !== undefined && !noReleased}
            isInert={isBusy}
          />
          {chips.map((chip, index) => (
            <FilterChip
              key={chip.id}
              field={chip.name}
              value={chip.value}
              isNegated={chip.isNegated}
              isInactive={chip.isInactive}
              // A mark is that of the answer shown, which may be that of the view of before.
              isStale={chip.isInactive && isStale}
              isDisabled={isBusy}
              isExpanded={expanded === chip.id}
              isUnderPopover={isOpen}
              onPress={() => {
                const pills = bar.current?.querySelectorAll("[data-part='filter-chip']");
                open(chip.field, chip.id, pills?.[index]);
              }}
              onRemove={() => {
                remove(chip, index);
              }}
            />
          ))}
          {/* The two wrap as one: a line starts with the pill, on the line of the chips above. */}
          <span data-part="filter-actions" className={styles.actions}>
            <AddFilterChip
              isDisabled={isBusy}
              isExpanded={expanded === ADD}
              onPress={() => {
                open(null, ADD, addFilter());
              }}
            />
            {chips.length === 0 ? null : (
              <Button
                variant="quiet"
                isDisabled={isBusy}
                onPress={() => {
                  addFilter()?.focus();
                  clear();
                }}
              >
                {t("filters.clear")}
              </Button>
            )}
          </span>
        </div>
        {/*
          The trailing part keeps its width whatever it holds: the total, or in its place why
          nothing can be changed. The total says nothing certain while what it counts is on its
          way. The region is always there, so that what it comes to say is announced.
        */}
        <div data-part="filter-end" className={styles.end}>
          <p role="status" className={styles.reason}>
            {reason}
          </p>
          {isBusy || options.isError ? null : (
            <p
              data-part="filter-total"
              data-stale={isStale ? "" : undefined}
              aria-busy={counted === undefined || isStale ? "true" : undefined}
              className={styles.total}
            >
              {counted === undefined ? (
                <Skeleton width="9ch" />
              ) : (
                t("filters.total", { count: counted.total })
              )}
            </p>
          )}
        </div>
        <div data-part="filter-save" className={styles.save}>
          <SaveViewPopover />
        </div>
      </div>
      {noReleased || missing.length > 0 || hasInactive || isUnknown ? (
        <p data-part="filter-notes" data-stale={isStale ? "" : undefined} className={styles.notes}>
          {[
            noReleased ? (
              <span key="released" data-part="filter-no-released">
                {t("filters.noReleased")}
              </span>
            ) : null,
            missing.length === 0 ? null : (
              <span key="absent" data-part="filter-absent">
                {t("filters.absent", {
                  count: missing.length,
                  columns: formatList(missing.map(exportColumn)),
                })}
              </span>
            ),
            hasInactive ? (
              <span key="inactive" data-part="filter-inactive">
                {t("filters.inactiveKept")}
              </span>
            ) : null,
            isUnknown ? (
              <span key="unknown" data-part="filter-inactive-unknown">
                {t("filters.inactiveUnknown")}
              </span>
            ) : null,
          ]
            .filter((sentence) => sentence !== null)
            // One space between the sentences of the line.
            .flatMap((sentence, index) => (index === 0 ? [sentence] : [" ", sentence]))}
        </p>
      ) : null}
      {options.isError ? (
        <ErrorState
          error={asCommandError(options.error)}
          title={t("filters.error")}
          onRetry={() => void options.refetch()}
          isRetrying={options.isRefetching}
          className={styles.error}
        />
      ) : null}
      {/* Where the control that opened the picker was: what the picker stands under. */}
      <span
        ref={anchor}
        aria-hidden="true"
        data-part="filter-picker-anchor"
        className={styles.anchor}
        style={picker.place}
      />
      <FilterPicker
        anchor={anchor}
        isOpen={isOpen}
        field={picker.field}
        options={options}
        onChoose={(field) => {
          setPicker((current) => ({ ...current, field }));
        }}
        onClose={() => {
          setPicker((current) => ({ ...current, isOpen: false }));
        }}
      />
    </div>
  );
}
