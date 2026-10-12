import "@testing-library/jest-dom/vitest";
import "../app/i18n";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup } from "@testing-library/react";
import { randomFillSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach } from "vitest";
import { queryClient } from "../app/query";

// The mocked command channel needs window.crypto.getRandomValues, which jsdom may lack. Only the
// missing method is defined.
if (typeof window.crypto.getRandomValues !== "function") {
  Object.defineProperty(window.crypto, "getRandomValues", {
    configurable: true,
    value: (array: Uint32Array) => randomFillSync(array),
  });
}

// The tests run with the token stylesheet the app runs with, so a component that reads a token
// (a delay, a timeout, the gap of an overlay) reads the value of DESIGN.md here as well.
const tokens = document.createElement("style");
tokens.textContent = readFileSync(join(import.meta.dirname, "../design/tokens.css"), "utf8");
document.head.append(tokens);

// jsdom draws nothing: its canvas has no context, and it writes that to the console at every
// request. The accessibility checker asks when it tells an icon font from text. The answer stays
// the same, without the line on the console.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null,
});

afterEach(() => {
  cleanup();
  clearMocks();
  // The query client is shared by the whole app, so what one test loaded must not reach the next.
  queryClient.clear();
});
