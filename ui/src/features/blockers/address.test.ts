import { describe, expect, it } from "vitest";
import { searchWithSelection } from "../../app/selection";
import { BLOCKERS_PATH, blockersAddress, selectedBlocker } from "./address";

describe("the address of Blockers", () => {
  it("is the page alone when no blocker is selected", () => {
    expect(blockersAddress()).toBe(BLOCKERS_PATH);
    expect(blockersAddress(null)).toBe("/blockers");
    expect(selectedBlocker("")).toBeNull();
  });

  it("names the selected blocker by its key, whatever characters the key holds", () => {
    for (const key of ["Piping|Stress", "Process|577-PR-400", "Civil|Vendor data & more", "|"]) {
      const address = blockersAddress(key);
      expect(address.startsWith(`${BLOCKERS_PATH}?blocker=`)).toBe(true);
      expect(selectedBlocker(address)).toBe(key);
      expect(selectedBlocker(address.slice(BLOCKERS_PATH.length))).toBe(key);
    }
  });

  it("reads the blocker as the detail panel reads the selection, and nothing else", () => {
    expect(selectedBlocker("?blocker=Civil%7CStress&view=3")).toBe("Civil|Stress");
    expect(selectedBlocker("?blocker=")).toBeNull();
    expect(selectedBlocker("?line=78B01-573-04400-FW")).toBeNull();
    expect(selectedBlocker("?hold=4")).toBeNull();
    // What the panel would write is what the page reads.
    expect(
      selectedBlocker(searchWithSelection("?view=3", { kind: "blocker", key: "Piping|Client" })),
    ).toBe("Piping|Client");
  });
});
