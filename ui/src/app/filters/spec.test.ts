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
    expect(toSpec(defaultFilters, [])).toEqual(openHoldsFilter());
    expect(toSpec(defaultFilters, [])).toEqual(fixture);
  });

  it("carries the status", () => {
    expect(toSpec(filters({ status: "Released" }), []).status).toBe("Released");
    expect(toSpec(filters({ status: "All" }), []).status).toBe("All");
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
      [],
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
      [],
    );
    expect(spec.fields).toEqual([{ dim: "HoldType", values: ["Vendor data"], negate: false }]);
  });

  it("carries the negation of a field", () => {
    const spec = toSpec(
      filters({
        fields: [{ dim: "Role", values: [{ key: "Lead", label: "Lead" }], negate: true }],
      }),
      [],
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
      [],
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
    expect(toSpec(filters({ sizeMismatch: false }), []).size_mismatch).toBe(false);
  });

  it("gives the same object for the same filters", () => {
    const set = filters({ text: "valve" });
    expect(toSpec(set, [])).toBe(toSpec(set, []));
    expect(toSpec(defaultFilters, [])).toBe(toSpec(defaultFilters, []));
    // Other filters are another object, also when they say the same.
    expect(toSpec(filters({ text: "valve" }), [])).not.toBe(toSpec(set, []));
    expect(toSpec(filters({ text: "valve" }), [])).toEqual(toSpec(set, []));
  });

  it("leaves out a filter that needs a column the snapshot has no value in, and keeps the rest", () => {
    const set = filters({
      fields: [
        { dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false },
        { dim: "Role", values: [{ key: "Lead", label: "Lead" }], negate: true },
        { dim: "ModelSize", values: [{ key: "6", label: "6" }], negate: false },
        { dim: "HoldType", values: [{ key: "MISC.", label: "MISC." }], negate: false },
      ],
      text: "577-PR",
      ageBands: [{ min_days: 90, max_days: null }],
      created: { from: "2026-09-01", to: null },
      released: { from: null, to: "2026-09-30" },
      sizeMismatch: true,
    });
    const spec = toSpec(set, ["Discipline", "Created", "LdtSize"]);
    expect(spec.fields).toEqual([
      { dim: "Role", values: ["Lead"], negate: true },
      { dim: "ModelSize", values: ["6"], negate: false },
      { dim: "HoldType", values: ["MISC."], negate: false },
    ]);
    // The age is counted from the creation date, and the sizes are compared with each other.
    expect(spec.age_bands).toEqual([]);
    expect(spec.created).toEqual({ from: null, to: null });
    expect(spec.size_mismatch).toBeNull();
    expect(spec.released).toEqual({ from: null, to: "2026-09-30" });
    expect(spec.text).toBe("577-PR");

    const noRelease = toSpec(set, ["ReleaseDate", "ModelSize"]);
    expect(noRelease.released).toEqual({ from: null, to: null });
    expect(noRelease.fields.map((field) => field.dim)).toEqual(["Discipline", "Role", "HoldType"]);
    expect(noRelease.size_mismatch).toBeNull();
    expect(noRelease.created).toEqual({ from: "2026-09-01", to: null });

    // The filters are what the user set: a snapshot with the columns has every filter sent again.
    expect(set.fields).toHaveLength(4);
    expect(set.sizeMismatch).toBe(true);
    expect(toSpec(set, [])).toEqual(toSpec(filters({ ...set }), []));
    expect(toSpec(set, []).fields).toHaveLength(4);
    expect(toSpec(set, []).age_bands).toEqual([{ min_days: 90, max_days: null }]);
  });

  it("leaves out nothing for a column that no filter set needs", () => {
    const set = filters({
      fields: [{ dim: "HoldType", values: [{ key: "MISC.", label: "MISC." }], negate: false }],
      text: "valve",
    });
    expect(toSpec(set, ["Discipline", "Role", "Created", "ModelSize"])).toEqual(toSpec(set, []));
    expect(toSpec(defaultFilters, ["Released", "ReleaseDate"])).toEqual(openHoldsFilter());
  });

  it("gives the same object for the same filters while the same filters are left out", () => {
    const set = filters({
      fields: [{ dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false }],
      text: "valve",
    });
    const whole = toSpec(set, []);
    // A column that nothing set needs leaves the same filters out.
    expect(toSpec(set, ["SourceId"])).toBe(whole);
    expect(toSpec(set, ["Role", "Created"])).toBe(whole);
    const without = toSpec(set, ["Discipline"]);
    expect(without).not.toBe(whole);
    expect(toSpec(set, ["Discipline", "SourceId"])).toBe(without);
    expect(toSpec(set, [])).toBe(whole);
  });
});
