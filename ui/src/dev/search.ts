// What the development page answers for the `search` command: a small fixed result in the shape
// the command returns, with values like those of the other development answers, whatever the
// query. A query shorter than two characters finds nothing, as the command's does. For
// development only; see ui/src/dev/app.tsx.
import type { SearchHit } from "../bindings/SearchHit";
import type { SearchResults } from "../bindings/SearchResults";
import type { TextPart } from "../bindings/TextPart";

/** A shown text: the runs between `|` alternate, unmarked first. */
function partsOf(text: string): TextPart[] {
  return text
    .split("|")
    .map((run, index) => ({ text: run, matched: index % 2 === 1 }))
    .filter((part) => part.text !== "");
}

function hit(
  kind: SearchHit["kind"],
  value: string,
  shown: string,
  holds: number,
  detail = "",
  released = false,
): SearchHit {
  return { kind, value, parts: partsOf(shown), detail, holds, released };
}

/** The fixed answer, with `query` as asked. */
export function devSearch(query: string): SearchResults {
  if (query.trim().length < 2) return { query, groups: [] };
  return {
    query,
    groups: [
      {
        kind: "Lines",
        total: 14,
        hits: [
          hit("Line", "78B04-573-00004-PR-004", "78B04-|573-PR|-00004-PR-004", 6),
          hit("Line", "78B09-573-00097-PR-007", "78B09-|573-PR|-00097-PR-007", 3),
          hit("Line", "78B02-573-00195-PR-006", "78B02-|573-PR|-00195-PR-006", 1, "", true),
        ],
      },
      {
        kind: "Blockers",
        total: 2,
        hits: [
          hit("Blocker", "Process|573-PR-1450", "Process / |573-PR|-1450", 9),
          hit("Blocker", "Piping|573-PR-1022", "Piping / |573-PR|-1022", 4),
        ],
      },
      {
        kind: "People",
        total: 1,
        hits: [hit("Person", "R. Tanaka", "R. |Tanaka|", 31, "Checker")],
      },
      {
        kind: "Remarks",
        total: 2,
        hits: [
          hit("Remark", "HOLD PENDING 573-PR-1450", "HOLD PENDING |573-PR|-1450", 9),
          hit("Remark", "HOLD PENDING 573-PR-1022", "HOLD PENDING |573-PR|-1022", 4),
        ],
      },
      {
        kind: "Holds",
        total: 2,
        hits: [
          hit("HoldType", "Process data", "|Process| data", 1041),
          hit("Discipline", "Process", "|Process|", 913),
        ],
      },
    ],
  };
}
