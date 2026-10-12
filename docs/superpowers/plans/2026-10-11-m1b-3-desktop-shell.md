# M1b-3 Desktop Shell and Import Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A desktop app that starts, opens or creates a workspace, imports a PlantIM export through a mapping step and a review page into the history store, and shows the stored snapshot's headline numbers.

**Architecture:** A thin Tauri 2 crate (`src-tauri`, package `hx-desktop`) holds application state and exposes commands; each command is a few lines around a plain Rust function that is tested without a window. The React interface (`ui/`) presents what the commands return and holds no business rules. The types that cross the boundary are generated from the Rust types.

**Tech Stack:** Rust 1.97, Tauri 2.12, `ts-rs` 12; TypeScript, React 19, Vite, React Router, TanStack Query, React Aria Components, CSS Modules with design tokens, i18next; Vitest and Testing Library; pnpm.

## Where this plan sits

Milestone 1 (Core) is split into plans: M1a core engine (merged), M1b-1 API pass (merged), M1b-2 history store (merged), **M1b-3 desktop shell and import flow (this plan)**, M1c screens, filters, search, saved views, and keyboard, M1d export, update check, and release pipeline.

When this plan is done the app is a vertical slice: every layer exists and is connected, with one real flow (import) and one real screen (a first Overview). M1c widens it.

## How this plan is written

Each task gives the files, the exact public interface (commands, types, component names) that later tasks rely on, the rules, and the test cases. It does not give the implementation. The test cases are the requirements. Facts about Tauri 2 that this plan relies on were researched on 2026-10-11 and are kept in the working notes handed to each implementer; where a call does not compile as written there, the implementer reads the crate source and reports what was adapted.

## Decisions this plan rests on

1. **Generated types: `ts-rs`.** The spec (5.2) wants no type written twice. `tauri-specta` would also generate the command wrappers, but it has no stable release for Tauri 2 and forbids 64-bit integers by default. `ts-rs` is stable and generates types only; the command wrappers are written once, by hand, in one file. Large integers are exported as `number`: source ids are exact whole numbers within ±2^53 by the import rules, and the other integers are counts and row ids.
2. **Layout.** `package.json` at the repository root, the interface in `ui/`, the Tauri crate in `src-tauri/` as a member of the Cargo workspace. The Tauri CLI finds `src-tauri` below the directory it is run from, so the root is where it runs.
3. **Commands address a workspace by its id**, never by a path. The interface receives paths only as display text and sends paths only when they come from a file dialog or a drop.
4. **The file being imported stays in Rust state.** The interface receives a slim view (headers, a preview, the proposed mapping) and sends back only the mapping the user edited.
5. **One open workspace, one import draft at a time.** State is one `Mutex`.
6. **The sidebar shows every destination of the spec; those not built yet open a "coming soon" screen** (decided by the owner, 2026-10-11). In this plan Overview and Settings are real. Breakdown, Lines, Blockers, History, People, Follow-up, and Rules each open a screen that names the destination, says in one or two sentences what it will show, and says it is not available yet. These screens are a product decision, not unfinished work: each is a complete, tested page, and the plan that builds a destination replaces its screen.
7. **Not in this plan:** bulk import (spec 6.6), deleting a workspace or a snapshot from the interface, the history bundle, the update check, signed or published builds, and end-to-end tests through WebDriver. Each belongs to the plan named in "Left for later plans".
8. **Interface libraries.** React Aria Components for controls (keyboard and focus behaviour, a table with arrow-key movement, a drop zone); TanStack Query for command results (a refetch keeps the previous result on screen, as spec 13.1 asks); React Router for the page-level flows; CSS Modules over design tokens, no utility framework; i18next for text.

## Global Constraints

