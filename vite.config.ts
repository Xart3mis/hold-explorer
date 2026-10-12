import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig } from "vitest/config";
import { testLimits } from "./ui/src/test/limits";

export default defineConfig({
  root: "ui",
  plugins: [react()],
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
    // allowance of ui/src/test/slow.ts grows the same way. ui/src/test/limits.ts holds the times.
    testTimeout: testLimits(process.env).test,
  },
});
