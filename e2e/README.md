# End-to-end tests

These tests drive the built app on Linux, as a user does: they start it, press its buttons, and
type into it. WebdriverIO talks to `tauri-driver`, which starts `WebKitWebDriver`, which starts the
app. The app is built with the cargo feature `e2e`, in which the open and save dialogs are
answered with paths from the environment (`HX_E2E_OPEN`, `HX_E2E_SAVE_DIR`) and the update check
never runs. The release build has none of this.

Each spec file in `specs/` runs alone, in a fresh home, config, and data folder of its own, with
its own `tauri-driver`. Before its tests, `hx-cli synth` writes a synthetic workbook into that
folder; the open dialog answers with it. No real project file is used.

| Spec              | What it does                                                                   |
| ----------------- | ------------------------------------------------------------------------------ |
| `demo.e2e.ts`     | Starts the app, opens the demo workspace, and reads the four Overview figures. |
| `import.e2e.ts`   | Imports the synthetic workbook, reviews it, commits it, and sees the Overview. |
| `filter.e2e.ts`   | Adds a Discipline filter and sees the count of holds change.                   |
| `search.e2e.ts`   | Searches for a line ID and opens the line in the panel.                        |
| `views.e2e.ts`    | Saves a view, clears the filters, applies the view, and sees its chip again.   |
| `export.e2e.ts`   | Exports "Excel, this view" and checks the saved file is a workbook over 1 KB.  |
| `keys.e2e.ts`     | Opens the command palette with Ctrl+K and the shortcuts with `?`.              |
| `date.e2e.ts`     | Prints how WebKitGTK writes 30 September 2026, and checks the page agrees.     |

## Running them on Linux

What CI does (`.github/workflows/ci.yml`, job `e2e`), on Ubuntu:

1. Install the packages Tauri builds with, the WebKit driver, and a virtual display:

   ```sh
   sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
     libssl-dev libayatana-appindicator3-dev librsvg2-dev webkit2gtk-driver xvfb
   ```

   On another distribution, `WebKitWebDriver` comes with its WebKitGTK package or a package of
   its own; it must be on the `PATH`.

2. Install `tauri-driver`, at the version CI uses:

   ```sh
   cargo install tauri-driver --version 2.1.0 --locked
   ```

   It goes to `~/.cargo/bin`, which must be on the `PATH`. Set `TAURI_DRIVER` to its path to use
   another copy.

3. Install the dependencies, and build the app with the `e2e` feature and the command line:

   ```sh
   pnpm install
   pnpm e2e:build
   ```

   This builds `target/debug/hx-desktop` with the interface in it, and `target/debug/hx-cli`.
   Build again after a change to the app or the interface.

4. Run the tests:

   ```sh
   pnpm e2e
   ```

   On a desktop the window opens on the screen while the tests run. Without a display, or to
   keep the window off the screen, run them on a virtual one as CI does:

   ```sh
   xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" pnpm e2e
   ```

   One spec file: `pnpm e2e --spec e2e/specs/import.e2e.ts`.

## Logs

WebdriverIO's logs, and each `tauri-driver` log with what the app printed, are written to
`target/e2e/logs/`. CI keeps that folder as the artifact `e2e-logs` when the job fails.

The date spec prints a line such as `WebKitGTK writes formatDate("2026-09-30") as "30 Sept 2026".`
That records whether WebKitGTK writes the short September as "Sept" or "Sep"; the Windows smoke
test records the same for WebView2.
