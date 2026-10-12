import "@testing-library/jest-dom/vitest";
import "../text/i18n";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, configure } from "@testing-library/react";
import { randomFillSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { afterEach, vi } from "vitest";
import { queryClient } from "../app/query";
import { checkUnhandledCommands } from "./ipc";
import { testLimits } from "./limits";
import { resetWindowApi } from "./window";

// How long a test waits for something to appear (`findBy...`, `waitFor`): three seconds, nine on
// CI. That is longer than the library's one second, and shorter than a test may take, so a wait
// in vain fails with what it waited for. It is set once, here, for every test;
// ui/src/test/limits.ts says why it is what it is.
configure({ asyncUtilTimeout: testLimits(process.env).wait });

// No test reaches the file dialog, the file manager, or the window's drag events: the module that
// talks to them is replaced by the stand-in of ui/src/test/window.ts. The test of that module
// itself asks for the real one.
vi.mock("../api/window", async () => (await import("./window")).windowApi);

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
  resetWindowApi();
  // The component library announces a button that starts to wait through a live region it keeps
  // on the page for a few seconds. It refers to the button, which is gone with its test.
  for (const region of document.querySelectorAll("[data-live-announcer]")) region.remove();
  // The query client is shared by the whole app, so what one test loaded must not reach the next.
  queryClient.clear();
  // Last, so that everything above is put back also when this fails the test: a command the
  // test sent and gave no handler for. See ui/src/test/ipc.ts.
  checkUnhandledCommands();
});
