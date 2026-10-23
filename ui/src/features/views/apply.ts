// What a saved view is on screen (owner, 2026-10-19; DESIGN.md, "Saved views"):
//
// - its address is the address of a data screen without its selection: `line`, `hold`,
//   `blocker`, and on Breakdown the groups that are open (`open`), which are a selection too.
//   It is written by the screen's own address module from the state it reads, so the same
//   screen has one address however it was reached;
// - applying it sets the filters of the workspace to its filters, then opens its address;
// - it is current while the address shown, its selection left out, and the filters are its own.
//
// A saved view keeps the keys of its filter values, and not the labels they were picked under.
// The labels a chip shows come back from the filters the view was saved or last applied with in
// this session, then from the filters on screen, and otherwise are the keys themselves, as the
// picker shows a ticked value the snapshot does not list.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { keys } from "../../api/keys";
import { isSameDim } from "../../app/filters/dims";
import { useFilters, type Filters } from "../../app/filters/state";
import { toSpec } from "../../app/filters/spec";
import { useShell } from "../../app/shell/context";
import type { Dim } from "../../bindings/Dim";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { SavedView } from "../../bindings/SavedView";
import { t } from "../../text/i18n";
import { BLOCKERS_PATH, searchWithStepSort, stepSort } from "../blockers/address";
import { BREAKDOWN_PATH, breakdownAddress, parseBreakdownAddress } from "../breakdown/address";
import { LINES_PATH, linesAddress, parseLinesAddress } from "../lines/address";

/** The parts of an address that select something on the page rather than say what it shows. */
const SELECTION = new Set(["line", "hold", "blocker"]);

/** The longest name a saved view may have, in characters (decision 6 of the plan). */
export const NAME_LIMIT = 80;

/** The key of one `key=value` part of a query, decoded; one that cannot be decoded, as written. */
function keyOf(part: string): string {
  const [raw = ""] = part.split("=", 1);
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

/**
 * The address of a screen that has no address module: the path, and the query without what
 * selects, the other parts as the page wrote them.
 */
function withoutSelection(pathname: string, search: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const kept = query.split("&").filter((part) => part !== "" && !SELECTION.has(keyOf(part)));
  return kept.length === 0 ? pathname : `${pathname}?${kept.join("&")}`;
}

/**
 * The address a view keeps of the screen at an address: the state its screen reads from it,
 * written again by the screen's own address module, without the selection (a line, a hold, a
 * blocker, and Breakdown's open groups) and without any part the screen does not read. Two
 * spellings of the same screen give the same address: Breakdown at `/breakdown` and at
 * `/breakdown?mode=list&by=Discipline` is one screen, and its address is the second.
 */
export function viewAddress(pathname: string, search: string): string {
  switch (pathname) {
    case BREAKDOWN_PATH:
      return breakdownAddress({ ...parseBreakdownAddress(search), open: [] });
    case LINES_PATH:
      return linesAddress(parseLinesAddress(search));
    case BLOCKERS_PATH:
      return `${BLOCKERS_PATH}${searchWithStepSort("", stepSort(search))}`;
    default:
      return withoutSelection(pathname, search);
  }
}

/** The path of an address. */
export function pathOf(address: string): string {
  const at = address.indexOf("?");
  return at === -1 ? address : address.slice(0, at);
}

/** The search text of an address: `?` and what follows, or nothing. */
function searchOf(address: string): string {
  const at = address.indexOf("?");
  return at === -1 ? "" : address.slice(at);
}

/** The parts of an address's query, decoded, in an order that does not depend on its spelling. */
function partsOf(address: string): string[] {
  return [...new URLSearchParams(searchOf(address)).entries()]
    .map(([key, value]) => `${key}\u0000${value}`)
    .sort();
}

/**
 * Whether two addresses are the same screen: the state their screen reads from them is the same,
 * their selection left out. A screen without an address module compares the parts of its query,
 * however each was encoded and in whatever order.
 */
export function isSameAddress(one: string, other: string): boolean {
  const a = viewAddress(pathOf(one), searchOf(one));
  const b = viewAddress(pathOf(other), searchOf(other));
  if (pathOf(a) !== pathOf(b)) return false;
  const x = partsOf(a);
  const y = partsOf(b);
  return x.length === y.length && x.every((part, index) => part === y[index]);
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

/** The label a value of a dimension was picked under in the first of these filters that has it. */
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
