import type { SearchGroup } from "../bindings/SearchGroup";
import type { SearchHit } from "../bindings/SearchHit";
import type { SearchResults } from "../bindings/SearchResults";
import type { TextPart } from "../bindings/TextPart";

/** A shown text whose runs between `|` alternate, unmarked first: `"78B04-|573|-PR"`. */
export function partsOf(text: string): TextPart[] {
  return text
    .split("|")
    .map((run, index) => ({ text: run, matched: index % 2 === 1 }))
    .filter((part) => part.text !== "");
}

/** A result as the command answers one. */
export function searchHit(
  kind: SearchHit["kind"],
  value: string,
  shown: string,
  overrides: Partial<Omit<SearchHit, "kind" | "value" | "parts">> = {},
): SearchHit {
  return {
    kind,
    value,
    // As the command labels it: the whole text shown (a blocker's `<discipline> / <item>`, a
    // remark as written), unless the test says otherwise.
    label: shown.split("|").join(""),
    parts: partsOf(shown),
    detail: "",
    holds: 1,
    released: false,
    ...overrides,
  };
}

/** The groups the tests find for any query of two characters or more: one of every kind. */
export function searchGroups(): SearchGroup[] {
  return [
    {
      kind: "Lines",
      total: 12,
      hits: [
        searchHit("Line", "78B04-573-00004-PR-004", "78B04-|573|-00004-PR-004", { holds: 6 }),
        searchHit("Line", "78B02-573-00195-PR-006", "78B02-|573|-00195-PR-006", {
          holds: 2,
          released: true,
        }),
      ],
    },
    {
      kind: "Blockers",
      total: 1,
      hits: [searchHit("Blocker", "Piping|573-PR-1450", "Piping / |573|-PR-1450", { holds: 9 })],
    },
    {
      kind: "People",
      total: 2,
      hits: [
        searchHit("Person", "R. Tanaka", "R. |Tan|aka", { holds: 31, detail: "Checker" }),
        searchHit("Role", "Checker", "|Che|cker", { holds: 40 }),
      ],
    },
    {
      kind: "Remarks",
      total: 3,
      hits: [searchHit("Remark", "HOLD PENDING 573-PR-1450", "HOLD PENDING |573|-PR-1450")],
    },
    {
      kind: "Holds",
      total: 1,
      hits: [searchHit("HoldType", "Process data", "|Process| data", { holds: 1041 })],
    },
  ];
}

/** What the search command answers for a query: nothing below two characters, as it does. */
export function searchResults(query: string): SearchResults {
  return { query, groups: query.trim().length < 2 ? [] : searchGroups() };
}
