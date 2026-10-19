import { describe, expect, it } from "vitest";
import fileColumns from "../../api/file-columns.json";
import openHolds from "../../api/open-holds-filter.json";
import { defaultFilters, type Filters } from "../../app/filters/state";
import type { FilterSpec } from "../../bindings/FilterSpec";
import en from "../../locales/en.json";
import { stepColumns } from "../blockers/columns";
import { groupColumns } from "../breakdown/ListMode";
import { holdColumns } from "../lines/holdColumns";
import { lineColumns } from "../lines/lineColumns";
import { DEFAULT_CHOICE, type ExportChoice } from "./choices";
import { buildRequest, FILE_COLUMNS, filterTexts, type ScreenState } from "./requests";
import { exportText } from "./text";

const OPEN = openHolds as FilterSpec;
const choice = (overrides: Partial<ExportChoice> = {}): ExportChoice => ({
  ...DEFAULT_CHOICE,
  ...overrides,
});

const LINES: ScreenState = {
  screen: "lines",
  query: { sort: "OldestFirst", single_hold_only: false, size_mismatch_only: false, reverse: true },
};
const HOLDS: ScreenState = { screen: "holds", sort: "Blocker", reverse: false };
const BREAKDOWN: ScreenState = {
  screen: "breakdown",
  dim: "HoldType",
  shownKeys: ["Vendor data", "", "Process data"],
};
const BLOCKERS: ScreenState = { screen: "blockers", shownKeys: ["b3", "b1", "b2"] };

describe("the columns of each screen's file", () => {
  it("are the fixture both sides read", () => {
    expect(FILE_COLUMNS).toEqual({ ...fileColumns, overview: [], matrix: [] });
  });

  it("are the columns of the Lines table", () => {
    expect(lineColumns(10, []).map((column) => column.id)).toEqual(fileColumns.lines);
  });

  it("are the columns of the hold rows among all holds, then the two the file adds", () => {
    expect([
      ...holdColumns(10, [], "All").map((column) => column.id),
      "sourceId",
      "releaseRemark",
    ]).toEqual(fileColumns.holds);
  });

  it("are the columns of the Breakdown list but its share bar, which the file gives as holds", () => {
    const ids = groupColumns("Discipline", 10, 10).map((column) => column.id);
    expect(ids.filter((id) => id !== "share")).toEqual(fileColumns.breakdown);
    expect(ids).toContain("share");
  });

  it("are the columns of the Blockers steps", () => {
    expect(stepColumns().map((column) => column.id)).toEqual(fileColumns.blockers);
  });
});

describe("filterTexts", () => {
  it("is empty for the default filters, and leaves the status to the request", () => {
    expect(filterTexts(defaultFilters)).toEqual([]);
    expect(filterTexts({ ...defaultFilters, status: "Released" })).toEqual([]);
  });

  it("writes each chip as the filter bar does", () => {
    const filters: Filters = {
      ...defaultFilters,
      fields: [
        { dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false },
        {
          dim: { Custom: "Area" },
          values: [
            { key: "North", label: "North" },
            { key: "South", label: "South" },
          ],
          negate: true,
        },
      ],
      text: "577-PR",
    };
    expect(filterTexts(filters)).toEqual([
      `${en.import.field.Discipline} Civil`,
      "Area is not North, South",
      `${en.filters.field.text} “577-PR”`,
    ]);
  });
});

