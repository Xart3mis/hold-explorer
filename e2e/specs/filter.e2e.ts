// 3. Add a Discipline filter and see the count change.
import assert from "node:assert/strict";
import { addDisciplineFilter, filterTotal, openDemo } from "../support/page.ts";

describe("a filter", () => {
  it("on Discipline changes the count of holds", async () => {
    await openDemo();
    const before = await filterTotal();
    await addDisciplineFilter();
    let after = before;
    await browser.waitUntil(
      async () => {
        after = await filterTotal();
        return after !== before;
      },
      { timeoutMsg: `The total stayed "${before}" with a Discipline filter.` },
    );
    assert.notEqual(after, before);
  });
});
