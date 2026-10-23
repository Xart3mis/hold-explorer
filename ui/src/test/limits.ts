/**
 * How long a test may take, and how long it waits for something to appear. This is the one place
 * the four times are written; `vite.config.ts`, `ui/src/test/setup.ts`, and `ui/src/test/slow.ts`
 * read them here.
 *
 * - `wait`: how long the queries of the testing library wait (`findBy...`, `waitFor`): three
 *   seconds on a development machine. The library's default is one second, and a test of a
 *   screen renders the whole app: on a busy machine the first such render of a file takes longer
 *   without anything being wrong. It stays below the limit of a test on purpose. A wait that
 *   will never be satisfied then fails with the library's own message, which says what it waited
 *   for and prints the page, and not with a bare "test timed out".
 * - `test`: the limit of a test. Five seconds on a development machine, where a test that takes
 *   longer is worth a look.
 * - `slow`: the limit of a test that takes the allowance of `ui/src/test/slow.ts`.
 * - `slowWait`: how long the queries wait in such a test: ten seconds. A test that walks through
 *   several pages, or opens its lists more than once, waits for the first render of each, and on
 *   a loaded machine one of those can pass three seconds without anything being wrong. It is
 *   below `slow` for the reason `wait` is below `test`. `ui/src/test/setup.ts` sets it for the
 *   length of such a test, which it knows by the limit the test was given.
 *
 * On CI all four are three times as long: nine seconds to wait, fifteen for a test, thirty to wait
 * in a slow test, sixty for it. A CI runner is slower than a development machine in everything, in the first
 * render a query waits for as much as in a whole test, and a test that is merely slow there is
 * not a failure. The four keep their proportions, so the wait is below the limit there as well.
 * CI is told by the environment variable `CI`, which GitHub sets; set to nothing, it is not set.
 */
export interface TestLimits {
  wait: number;
  test: number;
  slow: number;
  slowWait: number;
}

const ON_CI = 3;

export function testLimits(env: { CI?: string | undefined }): TestLimits {
  const scale = env.CI !== undefined && env.CI !== "" ? ON_CI : 1;
  return {
    wait: 3000 * scale,
    test: 5000 * scale,
    slow: 20_000 * scale,
    slowWait: 10_000 * scale,
  };
}
