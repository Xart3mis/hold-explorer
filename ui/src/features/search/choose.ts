// What choosing in the search field does (owner, 2026-10-19; DESIGN.md, "Search field"):
//
// - a line opens Lines with the line in the detail panel;
// - a blocker opens Blockers with the blocker in the panel;
// - a person, a role, a remark, or a hold value becomes the filter of its field, in place of the
//   values that field was filtered by, and Lines opens in a row per hold;
// - "N more in Lines" sets the text as the text filter and opens Lines, "N more in Blockers" the
//   same on Blockers;
// - Enter with no result highlighted sets the text as the text filter of the data destination
//   shown, or of Lines from any other page.
//
// The addresses are those the screens write (their address modules), and the filters are set
// through the filters of the workspace, as Overview's links set them. The command palette chooses
// a line the same way, through `useSearchChoice`.
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { destinations } from "../../app/destinations";
import { useFilters, withValues, type Filters } from "../../app/filters/state";
import { selectionOf, type Selection } from "../../app/selection";
import type { Dim } from "../../bindings/Dim";
import type { SearchGroupKind } from "../../bindings/SearchGroupKind";
import type { SearchHit } from "../../bindings/SearchHit";
import type { SearchKind } from "../../bindings/SearchKind";
import type { TextPart } from "../../bindings/TextPart";
import { BLOCKERS_PATH, blockersAddress } from "../blockers/address";
import { useDetailFocus } from "../detail/selection";
import {
  DEFAULT_HOLDS_STATE,
  DEFAULT_LINES_STATE,
  LINES_PATH,
  linesAddress,
  withSelection,
} from "../lines/address";

/** What was chosen: a result, the last item of a group that has more, or the text itself. */
export type SearchChoice =
  | { kind: "hit"; hit: SearchHit }
  | { kind: "more"; group: SearchGroupKind; query: string }
  | { kind: "text"; query: string };

/** The kinds of result that are a value of a field: choosing one filters by it. */
export type ValueKind = Exclude<SearchKind, "Line" | "Blocker">;

/** The field each value kind filters. */
export const DIM_OF_KIND: Record<ValueKind, Dim> = {
  Person: "Name",
  Role: "Role",
  Remark: "Remark",
  HoldType: "HoldType",
  Discipline: "Discipline",
  StressCalc: "StressCalc",
};

/** Whether a kind of result is a value of a field. */
export function isValueKind(kind: SearchKind): kind is ValueKind {
  return kind !== "Line" && kind !== "Blocker";
}

/** The text a result shows, its parts put together. */
export function textOf(parts: readonly TextPart[]): string {
  return parts.map((part) => part.text).join("");
}

/** What a choice does, worked out from where the user is. */
export interface ChoiceEffect {
  /** The address to open; `null` to stay on the page shown. */
  address: string | null;
  /** How the filters change; `null` when they stay as they are. */
  filters: ((current: Filters) => Filters) | null;
  /** The selection the address opens in the detail panel; `null` for none. */
  selection: Selection;
  /** Where the focus goes once the page is there: the heading of the panel, or the table. */
  focus: "heading" | "table";
}

/** Where the user is when they choose. */
export interface ChoicePlace {
  pathname: string;
}

/** The data destinations that are built: the pages a text filter is set on in place. */
function isDataPage(pathname: string): boolean {
  return destinations.some(
    (destination) =>
      destination.group === "data" && destination.available && destination.path === pathname,
  );
}

/** The filters with this text as the text filter. */
function withText(text: string): (current: Filters) => Filters {
  return (current) => ({ ...current, text });
}

