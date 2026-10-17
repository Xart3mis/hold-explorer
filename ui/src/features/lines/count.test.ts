import { describe, expect, it } from "vitest";
import { countTextFor } from "./count";

describe("the count line of Lines", () => {
  it("says how many rows are loaded of how many, all of them, and at the limit how to reach the rest", () => {
    const lines = countTextFor("lines", 5000);
    expect(lines(200, 3612)).toBe("200 of 3,612 lines");
    expect(lines(3, 3)).toBe("3 lines");
    expect(lines(1, 1)).toBe("1 line");
    expect(lines(0, 0)).toBe("0 lines");
    expect(lines(5000, 9312)).toBe(
      "5,000 of 9,312 lines are shown. Narrow the filters or reverse the sort to reach the others.",
    );
    const holds = countTextFor("holds", 5000);
    expect(holds(200, 9312)).toBe("200 of 9,312 holds");
    expect(holds(5000, 9312)).toBe(
      "5,000 of 9,312 holds are shown. Narrow the filters or reverse the sort to reach the others.",
    );
  });
});
