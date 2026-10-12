/**
 * How long a test may take, and how long it waits for something to appear. This is the one place
 * the three times are written; `vite.config.ts`, `ui/src/test/setup.ts`, and `ui/src/test/slow.ts`
 * read them here.
 *
 * - `wait`: how long the queries of the testing library wait (`findBy...`, `waitFor`). The
 *   library's default is one second, and a test of a screen renders the whole app: on a busy
 *   machine the first such render of a file takes longer without anything being wrong. It stays
 *   below the limit of a test on purpose. A wait that will never be satisfied then fails with
 *   the library's own message, which says what it waited for and prints the page, and not with
 *   a bare "test timed out".
 * - `test`: the limit of a test. Five seconds on a development machine, where a test that takes
 *   longer is worth a look.
 * - `slow`: the limit of a test that takes the allowance of `ui/src/test/slow.ts`.
 *
 * On CI both limits are three times as long, and the wait stays where it is. A CI runner is
 * slower than a development machine, and a test that is merely slow there is not a failure. CI
 * is told by the environment variable `CI`, which GitHub sets; set to nothing, it is not set.
 */
export interface TestLimits {
  wait: number;
  test: number;
  slow: number;
}

const ON_CI = 3;

export function testLimits(env: { CI?: string | undefined }): TestLimits {
  const scale = env.CI !== undefined && env.CI !== "" ? ON_CI : 1;
  return { wait: 3000, test: 5000 * scale, slow: 20_000 * scale };
}
