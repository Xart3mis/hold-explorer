import { describe, expect, it } from "vitest";
import { columnWidth, headerWidth, textChars } from "./columns";

const widths = { text: 8, mono: 9 };

describe("columnWidth", () => {
  it("gives a column of characters their room and the cell padding on both sides", () => {
    expect(columnWidth({ chars: 10 }, "text", widths, 12)).toEqual({ width: 104, minWidth: 104 });
    expect(columnWidth({ chars: 4 }, "number", widths, 8)).toEqual({ width: 48, minWidth: 48 });
  });

  it("gives a flex column its share as a fraction, and a minimum from its least characters", () => {
    expect(columnWidth({ flex: 1, minChars: 20 }, "text", widths, 12)).toEqual({
      width: "1fr",
      minWidth: 184,
    });
    expect(columnWidth({ flex: 2, minChars: 6 }, "text", widths, 8)).toEqual({
      width: "2fr",
      minWidth: 64,
    });
  });

  it("measures an identifier column in the monospace face", () => {
    expect(columnWidth({ chars: 21 }, "identifier", widths, 12)).toEqual({
      width: 213,
      minWidth: 213,
    });
    expect(columnWidth({ flex: 1, minChars: 10 }, "identifier", widths, 12).minWidth).toBe(114);
  });

  it("rounds a part of a pixel up, so the last character is never cut", () => {
    expect(columnWidth({ chars: 10 }, "text", { text: 7.21, mono: 7.8 }, 12).width).toBe(97);
    expect(columnWidth({ chars: 21 }, "identifier", { text: 7.21, mono: 7.8 }, 12).width).toBe(188);
  });
});

describe("textChars", () => {
  it("counts a figure in full and any other character as a letter, which is narrower", () => {
    expect(textChars("2026")).toBe(4);
    expect(textChars("Holds")).toBeCloseTo(4.25);
    expect(textChars("7 Oct 2026")).toBeCloseTo(5 + 5 * 0.85);
    expect(textChars("")).toBe(0);
  });
});

describe("headerWidth", () => {
  it("is the room the header text needs, with the cell padding on both sides", () => {
    // Five letters: 4.25 figures of 8 px, and 12 px at each side.
    expect(headerWidth("Holds", false, widths, 12, 20)).toBe(58);
  });

  it("adds the room of the arrow to a header that can be sorted", () => {
    expect(headerWidth("Holds", true, widths, 12, 20)).toBe(78);
  });
});
