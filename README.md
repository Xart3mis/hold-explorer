# Hold Explorer

Desktop app that reads the PlantIM "holds" export, shows which piping lines are on hold and why, tracks changes between exports, and recommends which blockers to solve first.

Status: early development. The design is in `docs/superpowers/specs/`.

## What it does today

- Keeps several workspaces, each a file of its own with every imported snapshot. The first screen lists them, and a demo workspace can be built from synthetic data.
- Imports an export through a review page: it finds the data sheet, maps the columns (asking where a column is not recognized), reads the snapshot date, and says what it found before anything is written. A trimmed file imports as a limited snapshot.
- Overview: the open holds, the lines on hold, the single-hold lines, and the median age of the snapshot in view, with bars by discipline and by hold type. A bar opens Lines filtered to its value, and the two line tiles open Lines with their preset.
- Filters shared by Overview and Lines, kept per workspace for the session: the status, any value of discipline, hold type, role, name, blocker type, blocker, remark, line, and every extra column, with "is not", age bands, created and released date ranges, size, stress calc, size mismatch, and text. The picker counts how many holds each value would keep.
- Lines: the lines on hold, or every hold, in a table that stays quick at 30,000 holds. Five presets (All, Single hold, Easiest to release, Oldest first, Size mismatch), sorting by any header, rows loaded 200 at a time as the table scrolls.
- A detail panel for a line (its sizes, the blockers to clear in solve order, its open and released holds) and for a hold (every fact of it), opened from the table and kept in the address.
- An older snapshot can be put in view; every screen then shows the data as it stood then.

Breakdown, Blockers, History, People, Follow-up, and Rules are listed in the sidebar and say "Soon". Settings has the theme.

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

The app's own pages open in a browser at `http://localhost:1420/dev.html?state=first-run`, with the commands answered from fixtures (`ui/src/dev/commands.ts`). The states are listed and explained at the top of `ui/src/dev/commands.ts` (`first-run`, `workspaces`, `open`, `older`, the filter, Lines, detail panel, and import states, among others); add `&theme=light` for the light theme. This page is for development only as well, and `pnpm check:dist` fails a build that contains it.

## Data policy

Real project files never enter this repository. Tests generate synthetic workbooks at run time with `hx-synth`.

## License

MIT
