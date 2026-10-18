import { describe, expect, it } from "vitest";
import { searchWithSelection } from "../../app/selection";
import {
  BLOCKERS_PATH,
  blockersAddress,
  searchWithStepSort,
  selectedBlocker,
  stepSort,
} from "./address";

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

  it("keeps the sort of the steps as sort and dir, beside the selected blocker", () => {
    const sorted = searchWithStepSort("?blocker=Piping%7CClient&view=3", {
      column: "gain",
      direction: "descending",
    });
    expect(sorted).toBe("?blocker=Piping%7CClient&view=3&sort=gain&dir=desc");
    expect(stepSort(sorted)).toEqual({ column: "gain", direction: "descending" });
    expect(selectedBlocker(sorted)).toBe("Piping|Client");
    for (const column of ["step", "blocker", "kind", "discipline", "holds", "gain", "cumulative"]) {
      for (const direction of ["ascending", "descending"] as const) {
        expect(stepSort(searchWithStepSort("", { column, direction }))).toEqual({
          column,
          direction,
        });
      }
    }
    // Another sort takes the place of the one before; none leaves the steps in the solve order.
    expect(searchWithStepSort(sorted, { column: "step", direction: "ascending" })).toBe(
      "?blocker=Piping%7CClient&view=3&sort=step&dir=asc",
    );
    expect(searchWithStepSort(sorted, undefined)).toBe("?blocker=Piping%7CClient&view=3");
    expect(searchWithStepSort("?sort=gain&dir=asc", undefined)).toBe("");
  });

  it("reads no sort from a part it cannot read", () => {
    expect(stepSort("")).toBeUndefined();
    expect(stepSort("?sort=gain")).toBeUndefined();
    expect(stepSort("?sort=gain&dir=down")).toBeUndefined();
    expect(stepSort("?sort=lines&dir=asc")).toBeUndefined();
  });
});
