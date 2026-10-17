import type { UseQueryResult } from "@tanstack/react-query";
import { asCommandError } from "../../api/error";
import { useFilters } from "../../app/filters/state";
import type { AgeBand } from "../../bindings/AgeBand";
import type { FilterOptions } from "../../bindings/FilterOptions";
import { ErrorState, OptionList, type Option } from "../../components";
import { formatAgeBand } from "../../text/format";
import { t } from "../../text/i18n";
import { fieldName } from "./chips";
import styles from "./FilterPicker.module.css";

/** A band in one word, to tell it from every other: its two bounds. */
const bandKey = (band: AgeBand) => `${String(band.min_days)}:${String(band.max_days)}`;

export interface AgeBandsProps {
  /** The options of the snapshot in view, as the filter bar reads them: the bands and their counts. */
  options: UseQueryResult<FilterOptions>;
}

/**
 * The editor of age: the age bands of the workspace, several to choose, each with the count of
 * holds it would keep. A ticked band that is not one of them (the bands were changed since) is
 * listed first, without a count, so that it can be unticked.
 */
export function AgeBands({ options }: AgeBandsProps) {
  const { filters, update } = useFilters();
  const name = fieldName({ kind: "ageBands" });
  if (options.isError) {
    return (
      <ErrorState
        error={asCommandError(options.error)}
        title={t("filters.error")}
        onRetry={() => void options.refetch()}
        isRetrying={options.isRefetching}
      />
    );
  }
  const counted = options.data;
  const known = counted?.age_bands ?? [];
  const knownKeys = new Set(known.map(bandKey));
  const bands = [...filters.ageBands.filter((band) => !knownKeys.has(bandKey(band))), ...known];
  const counts = new Map(
    known.map((band, index) => [bandKey(band), counted?.facets.age_bands[index]]),
  );

  return (
    <div className={styles.group}>
      <p className={styles.title}>{name}</p>
      <OptionList
        aria-label={name}
        selectionMode="multiple"
        options={bands.map((band): Option => {
          const count = counts.get(bandKey(band));
          return {
            key: bandKey(band),
            label: formatAgeBand(band),
            ...(count === undefined ? {} : { count }),
          };
        })}
        selectedKeys={filters.ageBands.map(bandKey)}
        onSelectionChange={(keys) => {
          // The ticked bands in the order of the list, whatever the order they were ticked in.
          update((current) => ({
            ...current,
            ageBands: bands.filter((band) => keys.includes(bandKey(band))),
          }));
        }}
        isLoading={counted === undefined || options.isPlaceholderData}
        emptyText={t("filters.picker.noBands")}
      />
    </div>
  );
}