- Real project files never enter the repository. Tests build inputs with `hx-synth` or write small text files, in temporary directories.
- `hx-core` and `hx-store` do not depend on Tauri. `ts-rs` enters them only behind a cargo feature named `ts`.
- A Tauri command contains no logic beyond locking state, calling one function of `hx_desktop::app`, and mapping the error. Everything else is in functions that take plain arguments and are tested without a window.
- The interface computes no counts, ages, groups, dates, or blockers. It shows what commands return.
- No type that crosses the boundary is written by hand in `ui/`. Generated files live in `ui/src/bindings/`, are committed, and CI fails when they are out of date.
- Rust: edition 2021, toolchain 1.97.0. `hx-desktop` declares `rust-version = "1.90"` (Tauri 2.12's minimum); the other crates keep `1.88`. `#![forbid(unsafe_code)]` in every crate. No `unwrap()` or `expect()` outside tests, except on values that cannot fail by construction, with a message saying why. No `#[allow]`.
- Pinned versions: `tauri` 2.12, `tauri-build` 2.7, `@tauri-apps/cli` 2.12, `@tauri-apps/api` 2.12, `tauri-plugin-dialog` 2.8, `tauri-plugin-single-instance` 2.5, `tauri-plugin-opener` 2.7, `tauri-plugin-window-state` 2.5, `ts-rs` 12.0. The npm and crate minors of Tauri match.
- TypeScript is strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`, no `@ts-ignore`, no non-null assertion on a value that can be absent.
- The app makes no network request. The content security policy allows only the app's own files and the command channel. Fonts are bundled.
- Every user-facing string is in `ui/src/locales/en.json`. A component contains no literal user-facing text. Terms: Hold, Line, Blocker, Snapshot, Workspace, Saved view.
- Every error shown to the user says what happened, why, and how to fix it. Commands return errors as `{ kind, message }`; the message is the Rust error's text.
- Interface rules from spec 13.1 bind every screen: each component has its default, hover, focus, active, disabled, loading, and error states; a first load shows skeletons; a refetch keeps the previous render, dimmed; an empty state names the next action; motion lasts 150 to 250 ms, marks state changes only, and respects reduced motion; nothing is reachable by hover alone; contrast meets WCAG AA in both themes; no colored side stripes, nested cards, gradient text, decorative glass, or gradient hero tiles. The mapping step and the import review are pages, not dialogs.
- Every action is reachable by keyboard, and focus is always visible.
- Colors, type sizes, spacing, radii, and motion come from the tokens in `DESIGN.md`. A component uses no literal color, size, or duration.
- The parity tests and `tools/parity/reference.mjs` do not change. The existing performance limits stay.
- Commit messages follow Conventional Commits.

## File Structure

```
PRODUCT.md, DESIGN.md                      design context (Task 1)
package.json, pnpm-lock.yaml, vite.config.ts, tsconfig.json, eslint.config.js, .prettierrc.json
.cargo/config.toml                         where generated types are written
ui/index.html
ui/src/main.tsx                            entry: providers, router
ui/src/api/                                invoke wrappers (commands.ts), query keys, error type
ui/src/bindings/                           generated types (committed)
ui/src/design/                             tokens.css, theme.ts, fonts
ui/src/components/                         base components, one folder each
ui/src/features/shell/                     top bar, sidebar, layout, notices
ui/src/features/welcome/                   first run
ui/src/features/workspaces/                switcher, create, rename
ui/src/features/import/                    file entry, sheet choice, mapping page, review page
ui/src/features/overview/                  first Overview
ui/src/features/settings/                  theme, data folder
ui/src/features/coming-soon/               the screen for destinations not built yet
ui/src/locales/en.json
ui/src/test/                               setup, IPC mock helpers, fixtures
src-tauri/Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, icons/
src-tauri/src/main.rs                      calls hx_desktop::run()
src-tauri/src/lib.rs                       builder, plugins, command registration
src-tauri/src/commands.rs                  thin #[tauri::command] functions
src-tauri/src/app/mod.rs                   AppState
src-tauri/src/app/error.rs                 CommandError
src-tauri/src/app/settings.rs              settings file
src-tauri/src/app/workspaces.rs            list, create, open, rename
src-tauri/src/app/import.rs                import draft, review, commit
src-tauri/src/app/snapshots.rs             selection, overview
src-tauri/src/app/demo.rs                  demo workspace
```

---

### Task 1: Product and design context

**Files:** new `PRODUCT.md`, `DESIGN.md` at the repository root; new `tools/design/check-tokens.mjs`.

**Why:** Every later interface task takes its colors, type, spacing, component anatomy, and copy tone from these two files, and the design skills used for review read them.

**Sources:** the design spec, sections 1, 2, 9, 10, and 13 (register, restrained color, the scene, dark by default with a designed light theme, the anchors Linear, Stripe Dashboard, and Excel, the interface rules, the chart rules).

**`PRODUCT.md` contains:** register (`product`); who uses the app and in what setting (the two scenes of spec 13); what the product is for; the tone of its text (plain, specific, no marketing voice, the glossary terms); anti-references (what it must not look like, including the banned patterns); the strategic principles (the tool disappears into the task; familiar patterns are a feature; calm overview, dense detail; keyboard first; nothing silently changed).

**`DESIGN.md` contains, with exact values:**

- Color tokens for the dark theme and the light theme, each designed on its own, in OKLCH: surfaces (app background, panel, raised, overlay), borders (subtle, strong), text (primary, secondary, muted, on-accent), one accent with hover and active steps and a subtle background step, focus ring, and state colors (danger, warning, success, info) each with a text step and a subtle background step. Neutrals are tinted toward the accent hue; no pure black or white.
- A chart palette: one sequential hue from light to dark (heatmap, age bands), a categorical set of six plus "Other" in a fixed order, and reserved status colors that are not in the categorical set. Each set is given for both themes.
- Type: one bundled sans-serif family and one bundled monospace family, both under an open license, named with their npm font packages; a fixed scale (size, line height, weight) for page title, section title, body, table, label, and caption, with a ratio of at least 1.25 between steps; tabular figures in tables, proportional on stat tiles.
- Spacing scale, radii, border widths, elevation (shadows per theme), z-index layers.
- Motion: durations between 150 and 250 ms, one ease-out curve, and the reduced-motion rule.
- Density: row heights and paddings for the two densities, comfortable and compact.
- Layout: the shell's regions and their sizes (top bar height, sidebar width, detail panel width, content max width for pages of text).
- Component anatomy and states for: button (primary, secondary, quiet, danger), text field, select, checkbox, table (header, row, selected row, focus), tabs, stat tile, bar row, notice (inline) and toast (with an undo action), skeleton, empty state, page header, sidebar item, drop zone, progress.

**Rules:**
- The theme choice is justified by the scene sentences, not by category. The accent is checked against the two reflex tests of the design skill (it must not be the color anyone would guess from "engineering tool").
- `tools/design/check-tokens.mjs` reads the token tables from `DESIGN.md` and fails when any text-on-surface pair used by a component is below 4.5:1 (3:1 for large text and for borders of controls and the focus ring), in either theme. The chart palette is checked with the validator of the data visualization skill for both themes; its output is recorded.
- No em dashes in either file.

**Verification:** `node tools/design/check-tokens.mjs` passes; the palette validator passes for both themes; every token named in a component section exists in a token table.

**Commit:** `docs: add product and design context`

---

### Task 2: Boundary types in core and store

**Files:** `crates/core/Cargo.toml`, `crates/store/Cargo.toml`, root `Cargo.toml`, new `.cargo/config.toml`; `crates/core/src/{load.rs, mapping.rs, model.rs, import.rs, warning.rs, error.rs, snapshot_date.rs, filter.rs, query.rs, table.rs}`; `crates/store/src/{snapshot.rs, workspace.rs, directory.rs, error.rs}`; `crates/cli/src/main.rs` for the renamed field.

**Interface:**

```rust
// hx-core, load.rs
/// What the interface needs to show a file that is open but not yet imported.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OpenedView {
    pub file_name: String,
    pub content_hash: String,
    pub sheet_name: String,
    pub sheets: Vec<String>,
    pub headers: Vec<String>,
    /// The first rows as display text, one entry per header.
    pub preview: Vec<Vec<String>>,
    pub auto_map: ColumnMap,
    pub error_cells: usize,
    pub row_count: usize,
}
impl Opened {
    /// The slim view, with at most `preview_rows` rows.
    pub fn view(&self, preview_rows: usize) -> OpenedView;
}

// hx-store, snapshot.rs
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ImportOptions {
    pub replace: Option<i64>,
    /// Stored as the workspace's saved mapping in the import's transaction.
    pub save_mapping: Option<SavedMapping>,
    /// Added to the workspace's project numbers in the import's transaction.
    pub add_project_number: Option<String>,
}
pub struct SnapshotDetail {
    pub snapshot: SnapshotInfo,          // was `info`
    pub detected: Option<SnapshotDate>,
    pub info_sheet: BTreeMap<String, String>,
    /* headers, mapping, skipped, warnings unchanged */
}
```

**Rules:**
- Feature `ts` on `hx-core` and on `hx-store` (which turns on `hx-core/ts`): an optional dependency on `ts-rs` with its `chrono-impl` feature. Every type that is `Serialize` and public in the two crates derives `ts_rs::TS` with `#[ts(export)]` under `#[cfg_attr(feature = "ts", ...)]`. Without the feature, nothing changes and `ts-rs` is not compiled.
- `.cargo/config.toml` sets, under `[env]`, `TS_RS_EXPORT_DIR` to `ui/src/bindings` (relative to the repository root) and `TS_RS_LARGE_INT` to `number`.
- The JSON shapes that existing tests pin do not change: unit enums are strings, `Dim` is `"Discipline"` or `{"Custom":"Area"}`, errors are tagged with `kind`, dates are ISO text, `None` is `null`.
- The generated TypeScript must agree with the JSON: for each exported type that has a JSON round-trip test, a test checks that the generated declaration exists and names the same fields as the JSON object's keys.
- `ImportOptions::save_mapping` and `add_project_number` are written inside the import's transaction; a failed import stores neither. `hx-cli ws import` uses them and no longer writes after the commit.
- `SnapshotDetail.info` is renamed `snapshot` everywhere (the store, the CLI, their tests). The stored format does not change.
- `OpenedView.preview` shows each cell as the import would read it as text: numbers without a trailing `.0`, dates as ISO text, empty cells as `""`.

