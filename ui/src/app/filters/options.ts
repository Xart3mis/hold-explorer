/**
 * What the filter bar offers for the filters in view: the counts of each choice and the fields the
 * snapshot has no value for. The bar, the Lines page, and the detail panel read it, through this
 * one hook, so they share one reading of the command and cannot drift apart in how they ask.
 */
import type { UseQueryResult } from "@tanstack/react-query";
import { api } from "../../api/commands";
import type { FilterOptions } from "../../bindings/FilterOptions";
import { useSnapshotQuery } from "../view";
import { useFilters } from "./state";

/** The filter options of the snapshot in view under the filters in view. `enabled: false` reads nothing. */
export function useFilterOptions({
  enabled = true,
}: { enabled?: boolean } = {}): UseQueryResult<FilterOptions> {
  const { spec } = useFilters();
  return useSnapshotQuery({
    name: "filterOptions",
    params: [spec],
    read: (view, asked) => api.filterOptions(asked, view),
    enabled,
  });
}
