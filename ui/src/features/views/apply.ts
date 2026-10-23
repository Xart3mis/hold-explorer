// What a saved view is on screen (owner, 2026-10-19; DESIGN.md, "Saved views"):
//
// - its address is the address of a data screen without its selection: `line`, `hold`,
//   `blocker`, and on Breakdown the groups that are open (`open`), which are a selection too;
// - applying it sets the filters of the workspace to its filters, then opens its address;
// - it is current while the address shown, its selection left out, and the filters are its own.
//
// A saved view keeps the keys of its filter values, and not the labels they were picked under.
// The labels a chip shows come back from the filters the view was saved or last applied with in
// this session, then from the filters on screen, and otherwise are the keys themselves, as the
// picker shows a ticked value the snapshot does not list.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { asCommandError } from "../../api/error";
import { keys } from "../../api/keys";
import { useSavedViews } from "../../app/actions/views";
import { isSameDim } from "../../app/filters/dims";
import { useFilters, type Filters } from "../../app/filters/state";
import { toSpec } from "../../app/filters/spec";
import { useShell } from "../../app/shell/context";
import type { Dim } from "../../bindings/Dim";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { SavedView } from "../../bindings/SavedView";
import { useToast } from "../../components";
import { t } from "../../text/i18n";

/** The parts of an address that select something on the page rather than say what it shows. */
const SELECTION = new Set(["line", "hold", "blocker"]);
/** Breakdown's expanded groups: a selection on that page alone. */
const BREAKDOWN_OPEN = { path: "/breakdown", key: "open" };

/** The longest name a saved view may have, in characters (decision 6 of the plan). */
export const NAME_LIMIT = 80;