describe("buildRequest", () => {
  it("asks for the Overview's figures, every column and row, under the filters", () => {
    const request = buildRequest({ screen: "overview" }, OPEN, [], choice());
    expect(request).toEqual({
      screen: { kind: "Overview" },
      columns: [],
      rows: { kind: "All" },
      spec: OPEN,
      text: exportText(),
      filters: [],
    });
  });

  it("asks for the lines in the order of the table's query", () => {
    const request = buildRequest(LINES, OPEN, ["Discipline Civil"], choice());
    expect(request.screen).toEqual({
      kind: "Lines",
      query: {
        sort: "OldestFirst",
        single_hold_only: false,
        size_mismatch_only: false,
        reverse: true,
      },
    });
    expect(request.rows).toEqual({ kind: "All" });
    expect(request.filters).toEqual(["Discipline Civil"]);
  });

  it("asks for the loaded lines as the first rows, as many as are loaded", () => {
    const request = buildRequest(LINES, OPEN, [], choice({ rows: "loaded" }), {
      loaded: 400,
      selected: [],
    });
    expect(request.rows).toEqual({ kind: "First", count: 400 });
  });

  it("asks for the selected lines by their keys, in the order of the table", () => {
    const request = buildRequest(LINES, OPEN, [], choice({ rows: "selected" }), {
      loaded: 400,
      selected: ["11-PR-2001", "11-PR-0004", "11-PR-1500"],
    });
    expect(request.rows).toEqual({
      kind: "Keys",
      keys: ["11-PR-2001", "11-PR-0004", "11-PR-1500"],
    });
  });

  it("asks for every row when the selected rows are asked for and none is selected", () => {
    const request = buildRequest(LINES, OPEN, [], choice({ rows: "selected" }), {
      loaded: 400,
      selected: [],
    });
    expect(request.rows).toEqual({ kind: "All" });
  });

  it("asks for every row when the loaded rows are asked for and the table is not known", () => {
    expect(buildRequest(LINES, OPEN, [], choice({ rows: "loaded" })).rows).toEqual({ kind: "All" });
  });

  it("asks for the hold rows by their sort, the loaded ones first, the selected ones by position", () => {
    expect(buildRequest(HOLDS, OPEN, [], choice()).screen).toEqual({
      kind: "Holds",
      sort: "Blocker",
      reverse: false,
    });
    expect(
      buildRequest(HOLDS, OPEN, [], choice({ rows: "loaded" }), { loaded: 200, selected: [] }).rows,
    ).toEqual({ kind: "First", count: 200 });
    expect(
      buildRequest(HOLDS, OPEN, [], choice({ rows: "selected" }), {
        loaded: 200,
        selected: ["17", "3"],
      }).rows,
    ).toEqual({ kind: "Keys", keys: ["17", "3"] });
  });

  it("asks for the groups of a table held whole always by their keys, in the order shown", () => {
    for (const rows of ["all", "loaded"] as const) {
      const request = buildRequest(BREAKDOWN, OPEN, [], choice({ rows }), {
        loaded: 3,
        selected: [],
      });
      expect(request.screen).toEqual({ kind: "Breakdown", dim: "HoldType" });
      expect(request.rows).toEqual({ kind: "Keys", keys: ["Vendor data", "", "Process data"] });
    }
    const selected = buildRequest(BREAKDOWN, OPEN, [], choice({ rows: "selected" }), {
      loaded: 3,
      selected: ["Process data", "Vendor data"],
    });
    expect(selected.rows).toEqual({ kind: "Keys", keys: ["Vendor data", "Process data"] });
  });

  it("asks for the steps of the solve order by their keys, in the order shown", () => {
    const request = buildRequest(BLOCKERS, OPEN, [], choice({ rows: "selected" }), {
      loaded: 3,
      selected: ["b2", "b3"],
    });
    expect(request.screen).toEqual({ kind: "Blockers" });
    expect(request.rows).toEqual({ kind: "Keys", keys: ["b3", "b2"] });
    expect(buildRequest(BLOCKERS, OPEN, [], choice()).rows).toEqual({
      kind: "Keys",
      keys: ["b3", "b1", "b2"],
    });
  });

  it("asks for both cross-tabs of the matrix whole", () => {
    const request = buildRequest(
      { screen: "matrix", rows: "Discipline", cols: "HoldType" },
      OPEN,
      [],
      choice({ columns: ["label"], rows: "selected" }),
      { loaded: 0, selected: ["x"] },
    );
    expect(request.screen).toEqual({ kind: "Matrix", rows: "Discipline", cols: "HoldType" });
    expect(request.columns).toEqual([]);
    expect(request.rows).toEqual({ kind: "All" });
  });

  it("writes the chosen columns in table order, without those the screen does not have", () => {
    const request = buildRequest(LINES, OPEN, [], choice({ columns: ["oldest", "gone", "line"] }));
    expect(request.columns).toEqual(["line", "oldest"]);
    expect(buildRequest(LINES, OPEN, [], choice()).columns).toEqual([]);
  });

  it("keeps the status of the filters, and names it among the filters when it is not Open", () => {
    const released: FilterSpec = { ...OPEN, status: "Released" };
    const request = buildRequest(LINES, released, ["Discipline Civil"], choice());
    expect(request.spec.status).toBe("Released");
    expect(request.filters).toEqual([
      en.filters.status.name.replace("{{status}}", en.filters.status.Released),
      "Discipline Civil",
    ]);
    expect(buildRequest(LINES, OPEN, ["Discipline Civil"], choice()).filters).toEqual([
      "Discipline Civil",
    ]);
  });

  it("puts the chosen status in place of the filters' for the export only", () => {
    const spec: FilterSpec = { ...OPEN, text: "577" };
    const all = buildRequest(LINES, spec, [], choice({ status: "All" }));
    expect(all.spec).toEqual({ ...spec, status: "All" });
    expect(all.filters).toEqual([
      en.filters.status.name.replace("{{status}}", en.filters.status.All),
    ]);
    expect(spec.status).toBe("Open");
    const open = buildRequest(
      LINES,
      { ...OPEN, status: "Released" },
      [],
      choice({ status: "Open" }),
    );
    expect(open.spec.status).toBe("Open");
    expect(open.filters).toEqual([]);
  });
});
