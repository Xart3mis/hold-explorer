// 5. Save a view, clear the filters, apply the view, and see the chip label.
import assert from "node:assert/strict";
import {
  addDisciplineFilter,
  chipLabels,
  find,
  openDemo,
  press,
  scope,
  text,
} from "../support/page.ts";

describe("a saved view", () => {
  it("brings back the filter it was saved with", async () => {
    await openDemo();
    const chip = await addDisciplineFilter();

    await press("button", text.views.save);
    const dialog = await scope("dialog", text.views.saveTitle);
    // The name the dialog proposes.
    const name = await (await find("textbox", text.views.name, { within: dialog })).getValue();
    assert.notEqual(name.trim(), "", "The dialog proposed no name.");
    await press("button", text.views.saveButton, { within: dialog });
    await $(dialog).waitForExist({ reverse: true });

    await press("button", text.filters.clear);
    await browser.waitUntil(async () => (await chipLabels()).length === 0, {
      timeoutMsg: "Clear all left a chip in the bar.",
    });

    const list = await scope("list", text.views.title);
    await press("link", name.trim(), { within: list });
    await browser.waitUntil(async () => (await chipLabels()).includes(chip), {
      timeoutMsg: `The view ${name} did not bring back the chip "${chip}".`,
    });
  });
});
