import { describe, expect, it } from "vitest";
import { defaultFilters } from "../../app/filters/state";
import { searchHit } from "../../test/search";
import { effectOf } from "./choose";

const at = (pathname: string) => ({ pathname });

describe("effectOf", () => {
  it("opens a line in the panel over the lines, and a blocker on Blockers", () => {
    const line = effectOf(
      { kind: "hit", hit: searchHit("Line", "78B04-573", "78B04-|573|") },
      at("/settings"),
    );
    expect(line).toMatchObject({
      address: "/lines?line=78B04-573",
      filters: null,
      selection: { kind: "line", lineId: "78B04-573" },
      focus: "heading",
    });
    const blocker = effectOf(
      { kind: "hit", hit: searchHit("Blocker", "Piping|573-PR-1", "Piping / |573|-PR-1") },
      at("/lines"),
    );
    expect(blocker).toMatchObject({
      address: "/blockers?blocker=Piping%7C573-PR-1",
      selection: { kind: "blocker", key: "Piping|573-PR-1" },
      focus: "heading",
    });
  });

  it.each([
    ["Person", "Name"],
    ["Role", "Role"],
    ["Remark", "Remark"],
    ["HoldType", "HoldType"],
    ["Discipline", "Discipline"],
    ["StressCalc", "StressCalc"],
  ] as const)("filters by a %s on its field, %s, and opens the holds", (kind, dim) => {
    const effect = effectOf(
      { kind: "hit", hit: searchHit(kind, "KEY", "the |shown| text") },
      at("/overview"),
    );
    expect(effect.address).toBe("/lines?rows=holds");
    expect(effect.focus).toBe("table");
    const before = {
      ...defaultFilters,
      fields: [{ dim, values: [{ key: "Old", label: "Old" }], negate: true }],
    };
    expect(effect.filters?.(before).fields).toEqual([
      { dim, values: [{ key: "KEY", label: "the shown text" }], negate: false },
    ]);
  });

  it("sets the text filter of a data screen in place, and of Lines from elsewhere", () => {
    for (const path of ["/overview", "/breakdown", "/lines", "/blockers"]) {
      const effect = effectOf({ kind: "text", query: " 573 " }, at(path));
      expect(effect.address).toBeNull();
      expect(effect.filters?.(defaultFilters).text).toBe("573");
    }
    for (const path of ["/settings", "/history", "/welcome"]) {
      expect(effectOf({ kind: "text", query: "573" }, at(path)).address).toBe("/lines");
    }
  });

  it("opens Lines or Blockers for more of a group, and stays when that page is shown", () => {
    expect(effectOf({ kind: "more", group: "People", query: "tan" }, at("/overview")).address).toBe(
      "/lines",
    );
    expect(
      effectOf({ kind: "more", group: "Holds", query: "tan" }, at("/lines")).address,
    ).toBeNull();
    expect(
      effectOf({ kind: "more", group: "Blockers", query: "573" }, at("/overview")).address,
    ).toBe("/blockers");
    expect(
      effectOf({ kind: "more", group: "Blockers", query: "573" }, at("/blockers")).address,
    ).toBeNull();
  });
});
