// 4. Search for a line ID and open its panel.
import {
  find,
  first,
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
    const row = await $(await first('[role="row"][data-key]'));
    const lineId = await row.getAttribute("data-key");
    if (lineId === null || lineId === "") throw new Error("The first row of Lines has no key.");

    const field = await find("combobox", text.search.label);
    await field.click();
    await browser.keys(lineId);
    // The whole ID reached the field, in order, before any result is looked for.
    let typed = "";
    await browser
      .waitUntil(async () => {
        typed = await field.getValue();
        return typed === lineId;
      })
      .catch((error: unknown) => {
        const why = error instanceof Error ? ` (${error.message})` : "";
        throw new Error(`The search field reads ${JSON.stringify(typed)}, not "${lineId}"${why}.`);
      });
    // The result named by exactly that ID. The list sits in a popover the page may render anew
    // while the answer comes, so it is found again on each try rather than held. The list as it
    // was first seen is marked too, and the log says whether it was still there once the result
    // was: a record of whether WebKitGTK renders the popover anew.
    const firstList = await scope("listbox", text.search.results);
    const option = await find("option", lineId, {
      within: { role: "listbox", name: text.search.results },
    });
    const kept = await $(firstList).isExisting();
    console.log(`The search list first seen was ${kept ? "still there" : "rendered anew"}.`);
    await option.waitForClickable();
    await option.click();
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
