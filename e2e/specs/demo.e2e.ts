// 1. Start, open the demo workspace, and see the Overview tiles.
import assert from "node:assert/strict";
import { openDemo, overviewFigures, text } from "../support/page.ts";

describe("the demo workspace", () => {
  it("opens from the first screen on its Overview, with the four figures", async () => {
    await openDemo();
    const figures = await overviewFigures();
    for (const label of [
      text.overview.openHolds,
      text.overview.linesOnHold,
      text.overview.singleHoldLines,
      text.overview.medianAge,
    ]) {
      assert.ok(figures.includes(label), `The figures read "${figures}", without "${label}".`);
    }
    assert.match(figures, new RegExp(`${text.overview.openHolds} [\\d,]+`));
  });
});
