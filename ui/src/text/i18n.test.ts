import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import i18next, { locale, t } from "./i18n";

/** Every text of the catalog with its dotted key. */
function entries(node: unknown, prefix = ""): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) =>
    entries(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("t", () => {
  it("returns the text of a key", () => {
    expect(t("app.name")).toBe(en.app.name);
  });

  it("puts named values into the text", () => {
    expect(t("units.days", { value: "71" })).toBe("71 d");
  });

  it("chooses the plural form by the count", () => {
    expect(t("table.rowCount", { count: 0 })).toBe("0 rows");
    expect(t("table.rowCount", { count: 1 })).toBe("1 row");
    expect(t("table.rowCount", { count: 2 })).toBe("2 rows");
  });

  it("formats a count inside a sentence by locale", () => {
    expect(t("table.rowCount", { count: 9241 })).toBe("9,241 rows");
  });

  it("is the same function the hook gives a component", () => {
    expect(t("app.name")).toBe(i18next.t("app.name"));
    expect(i18next.language).toBe("en");
    expect(locale).toBe("en-GB");
  });
});

describe("the text catalog", () => {
  const texts = entries(en);

  it("gives every plural key both English forms", () => {
    const keys = new Set(texts.map(([key]) => key));
    for (const key of keys) {
      const plural = /^(.*)_(one|other)$/.exec(key);
      if (!plural) continue;
      expect(keys, key).toContain(`${plural[1] ?? ""}_one`);
      expect(keys, key).toContain(`${plural[1] ?? ""}_other`);
    }
  });

  it("keeps the tone of PRODUCT.md: no em dash, no exclamation mark, none of the banned words", () => {
    for (const [key, text] of texts) {
      // `common.none` is no text: it is the dash the core writes for a blank role, kept in the
      // catalog so `ui/src/api/core-words.json` can be checked against it.
      expect(text, key).not.toMatch(key === "common.none" ? /--|!/ : /\u2014|--|!/);
      // "Yes" is banned as the label of a button (PRODUCT.md). `file.yes` is no label: it is the
      // value a file writes in a cell of a yes-or-no column, beside `file.no`.
      const banned =
        key === "file.yes"
          ? /\b(OK|Submit|Oops|Welcome back)\b/
          : /\b(OK|Yes|Submit|Oops|Welcome back)\b/;
      expect(text, key).not.toMatch(banned);
      expect(text.trim(), key).toBe(text);
      expect(text, key).not.toBe("");
    }
  });
});
