# Hold Explorer

Desktop app that reads the PlantIM "holds" export, shows which piping lines are on hold and why, tracks changes between exports, and recommends which blockers to solve first.

Status: early development. The design is in `docs/superpowers/specs/`.

## What it does today

- Keeps several workspaces, each a file of its own with every imported snapshot. The first screen lists them, and a demo workspace can be built from synthetic data.
- Imports an export through a review page: it finds the data sheet, maps the columns (asking where a column is not recognized), reads the snapshot date, and says what it found before anything is written. A trimmed file imports as a limited snapshot.
- Overview: the open holds, the lines on hold, the single-hold lines, and the median age of the snapshot in view; bars by discipline, hold type, and role; the top ten blockers and the top ten lines; and the holds open for 90 days or more. A bar opens Lines filtered to its value, a top blocker opens it on Blockers, a top line opens it in Lines, and the stale holds open in Lines, oldest first.
- Breakdown: the holds grouped by any dimension, as a list whose groups expand in place to their lines, or as a heatmap of two dimensions (30 values a side, the rest in "All others") whose cells open their holds in Lines. Every chart has a table view and can be read by keyboard.
- Blockers: the full solve order of the blockers the filters keep, as a cumulative curve of lines freed and a table of steps.
- Filters shared by every data screen, kept per workspace for the session: the status, any value of discipline, hold type, role, name, blocker type, blocker, remark, line, and every extra column, with "is not", age bands, created and released date ranges, size, stress calc, size mismatch, and text. The picker counts how many holds each value would keep.
- Lines: the lines on hold, or every hold, in a table that stays quick at 30,000 holds. Five presets (All, Single hold, Easiest to release, Oldest first, Size mismatch), sorting by any header, rows loaded 200 at a time as the table scrolls.
- A detail panel for a line (its sizes, the blockers to clear in solve order, its open and released holds), for a hold (every fact of it), and for a blocker (the lines it frees on its own, the lines others also hold, its linked blockers, its oldest hold, and its step), opened from a table, the curve, or another panel, and kept in the address.
- The layout adapts to windows from 1024 px wide: the panel sits beside the content from 1280 px, the sidebar can be collapsed to a rail, and a narrow table leaves out its least needed columns, which the panel shows.
- An older snapshot can be put in view; every screen then shows the data as it stood then.
- Export: an Export menu in the top bar beside Import, active on Overview, Breakdown, Lines, and Blockers (`Ctrl+E` for Excel). Excel workbooks with real tables, a frozen header, formats, and colors, for the view or as a full workbook of every screen; CSV with a byte-order mark and accents intact; the table, the selected rows, or the line IDs copied as text; charts as PNG or SVG, to a file or the clipboard; and a PDF status report on A4. Several rows can be selected as in Excel, and every table sorts by every column. Files are written whole or not at all, and the notice that follows offers to open the file or show it in its folder.

- Search: one box in the top bar (`/` reaches it) finds lines, blockers, people and roles, remarks, and hold values in the snapshot in view, open and released, grouped and with the match marked. It forgives a misspelling and accepts a wildcard in a line ID, as in `78B01-573-*`. Choosing a result opens the line or the blocker, or filters Lines by the value; Enter applies the text as a filter.
- Saved views: "Save view" in the filter bar keeps the destination, mode, grouping, sort, and filters under a name. The views are kept in the workspace file and listed in the sidebar; one press applies one, and a deleted view can be brought back with Undo.
- Command palette and shortcuts: `Ctrl+K` opens a palette to jump to a destination, a saved view, a snapshot, a workspace, or a line, or to run an action (import, export, clear filters, theme, density). `?` lists every shortcut.
- Settings: theme, density (comfortable or compact), author name, and the workspaces folder, which can be changed with the option of moving the workspace files to the new folder. About shows the version, the workspaces folder, and the settings file, each path with Show in folder.

History, People, Follow-up, and Rules are listed in the sidebar and say "Soon".

## Download

Releases are on the releases page of this repository: https://github.com/Xart3mis/hold-explorer/releases. Each release has three files:

- `HoldExplorer-<version>-windows-x64.exe`: Windows 10 and 11, x64. It is portable: there is nothing to install and it needs no admin rights. Put it in any folder and start it.
- `HoldExplorer-<version>-linux-x86_64.AppImage`: Linux, x64. Make it executable (`chmod +x HoldExplorer-<version>-linux-x86_64.AppImage`) and start it.
- `SHA256SUMS.txt`: the SHA-256 checksum of each of the other two files.

