// 2. Import the synthetic workbook through the open-dialog substitute, review it, commit it, and
// see the Overview.
import assert from "node:assert/strict";
import { find, importWorkbook, literal, overviewFigures, text } from "../support/page.ts";

describe("an import", () => {
  it("reads the workbook the open dialog answers with, and opens its Overview once committed", async () => {
    await importWorkbook();
    const figures = await overviewFigures();
    assert.match(figures, new RegExp(`${text.overview.openHolds} [\\d,]+`));
    // The review proposed a new workspace named by the project number of the file.
    await find("button", new RegExp(`^${literal(text.workspaces.switcher)}\\s*0000-TEST$`));
  });
});
