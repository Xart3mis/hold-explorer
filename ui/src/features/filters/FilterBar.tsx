import { useIsMutating } from "@tanstack/react-query";
import { useRef } from "react";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { exportColumn } from "../../api/export";
import { keys } from "../../api/keys";
import { useStart } from "../../app/actions/start";
import { useFilters } from "../../app/filters/state";
import { useSnapshotQuery } from "../../app/view";
import type { Field } from "../../bindings/Field";
import { AddFilterChip, Button, ErrorState, FilterChip, Skeleton } from "../../components";
import { formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { chipsOf, type Chip } from "./chips";
import styles from "./FilterBar.module.css";
import { FilterPicker } from "./FilterPicker";
import { StatusControl } from "./StatusControl";

/** The fields that have no value in a snapshot in which no hold is released. */
const RELEASE_FIELDS: ReadonlySet<Field> = new Set(["Released", "ReleaseRemark", "ReleaseDate"]);

/** A chip and "Add filter" open their picker by being its trigger; the press itself does nothing more. */
const opensPicker = () => undefined;

/**
 * The filter bar of a data screen: the status, one chip per active filter, the way to add one,
 * the way to clear them, and the number of holds the filters keep. It reads the filters every
 * data screen shares (`useFilters`) and the options of the snapshot in view for them, so it takes
 * no props; a page places it under its header (`bar` of `Page`).
 *
 * While an action on the workspace runs nothing can be changed, and a short sentence in the place
 * of the total says why; the bar keeps its height and every control its place. A snapshot that
 * has no value in a column of the export is said to lack it, once, under the controls, and one in
 * which no hold is released is said to have none; only the open holds are then offered.
 */
export function FilterBar() {
  const { filters, spec, update, clear } = useFilters();
  const { isBusy } = useStart();
  // Another workspace or snapshot is on its way, or the one in view is being changed.
  const isSwitching = useIsMutating({ mutationKey: keys.switching }) > 0;
  const options = useSnapshotQuery({
    name: "filterOptions",
    params: [spec],
    read: (view, asked) => api.filterOptions(asked, view),
  });
  const bar = useRef<HTMLDivElement>(null);

  const chips = chipsOf(filters);
  const counted = options.isError ? undefined : options.data;
  // What is shown was counted for the filters, the snapshot, or the workspace of before.
  const isStale = counted !== undefined && options.isPlaceholderData;
  const absent = counted?.absent ?? [];
  // No hold of the snapshot is released: its file had no column that says so, or none is yet.
  const noReleased = absent.includes("Released");
  // What the sentence about the holds says is not said again as columns without values.
  const missing = noReleased ? absent.filter((field) => !RELEASE_FIELDS.has(field)) : absent;
  const reason = !isBusy ? "" : t(isSwitching ? "filters.busySwitching" : "filters.busyChanging");

  /** "Add filter": where the focus goes when the control that had it is gone. */
  const addFilter = () =>
    bar.current?.querySelector<HTMLElement>("[data-part='add-filter-chip']") ?? null;

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
            <FilterPicker
              key={chip.id}
              field={chip.field}
              trigger={
                <FilterChip
                  field={chip.name}
                  value={chip.value}
                  isNegated={chip.isNegated}
                  isDisabled={isBusy}
                  onPress={opensPicker}
                  onRemove={() => {
                    remove(chip, index);
                  }}
                />
              }
            />
          ))}
          {/* The two wrap as one: a line starts with the pill, on the line of the chips above. */}
          <span data-part="filter-actions" className={styles.actions}>
            <FilterPicker
              field={null}
              trigger={<AddFilterChip isDisabled={isBusy} onPress={opensPicker} />}
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
      </div>
      {noReleased || missing.length > 0 ? (
        <p data-part="filter-notes" data-stale={isStale ? "" : undefined} className={styles.notes}>
          {noReleased ? (
            <span data-part="filter-no-released">{t("filters.noReleased")}</span>
          ) : null}
          {noReleased && missing.length > 0 ? " " : null}
          {missing.length === 0 ? null : (
            <span data-part="filter-absent">
              {t("filters.absent", {
                count: missing.length,
                columns: formatList(missing.map(exportColumn)),
              })}
            </span>
          )}
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
    </div>
  );
}