/** The key of one `key=value` part of a query, decoded. A part that cannot be decoded is its text. */
function keyOf(part: string): string {
  const [raw = ""] = part.split("=", 1);
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function isSelection(pathname: string, key: string): boolean {
  return SELECTION.has(key) || (pathname === BREAKDOWN_OPEN.path && key === BREAKDOWN_OPEN.key);
}

/**
 * The address a view saves from the address shown: the path, and the query without what selects.
 * The other parts are kept as the page wrote them, in their order.
 */
export function viewAddress(pathname: string, search: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const kept = query
    .split("&")
    .filter((part) => part !== "" && !isSelection(pathname, keyOf(part)));
  return kept.length === 0 ? pathname : `${pathname}?${kept.join("&")}`;
}

/** The path of an address. */
export function pathOf(address: string): string {
  const at = address.indexOf("?");
  return at === -1 ? address : address.slice(0, at);
}

/** The parts of an address's query, decoded, in an order that does not depend on how it was written. */
function partsOf(address: string): string[] {
  const at = address.indexOf("?");
  const query = at === -1 ? "" : address.slice(at + 1);
  return [...new URLSearchParams(query).entries()]
    .map(([key, value]) => `${key}\u0000${value}`)
    .sort();
}

/**
 * Whether two addresses open the same screen: the same path and the same parts, however each was
 * encoded and in whatever order. A page writes its whole query again when a row is selected, so
 * the same parts may come back spelled another way.
 */
export function isSameAddress(one: string, other: string): boolean {
  if (pathOf(one) !== pathOf(other)) return false;
  const a = partsOf(one);
  const b = partsOf(other);
  return a.length === b.length && a.every((part, index) => part === b[index]);
}

/** Whether two values that came from JSON are the same, whatever the order of their keys. */
function isSameValue(one: unknown, other: unknown): boolean {
  if (one === other) return true;
  if (typeof one !== "object" || typeof other !== "object" || one === null || other === null) {
    return false;
  }
  if (Array.isArray(one) || Array.isArray(other)) {
    return (
      Array.isArray(one) &&
      Array.isArray(other) &&
      one.length === other.length &&
      one.every((item, index) => isSameValue(item, other[index]))
    );
  }
  const a = Object.entries(one);
  const b = new Map(Object.entries(other));
  return (
    a.length === b.size && a.every(([key, value]) => b.has(key) && isSameValue(value, b.get(key)))
  );
}

/** Whether two filters keep the same holds as the commands read them. */
export function isSameSpec(one: FilterSpec, other: FilterSpec): boolean {
  return isSameValue(one, other);
}

/** The label a value of a dimension was picked under in one of these filters, the first that has it. */
function labelIn(known: readonly Filters[], dim: Dim, key: string): string | undefined {
  for (const filters of known) {
    const entry = filters.fields.find((held) => isSameDim(held.dim, dim));
    const value = entry?.values.find((held) => held.key === key);
    if (value !== undefined) return value.label;
  }
  return undefined;
}

/**
 * The filters a view sets, with each value under the label it has in the first of `known` that
 * has it, and otherwise under its key: "(blank)" for the empty key, as the chips write it.
 */
export function filtersOf(spec: FilterSpec, known: readonly Filters[]): Filters {
  return {
    status: spec.status,
    fields: spec.fields
      .filter((entry) => entry.values.length > 0)
      .map((entry) => ({
        dim: entry.dim,
        values: entry.values.map((key) => ({
          key,
          label: labelIn(known, entry.dim, key) ?? (key === "" ? t("common.blank") : key),
        })),
        negate: entry.negate,
      })),
    text: spec.text,
    ageBands: spec.age_bands.map((band) => ({ ...band })),
    created: { ...spec.created },
    released: { ...spec.released },
    sizeMismatch: spec.size_mismatch,
  };
}

/** A name cut to the characters a saved view may have. */
export function withinLimit(name: string): string {
  return Array.from(name).slice(0, NAME_LIMIT).join("");
}

/** Whether a view is the screen shown: its address, the selection left out, and its filters. */
export function isCurrentView(
  view: SavedView,
  place: { pathname: string; search: string },
  spec: FilterSpec,
): boolean {
  return (
    isSameAddress(view.address, viewAddress(place.pathname, place.search)) &&
    isSameSpec(view.filters, spec)
  );
}

/**
 * The way to apply a view: the filters of the workspace become the view's, the page whose
 * destination is the view's is drawn anew (as a second press on a destination draws it), and the
 * view's address opens. `onRestart` draws the page anew.
 */
export function useApplyView(onRestart: () => void): (view: SavedView) => void {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { filters, set } = useFilters();
  const { start } = useShell();
  const workspace = start.open?.workspace.id ?? null;
  return useCallback(
    (view: SavedView) => {
      if (workspace === null) return;
      const key = keys.savedViewFilters(workspace, view.id);
      const remembered = client.getQueryData<Filters>(key);
      const next =
        remembered !== undefined && isSameSpec(toSpec(remembered), view.filters)
          ? remembered
          : filtersOf(view.filters, remembered === undefined ? [filters] : [remembered, filters]);
      client.setQueryData<Filters>(key, next);
      set(next);
      if (pathOf(view.address) === pathname) onRestart();
      void navigate(view.address);
    },
    [client, navigate, pathname, filters, set, workspace, onRestart],
  );
}

/** Keeps the filters a view was saved with, labels and all, for when it is applied in this session. */
export function useRememberFilters(): (workspace: string, id: number, filters: Filters) => void {
  const client = useQueryClient();
  return useCallback(
    (workspace: string, id: number, filters: Filters) => {
      client.setQueryData<Filters>(keys.savedViewFilters(workspace, id), filters);
    },
    [client],
  );
}

/**
 * The toasts of the saved views: what was done, the Undo of a delete, and what failed. An Undo
 * belongs to the workspace it was offered in, and its toast goes when another workspace opens.
 */
export function useViewToasts() {
  const toast = useToast();
  const { start } = useShell();
  const { deleteView, restoreView } = useSavedViews();
  const workspace = start.open?.workspace.id ?? null;
  const offered = useRef<{ toast: string; workspace: string }[]>([]);
  useEffect(() => {
    const [stays, goes] = [
      offered.current.filter((held) => held.workspace === workspace),
      offered.current.filter((held) => held.workspace !== workspace),
    ];
    for (const held of goes) toast.dismiss(held.toast);
    offered.current = stays;
  }, [workspace, toast]);

  /** Says that something failed, in the words of the command. */
  const failed = useCallback(
    (error: unknown) => {
      toast.show({ message: asCommandError(error).message });
    },
    [toast],
  );

  /**
   * Deletes a view at once and offers to put it back where it was. `onDone` is called once the
   * view is gone.
   */
  const remove = useCallback(
    (owner: string, view: SavedView, index: number, onDone?: () => void) => {
      // Each call answers on its own promise: two deletes in a row each get their toast.
      void deleteView.mutateAsync({ workspace: owner, id: view.id }).then(() => {
        onDone?.();
        const shown = toast.show({
          message: t("views.deleted", { name: view.name }),
          action: {
            label: t("common.undo"),
            isUndo: true,
            onAction: () => {
              offered.current = offered.current.filter((held) => held.toast !== shown);
              void restoreView.mutateAsync({ workspace: owner, view, index }).catch(failed);
            },
          },
        });
        offered.current = [...offered.current, { toast: shown, workspace: owner }];
      }, failed);
    },
    [deleteView, restoreView, toast, failed],
  );

  return { remove, failed, toast };
}