**Tests:** `Opened::view` on a synthetic workbook (headers, row count, a preview of 3 rows with a date cell and a number cell, the automatic mapping) and on a delimited text file; `view(0)` has an empty preview; with the feature on, `cargo test -p hx-core -p hx-store --features hx-store/ts` writes one `.ts` file for each exported type into the export directory and the set of files is listed in a test; `i64` and `usize` fields are `number` and `NaiveDateTime` is `string` in the generated text; `BTreeMap<Field, usize>` is a partial record keyed by the field names; an import with `save_mapping` and `add_project_number` stores both, and the trigger-based failed import stores neither; the CLI tests still pass with the transaction-bound writes.

**Commit:** `feat(core,store): add the types the desktop shell exchanges`

---

### Task 3: Scaffold the desktop crate, the interface toolchain, and CI

**Files:** root `Cargo.toml`, new `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `ui/index.html`, `ui/src/main.tsx`, `ui/src/test/setup.ts`; new `src-tauri/{Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, icons/*, src/main.rs, src/lib.rs}`; `.github/workflows/ci.yml`; `.gitignore`; `README.md`.

**Interface:**

```
pnpm dev          Vite dev server on port 1420
pnpm build        type-check, then build the interface into dist/
pnpm tauri dev    the app, with the dev server
pnpm tauri build --no-bundle    release binary with the interface embedded
pnpm test         Vitest, once
pnpm lint         ESLint and Prettier check
pnpm typecheck    tsc --noEmit
pnpm bindings     regenerate ui/src/bindings (cargo test with the ts feature)
```

`hx_desktop::run()` builds the Tauri app. The window label is `main`, its title `Hold Explorer`, its minimum size 960 by 600.

**Rules:**
- `src-tauri` is a workspace member, package `hx-desktop`, library name `hx_desktop`. Its default features do not include `custom-protocol`, so `cargo clippy --workspace` and `cargo test --workspace` need no built interface.
- Plugins, in this order: single instance (a second launch focuses and un-minimizes the `main` window), window state, dialog, opener. The capability file grants `core:default`, `dialog:default`, `opener:default`, `window-state:default` to the window `main` and nothing else.
- `tauri.conf.json`: identifier `io.github.xart3mis.holdexplorer`; `devUrl` `http://localhost:1420`; `frontendDist` `../dist`; the content security policy of the working notes for the build and for dev; `bundle.targets` `["appimage"]`; file drop enabled.
- Icons are generated with `pnpm tauri icon` from one SVG source kept in `src-tauri/icons/source.svg`: a plain mark, the accent color of `DESIGN.md` on its dark surface, no gradient.
- The release profile in the root `Cargo.toml`: `codegen-units = 1`, `lto = true`, `opt-level = "s"`, `strip = true`. `panic` stays `unwind`, so a failure inside a background task is reported instead of ending the app.
- The interface at this stage renders one page with the product name from the text catalog, in the dark theme's app background and primary text color from `DESIGN.md`, so the toolchain is proven end to end.
- ESLint: `typescript-eslint` strict type-checked rules, `react-hooks`, `jsx-a11y`. Prettier formats `ui/`, the config files, and the JSON.
- CI, on `ubuntu-latest` and `windows-latest`: install the Linux packages of the working notes (Linux only); Rust 1.97.0; Node 22 and pnpm with the lockfile frozen; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm bindings` followed by `git diff --exit-code ui/src/bindings`; then the existing Rust steps (fmt, clippy, tests, performance); then `pnpm tauri build --no-bundle` and a step that prints the size of the binary. Rust build output is cached.
- `README.md` gains a "Develop" section: prerequisites for Linux and Windows, and the commands above.
- `.gitignore` gains `src-tauri/gen/` if the build writes schemas there, and keeps `dist/` and `node_modules/`.

**Tests:** a Vitest test renders the root component and finds the product name from the catalog; `cargo test -p hx-desktop` has one test that the capability file grants exactly the four permission sets; by hand, `pnpm tauri dev` opens the window, a second `pnpm tauri dev`-built binary launch focuses the first, and `pnpm tauri build --no-bundle` leaves a binary that starts without the dev server; the size of that binary is recorded in the report.

**Commit:** `feat(desktop): scaffold the Tauri shell, the interface toolchain, and CI`

---

### Task 4: Application state, settings, errors, and workspace commands

**Files:** `src-tauri/src/app/{mod.rs, error.rs, settings.rs, workspaces.rs}`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`; new `ui/src/api/{commands.ts, error.ts, keys.ts}`, `ui/src/test/ipc.ts`.

**Interface:**

```rust
// error.rs
/// What a failed command returns: the error's kind and its full text.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct CommandError { pub kind: String, pub message: String }
impl From<StoreError> for CommandError;      // kind = the variant name
impl From<ImportError> for CommandError;     // kind = the variant name
// further kinds made here: "NoWorkspace", "NoDraft", "WorkspaceNotFound", "Settings", "Internal"

// settings.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
pub enum Theme { #[default] Dark, Light, System }
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(default)]
pub struct Settings {
    pub theme: Theme,
    /// Where workspaces are kept; `None` means the default folder.
    pub workspace_dir: Option<String>,
    pub last_workspace: Option<String>,
}
pub fn load_settings(config_dir: &Path) -> Settings;                       // a missing or unreadable file gives the defaults
pub fn save_settings(config_dir: &Path, settings: &Settings) -> Result<(), CommandError>;

// workspaces.rs
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct WorkspaceView { pub id: String, pub name: String, pub project_numbers: Vec<String>,
    pub created_at: NaiveDateTime, pub snapshot_count: usize, pub latest_taken_at: Option<NaiveDateTime> }
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct UnreadableView { pub file_name: String, pub path: String, pub kind: String, pub message: String }
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct WorkspaceListView { pub workspaces: Vec<WorkspaceView>, pub unreadable: Vec<UnreadableView>, pub folder: String }
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct WorkspaceOpen { pub workspace: WorkspaceView, pub snapshots: Vec<SnapshotInfo>, pub selected: Option<i64> }
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct AppStart { pub version: String, pub settings: Settings, pub list: WorkspaceListView, pub open: Option<WorkspaceOpen> }

// mod.rs
pub struct AppState { /* config dir, default data dir, settings, open workspace, selected snapshot, cached dataset, import draft */ }
impl AppState {
    pub fn new(config_dir: PathBuf, data_dir: PathBuf) -> AppState;
    pub fn start(&mut self) -> AppStart;                                   // reopens the last workspace when it can
    pub fn set_theme(&mut self, theme: Theme) -> Result<Settings, CommandError>;
    pub fn list_workspaces(&self) -> Result<WorkspaceListView, CommandError>;
    pub fn create_workspace(&mut self, name: &str) -> Result<WorkspaceOpen, CommandError>;
    pub fn open_workspace(&mut self, id: &str) -> Result<WorkspaceOpen, CommandError>;
    pub fn rename_workspace(&mut self, name: &str) -> Result<WorkspaceView, CommandError>;
}
```

Commands (each a wrapper of the method of the same meaning): `app_start`, `settings_set_theme(theme)`, `workspace_list`, `workspace_create(name)`, `workspace_open(id)`, `workspace_rename(name)`.

```ts
// ui/src/api/commands.ts: one typed function per command, the only place that calls invoke
export const api = {
  appStart(): Promise<AppStart>,
  setTheme(theme: Theme): Promise<Settings>,
  workspaceList(): Promise<WorkspaceListView>,
  workspaceCreate(name: string): Promise<WorkspaceOpen>,
  workspaceOpen(id: string): Promise<WorkspaceOpen>,
  workspaceRename(name: string): Promise<WorkspaceView>,
};
// ui/src/api/error.ts
export function asCommandError(value: unknown): CommandError;   // anything else becomes kind "Internal"
// ui/src/test/ipc.ts
export function mockCommands(handlers: Partial<{ [K in CommandName]: (args: ArgsOf<K>) => ResultOf<K> }>): void;
```

**Rules:**
- The settings file is `settings.json` in the app's configuration directory; workspaces live in `workspaces/` under the app's data directory unless `workspace_dir` is set. The command layer passes both directories in; `app` never asks Tauri for a path.
- Settings are written to a temporary file beside the target and renamed over it. A settings file that cannot be parsed is kept as `settings.json.unreadable` and defaults are used; nothing is lost silently.
- Opening a workspace closes the one that was open, clears the selected snapshot (the newest becomes selected), clears the cached dataset and any import draft, and records the id as `last_workspace`.
- `start` reopens `last_workspace` when it is in the folder and readable; otherwise `open` is `None` and no error is raised.
- A workspace id that is not in the folder gives the kind `WorkspaceNotFound`. `rename_workspace` without an open workspace gives `NoWorkspace`.
- `WorkspaceListView.workspaces` is sorted by name without regard to case, then by id. `UnreadableView.message` is the store error's text; `kind` its variant.
- `WorkspaceView`, `UnreadableView`, and the other views use `String` for paths (lossy), so serialization cannot fail on an unusual path.
- A command that touches the workspace file runs off the main thread.
- In `ui/`, only `api/commands.ts` imports `invoke`. A lint rule forbids importing `@tauri-apps/api/core` anywhere else.

**Tests (Rust, with temporary directories):** defaults when no settings file exists; theme saved and read back; an unparseable settings file is set aside and defaults are returned; create then list shows the workspace; two workspaces list in name order whatever their case; opening by id returns its snapshots, the newest selected; `start` reopens the last workspace; `start` with a last workspace that was deleted returns no open workspace and still lists the others; an unreadable workspace (version 99) appears in `unreadable` with kind `NewerSchema` and its message; an unknown id gives `WorkspaceNotFound`; rename persists and a blank name becomes the store's default name; `CommandError` from each `StoreError` and `ImportError` variant carries the variant name and the error text.

**Tests (interface):** `asCommandError` on a command error object, a string, and an `Error`; `mockCommands` returns typed results and rejects with a `CommandError` when a handler throws one; a compile-time test file asserts that each `api` function's result type is the generated type.

**Commit:** `feat(desktop): add application state, settings, and workspace commands`

---

### Task 5: Import commands

**Files:** `src-tauri/src/app/import.rs`, `mod.rs`, `commands.rs`; `ui/src/api/commands.ts`.

**Interface:**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct ImportDraft {
    pub file: OpenedView,
    /// Required fields the proposed mapping does not cover; empty when the file can be read as it is.
    pub missing_required: Vec<Field>,
    /// True when the workspace's saved mapping changed the automatic one.
    pub used_saved_mapping: bool,
}
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct WarningGroup { pub kind: WarningKind, pub count: usize, pub examples: Vec<ImportWarning> }
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct ImportTarget {
    /// The open workspace when the file's project number is among its numbers or it has none yet.
    pub suggested: Option<String>,
    /// Every workspace whose project numbers include the file's.
    pub matching: Vec<WorkspaceView>,
    pub all: Vec<WorkspaceView>,
}
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct ImportReview {
    pub file_name: String,
    pub project_no: Option<String>,
    pub detected: Option<SnapshotDate>,
    /// True when the date is known only from the file's modified time, or not at all.
    pub date_needs_confirmation: bool,
    pub row_count: usize, pub open_count: usize, pub released_count: usize, pub limited: bool,
    pub skipped_count: usize, pub skipped: Vec<SkippedRow>,            // at most 200
    pub warning_count: usize, pub warnings: Vec<WarningGroup>,         // at most 5 examples each
    pub mapping: ColumnMap,
    pub target: ImportTarget,
}
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct TargetCheck { pub already_imported: Option<SnapshotInfo>, pub same_day: Vec<SnapshotInfo> }
#[derive(Debug, Clone, PartialEq, Deserialize, TS)]
#[serde(tag = "kind")]
pub enum TargetChoice { Existing { id: String }, New { name: String } }
#[derive(Debug, Clone, PartialEq, Deserialize, TS)]
pub struct ImportCommit { pub target: TargetChoice, pub taken_at: NaiveDateTime, pub date_edited: bool, pub replace: Option<i64> }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
pub enum ImportPhase { Reading, Checking, Storing, Done }
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct ImportDone { pub open: WorkspaceOpen, pub snapshot: SnapshotInfo }

impl AppState {
    pub fn import_open(&mut self, path: &Path) -> Result<ImportDraft, CommandError>;
    pub fn import_choose_sheet(&mut self, sheet: &str) -> Result<ImportDraft, CommandError>;
    /// Parses the draft with `fields` (field to column index), or with the proposed mapping when `None`.
    pub fn import_review(&mut self, fields: Option<BTreeMap<Field, usize>>) -> Result<ImportReview, CommandError>;
    pub fn import_check_target(&self, target: &TargetChoice, taken_at: NaiveDateTime) -> Result<TargetCheck, CommandError>;
    pub fn import_commit(&mut self, request: ImportCommit, progress: &dyn Fn(ImportPhase)) -> Result<ImportDone, CommandError>;
    pub fn import_cancel(&mut self);
}
```

