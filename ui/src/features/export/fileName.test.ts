import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import { fileName, fileView } from "./fileName";

describe("fileName", () => {
  it("is HoldExplorer, the workspace, the view, and the snapshot date, joined by underscores", () => {
    expect(fileName("Unit 573 piping", "Lines", "2026-10-07", "xlsx")).toBe(
      "HoldExplorer_Unit 573 piping_Lines_2026-10-07.xlsx",
    );
  });

  it("replaces every character a file system refuses with a hyphen", () => {
    expect(fileName('A\\B/C:D*E?F"G<H>I|J', "Lines", "2026-10-07", "csv")).toBe(
      "HoldExplorer_A-B-C-D-E-F-G-H-I-J_Lines_2026-10-07.csv",
    );
  });

  it("replaces control characters with a hyphen", () => {
    expect(fileName("Unit\t573\npiping\u0000\u007f", "Report", "2026-10-07", "pdf")).toBe(
      "HoldExplorer_Unit-573-piping--_Report_2026-10-07.pdf",
    );
  });

  it("keeps spaces, accents, and the case of the name", () => {
    expect(fileName("Raffinerie  Süd, Phase 2", "Blockers", "2026-10-07", "xlsx")).toBe(
      "HoldExplorer_Raffinerie  Süd, Phase 2_Blockers_2026-10-07.xlsx",
    );
  });

  it("keeps a long name whole", () => {
    const long = "Offsites and utilities ".repeat(12).trim();
    const name = fileName(long, "Workbook", "2026-10-07", "xlsx");
    expect(name).toBe(`HoldExplorer_${long}_Workbook_2026-10-07.xlsx`);
    expect(name.length).toBeGreaterThan(250);
  });

  it("cleans the view as it cleans the workspace", () => {
    expect(fileName("Unit 573", "Holds by Area/Zone", "2026-10-07", "png")).toBe(
      "HoldExplorer_Unit 573_Holds by Area-Zone_2026-10-07.png",
    );
  });

  it("leaves the date out for a workspace without a snapshot", () => {
    expect(fileName("Unit 573", "Workbook", "", "xlsx")).toBe(
      "HoldExplorer_Unit 573_Workbook.xlsx",
    );
  });
});

describe("fileView", () => {
  it("names the screen of a file of this view", () => {
    expect(fileView("lines", { kind: "Excel" })).toBe(en.export.fileView.lines);
    expect(fileView("holds", { kind: "Csv" })).toBe(en.export.fileView.holds);
    expect(fileView("matrix", { kind: "Excel" })).toBe(en.export.fileView.matrix);
  });

  it("names the full workbook and the report by what they are, whatever the screen", () => {
    expect(fileView("blockers", { kind: "Workbook" })).toBe(en.export.fileView.workbook);
    expect(fileView("overview", { kind: "Report" })).toBe(en.export.fileView.report);
  });

  it("names a chart by what it draws", () => {
    expect(fileView("overview", { kind: "ChartPng", chart: { kind: "Bars", dim: "Role" } })).toBe(
      "Holds by Role",
    );
    expect(
      fileView("matrix", {
        kind: "ChartSvg",
        chart: { kind: "Heatmap", rows: "Discipline", cols: { Custom: "Area" } },
      }),
    ).toBe("Holds by Discipline and Area");
    expect(fileView("overview", { kind: "ChartSvg", chart: { kind: "TopBlockers" } })).toBe(
      en.export.fileView.topBlockers,
    );
    expect(fileView("blockers", { kind: "ChartPng", chart: { kind: "Curve", steps: 0 } })).toBe(
      en.export.fileView.curve,
    );
  });
});
