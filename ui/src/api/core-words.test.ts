import { describe, expect, it } from "vitest";
import words from "./core-words.json";
import en from "../locales/en.json";

/** The catalog key that holds each word the core writes into its labels. */
const catalogKeys = { blank: "common.blank", none: "common.none" } as const;

describe("core-words.json", () => {
  it("holds the words the catalog holds, under the mapped keys", () => {
    expect(Object.keys(words).sort()).toEqual(Object.keys(catalogKeys).sort());
    expect(en.common.blank).toBe(words.blank);
    // The import review writes the same word for a blank value.
    expect(en.import.review.blank).toBe(en.common.blank);
    expect(en.common.none).toBe(words.none);
  });
});
