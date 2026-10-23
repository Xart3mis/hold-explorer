import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig, type Plugin } from "vitest/config";
import { testLimits } from "./ui/src/test/limits.ts";

// The strings of the component library (react-aria) come in one file for each language and each
// package: `.../intl/<package>/<language>.mjs`, 70 languages for 19 packages. The app fixes its
// locale (`locale` of ui/src/text/i18n.ts, English), and the library falls back to en-US for it,
// so the other languages would only be dead weight in the bundle. This is the replacement the
// library's documentation describes for a Vite build (`@react-aria/optimize-locales-plugin`),
// written here so the project takes no new dependency: every language but en-US loads as an
// empty module. A build only; the tests and the development server keep the library as it is.
const OTHER_LANGUAGE = /[\\/]intl[\\/][^\\/]+[\\/](?!en-US\.)[a-z]{2,3}-[A-Z]{2}\.m?js$/;
const englishOnly: Plugin = {
  name: "hx-english-only-components",
  apply: "build",
  enforce: "pre",
  load(id) {
    return OTHER_LANGUAGE.test(id.split("?")[0] ?? id) ? "export default {};" : null;
  },
};

export default defineConfig({
  root: "ui",
  plugins: [react(), englishOnly],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Nothing is inlined as a data: address: the content security policy lets fonts load from the
  // app's own files only, so a small font written into the stylesheet would be refused.
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 0 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    // Five seconds for a test on a development machine, fifteen on CI (the environment variable
    // CI, which GitHub sets): a runner is slower, and a slow test there is not a failed one. The
    // allowance of ui/src/test/slow.ts and the wait of the queries grow the same way.
    // ui/src/test/limits.ts holds the times.
    testTimeout: testLimits(process.env).test,
  },
});
