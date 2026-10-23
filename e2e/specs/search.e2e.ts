// 4. Search for a line ID and open its panel.
import {
  find,
  isShown,
  key,
  KEYS,
  openDemo,
  press,
  scope,
  startsWith,
  text,
} from "../support/page.ts";

describe("the search", () => {
  it("finds a line by its ID and opens it in the panel", async () => {
    await openDemo();
    // A line of the demo workspace: the first row of Lines.
    await press("link", text.destinations.name.lines);
    await pageReady();
    const row = await $('[role="row"][data-key]');
    await row.waitForExist();
    const lineId = await row.getAttribute("data-key");
    if (lineId === null || lineId === "") throw new Error("The first row of Lines has no key.");

    await press("combobox", text.search.label);
    await browser.keys(lineId);
    const results = await scope("listbox", text.search.results);
    await press("option", startsWith(lineId), { within: results });
    await find("heading", startsWith(lineId));
    await key(KEYS.escape);
    await browser.waitUntil(async () => !(await isShown("heading", startsWith(lineId))), {
      timeoutMsg: `Escape did not close the panel of ${lineId}.`,
    });
  });
});

/** Lines is shown. */
async function pageReady(): Promise<void> {
  await find("heading", text.destinations.name.lines);
}
