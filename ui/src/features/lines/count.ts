import { t } from "../../text/i18n";
import type { LinesMode } from "./address";

/**
 * The count line of the table of a mode: how many rows are loaded of how many there are, all of
 * them once they are all there, and at the limit of what a table loads, how to reach the others.
 */
export function countTextFor(mode: LinesMode, limit: number) {
  const holds = mode === "holds";
  return (shown: number, total: number): string => {
    if (shown >= total) return t(holds ? "lines.countHolds" : "lines.countLines", { count: total });
    if (shown >= limit) {
      return t(holds ? "lines.countHoldsLimited" : "lines.countLinesLimited", {
        shown,
        count: total,
      });
    }
    return t(holds ? "lines.countHoldsOf" : "lines.countLinesOf", { shown, count: total });
  };
}