/** What a choice does from a place; see the top of this file. */
export function effectOf(choice: SearchChoice, { pathname }: ChoicePlace): ChoiceEffect {
  if (choice.kind === "text") {
    return {
      address: isDataPage(pathname) ? null : linesAddress(DEFAULT_LINES_STATE),
      filters: withText(choice.query.trim()),
      selection: null,
      focus: "table",
    };
  }
  if (choice.kind === "more") {
    const onBlockers = choice.group === "Blockers";
    const path = onBlockers ? BLOCKERS_PATH : LINES_PATH;
    return {
      // The page that is open already stays as it is: its mode and its sort are kept.
      address:
        pathname === path
          ? null
          : onBlockers
            ? blockersAddress()
            : linesAddress(DEFAULT_LINES_STATE),
      filters: withText(choice.query.trim()),
      selection: null,
      focus: "table",
    };
  }
  const { hit } = choice;
  if (hit.kind === "Line") {
    return {
      address: linesAddress(DEFAULT_LINES_STATE, withSelection("", "lines", hit.value)),
      filters: null,
      selection: { kind: "line", lineId: hit.value },
      focus: "heading",
    };
  }
  if (hit.kind === "Blocker") {
    return {
      address: blockersAddress(hit.value),
      filters: null,
      selection: { kind: "blocker", key: hit.value },
      focus: "heading",
    };
  }
  const dim = DIM_OF_KIND[hit.kind];
  const value = { key: hit.value, label: textOf(hit.parts) };
  return {
    address: linesAddress(DEFAULT_HOLDS_STATE),
    // The value takes the place of what the field was filtered by.
    filters: (current) => withValues(current, dim, [value], false),
    selection: null,
    focus: "table",
  };
}

function isSameSelection(one: Selection, other: Selection): boolean {
  if (one === null || other === null) return one === other;
  if (one.kind === "line" && other.kind === "line") return one.lineId === other.lineId;
  if (one.kind === "blocker" && other.kind === "blocker") return one.key === other.key;
  if (one.kind === "hold" && other.kind === "hold") return one.position === other.position;
  return false;
}

/** The table of the page shown, in the content area; `null` while it has none. */
function pageTable(): HTMLElement | null {
  return document.querySelector<HTMLElement>("main [role='grid'], main [role='treegrid']");
}

/**
 * Takes the focus to the table of the page: at once when it is there, and otherwise, when
 * `waits`, as soon as the page draws it. It gives up waiting when the focus has been moved
 * elsewhere meanwhile, as the user may do before a page is drawn. Returns the way to stop waiting.
 */
function focusTable(waits: boolean): () => void {
  const from = document.activeElement;
  const take = (): boolean => {
    const table = pageTable();
    if (table === null) return false;
    table.focus();
    return true;
  };
  if (take() || !waits) return () => undefined;
  const moved = () => document.activeElement !== from && document.activeElement !== document.body;
  const observer = new MutationObserver(() => {
    if (moved() || take()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
  };
}

/**
 * The way to carry out a choice of the search field: the filters set through the filters of the
 * workspace, the page opened at the address its screen writes, and the focus taken to the heading
 * of the panel that opens, or to the table of the page.
 */
export function useSearchChoice(): (choice: SearchChoice) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const { update } = useFilters();
  const detailFocus = useDetailFocus();
  // Where the focus goes once the page the choice opened has been drawn.
  const pending = useRef<"table" | "heading" | null>(null);

  useEffect(() => {
    const next = pending.current;
    pending.current = null;
    if (next === null) return undefined;
    // A page that is opened takes the focus to its title as it arrives (ui/src/app/shell/Page.tsx).
    // The focus moves on once it has, on the next frame, and the page then leaves it where it is.
    let stop: () => void = () => undefined;
    const frame = window.requestAnimationFrame(() => {
      if (next === "heading") detailFocus.focusHeading();
      else stop = focusTable(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      stop();
    };
  }, [location, detailFocus]);

  return useCallback(
    (choice: SearchChoice) => {
      const effect = effectOf(choice, { pathname: location.pathname });
      if (effect.filters !== null) update(effect.filters);
      if (effect.focus === "heading") {
        // The panel takes the focus to its heading when it shows another selection; when it
        // shows this one already it is not drawn anew, and is not asked. Either way the heading
        // is focused again once the page has arrived, which takes the focus to its own title.
        const isShown =
          isDataPage(location.pathname) &&
          isSameSelection(selectionOf(location.search), effect.selection);
        if (!isShown) detailFocus.askForHeading();
        pending.current = "heading";
      } else if (effect.address === null) {
        // The page stays: its table, when it has one, takes the focus now.
        focusTable(false);
      } else {
        pending.current = "table";
      }
      if (effect.address !== null) void navigate(effect.address);
    },
    [location, update, detailFocus, navigate],
  );
}
