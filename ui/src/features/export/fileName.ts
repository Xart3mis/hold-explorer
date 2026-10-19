import { dimName } from "../../app/filters/dims";
import type { ChartChoice } from "../../bindings/ChartChoice";
import type { SaveFormat } from "../../bindings/SaveFormat";
import { t, type MessageKey } from "../../text/i18n";
import type { ExportScreen } from "./requests";

/** The characters a file system refuses in a name, besides the control characters. */
const REFUSED = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"]);

/** Whether a file system refuses this character: one of `\ / : * ? " < > |`, or a control character. */
function isRefused(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return REFUSED.has(character) || code < 0x20 || code === 0x7f;
}

/** A part of a file name with every character a file system refuses replaced by `-`. */
function clean(part: string): string {
  return Array.from(part, (character) => (isRefused(character) ? "-" : character)).join("");
}

/**
 * The name a saved export is offered under: `HoldExplorer_<workspace>_<view>_<snapshot>.<extension>`,
 * the snapshot as its date `YYYY-MM-DD`, left out with its underscore for a workspace without a
 * snapshot. The workspace and the view keep their spaces, case, and length; each character a file
 * system refuses becomes a hyphen.
 */
export function fileName(
  workspace: string,
  view: string,
  snapshot: string,
  extension: string,
): string {
  const parts = ["HoldExplorer", clean(workspace), clean(view)];
  if (snapshot !== "") parts.push(clean(snapshot));
  return `${parts.join("_")}.${extension}`;
}

/** The name of each screen in a file name. */
const SCREEN_VIEWS: Record<ExportScreen, MessageKey> = {
  overview: "export.fileView.overview",
  lines: "export.fileView.lines",
  holds: "export.fileView.holds",
  breakdown: "export.fileView.breakdown",
  matrix: "export.fileView.matrix",
  blockers: "export.fileView.blockers",
};

/** The name of a chart in a file name: what it draws. */
function chartView(chart: ChartChoice): string {
  switch (chart.kind) {
    case "Bars":
      return t("export.fileView.bars", { dim: dimName(chart.dim) });
    case "TopBlockers":
      return t("export.fileView.topBlockers");
    case "Heatmap":
      return t("export.fileView.heatmap", { rows: dimName(chart.rows), cols: dimName(chart.cols) });
    case "Curve":
      return t("export.fileView.curve");
  }
}

/**
 * The `view` part of the name of a file saved from a screen: the full workbook and the report by
 * what they are, a chart by what it draws, and anything else by the screen.
 */
export function fileView(screen: ExportScreen, format: SaveFormat): string {
  switch (format.kind) {
    case "Workbook":
      return t("export.fileView.workbook");
    case "Report":
      return t("export.fileView.report");
    case "ChartPng":
    case "ChartSvg":
      return chartView(format.chart);
    case "Excel":
    case "Csv":
      return t(SCREEN_VIEWS[screen]);
  }
}