Commands: `import_open(path)`, `import_choose_sheet(sheet)`, `import_review(fields)`, `import_check_target(target, takenAt)`, `import_commit(request, onProgress)` (the progress callback is a Tauri channel of `ImportPhase`), `import_cancel()`. Matching functions in `api`.

**Rules:**
- `import_open` reads the file with `hx_core::load::open_file`, keeps the `Opened` in the draft, and proposes `ColumnMap::auto_with` from the open workspace's saved mapping when there is one, else `ColumnMap::auto`. The preview has 20 rows. A second `import_open` replaces the draft.
- `import_review` builds the mapping (`ColumnMap::from_fields` for an edited one), parses with `parse_opened`, keeps the `Loaded` in the draft, and reports. A mapping that leaves a required field out gives the import error for missing columns, with the fields.
- `released_count` is `row_count - open_count`. `skipped` is capped at 200 rows and warnings at 5 examples per kind; the counts are the full numbers. Warning groups are in a fixed order of kind.
- `ImportTarget.suggested`: the open workspace when the file has no project number, or when the open workspace has no project numbers yet, or when its numbers include the file's; else the only matching workspace when exactly one matches; else `None`.
- `import_check_target` reports, for an existing workspace, the snapshot with the same content hash if any, and the snapshots dated on the same calendar day as `taken_at`. For a new workspace both are empty. It never writes.
- `import_commit`: the date is `taken_at` with the detected source when `date_edited` is false and a date was detected; otherwise source `User`. A date whose year is outside 2000 to 2100 is refused with a message that names the range. It creates the workspace for `New`, opens the target, imports with `ImportOptions { replace, save_mapping: the mapping used, add_project_number: the file's }`, selects the new snapshot, clears the draft, and returns the open workspace with its snapshots. If the import fails after a workspace was created for it, that new workspace file is removed.
- `progress` is called with `Reading` (before parsing, when the draft has no parsed file yet), `Checking`, `Storing`, and `Done`, in that order.
- A command without a draft gives the kind `NoDraft`. `import_cancel` clears the draft and never fails.
- The command wrappers for `import_open`, `import_review`, and `import_commit` run off the main thread.

