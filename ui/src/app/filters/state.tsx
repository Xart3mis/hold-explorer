/**
 * The filters every data screen shares. The user builds them in the filter bar; the screens send
 * them to the commands as a `FilterSpec` (`toSpec`), and the Rust side decides what they match.
 *
 * A filter that needs a column the snapshot in view has no value in stays as the user set it, but
 * is not sent (`toSpec`) until a snapshot has the column again. Which columns the snapshot lacks
 * is what any answer of its filter options says (`absent`); before one is there, none.
 *
 * They belong to a workspace for the session. They are kept in the query client, under the id of
 * the workspace, beside what the commands returned for it: opening another workspace shows that
 * workspace's filters of this session, or the default, and selecting another snapshot keeps them.
 * Nothing writes them to disk, so an app that starts has the default for every workspace.
 *
 * The query client keeps what it holds wherever a new value says the same, so filters that are
 * set to what they already are stay the same object, and their spec with them.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { openHoldsFilter } from "../../api/filter";
import { keys } from "../../api/keys";
import type { AgeBand } from "../../bindings/AgeBand";
import type { DateRange } from "../../bindings/DateRange";
import type { Dim } from "../../bindings/Dim";
import type { Field } from "../../bindings/Field";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { Status } from "../../bindings/Status";
import { useCached } from "../query";
import { isSameDim } from "./dims";
import { useShell } from "../shell/context";
import { useAbsentColumns } from "../view";
import { toSpec } from "./spec";

/** One value of a dimension: the key the command takes, and the label it was picked under. */
export interface FilterValue {
  key: string;
  label: string;
}

/** The filter on one dimension: the values kept, or with `negate` the values left out. */
export interface FieldEntry {
  dim: Dim;
  values: readonly FilterValue[];
  negate: boolean;
}

export interface Filters {
  status: Status;
  /** One entry per dimension, in the order they were added. */
  fields: readonly FieldEntry[];
  /** Empty for no text filter. */
  text: string;
  /** Empty for no age filter. */
  ageBands: readonly AgeBand[];
  created: DateRange;
  released: DateRange;
  /** `null` for no filter on the sizes. */
  sizeMismatch: boolean | null;
}

/** No column: what is absent before the filter options of the snapshot in view say otherwise. */
const NONE: readonly Field[] = [];

/** The default spec, which says what the default filters are: `openHoldsFilter` defines both. */
const open = openHoldsFilter();

/** The open holds, and nothing else: what a workspace has until the user sets something. */
export const defaultFilters: Filters = {
  status: open.status,
  fields: [],
  text: open.text,
  ageBands: open.age_bands,
  created: open.created,
  released: open.released,
  sizeMismatch: open.size_mismatch,
};

/** Whether the filters keep what the default keeps. An entry without values filters nothing. */
function isDefault(filters: Filters): boolean {
  return (
    filters.status === defaultFilters.status &&
    filters.fields.every((entry) => entry.values.length === 0) &&
    filters.text === "" &&
    filters.ageBands.length === 0 &&
    filters.created.from === null &&
    filters.created.to === null &&
    filters.released.from === null &&
    filters.released.to === null &&
    filters.sizeMismatch === null
  );
}

/**
 * The filters with the values of one dimension set: in the place its entry has, or after the
 * others when it has none. Without values the dimension has no entry: nothing is filtered by it.
 */
export function withValues(
  filters: Filters,
  dim: Dim,
  values: readonly FilterValue[],
  negate: boolean,
): Filters {
  const isIts = (entry: { dim: Dim }) => isSameDim(entry.dim, dim);
  if (values.length === 0) {
    return { ...filters, fields: filters.fields.filter((entry) => !isIts(entry)) };
  }
  const entry = { dim, values, negate };
  return {
    ...filters,
    fields: filters.fields.some(isIts)
      ? filters.fields.map((held) => (isIts(held) ? entry : held))
      : [...filters.fields, entry],
  };
}

export interface FiltersState {
  filters: Filters;
  /**
   * The filter as the commands take it, without the filters on columns in `absent`. The same
   * object while the filters are the same and the same of them are left out.
   */
  spec: FilterSpec;
  /** The columns the snapshot in view has no value in, once its filter options say so. */
  absent: readonly Field[];
  /** Whether the filters keep what the default keeps: the open holds. */
  isDefault: boolean;
  set: (next: Filters) => void;
  update: (change: (current: Filters) => Filters) => void;
  /** Sets the default again, the status included. */
  clear: () => void;
}

/**
 * The filters of the open workspace, and the ways to change them. Every reader inside the shell
 * sees the same ones. Without an open workspace they are the default and cannot be changed:
 * there is nothing to filter.
 */
export function useFilters(): FiltersState {
  const client = useQueryClient();
  const { start } = useShell();
  const workspaceId = start.open?.workspace.id ?? null;
  const filters =
    useCached((cache) =>
      workspaceId === null
        ? undefined
        : cache.getQueryData<Filters>(keys.workspaceFilters(workspaceId)),
    ) ?? defaultFilters;

  const update = useCallback(
    (change: (current: Filters) => Filters) => {
      if (workspaceId === null) return;
      client.setQueryData<Filters>(keys.workspaceFilters(workspaceId), (held) =>
        change(held ?? defaultFilters),
      );
    },
    [client, workspaceId],
  );
  const set = useCallback(
    (next: Filters) => {
      update(() => next);
    },
    [update],
  );
  const clear = useCallback(() => {
    set(defaultFilters);
  }, [set]);

  const absent = useAbsentColumns() ?? NONE;

  return {
    filters,
    spec: toSpec(filters, absent),
    absent,
    isDefault: isDefault(filters),
    set,
    update,
    clear,
  };
}
