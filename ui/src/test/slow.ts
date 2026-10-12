import process from "node:process";
import { testLimits } from "./limits";

/**
 * The allowance for the few tests that are slow by nature, passed as a test's options:
 * `it("...", SLOW, async () => { ... })`. Every other test keeps the default limit.
 *
 * Four kinds of test take it; each runs for more than half a second on a development machine,
 * an eighth of the default limit. One runs the accessibility checker several times, or over the
 * whole document with a list open: the checker walks every node against every rule, about a
 * quarter of a second for each run. One sends a long series of keys or clicks to a grid or a
 * list: each is a round of events through the component library and a render. One is the first
 * render of the table in its file, which builds the grid before anything is warm. One renders the
 * whole app and walks through several of its pages, or opens its lists more than once. On a loaded
 * CI runner any of them can pass the default five seconds without anything being wrong.
 *
 * The allowance is twenty seconds on a development machine and three times that on CI, as the
 * default limit is; see ui/src/test/limits.ts, where both are written.
 */
export const SLOW = { timeout: testLimits(process.env).slow } as const;
