import { describe, expect, it } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { defaultFilters, type Filters } from "../../app/filters/state";
import type { FilterSpec } from "../../bindings/FilterSpec";
import en from "../../locales/en.json";
import {
  filtersOf,
  isCurrentView,
  isSameAddress,
  isSameSpec,
  viewAddress,
  withinLimit,
} from "./apply";

describe("the address a view saves", () => {
  it("leaves out a line, a hold, and a blocker, and keeps the rest as it was written", () => {
    expect(viewAddress("/lines", "?rows=holds&sort=age&hold=3")).toBe("/lines?rows=holds&sort=age");
    expect(viewAddress("/lines", "?line=78B-1&sort=holds")).toBe("/lines?sort=holds");
    expect(viewAddress("/blockers", "?blocker=Piping%7CStress")).toBe("/blockers");
    expect(viewAddress("/overview", "")).toBe("/overview");
  });

  it("leaves out Breakdown's open groups, which are a selection there and nowhere else", () => {
    expect(viewAddress("/breakdown", "?mode=list&by=Role&open=Lead,Checker&sort=holds")).toBe(
      "/breakdown?mode=list&by=Role&sort=holds",
    );
    expect(viewAddress("/lines", "?open=1")).toBe("/lines?open=1");
  });
});

describe("whether two addresses are the same screen", () => {
  it("compares the parts, however they were encoded and ordered", () => {
    expect(isSameAddress("/breakdown?by=Role&sort=holds", "/breakdown?sort=holds&by=Role")).toBe(
      true,
    );
    expect(isSameAddress("/lines?q=a%20b", "/lines?q=a+b")).toBe(true);
    expect(isSameAddress("/lines?rows=holds", "/lines")).toBe(false);
    expect(isSameAddress("/lines", "/blockers")).toBe(false);
  });
});

describe("whether two filters are the same", () => {
  it("does not depend on the order of the keys", () => {
    const spec = openHoldsFilter();
    const reordered = JSON.parse(
      JSON.stringify({
        size_mismatch: spec.size_mismatch,
        released: spec.released,
        created: { to: spec.created.to, from: spec.created.from },
        age_bands: spec.age_bands,
        text: spec.text,
        fields: spec.fields,
        status: spec.status,
      }),
    ) as FilterSpec;
    expect(isSameSpec(spec, reordered)).toBe(true);
    expect(isSameSpec(spec, { ...spec, text: "valve" })).toBe(false);
    expect(isSameSpec(spec, { ...spec, status: "All" })).toBe(false);
  });
});

describe("the filters a view sets", () => {
  const spec: FilterSpec = {
    ...openHoldsFilter(),
    status: "All",
    text: "valve",
    fields: [
      { dim: "Remark", values: ["PENDING STRESS", ""], negate: false },
      { dim: "Role", values: [], negate: false },
    ],
  };

  it("gives each value the label it was picked under, or its key", () => {
    const known: Filters = {
      ...defaultFilters,
      fields: [
        {
          dim: "Remark",
          values: [{ key: "PENDING STRESS", label: "Pending stress" }],
          negate: true,
        },
      ],
    };
    const filters = filtersOf(spec, [known]);
    expect(filters.fields).toEqual([
      {
        dim: "Remark",
        values: [
          { key: "PENDING STRESS", label: "Pending stress" },
          { key: "", label: en.common.blank },
        ],
        negate: false,
      },
    ]);
    expect(filters.status).toBe("All");
    expect(filters.text).toBe("valve");
    expect(filtersOf(spec, []).fields[0]?.values[0]).toEqual({
      key: "PENDING STRESS",
      label: "PENDING STRESS",
    });
  });

  it("is current while the address, its selection left out, and the filters are the view's", () => {
    const sent: FilterSpec = {
      ...spec,
      fields: [{ dim: "Remark", values: ["PENDING STRESS", ""], negate: false }],
    };
    const view = { id: 1, name: "Remarks", address: "/lines?rows=holds", filters: sent };
    expect(isCurrentView(view, { pathname: "/lines", search: "?hold=4&rows=holds" }, sent)).toBe(
      true,
    );
    expect(isCurrentView(view, { pathname: "/lines", search: "" }, sent)).toBe(false);
    expect(
      isCurrentView(view, { pathname: "/lines", search: "?rows=holds" }, openHoldsFilter()),
    ).toBe(false);
  });
});

describe("a proposed name", () => {
  it("is cut to 80 characters, counted as characters", () => {
    expect(Array.from(withinLimit("é".repeat(100)))).toHaveLength(80);
    expect(withinLimit("Lines")).toBe("Lines");
  });
});
