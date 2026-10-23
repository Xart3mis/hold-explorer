// The globals the test runner gives every spec: `browser` and `$`, and Mocha's `describe`, `it`,
// and hooks. The runner sets them at run time; these lines give them their types.
//
// With pnpm only the project's own dependencies can be imported from here, and the runner's
// packages that declare these globals (`@wdio/globals`, `@types/node`, `@types/mocha`) are not
// among them. Their types are reached through the two that are: `@wdio/cli` brings the types of
// WebdriverIO and of Node, `@wdio/mocha-framework` those of Mocha. `@wdio/cli` brings two versions
// of Node's types (22 through WebdriverIO, 26 through its own dependencies), which disagree on the
// events of a child process; e2e/wdio.conf.ts therefore reads a child's state, not its events.
import type {} from "@wdio/cli";
import type {} from "@wdio/mocha-framework";

declare global {
  namespace WebdriverIO {
    interface Capabilities {
      /** What tauri-driver starts: the app, and the arguments it is given. */
      "tauri:options"?: { application: string; args?: string[] };
    }
  }
  var browser: WebdriverIO.Browser;
  function $(...args: Parameters<WebdriverIO.Browser["$"]>): ReturnType<WebdriverIO.Browser["$"]>;
  function $$(
    ...args: Parameters<WebdriverIO.Browser["$$"]>
  ): ReturnType<WebdriverIO.Browser["$$"]>;
}