**Tests (Rust):** open a synthetic workbook: the draft has the headers, 20 preview rows, no missing fields; open a text file with headers `Kind,Line,Why`: `missing_required` lists the three required fields, and `import_review(None)` gives the missing-columns error; the same file with an edited mapping reviews and commits; a workspace with a saved mapping for those headers makes the next draft complete with `used_saved_mapping` true; a workbook with two sheets: `import_choose_sheet` switches and an unknown sheet gives the sheet-not-found error naming the sheets; review counts equal those of `load_file` on the same file; a file with 300 skipped rows reports `skipped_count` 300 and 200 rows; warnings of two kinds are grouped with their counts and at most 5 examples; `date_needs_confirmation` is true for a text file without a date in its name and false for the synthetic workbook; target suggestion for each of its four cases; `import_check_target` finds the same file already imported, and a different file dated the same day; commit into a new workspace creates it, stores the snapshot, the saved mapping, and the project number, and returns it open with the snapshot selected; commit with an unedited date keeps the detected source and with an edited date stores `User` with the detected date kept; year 1999 and 2101 are refused and nothing is stored; commit of an already imported file gives `AlreadyImported` and, for target `New`, leaves no workspace file behind; `replace` removes the named snapshot; progress phases arrive in order; every method without a draft gives `NoDraft`; opening another workspace clears the draft.

**Commit:** `feat(desktop): add the import commands`

---

### Task 6: Snapshot selection, the overview query, and the demo workspace

**Files:** `src-tauri/src/app/{snapshots.rs, demo.rs, mod.rs}`, `commands.rs`, `src-tauri/Cargo.toml`; `ui/src/api/commands.ts`.

