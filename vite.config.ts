import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
  },
});
