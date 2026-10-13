import { useIsMutating } from "@tanstack/react-query";
import { useRef } from "react";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { exportColumn } from "../../api/export";
import { keys } from "../../api/keys";
import { useStart } from "../../app/actions/start";
import { useFilters } from "../../app/filters/state";
import { useSnapshotQuery } from "../../app/view";
import { AddFilterChip, Button, ErrorState, FilterChip, Skeleton } from "../../components";
import { formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { chipsOf, type Chip } from "./chips";
import styles from "./FilterBar.module.css";
import { FilterPicker } from "./FilterPicker";
import { StatusControl } from "./StatusControl";

/** A chip and "Add filter" open their picker by being its trigger; the press itself does nothing more. */
const opensPicker = () => undefined;

/**
 * The filter bar of a data screen: the status, one chip per active filter, the way to add one,
 * the way to clear them, and the number of holds the filters keep. It reads the filters every
 * data screen shares (`useFilters`) and the options of the snapshot in view for them, so it takes
 * no props; a page places it under its header (`bar` of `Page`).
 *
 * While an action on the workspace runs nothing can be changed, and one line after the controls
 * says why. A snapshot that has no value in a column of the export is said to lack it, once,
 * under the controls; the status that needs the released column is then not offered.
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
  const isReading = counted === undefined || options.isPlaceholderData;
  const absent = counted?.absent ?? [];
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
            hasReleased={!absent.includes("Released")}
            isInert={isBusy}
            className={styles.status}
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
          {/* Always there, so that what it comes to say is announced. */}
          <p role="status" className={styles.reason}>
            {reason}
          </p>
        </div>
        {options.isError ? null : (
          <p
            data-part="filter-total"
            data-stale={counted !== undefined && options.isPlaceholderData ? "" : undefined}
            aria-busy={isReading ? "true" : undefined}
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
      {absent.length === 0 ? null : (
        <p data-part="filter-absent" className={styles.absent}>
          {t("filters.absent", {
            count: absent.length,
            columns: formatList(absent.map(exportColumn)),
          })}
        </p>
      )}
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
