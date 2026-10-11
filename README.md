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
    pnpm lint                       ESLint and Prettier check
    pnpm typecheck                  tsc --noEmit
    pnpm bindings                   regenerate ui/src/bindings (cargo test with the ts feature)

The types in `ui/src/bindings/` are generated from Rust and committed. CI fails when they are out of date.

## Data policy

Real project files never enter this repository. Tests generate synthetic workbooks at run time with `hx-synth`.

## License

MIT
