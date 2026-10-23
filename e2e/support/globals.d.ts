// The capability tauri-driver reads, added to WebdriverIO's capabilities. The runner's globals
// (`browser`, `$`, Mocha's `describe` and `it`) come from the `types` of e2e/tsconfig.json.
declare namespace WebdriverIO {
  interface Capabilities {
    /** What tauri-driver starts: the app, and the arguments it is given. */
    "tauri:options"?: { application: string; args?: string[] };
  }
}
