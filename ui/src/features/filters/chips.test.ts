import { describe, expect, it } from "vitest";
import { defaultFilters, type Filters } from "../../app/filters/state";
import en from "../../locales/en.json";
import { chipsOf, fieldId, fieldName } from "./chips";

function filters(overrides: Partial<Filters>): Filters {
  return { ...defaultFilters, ...overrides };
}

const value = (label: string, key = label) => ({ key, label });

/** Every kind of filter at once. */
const EVERY: Filters = {
  status: "All",
  fields: [
    { dim: "Discipline", values: [value("Civil")], negate: false },
    { dim: { Custom: "Area" }, values: [value("North"), value("South")], negate: true },
  ],
  text: "577-PR",
  ageBands: [{ min_days: 90, max_days: null }],
  created: { from: "2026-09-01", to: null },
  released: { from: "2026-09-01", to: "2026-09-30" },
  sizeMismatch: false,
};

describe("chipsOf", () => {
  it("has no chip for the default filters, and none for the status", () => {
    expect(chipsOf(defaultFilters)).toEqual([]);
    expect(chipsOf(filters({ status: "Released" }))).toEqual([]);
  });

  it("reads one value by its label, two as a list, and more as the first and how many more", () => {
    const five = ["Lead", "Engineer", "Designer", "Checker", "Manager"].map((label) =>
      value(label),
    );
    const chips = chipsOf(
      filters({
        fields: [
          { dim: "Discipline", values: [value("Civil")], negate: false },
          { dim: "HoldType", values: [value("Vendor data"), value("Process data")], negate: false },
          { dim: "Role", values: five.slice(0, 3), negate: false },
          { dim: "Name", values: five, negate: false },
        ],
      }),
    );
    expect(chips.map(({ name, value: text }) => [name, text])).toEqual([
      [en.import.field.Discipline, "Civil"],
      [en.import.field.HoldType, "Vendor data, Process data"],
      [en.import.field.Role, "Lead +2"],
      [en.import.field.Name, "Lead +4"],
    ]);
    expect(chips.every((chip) => !chip.isNegated)).toBe(true);
  });

  it("reads a value by the label it was picked under, a blank one included", () => {
    const [chip] = chipsOf(
      filters({
        fields: [{ dim: "Discipline", values: [value("Unspecified", "")], negate: false }],
      }),
    );
    expect(chip?.value).toBe("Unspecified");
  });

  it("says of a negated field that it is one", () => {
    const [chip] = chipsOf(
      filters({ fields: [{ dim: "Role", values: [value("Lead")], negate: true }] }),
    );
    expect(chip).toMatchObject({ name: en.import.field.Role, value: "Lead", isNegated: true });
  });

  it("has no chip for an entry without values", () => {
    expect(chipsOf(filters({ fields: [{ dim: "Role", values: [], negate: true }] }))).toEqual([]);
  });

  it("has one chip each for the age bands, the two ranges of days, the size mismatch, and the text", () => {
    const chips = chipsOf(
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
    expect(chips.map(({ name, value: text }) => [name, text])).toEqual([
      [en.filters.field.age, "0 to 13 days, 90 days or more"],
      [en.import.field.Created, "from 1 Sept 2026"],
      [en.import.field.ReleaseDate, "until 30 Sept 2026"],
      [en.filters.field.sizeMismatch, en.filters.sizeMismatch.differ],
      [en.filters.field.text, "“577-PR”"],
    ]);
  });

  it("reads three age bands as the first and how many more, and the other size choice as its own word", () => {
    const chips = chipsOf(
      filters({
        ageBands: [
          { min_days: 0, max_days: 13 },
          { min_days: 14, max_days: 29 },
          { min_days: 30, max_days: 59 },
        ],
        sizeMismatch: false,
      }),
    );
    expect(chips.map((chip) => chip.value)).toEqual([
      "0 to 13 days +2",
      en.filters.sizeMismatch.match,
    ]);
  });

  it("puts the fields first, in the order they were added, then the filters that are not a field", () => {
    expect(chipsOf(EVERY).map((chip) => chip.id)).toEqual([
      "dim:Discipline",
      "dim:Custom:Area",
      "ageBands",
      "created",
      "released",
      "sizeMismatch",
      "text",
    ]);
    expect(chipsOf(EVERY).map((chip) => chip.id)).toEqual(
      chipsOf(EVERY).map((chip) => fieldId(chip.field)),
    );
  });

  it("removes exactly its own filter, and leaves the status as it is", () => {
    for (const chip of chipsOf(EVERY)) {
      const left = chip.remove(EVERY);
      expect(left.status).toBe("All");
      expect(chipsOf(left).map(({ id }) => id)).toEqual(
        chipsOf(EVERY)
          .map(({ id }) => id)
          .filter((id) => id !== chip.id),
      );
    }
  });
});

describe("fieldName", () => {
  it("names a custom dimension by its header, and every other field from the catalog", () => {
    expect(fieldName({ kind: "dim", dim: { Custom: "Area" } })).toBe("Area");
    expect(fieldName({ kind: "dim", dim: "Blocker" })).toBe(en.filters.dim.Blocker);
    expect(fieldName({ kind: "ageBands" })).toBe(en.filters.field.age);
    expect(fieldName({ kind: "created" })).toBe(en.import.field.Created);
    expect(fieldName({ kind: "released" })).toBe(en.import.field.ReleaseDate);
    expect(fieldName({ kind: "sizeMismatch" })).toBe(en.filters.field.sizeMismatch);
    expect(fieldName({ kind: "text" })).toBe(en.filters.field.text);
  });
});
