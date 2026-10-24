// 7. Run Ctrl+K and `?` once each.
import { focusPage, key, KEYS, openDemo, scope, text } from "../support/page.ts";

describe("the keyboard", () => {
  it("opens the command palette with Ctrl+K, and the shortcuts with ?", async () => {
    await openDemo();

    await focusPage();
    await key("k", { ctrl: true });
    const palette = await scope("dialog", text.palette.name);
    await key(KEYS.escape);
    await $(palette).waitForExist({ reverse: true });

    await focusPage();
    await key("?");
    const sheet = await scope("dialog", text.shortcuts.title);
    await key(KEYS.escape);
    await $(sheet).waitForExist({ reverse: true });
  });
});
