// Run on the built interface (`pnpm build` first): `node --test tools/dist-locales.test.mjs`.
// The component library carries its strings in 33 languages. The app is English only, and
// vite.config.ts strips the others from the bundle. A word of each of several languages must
// not be in `dist`, and an English string of the library must be.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

const dist = resolve(import.meta.dirname, "../dist/assets");

/** A word from the color swatch picker and the table resizer of the library, per language. */
const OTHER_LANGUAGES = [
  ["German", "Farbfelder"],
  ["Spanish", "Muestras"],
  ["Italian", "Campioni"],
  ["French", "Redimensionneur"],
];

function bundle() {
  assert.ok(existsSync(dist), `${dist} does not exist. Run pnpm build first.`);
  return readdirSync(dist)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(join(dist, name), "utf8"))
    .join("\n");
}

describe("the built bundle", () => {
  const text = bundle();

  for (const [language, word] of OTHER_LANGUAGES) {
    it(`holds no ${language} string of the component library (${word})`, () => {
      assert.ok(!text.includes(word), `"${word}" is in the bundle`);
    });
  }

  it("still holds the English strings of the component library", () => {
    assert.ok(text.includes("Color swatches"));
    assert.ok(text.includes("Select an item"));
  });
});
