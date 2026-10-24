// 6. Export Excel this view through the save substitute. The file exists, starts with the zip
// signature, and is larger than 1 KB.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { literal, openDemo, press, scope, text } from "../support/page.ts";
import { saveDir } from "../support/run.ts";

/** The workbooks saved in the folder of the run, without a file still being written. */
function savedWorkbooks(): string[] {
  return readdirSync(saveDir()).filter((name) => name.endsWith(".xlsx") && !name.startsWith("."));
}

describe("the export", () => {
  it("saves Excel, this view, as a workbook where the save dialog answers", async () => {
    await openDemo();
    await press("button", text.export.menu.label);
    const menu = await scope("menu", text.export.menu.name);
    // "Excel, this view…", or with a note before its ellipsis: "Excel, this view (open holds)…".
    const [label, ellipsis] = text.export.menu.excel.split(/(…)$/);
    await press(
      "menuitem",
      new RegExp(`^${literal(label ?? "")}( \\(.+\\))?${literal(ellipsis ?? "")}$`),
      { within: menu },
    );
    await browser.waitUntil(() => savedWorkbooks().length > 0, {
      timeout: 60_000,
      timeoutMsg: `No workbook was saved in ${saveDir()}.`,
    });
    const [name] = savedWorkbooks();
    if (name === undefined) throw new Error("The saved workbook went away.");
    const bytes = readFileSync(path.join(saveDir(), name));
    assert.ok(
      bytes.length > 1024,
      `${name} has ${String(bytes.length)} bytes, not more than 1 KB.`,
    );
    assert.deepEqual(
      [...bytes.subarray(0, 4)],
      [0x50, 0x4b, 0x03, 0x04],
      `${name} is no zip file.`,
    );
  });
});
