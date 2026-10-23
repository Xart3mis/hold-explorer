/**
 * The labels the chips show for the values of the filters in view. A value keeps the label it was
 * picked under, in the picker or a search result; a filter that came from a saved view has its
 * keys only, and the labels the view was saved or last applied with in this session. A value of
 * a dimension whose keys are not its labels (a Remark, folded to upper case; a Blocker, keyed
 * `<discipline>|<item>`) that is still known by its key alone is labelled by the Rust side, for
 * the snapshot in view (`filter_labels`). The interface reads no key format.
 */
import { useMemo } from "react";
import { api } from "../../api/commands";
import type { Dim } from "../../bindings/Dim";
import type { FilterLabel } from "../../bindings/FilterLabel";
import { useSnapshotQuery } from "../view";
import { isSameDim } from "./dims";
import { useFilters, type FieldEntry, type FilterValue, type Filters } from "./state";

/** The dimensions whose keys are not what the picker shows for them. */
const DERIVED: readonly Dim[] = ["Remark", "Blocker"];

/** Whether a value is known by its key alone, where its key is not its label. */
function isUnlabelled(entry: FieldEntry, value: FilterValue): boolean {
  return (
    value.key !== "" &&
    value.label === value.key &&
    DERIVED.some((dim) => isSameDim(dim, entry.dim))
  );
}

/** The filters with each value known by its key alone under the label the command gave it. */
export function withLabels(filters: Filters, labels: readonly FilterLabel[] | undefined): Filters {
  if (labels === undefined || labels.length === 0) return filters;
  return {
    ...filters,
    fields: filters.fields.map((entry) => ({
      ...entry,
      values: entry.values.map((value) => {
        if (!isUnlabelled(entry, value)) return value;
        const found = labels.find(
          (label) => label.key === value.key && isSameDim(label.dim, entry.dim),
        );
        return found === undefined ? value : { key: value.key, label: found.label };
      }),
    })),
  };
}

/**
 * The filters in view, each value under the label the chips show. The labels the command gives
 * are read only while a value is known by its key alone; until they come, it shows its key.
 */
export function useLabelledFilters(): Filters {
  const { filters, spec } = useFilters();
  const asks = filters.fields.some((entry) =>
    entry.values.some((value) => isUnlabelled(entry, value)),
  );
  const labels = useSnapshotQuery({
    name: "filterLabels",
    params: [spec],
    read: (view, asked) => api.filterLabels(asked, view),
    enabled: asks,
  });
  const answered = asks ? labels.data : undefined;
  return useMemo(() => withLabels(filters, answered), [filters, answered]);
}
