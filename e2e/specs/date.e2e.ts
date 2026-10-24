// 8. The date sample of decision 9: the format module's date of 30 September 2026, as WebKitGTK
// writes it. The smoke run on Windows records how WebView2 writes it ("Sept" or "Sep"); this
// records it for WebKitGTK, and checks that the page writes its dates the same way.
import assert from "node:assert/strict";
import { fill, find, importWorkbook, text } from "../support/page.ts";

/**
 * Runs in the page: a date as ui/src/text/format.ts writes one (`formatDate`), with the same
 * locale and options, in the window's own engine. The locale and options are a copy of those of
 * `formatDate` in ui/src/text/format.ts, and must be changed with them.
 */
function formatInPage(year: number, month: number, day: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

describe("the date sample", () => {
  it("is written by WebKitGTK as the page writes its dates", async () => {
    // The synthetic workbook's snapshot is of 29 September 2026 (hx-synth's report date).
    await importWorkbook();
    const sample = await browser.execute(formatInPage, 2026, 9, 30);
    const snapshotDate = await browser.execute(formatInPage, 2026, 9, 29);
    console.log(`WebKitGTK writes formatDate("2026-09-30") as "${sample}".`);
    assert.match(sample, /^30 Sept? 2026$/);
    // The top bar names the snapshot in view by its date, written by formatDate.
    await find("button", fill(text.snapshots.trigger, { date: snapshotDate }));
  });
});
