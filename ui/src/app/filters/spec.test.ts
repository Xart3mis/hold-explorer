import { describe, expect, it } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import fixture from "../../api/open-holds-filter.json";
import { toSpec } from "./spec";
import { defaultFilters, type Filters } from "./state";

function filters(overrides: Partial<Filters>): Filters {
  return { ...defaultFilters, ...overrides };
}

describe("toSpec", () => {
  it("gives the default filter for the default filters: the open holds, as the shared fixture has them", () => {
    expect(toSpec(defaultFilters)).toEqual(openHoldsFilter());
    expect(toSpec(defaultFilters)).toEqual(fixture);
  });

  it("carries the status", () => {
    expect(toSpec(filters({ status: "Released" })).status).toBe("Released");
    expect(toSpec(filters({ status: "All" })).status).toBe("All");
  });

  it("sends the keys of the values of a field, in the order the fields were added", () => {
    const spec = toSpec(
      filters({
        fields: [
          {
            dim: "Discipline",
            values: [
              { key: "Civil", label: "Civil" },
              { key: "", label: "Unspecified" },
            ],
            negate: false,
          },
          { dim: { Custom: "Area" }, values: [{ key: "North", label: "North" }], negate: false },
        ],
      }),
    );
    expect(spec.fields).toEqual([
      { dim: "Discipline", values: ["Civil", ""], negate: false },
      { dim: { Custom: "Area" }, values: ["North"], negate: false },
    ]);
  });

  it("leaves out an entry without values", () => {
    const spec = toSpec(
      filters({
        fields: [
          { dim: "Role", values: [], negate: true },
          {
            dim: "HoldType",
            values: [{ key: "Vendor data", label: "Vendor data" }],
            negate: false,
          },
        ],
      }),
    );
    expect(spec.fields).toEqual([{ dim: "HoldType", values: ["Vendor data"], negate: false }]);
  });

  it("carries the negation of a field", () => {
    const spec = toSpec(
      filters({
        fields: [{ dim: "Role", values: [{ key: "Lead", label: "Lead" }], negate: true }],
      }),
    );
    expect(spec.fields).toEqual([{ dim: "Role", values: ["Lead"], negate: true }]);
  });

  it("carries the text, the age bands, the two ranges of days, and the size mismatch", () => {
    const spec = toSpec(
      filters({
        text: "577-PR",
        ageBands: [
          { min_days: 0, max_days: 13 },
          { min_days: 90, max_days: null },
        ],
        created: { from: "2026-09-01", to: null },
        released: { from: null, to: "2026-09-30" },
        sizeMismatch: true,
      }),
    );
    expect(spec).toEqual({
      status: "Open",
      fields: [],
      text: "577-PR",
      age_bands: [
        { min_days: 0, max_days: 13 },
        { min_days: 90, max_days: null },
      ],
      created: { from: "2026-09-01", to: null },
      released: { from: null, to: "2026-09-30" },
      size_mismatch: true,
    });
    expect(toSpec(filters({ sizeMismatch: false })).size_mismatch).toBe(false);
  });

  it("gives the same object for the same filters", () => {
    const set = filters({ text: "valve" });
    expect(toSpec(set)).toBe(toSpec(set));
    expect(toSpec(defaultFilters)).toBe(toSpec(defaultFilters));
    // Other filters are another object, also when they say the same.
    expect(toSpec(filters({ text: "valve" }))).not.toBe(toSpec(set));
    expect(toSpec(filters({ text: "valve" }))).toEqual(toSpec(set));
  });
});