### Check the download

Download `SHA256SUMS.txt` to the same folder as the app, then compare the checksums. A file whose checksum differs is damaged or is not the file that was published; delete it and download it again.

- Windows, in PowerShell, in that folder:

      Get-FileHash .\HoldExplorer-<version>-windows-x64.exe -Algorithm SHA256

  Compare the `Hash` it prints with the line for the `.exe` in `SHA256SUMS.txt`. PowerShell prints the hash in capitals and the file has it in small letters; the letters and digits must be the same.

- Linux, in that folder:

      sha256sum --check --ignore-missing SHA256SUMS.txt

  It prints `OK` after the name of each file it found and checked.

### The first start on Windows

The executable is not signed. On the first start of a downloaded copy, Windows SmartScreen may say "Windows protected your PC" and offer only "Don't run". Check the checksum first, then choose "More info" and "Run anyway". Windows asks again only for a newly downloaded file.

### The update check

When it starts, at most once a day, Hold Explorer asks GitHub whether a newer release is out. If one is, a notice says so and offers the release page or to skip that version. Nothing is downloaded or installed by the app.

The request goes to the GitHub API and carries the app's version number (in a `User-Agent` of `HoldExplorer/<version>`). It sends only its version number to GitHub: no file, no workspace data, no name, and no identifier. GitHub sees the network address the request comes from, as with any request. The app makes no other network request, and everything else works offline.

To turn the check off, open Settings and clear "Check for updates at start".

## Development

    cargo test --workspace

The parity test needs Node.js on the PATH.

## Develop

Prerequisites on both systems: Rust 1.97 (the repository pins it), Node.js 22 or newer, and pnpm 11 (`corepack enable` uses the version in `package.json`).

- Linux: the packages Tauri needs: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.
- Windows: the Microsoft C++ Build Tools (MSVC) and WebView2, which ships with Windows 10 and 11.

Install the interface dependencies once with `pnpm install`. Then:

    pnpm dev                        Vite dev server on port 1420
    pnpm build                      type-check, then build the interface into dist/
    pnpm tauri dev                  the app, with the dev server
    pnpm tauri build --no-bundle    release binary with the interface embedded
    pnpm test                       Vitest, once
    pnpm lint                       ESLint, Stylelint, and Prettier check
    pnpm typecheck                  tsc --noEmit
    pnpm bindings                   regenerate ui/src/bindings (cargo test with the ts feature)
    pnpm tokens                     regenerate ui/src/design/tokens.css from the tables in DESIGN.md
    pnpm check:dist                 after a build: fail if dist/ names another host

The types in `ui/src/bindings/` are generated from Rust and committed. CI fails when they are out of date.

The stylesheet of design tokens, `ui/src/design/tokens.css`, is generated from `DESIGN.md` and committed. A test fails when the two differ; change the table in `DESIGN.md`, then run `pnpm tokens`.

While `pnpm dev` runs, `http://localhost:1420/gallery.html` shows every base component in every state, in both themes. The gallery is for development only and is not part of the build.

The app's own pages open in a browser at `http://localhost:1420/dev.html?state=first-run`, with the commands answered from fixtures (`ui/src/dev/commands.ts`). The states are listed and explained at the top of `ui/src/dev/commands.ts` (`first-run`, `workspaces`, `open`, `older`, the filter, Lines, detail panel, Breakdown, Blockers, and import states, among others); add `&theme=light` for the light theme. This page is for development only as well, and `pnpm check:dist` fails a build that contains it.

## Data policy

Real project files never enter this repository. Tests generate synthetic workbooks at run time with `hx-synth`.

## License

MIT

## Third-party fonts

The interface and the files Hold Explorer writes use two typefaces under the SIL Open Font License 1.1:

- Public Sans, copyright 2015 The Public Sans Project Authors.
- Reddit Mono, copyright 2020-23 Reddit, Inc.

The interface bundles them from npm (`@fontsource-variable/public-sans` and `@fontsource-variable/reddit-mono`). The export crate embeds static instances of them in `crates/export/fonts/`, with their license texts (`OFL-PublicSans.txt`, `OFL-RedditMono.txt`) and a `README.md` that says where they come from and how they were made. The fonts are under their own license, not under the MIT license of this project.