**Interface:**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct OverviewView {
    pub snapshot: SnapshotInfo,
    /// False when a newer snapshot exists.
    pub is_latest: bool,
    pub summary: Summary,
    pub by_discipline: Vec<Group>,
    pub by_hold_type: Vec<Group>,
}
impl AppState {
    pub fn select_snapshot(&mut self, snapshot_id: i64) -> Result<WorkspaceOpen, CommandError>;
    pub fn overview(&mut self, spec: &FilterSpec) -> Result<Option<OverviewView>, CommandError>;   // None when the workspace has no snapshot
    pub fn create_demo(&mut self) -> Result<WorkspaceOpen, CommandError>;
}
```

Commands: `snapshot_select(id)`, `overview(spec)`, `demo_create()`. Matching functions in `api`.

**Rules:**
- The dataset of the selected snapshot is built once (`Workspace::dataset` with the built-in rules) and kept until another snapshot is selected, a snapshot is imported, or the workspace changes.
- `overview` answers with `hx_core::query` over the cached dataset: the summary, groups by discipline, and groups by hold type, for the given filter. The default filter is open holds.
- `create_demo` makes a workspace named `Demo` holding four snapshots: a synthetic export of 3,600 lines and 9,300 holds with a fixed seed, and three evolutions 7 days apart. Each is written to a temporary file, loaded, and imported with its own detected date; the temporary files are removed. It opens the workspace with the newest snapshot selected. Running it twice makes a second `Demo` workspace; it never changes an existing one.
- `hx-synth` becomes a normal dependency of `hx-desktop`.

**Tests (Rust):** `overview` on a workspace without snapshots is `None`; after an import its summary equals `Dataset::build` plus `query` on the same file directly; selecting the older of two snapshots gives that snapshot's numbers and `is_latest` false; an unknown snapshot id gives `SnapshotNotFound`; the dataset is reused between two `overview` calls and rebuilt after a selection (observed through a build counter in the state, visible to tests only); a filter with a discipline returns only that discipline's holds; the demo workspace has four snapshots on four dates 7 days apart, the newest selected, all loading without skipped rows; a second demo is a second workspace.

**Commit:** `feat(desktop): add snapshot selection, the overview query, and the demo workspace`

---

### Task 7: Interface foundation

**Files:** `ui/src/design/{tokens.css, theme.ts, fonts.css}`, `ui/src/components/*`, `ui/src/locales/en.json`, `ui/src/app/{providers.tsx, i18n.ts, query.ts}`, `ui/src/main.tsx`, `ui/src/test/setup.ts`, `package.json`.

**Interface (components, each in `ui/src/components/<Name>/` with its styles and tests):**

`Button` (variants `primary`, `secondary`, `quiet`, `danger`; `isPending`), `TextField`, `Select`, `Checkbox`, `DataTable` (columns, rows, a selected row, keyboard movement, a slot for row actions; not virtualized yet), `Tabs`, `StatTile`, `BarRow`, `Notice` (tones `info`, `warning`, `danger`, `success`; inline), `ToastRegion` with `useToast()` (`show({ message, action? })`, an action is how undo is offered), `Skeleton`, `EmptyState` (title, text, action), `PageHeader` (title, description, actions, back link), `DropZone`, `Progress`, `VisuallyHidden`, `ErrorState` (a `CommandError` shown as what happened and how to fix it, with a retry action when one is given).

```ts
// theme.ts
export function applyTheme(theme: Theme): void;        // sets data-theme on <html>; "System" follows the OS and its changes
// i18n.ts
export function t(key: MessageKey, values?: Record<string, string | number>): string;   // keys are typed from en.json
// query.ts
export const queryClient: QueryClient;                 // refetches keep the previous data; no retry on a CommandError
```

**Rules:**
- `tokens.css` holds every token of `DESIGN.md` as a CSS custom property, for `[data-theme="dark"]` and `[data-theme="light"]`. A test compares the token names and values with the tables in `DESIGN.md`, so the two cannot drift.
- Fonts come from the npm font packages named in `DESIGN.md`, imported in `fonts.css`, and are bundled by the build. No URL to another host appears in the built files; a test scans `dist/` after a build for `http://` and `https://` references other than XML namespaces and license text.
- Components are built on React Aria Components. Each has all the states of the constraint list, styled from tokens only. A lint rule forbids color literals, `px` font sizes, and duration literals in `ui/src/components/**/*.module.css` and `ui/src/features/**/*.module.css`.
- `DataTable` moves with the arrow keys, `Home`, and `End`, announces its row count, and marks the sorted column; it accepts a `density` of `comfortable` or `compact`.
- `Skeleton` and every transition respect `prefers-reduced-motion`.
- The first paint is in the saved theme: `index.html` carries the dark surface color inline, and the theme from `app_start` is applied before the first screen renders.
- A missing text key is a type error. Plurals use i18next's plural forms.
- Numbers and dates are formatted by helpers in `ui/src/app/format.ts` (`formatCount`, `formatDate`, `formatDateTime`, `formatDays`) built on `Intl`; components do not call `Intl` or `toLocaleString` themselves.

**Tests (Vitest, Testing Library, an accessibility checker):** for each component: it renders with its accessible name; the keyboard reaches and activates it; the disabled and pending states block activation; the accessibility checker finds no violation in each state. `DataTable`: arrow keys move the focused row, `Enter` selects, the row count is announced. `ToastRegion`: a toast with an action calls it once and is announced politely. `applyTheme`: each value sets the attribute, and `System` follows a change of the media query. `t`: interpolation and plural forms. The token test and the no-remote-URL test described above.

**Commit:** `feat(ui): add design tokens, text catalog, and base components`

---

### Task 8: Shell, first run, workspaces, and settings

**Files:** `ui/src/features/{shell, welcome, workspaces, settings, coming-soon}/*`, `ui/src/app/{router.tsx, destinations.ts}`, `ui/src/main.tsx`, `ui/src/locales/en.json`.

**Interface (routes):** `/welcome` (no workspace open), `/overview`, `/breakdown`, `/lines`, `/blockers`, `/history`, `/people`, `/follow-up`, `/rules`, `/settings`, `/import/*` (Task 9).

```ts
// destinations.ts: the one list the sidebar, the router, and the shortcuts are built from
export type DestinationId = 'overview' | 'breakdown' | 'lines' | 'blockers' | 'history' | 'people' | 'follow-up' | 'rules' | 'settings';
export interface Destination { id: DestinationId; path: string; shortcut?: string; available: boolean; group: 'data' | 'setup' }
export const destinations: readonly Destination[];
// coming-soon: one component, driven by the destination
export function ComingSoon(props: { destination: DestinationId }): JSX.Element;
``` `AppLayout` renders the top bar, the sidebar, and the page. `useApp()` gives the `AppStart` state and the actions that change it (`openWorkspace`, `createWorkspace`, `renameWorkspace`, `selectSnapshot`, `setTheme`), each a mutation that updates the cached state.

**Rules:**
- Top bar, left to right: the workspace switcher (the open workspace's name; a list of the others; "New workspace"; "Rename"), the snapshot selector (date, time, and row count of each snapshot, newest first; the selected one marked), and the Import button (primary). Global search arrives with M1c and has no control here.
- Sidebar, in the order of spec 9.1: Overview, Breakdown, Lines, Blockers, History, People, Follow-up; then, set apart, Rules and Settings. Each has a label and an icon; the current one is marked for assistive technology and visually. A destination that is not built yet looks and behaves like the others in the sidebar except for a quiet "Soon" tag after its label, which is also part of its accessible name; it is never disabled, since a disabled item explains nothing.
- `Ctrl+1` to `Ctrl+7` open the first seven destinations in sidebar order, built or not; `Ctrl+I` starts an import; `Ctrl+,` opens Settings. Shortcuts do not fire while a text field has focus, except those with `Ctrl`.
- A destination that is not built yet opens its "coming soon" screen: the destination's name as the page heading; one or two sentences, from the text catalog, that say what the destination will show, written from spec 9.2 in the product's plain tone; a line that says it is not available in this version; and one action, "Go to Overview". It uses the `EmptyState` component inside the normal layout, with the top bar and sidebar working as everywhere else. It names no date, no version number, and no internal plan name, and it has no sign-up, progress bar, or illustration.
- `destinations.ts` is the only place that says which destinations are available. Making a destination real is changing its `available` flag and its route's element; the sidebar tag and the screen go away with it.
- When the selected snapshot is not the newest, a notice under the top bar names the snapshot in view and offers "Go to newest".
- With no workspace open, the app shows the welcome page: a drop zone and an "Open a file" button that start an import, and "Open demo workspace". When workspaces exist they are listed with their snapshot counts and latest dates, to open. Unreadable workspace files are listed apart with the reason and a "Show in folder" action; they never block the page.
- Creating a workspace asks for a name on the page (an inline form, not a dialog) and opens it. Rename edits in place, saves on `Enter`, cancels on `Esc`, and offers undo in a toast.
- Settings: theme (Dark, Light, System), applied at once and saved; the workspaces folder shown with "Show in folder"; the app version.
- Every command result is loaded through TanStack Query. A first load shows skeletons shaped like the content; a failure shows `ErrorState` with retry; a refetch dims the previous render.
- Dropping a file anywhere on the window starts an import (Task 9 supplies the page; until then the drop handler is wired to the route). While a file is dragged over the window, the whole window shows the drop target.
- Focus moves to the page's heading on navigation. The page title in the top bar and the document title name the current page.

**Tests:** with `mockCommands`: the sidebar lists the nine destinations in order, in two groups; the seven that are not built carry the "Soon" tag in their accessible name and Overview and Settings do not; each of the seven routes renders its own heading and description, the not-available line, and "Go to Overview", which navigates there; `Ctrl+1` to `Ctrl+7` open the seven first destinations; a destination marked available in a test copy of the list renders its real element and loses the tag; each coming-soon screen passes the accessibility checker and is reached and left by keyboard alone; no workspaces shows welcome with the drop zone and the demo button; the demo button calls `demo_create` and lands on Overview; existing workspaces are listed and open on activation; an unreadable workspace shows its reason and does not hide the readable ones; the switcher lists, opens, creates, and renames, and a failed create shows the error with its fix; rename undo restores the old name; the snapshot selector selects, and selecting an older one shows the notice, whose action returns to the newest; theme changes call the command and set the attribute; `Ctrl+,` and `Ctrl+I` navigate, and plain keys typed in a field do not; a first load shows skeletons, and a failed load shows the error and retries; every page passes the accessibility checker; each page is operable with the keyboard alone (a test walks the tab order of the shell).

**Commit:** `feat(ui): add the shell, first run, workspaces, and settings`

---

### Task 9: Import flow

**Files:** `ui/src/features/import/*`, `ui/src/app/router.tsx`, `ui/src/locales/en.json`.

**Interface (routes):** `/import` (entry: reading the file), `/import/sheet`, `/import/mapping`, `/import/review`. `useImportDraft()` holds the draft, the review, and the choices between pages.

**Rules:**
- An import starts from the Import button or `Ctrl+I` (a file dialog filtered to `.xlsx`, `.xlsm`, `.xlsb`, `.xls`, `.ods`, `.csv`, `.tsv`, `.txt`), from "Open a file" on the welcome page, or from a file dropped on the window. More than one dropped file imports the first and says that one file is imported at a time.
- After `import_open`: when the mapping is complete, go to the review; when required fields are missing, go to the mapping page. A workbook with several sheets shows which sheet was read on the review, with "Choose another sheet".
- Mapping page: one row per required and optional field, each with a select of the file's columns (header and the first preview value) and "Not in this file" for optional fields; a preview table of the first rows beside it with the mapped columns marked; required fields that are unmapped are marked with a message; "Continue" is enabled when every required field is mapped. A column may serve one field only; choosing it for a second field clears the first and says so. When a saved mapping was applied, a notice says so.
- Review page: file name; project number; the snapshot date and time with its source in words ("from the information sheet", "from the file name", "from the file's modified time", "entered by you"), editable in a date field and a time field limited to years 2000 to 2100; when the date needs confirmation, the page says the date is only the file's modified time and "Import" stays disabled until the user confirms or edits it; counts of holds, open, and released; a limited file is named as such with what that means; skipped rows in a table (row, reason, value) with the total when more than 200; warnings grouped by kind with the count, expandable to examples; the mapping in use with "Change mapping"; the target workspace as a select of existing workspaces plus "New workspace" with a name field, preselected from the suggestion.
- After the target or the date changes, `import_check_target` runs: a file already imported there shows which snapshot and disables "Import"; snapshots on the same day are listed with the choice "Keep both" (default) or "Replace" one of them.
- "Import" calls `import_commit`, shows the phase as progress, then opens Overview on the new snapshot with a toast that names the workspace and the counts. "Cancel" calls `import_cancel` and returns to where the import was started.
- Each import error is shown by its kind with its fix, on the page where it occurred: not found, unreadable, empty, no data sheet (the sheets are listed, each a choice), sheet not found, missing columns (opens the mapping page with those fields marked), no rows, no holds (the skipped count and an example).
- Leaving the flow by the sidebar cancels the draft. The browser back control moves between the flow's pages without losing choices.

**Tests:** with `mockCommands`: a complete draft goes to review and a draft with missing fields to mapping; mapping: selecting columns enables Continue, reusing a column clears the earlier field and announces it, optional fields accept "Not in this file", the saved-mapping notice shows; review shows each element from a fixture; the date field refuses 1999 and 2101; a date that needs confirmation blocks Import until confirmed; changing the target re-runs the check; an already imported file disables Import and names the snapshot; same-day snapshots offer keep and replace, and replace sends the id; Import sends the request, shows progress phases, and lands on Overview with the toast; each of the eight error kinds renders its message and fix, and missing columns leads to mapping; Cancel calls `import_cancel`; a drop with two files imports the first and shows the notice; the flow is completed by keyboard alone; each page passes the accessibility checker.

**Commit:** `feat(ui): add the import flow`

---

### Task 10: First Overview

**Files:** `ui/src/features/overview/*`, `ui/src/locales/en.json`.

**Rules:**
- The page shows, for the selected snapshot and open holds: stat tiles for open holds, lines on hold, single-hold lines, and median age in days; bars by discipline and bars by hold type, each row with its label, hold count, and line count, sorted by holds, with a "Show as table" switch that renders the same numbers in a `DataTable`.
- Bars in one group use one color; the label carries identity. Blank discipline shows as the label the core returns. No chart library is added in this plan.
- A workspace without snapshots shows an empty state whose action starts an import.
- Tiles follow `DESIGN.md`'s stat tile: no gradient, no decorative icon, proportional figures.
- Deltas, the trend, top blockers, top lines, and the attention list arrive with M1c and M2; nothing on this page refers to them. (Whole destinations that are not built have their own "coming soon" screens; parts of a built page do not.)

**Tests:** from a fixture `OverviewView`: the four tiles show formatted numbers; bar rows are in the order given with labels and both counts; the table switch shows the same rows; the empty state starts an import; loading shows skeletons shaped like tiles and bars; an error shows `ErrorState` with retry; a snapshot change refetches and dims the previous render; the page passes the accessibility checker; bar widths are proportional to the largest count.

**Commit:** `feat(ui): add the first overview`

---

### Task 11: Whole-plan verification and design audit

- [ ] `cargo fmt --all -- --check`; `cargo clippy --workspace --all-targets --locked -- -D warnings`; `cargo doc --workspace --no-deps --locked` without warnings; `cargo test --workspace --locked`; the release performance tests.
- [ ] `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm bindings` leaves `ui/src/bindings` unchanged.
- [ ] `node tools/design/check-tokens.mjs` passes.
- [ ] `git diff main -- tools/parity/reference.mjs crates/cli/tests/parity.rs` is empty; no data file is tracked.
- [ ] `pnpm tauri build --no-bundle` on Linux; the binary starts; its size is recorded. `pnpm tauri build --bundles appimage` on Linux; the AppImage starts. CI builds the Windows binary and records its size against the 25 MB limit of spec 17.
- [ ] By hand on Linux, with a synthetic file made by `hx-cli synth`: first run shows welcome; each of the seven coming-soon destinations opens from the sidebar and by its shortcut; the demo workspace opens with four snapshots; a new workspace is created; the file is imported through review; the same file is refused; a text file with other headers goes through mapping; the next file with those headers needs no mapping; an older snapshot is selected and the notice appears; the theme switches; a second launch focuses the first window; the app restarts into the last workspace; a workspace file whose version is set to 99 is listed as unreadable and the others still open. Cold start is timed against the 2 s limit of spec 17.
- [ ] Screens are captured in both themes at 1280 by 800 and at 1920 by 1080: welcome, Overview, mapping, review (clean and with warnings), Settings, one coming-soon screen, an error state. They are audited with the design skill's audit and critique against `PRODUCT.md`, `DESIGN.md`, and spec 13; findings rated major or worse are fixed in this plan.

---

## What exists when this plan is done

- The app starts on Linux and Windows, remembers its theme and last workspace, and lists workspaces with those it cannot read set apart.
- A file is imported through an optional mapping step and a review page into a workspace; the mapping is remembered; duplicates and same-day snapshots are handled.
- The first Overview shows a stored snapshot's headline numbers; the snapshot selector shows older states.
- The sidebar shows all nine destinations; the seven not built yet open a "coming soon" screen that says what each will show.
- The boundary is typed from the Rust side, and CI keeps it so.

## Spec coverage of this plan

| Spec section | Task |
|---|---|
| 5.1 layers; 5.2 typed contract, work off the interface thread; 5.3 settings file, unreadable workspaces | 2, 3, 4 |
| 5.4 no network | 3, 7 |
| 6.1 pipeline steps 1 to 6; mapping and review as pages | 5, 9 |
| 6.3 date with source, user confirmation | 5, 9 |
| 6.4 workspace matching | 5, 9 |
| 6.5 same file refused; replace | 5, 9 |
| 6.7 drag and drop | 8, 9 |
| 9.1 shell: top bar, sidebar with every destination, snapshot selector and banner | 8 |
| 9.2 the destinations not built yet, each as a "coming soon" screen | 8 |
| 9.2 Overview (first part), Settings (theme, data folder, About) | 8, 10 |
| 9.4 first run: drop zone, demo workspace | 6, 8 |
| 13 design direction, interface rules, design context files | 1, 7, 11 |
| 14 import errors by cause; second launch focuses the window | 3, 9 |
| 16 portable executable, AppImage (built, not published) | 3, 11 |

Left for later plans: 6.6 bulk import, global search, filters and chips, the right detail panel, the other destinations, saved views, the command palette and the shortcut sheet (M1c); export, the update check, the WebView2 check at startup, release builds with checksums, and end-to-end tests of the built app (M1d); "Open history bundle", snapshot manager with undoable deletion, compare and trends (M2); density, language, and author name in Settings (with the features that use them).

## Post-review corrections (2026-10-12)

The plan was executed task by task, each task reviewed on its own, the branch reviewed as a whole in two halves (the Rust side with the configuration, and the interface), and corrected in one fix wave. Where this plan's interfaces and the repository differ, the repository is right. The spec was updated to match (sections 5.2, 6.1, 9.1, 9.4, 13, 13.1, 14).

Decisions the owner made during execution:

| Decision | Effect |
|---|---|
| Coming-soon screens | The sidebar shows all nine destinations; the seven not built open a screen that says what the destination will show (Decision 6 above, as amended). |
| No purple; the accent is teal | `DESIGN.md` and its checker hold it: no hue between 270 and 350 degrees anywhere. |
| Plain data is neutral gray; ramps are blue | Teal is reserved for the primary action, selection, and focus. Rose and burnt orange stay in the six-color set. |
| A breadcrumb | `PageHeader` shows a breadcrumb in place of the back link on pages below a destination. |

| Area | Plan said | Now |
|---|---|---|
| Design context (Task 1) | A token checker for contrast pairs. | The checker also runs every chart mark against every fill it can sit on, keeps series colors apart from status colors, guards the hue rules, and has committed tests of its own failing cases. `DESIGN.md` gained a tooltip, a menu-like list, the breadcrumb, and the rule for pending controls. |
| Boundary types (Task 2) | `OpenedView.preview` shows dates as ISO text. | Dates are shown as the cell's own text (`yyyy-mm-dd hh:mm:ss`). `ImportDraft` also carries `proposed` (the mapping the app proposes, beside the engine's automatic one) and `required` (the engine's list of required fields). `ImportReview` carries the year range. |
| Scaffold (Task 3) | Capability `core:default`, `dialog:default`, `opener:default`, `window-state:default`; minimum window 960 by 600; the release profile for every crate. | Capability `core:default`, `dialog:allow-open`, `opener:allow-reveal-item-in-dir`. Minimum window 1024 by 640, as `DESIGN.md` says. The engine crates and SQLite are built for speed, the shell for size. The page carries no inline style; the window's first-frame color is set natively. CI allows 90 minutes for a cold build and checks that the Windows binary carries its manifest. |
| Package versions (Task 3) | Tauri CLI 2.12, newest. | The newest version the package manager's release-age policy accepts; no exclusion is ever added to get a newer one. TypeScript stays on 6 until the lint tooling accepts 7. |
| State (Task 4) | A failed save of the last workspace fails the command. | Opening or creating a workspace never fails because settings cannot be saved: `WorkspaceOpen.warning` reports it. `AppStart.list_error` reports a workspaces folder that cannot be read. A settings file that cannot be read is set aside, and when that fails too, saving is refused and the file is never overwritten. Every command takes the state lock inside the blocking pool, the theme command included. A second start of the interface resets the state. |
| Command arguments (Tasks 4 to 6) | Not tied by any test. | One fixture of every command's arguments is read by both sides: the interface must send it, and a test on Tauri's mock runtime invokes every command with it and proves each key is read. |
| Import commands (Task 5) | Example headers `Kind,Line,Why` give three missing fields; `replace` is passed to the store. | `Line` is an alias of the line id, so the example gives two. A `replace` is honored only for a snapshot the review offered (same day, or the same file); anything else is refused before any write. A date counts as edited whenever it differs from the detected one at whole-second precision. A file that is not a regular file, or is larger than 256 MiB, is refused by the engine. A workspace created for an import that then fails is removed, and the message says so when it cannot be. |
| Overview query (Task 6) | `overview(spec)`. | `overview(spec, view)`: the interface says which workspace and snapshot it is showing, and the command refuses another view with `ViewChanged`. The interface reads such data only through `useSnapshotQuery`, and changes the workspace or the selection only through `workspaceAction()`, which orders those actions and cancels reads in flight. |
| Components (Task 7) | `PageHeader` with a back link; a global 20 s test limit appeared during the task. | A breadcrumb. A selected table row stays selected until the parent clears it; a table without a selection handler is read-only. Tests have 5 s each locally and 15 s on CI, with a named allowance for the slow ones. |
| Shell (Task 8) | A sidebar on every page; undo of a rename by name. | No sidebar while no workspace is open. Undo of a rename acts only on the workspace it renamed. The control that started an action shows a spinner; its siblings are inert. |
| Import pages (Task 9) | For "no data sheet", each sheet is offered as a choice; Cancel at any step. | The engine reports that error only when no sheet has rows, so the page offers another file. No Cancel while a commit runs. The page's button is "Import snapshot". A commit that fails after the page was left is reported by the shell. |
| Overview (Task 10) | Bars as the base component drew them. | Bars are static rows (no hover, no tab stop) until filtering by a bar exists. The header gives the snapshot's total and its open count. A limited snapshot is marked. |

Measured on the final commit (release build, 10,000 rows, idle machine): load and build about 120 ms, filtered views 7 ms, a page of 200 holds 0.5 ms, full solve order 21 ms, import into a workspace about 30 ms, read back as a dataset about 45 ms. Application binary 11.6 MiB on Linux; AppImage 106 MB.

Not verified by this plan, and why: the app in a real window (the machine that ran the work has no virtual display; every screen was checked in a headless browser against mocked commands), and anything on Windows (CI is the first run). Both are gates for merging.

Carried into later plans (kept in the working notes): virtualise the table and decide its column model before the first M1c screen; move the import flow's local layout pieces into the components and into `DESIGN.md`; split `useApp`; a typed union of error kinds with structured data; recovery after a panic without a restart; merging the saved mapping; the cache of datasets keyed by workspace and snapshot; a crash log, a native message on startup failure, and the WebView2 check (M1d); stripping unused locales from the bundle (M1d); a toast and undo registry before snapshot deletion (M2).
