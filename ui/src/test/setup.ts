import "@testing-library/jest-dom/vitest";
import "../i18n";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup } from "@testing-library/react";
import { randomFillSync } from "node:crypto";
import { afterEach } from "vitest";

// The mocked command channel needs window.crypto.getRandomValues, which jsdom may lack. Only the
// missing method is defined.
if (typeof window.crypto.getRandomValues !== "function") {
  Object.defineProperty(window.crypto, "getRandomValues", {
    configurable: true,
    value: (array: Uint32Array) => randomFillSync(array),
  });
}

afterEach(() => {
  cleanup();
  clearMocks();
});
