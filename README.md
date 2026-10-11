# Hold Explorer

Desktop app that reads the PlantIM "holds" export, shows which piping lines are on hold and why, tracks changes between exports, and recommends which blockers to solve first.

Status: early development. The design is in `docs/superpowers/specs/`.

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

## Data policy

Real project files never enter this repository. Tests generate synthetic workbooks at run time with `hx-synth`.

## License

MIT
