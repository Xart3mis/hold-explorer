import { describe, expect, it } from "vitest";
import keys from "../../api/file-text-keys.json";
import en from "../../locales/en.json";
import { exportText } from "./text";

/** Every text of a group of the catalog with its dotted key. */
function entries(node: unknown, prefix: string): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => entries(value, `${prefix}.${key}`));
}

describe("exportText", () => {
  const text = exportText();

  it("holds a label for every key the files ask for, and no other", () => {
    expect(Object.keys(text.labels).sort()).toEqual([...keys].sort());
    expect(keys).toHaveLength(114);
  });

  it("gives every label its text, never the key itself", () => {
    for (const key of keys) {
      const label = text.labels[key];
      expect(label, key).toBeDefined();
      expect(label, key).not.toBe(key);
      expect(label, key).not.toBe("");
      expect(label, key).not.toMatch(/\$t\(|\{\{|—/);
    }
  });

  it("keeps the catalog's file group to the keys the files ask for, but the list separator", () => {
    const catalog = entries(en.file, "file").map(([key]) => key);
    expect(catalog.sort()).toEqual(keys.filter((key) => key !== "file.listSeparator").sort());
  });

  it("leaves the single-brace places that Rust fills as they are", () => {
    expect(text.labels["file.chart.bars"]).toBe("Holds by {dim}");
    expect(text.labels["file.chart.heatmap"]).toBe("Holds by {rows} and {cols}");
    expect(text.labels["file.chart.more"]).toBe("More, up to {max}");
    expect(text.labels["file.about.offset"]).toBe("UTC{offset}");
    expect(text.labels["file.report.stale"]).toBe("Holds open for {days} days or more: {count}");
  });

  it("says the column headers as the tables on screen say them", () => {
    expect(text.labels["file.column.lines.line"]).toBe(en.lines.column.line);
    expect(text.labels["file.column.lines.stressCalc"]).toBe(en.lines.column.stressCalc);
    expect(text.labels["file.column.holds.releasedOn"]).toBe(en.lines.column.releasedOn);
    expect(text.labels["file.column.holds.sourceId"]).toBe(en.import.field.SourceId);
    expect(text.labels["file.column.breakdown.holds"]).toBe(en.breakdown.column.holds);
    expect(text.labels["file.column.blockers.gain"]).toBe(en.blockers.column.gain);
    expect(text.labels["file.dim.name"]).toBe(en.import.field.Name);
    expect(text.labels["file.dim.blocker"]).toBe(en.filters.dim.Blocker);
    expect(text.labels["file.summary.open.holds"]).toBe(en.overview.openHolds);
    expect(text.labels["file.status.released"]).toBe(en.lines.statusReleased);
    expect(text.labels["file.matrix.other"]).toBe(en.breakdown.other);
  });

  it("has the texts the files were made with", () => {
    expect(text.labels["file.listSeparator"]).toBe(", ");
    expect(text.labels["file.yes"]).toBe("Yes");
    expect(text.labels["file.no"]).toBe("No");
    expect(text.labels["file.about.noSnapshot"]).toBe("No snapshot");
    expect(text.labels["file.summary.stale"]).toBe("Holds open for {days} days or more");
  });

  it("has the twelve short month names, January first", () => {
    expect(text.months).toHaveLength(12);
    expect(text.months[0]).toBe("Jan");
    expect(text.months[8]).toBe("Sept");
    expect(text.months[11]).toBe("Dec");
  });
});
