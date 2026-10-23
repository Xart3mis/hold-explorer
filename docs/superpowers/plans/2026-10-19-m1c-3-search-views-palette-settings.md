# M1c-3: Search, Saved Views, Command Palette, Settings, and Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user finds any line, blocker, person, or remark from one search box, keeps a set of filters and a screen as a named view and returns to it with one click, reaches every destination and action from the keyboard through a command palette and a shortcut sheet, sets density, author name, and the workspace folder in Settings, and meets clear, typed errors where the app used to stop: a damaged settings file, a panic, a copied workspace file, an oversized import.

**Architecture:** Search is a pure function of `hx-core` over the dataset in view, answered by one desktop command and shown by a combobox in the top bar; the command palette reuses it for line IDs and lists the app's own destinations and actions itself. Saved views are kept in the workspace file's existing `setting` table under one key, so the schema does not change. Settings gain two fields and a folder change that can move the workspace files, done file by file in Rust. The desktop crate's error kinds become one generated TypeScript union, and a poisoned state lock recovers instead of asking for a restart.

**Tech Stack:** As M1c-export. No new crate or package is expected; if one is needed (a fuzzy matcher, for example), stop and report it instead of adding it: the matching rules below are small enough to write.

## Where this plan sits

M1 plans merged: M1a, M1b-1, M1b-2, M1b-3, M1c-1, M1c-2, M1c-export (PR #7, main ae948ed). **M1c-3 (this plan).** Then M1d (update check, release pipeline, crash log and panic hook, WebView2 check, end-to-end tests, CI pins). The owner's real-window checks of export are pending; anything they find is fixed on its own branch or folded in here by a correction.

## How this plan is written

As M1c-1 to M1c-export: each task gives its files, the exact interface later tasks rely on, the rules, and the test cases; not the implementation. Test cases are the requirements and are written failing first. Where the code behaves otherwise than this plan assumes, the implementer reads the installed source, adapts, and reports it. Every task runs the checks of CI that its change touches (`cargo fmt --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`, `pnpm lint`, `pnpm typecheck`, `CI=1 pnpm test`, `pnpm bindings` with no diff, `pnpm tokens` when DESIGN.md changes) and reports their output.

## Decisions this plan rests on

1. **Scope** (spec 9.5, 10.1, 10.3, 9.2 Settings; owner 2026-10-18 and 2026-10-19): global search; saved views; command palette and shortcut sheet; Settings' density, author name, workspace folder, and About; the Rust hardening the M1b-3 and M1c reviews left for this plan; and the owner's small design changes (decisions 12 to 16). The update check and its setting stay in M1d.
2. **Search groups** (spec 10.1): Lines (line ID), Blockers (blocker item, with its discipline), People (name, with role; and roles), Remarks (remark text), and Holds (the values of hold type, discipline, and stress calc). Notes are searched when notes exist (M4). Search covers every hold of the snapshot in view, open and released; a result whose holds are all released carries a "Released" tag.
3. **Search matching:** without regard to case or accents, and with runs of white space read as one. A result matches when the query is a substring of its text (a match at the start of the text or of a word ranks first), or, failing that, when every word of the query of at least 4 characters is within one edit (insertion, deletion, substitution, or swap of two neighbours) of a word of the text, two edits from 8 characters. A query with `*` is a line-ID pattern: `*` stands for any run of characters, the pattern matches the whole line ID, and only Lines are searched. A query shorter than 2 characters, after trimming, finds nothing.
4. **Choosing a search result** (owner, 2026-10-19): a line opens Lines with the line in the panel; a blocker opens Blockers with the blocker in the panel; a person, a role, a remark, or a hold value adds that value as a filter (replacing that field's values) and opens Lines in hold rows. Enter with no result highlighted applies the text as the text filter of the current data screen, or of Lines from any other page.
5. **Saved views live in the sidebar** (owner, 2026-10-19): a "Saved views" section under the destinations lists them by name; one click applies one (its filters, then its address); "Save view" is in the filter bar. A saved view stores a name, the address of a data screen without its selection (`line`, `hold`, `blocker`), so destination, mode, grouping, and sort, and the filters. Saved views belong to the workspace and are kept in its file.
6. **Saved views in the file:** in the `setting` table, key `saved_views`, one JSON value: the list in sidebar order. The schema version stays 1. Names are trimmed, 1 to 80 characters, unique within the workspace without regard to case; at most 100 views.
7. **Delete offers undo** (spec 13.1): deleting a saved view removes it and shows a toast with Undo, which puts it back where it was.
8. **Command palette** (owner, 2026-10-19: full): Ctrl+K opens it on any page. Its groups: Actions (Import, Export this view, Clear all filters, Theme: Dark, Light, System, Density: Comfortable, Compact, Keyboard shortcuts, Save view), Destinations, Saved views, Snapshots, Workspaces, and Lines (line IDs from the search command, from 2 characters). Each item shows its shortcut when it has one. Items that need a workspace or a snapshot are left out without one.
9. **Shortcut sheet:** `?` opens a dialog listing every shortcut, grouped (Go to, Actions, Tables, Panel and dialogs), built from the one registry in `shortcuts.ts`, so a shortcut cannot exist without its line in the sheet. `/` focuses the search field.
10. **Settings** (spec 9.2, 5.3): Theme (as today), Density (Comfortable, Compact; applied at once to the root element and saved), Author name (saved; it signs notes from M4 and is shown nowhere else yet), Workspace folder (Change, Use the default folder, Show in folder), and About (version, workspace folder, settings file).
11. **Changing the workspace folder offers to move the files** (owner, 2026-10-19): after a folder is chosen, the page asks inline whether to move the workspace files of the old folder there or leave them. A move goes file by file: copied under the same name, flushed, checked to open as a workspace read-only, then the original removed. A file that cannot be moved (in use, a name taken in the new folder, a failed copy) stays where it was, whole, and is listed with its reason. The open workspace is closed for the move and reopened from where it then is.
12. **Blank remark label** (owner, 2026-10-18): a blocker whose remark item is blank is labelled "Piping / (blank)", with the word "(blank)" the filter chips use, from the catalog.
13. **Second click resets** (owner, 2026-10-18): pressing the sidebar item of the current destination returns it to its default address: selection, scroll, mode, grouping, and sort reset; filters stay.
14. **Not in this snapshot chip** (owner, 2026-10-18): a filter chip whose field the snapshot lacks has full-contrast text, a dashed outline, and "not in this snapshot" in its tooltip and accessible name.
15. **Open row marker** (owner, 2026-10-19): the open row among selected rows carries a small accent mark in its first cell, on top of its deeper tint; not a coloured side stripe, which DESIGN.md bans.
16. **Blockers export row name** (owner, 2026-10-19, corrected the same day): the Blockers export is named by blocker: the `blocker` column ("Blocker") is its row-name column, first in every file and always written; `step` ("Step") follows it as an ordinary optional column.
17. **Export sits beside Import** (owner, 2026-10-19): the Export menu moves from the page header of the data screens to the top bar, next to Import, in every page; where a page has nothing to export it shows inert, saying where export is found.

## Global Constraints

Every constraint of the M1c-export plan holds, unchanged:

- Real project files never enter the repository; tests build inputs with `hx-synth` or small text files in temporary directories.
- `hx-core`, `hx-store`, and `hx-export` do not depend on Tauri; `ts-rs` only behind the `ts` feature.
- A Tauri command contains no logic beyond the `blocking` helper, calls into `hx_desktop::app`, and the error mapping. Every command that reads the data in view takes `view: ViewRef` and calls `AppState::check_view` first. Every command has an entry in `ui/src/api/command-args.json`; generated bindings are committed and unchanged by `pnpm bindings` in CI.
- The interface computes no counts, ages, groups, dates, blockers, or matches against snapshot data. It shows what commands return. Ordering rows it holds whole, and narrowing the palette's own fixed items (destinations, actions) by their labels, is presentation.
- A screen reads snapshot data only through `useSnapshotQuery` or `useSnapshotPages`, and changes the view only through `workspaceAction()`. The pending rule holds.
- Rust: edition 2021, toolchain 1.97.0; `hx-desktop`, `hx-cli`, and `hx-export` `rust-version = "1.92"`, others `1.88`; `#![forbid(unsafe_code)]`; no `unwrap()`/`expect()` outside tests except on values that cannot fail, with the reason; no `#[allow]`; every public item documented.
- TypeScript strict; no `any`, no `@ts-ignore`, no non-null assertion on a value that can be absent.
- Every user-facing string is in `ui/src/locales/en.json`, including every text written into a file; glossary terms (PRODUCT.md); errors say what happened, why, and how to fix it.
- Spec 13.1 and 13.2 bind every screen: all states; skeletons on first load; dimmed previous render on refetch; empty states name the next action; motion 150 to 250 ms on state changes only, none under reduced motion; nothing by hover alone; WCAG AA in both themes; banned patterns (side stripes, nested cards, gradient text, glass, hero-metric tile); modals only where DESIGN.md names them (the command palette and the shortcut sheet).
- Tokens only; a new token goes into `DESIGN.md` first, then `pnpm tokens`, the checker, and its tests. Teal for action, selection, focus, progress; plain data neutral gray; nothing purple.
- Never relax a supply-chain or security policy. `src-tauri/capabilities/default.json` is unchanged (the folder picker is `dialog:allow-open` with `directory: true`). The content security policy is unchanged. The app makes no network request.
- Parity tests and `tools/parity/reference.mjs` unchanged, except that the parity comparison reads the reference's blank remark spelling as "(blank)" (decision 12); existing performance limits stay; `query::*` functions keep their results for existing calls.
- Keyboard reaches everything; focus always visible.
- Conventional Commits; no em dashes in documents, interface text, or file text.
- Leave the uncommitted `.gitattributes` line and the untracked `.claude/` alone; never stage them.

New for this plan:

- Search answers in under 100 ms at 30,000 holds in a release build (spec 17's filter budget), timed in `crates/cli/tests/perf.rs`.
- A move of workspace files never leaves a file in neither folder, and never overwrites a file.
- Saved views and the palette add no route: they navigate to the addresses the screens already read.

## File Structure

```
crates/core/src/search.rs                 SearchResults, search(); tests in the same file
crates/core/src/words.rs                  BLANK and the other words the core writes
crates/core/src/{detail,query,solve}.rs   blank remark label through words::BLANK
crates/store/src/views.rs                 SavedView, read and write under setting key saved_views
crates/store/src/directory.rs             duplicate workspace ids listed as unreadable
crates/store/src/workspace.rs             merged saved mapping
src-tauri/src/app/error.rs                ErrorKind
src-tauri/src/app/settings.rs             Density, author_name, set-aside reported, transient reads
src-tauri/src/app/folder.rs               workspace folder change and move
src-tauri/src/app/views.rs                saved view commands
src-tauri/src/app/search.rs               search command body
src-tauri/src/app/import.rs               bounded read
src-tauri/src/commands.rs                 new commands; poisoned lock recovery
ui/src/api/core-words.json                words the core writes, read by both sides
ui/src/features/search/                   SearchField, results, choosing
ui/src/features/views/                    sidebar section, Save view popover, apply
ui/src/features/palette/                  CommandPalette
ui/src/features/shell/{shortcuts.ts, ShortcutSheet.tsx, Sidebar.tsx, TopBar.tsx, topBarSlot.tsx}
ui/src/features/settings/                 density, author name, folder, About
ui/src/features/filters/                  dashed chip; Save view
ui/src/components/DataTable/              open row marker
DESIGN.md                                 Search field, Command palette, Shortcut sheet,
                                          Saved views, Settings form, chip, open row
docs/superpowers/specs/2026-10-10-hold-explorer-desktop-design.md   9.1, 9.2, 9.5, 10.1, 10.3, 14, 18
```

---

### Task 1: The Export button in the top bar, beside Import

**Files:** `ui/src/features/shell/{TopBar.tsx, Shell.module.css, AppLayout.tsx}`; new `ui/src/features/shell/topBarSlot.tsx` (a slot the page fills); `ui/src/features/export/{ExportMenu.tsx, ExportMenuInert}` and their tests; the four pages that render the menu today in their header (`ui/src/features/{overview/OverviewPage.tsx, breakdown/BreakdownPage.tsx, lines/LinesPage.tsx, blockers/BlockersPage.tsx}`); `ui/src/locales/en.json`; `DESIGN.md` (Shell layout: the top bar's controls; Export menu: its place); spec 9.1 top bar list; tests.

**Interface:**

```ts
/** Where a page puts its Export menu: rendered into the top bar, beside Import, while the page
 * is shown. Only one page is shown at a time; the last mounted wins. */
export function TopBarExport({ children }: { children: ReactNode }): ReactPortal | null;
```

**Rules:** decision 17. The top bar's trailing end reads: snapshot selector, Export, Import (Import stays the primary button and the last control; Export is a secondary button of the same height with the same menu as today). A data screen fills the slot with its own `ExportMenu` (its items, its remembered columns and rows, its pending and failure states, Ctrl+E unchanged), or with the inert button when the workspace has no snapshot (as today, with its description). On every other page (Settings, the coming soon screens, the import flow, the workspace list with no workspace open) the slot shows the inert Export button with the accessible description "Open Overview, Breakdown, Lines, or Blockers to export" (catalog). Page headers lose the menu; nothing else in the header moves. The export notice (`ExportNotice`) keeps its place under the page header. The menu's popover opens below the button, aligned to its end. Focus order: snapshot selector, Export, Import.

**Tests:** each data screen's menu appears in the top bar and not in the page header; its items and Ctrl+E work as before (the existing export tests pass with their queries moved to the top bar); the inert button with its description on Settings and without a snapshot; switching screens swaps the menu with no flash of the inert button on a data screen whose data is loaded; tab order; axe in both themes; screenshots of the top bar at 1024 and 1280 px in both themes.

**Commit:** `feat(ui): the Export menu sits in the top bar beside Import`

---

### Task 2: The blank remark label and the Blockers export header

**Files:** new `crates/core/src/words.rs`; the core code that builds a blocker's label for a blank remark item (today `"Piping / —"`, see `crates/core/src/detail.rs` tests) and every other place the core writes `(blank)` or `—` as a value's label; the parity test's comparison (not `tools/parity/reference.mjs`); new `ui/src/api/core-words.json`; `ui/src/locales/en.json`; the export's Blockers column heading (`ui/src/api/file-columns.json` and the label key in `file-text-keys.json` if the heading is keyed there); tests on both sides.

**Interface:**

```rust
//! words.rs: the words the core writes into labels. The interface's catalog holds the same
//! words; `ui/src/api/core-words.json` is read by a test on each side, so neither drifts.
/// A blank value in a label: "(blank)".
pub const BLANK: &str = "(blank)";
/// The spelling of a blank role in a hold row, as today.
pub const NONE: &str = "—";
```

`core-words.json`: `{ "blank": "(blank)", "none": "—" }` with each key mapped to its catalog key (`{"blank": "common.blank", ...}` in the test).

**Rules:** the blocker key (`Piping|—` today) does not change, so addresses that name a blocker (and saved views from Task 10) keep working; only its label changes. Every label the core writes for a blank value uses `words::BLANK` or `words::NONE`; a test in core reads `core-words.json` and checks both constants; a test in the interface checks `en.json` holds the same words under the mapped keys. The Blockers export's row-name column is headed "Blocker" in every file (Excel, CSV, copy, the PDF's top blockers and solve order where they head a column with the step's name). The golden PDF hash changes only if the report shows a blank remark label or the heading; if it changes, regenerate it with the test's documented command and say why in the commit body.

**Tests:** a blocker with a blank remark is labelled `Piping / (blank)` in the solve order, the blocker detail, the top blockers, and the export sheet; its key is unchanged; the parity test passes with the reference's `—` read as `(blank)`; the fixture tests on both sides; the Blockers sheet's first column heading is "Blocker".

**Commit:** `fix(core): a blank remark reads "(blank)" in blocker labels, from the catalog's word`

---

### Task 3: Second click resets, the not-in-snapshot chip, and the open row marker

**Files:** `ui/src/features/shell/{Sidebar.tsx, NavItem.tsx}` and the module that remembers each destination's last address in the session (M1c-2 owner item 4); `ui/src/features/filters/{FilterBar.tsx, chips.ts}`, `ui/src/components/FilterChip/`; `ui/src/components/DataTable/`; `DESIGN.md` (Sidebar item, Filter chip, Table: selected rows); tests.

**Rules:**
- Sidebar: pressing the item of the destination already shown navigates to the destination's bare path (`/lines`), forgets its remembered address, scrolls its content to the top, and clears its selected rows; filters stay. Pressing another destination still opens it at its remembered address. The destination shortcuts (`Ctrl+1` to `Ctrl+4`) behave as the item does, so `Ctrl+3` on Lines resets Lines.
- Chip of a field the snapshot lacks: text `--color-text-primary` (full contrast), border `1px dashed` with the chip's border token, the existing icon kept; its accessible name and tooltip end with ", not in this snapshot" (catalog). The stale dimming of M1c-2 stays for a stale options read.
- Open row marker: the open row among two or more selected rows shows a small accent mark (a filled dot or chevron, `--size-icon-sm` or a new token, in `--color-accent`) at the start of its first cell, inside the cell's padding, so no column moves. A single selected row shows no mark (it is the open row by itself). The mark is decorative (`aria-hidden`); the row already says it is current through its state.

**Tests:** second press resets address, scroll, and selection and keeps filters; second `Ctrl+3` the same; another destination keeps its remembered address; chip styles and accessible name (computed name test), axe; marker shown only with two or more selected rows, on the open row only, not shifting the cell's text (layout test on the cell's padding box), absent in one-row selection.

**Commit:** `feat(ui): a second click resets a destination, a missing field's chip is dashed, the open row is marked`

---

### Task 4: Typed error kinds and recovery from a panic

**Files:** `src-tauri/src/app/error.rs`; `src-tauri/src/commands.rs`; `src-tauri/src/app/mod.rs` (a `recover` method); every `CommandError::new("Kind", ...)` call site; `ui/src/bindings/` (new `ErrorKind.ts`); `ui/src/api/error.ts` and every interface comparison of `kind` with a string; tests on both sides.

**Interface:**

```rust
/// Every kind of error a command can answer with. Serialized as its name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub enum ErrorKind {
    // The variant names of StoreError, ImportError, and ExportError, one for one,
    // then the commands' own: NoWorkspace, NoDraft, WorkspaceNotFound, ReplaceNotOffered,
    // SnapshotDateOutOfRange, ViewChanged, Settings, NotWritten, Clipboard, Open, Extension,
    // Internal, and those this plan adds (Task 5: SettingsSetAside; Task 7: Folder kinds;
    // Task 10: SavedView kinds).
}
pub struct CommandError { pub kind: ErrorKind, pub message: String }
impl CommandError { pub fn new(kind: ErrorKind, message: impl Into<String>) -> CommandError; }
```

**Rules:**
- The `From<StoreError | ImportError | ExportError>` impls map each variant to its own `ErrorKind` variant by an exhaustive `match`, not through serde text, so a new variant does not compile until it has a kind. A Rust test lists every variant of the three enums and checks none maps to `Internal`.
- The interface switches on `ErrorKind`; a test file under `ui/src/api` fails to type-check (`// @ts-expect-error` on a misspelt kind, as the bindings tests do) if a kind is compared with a string that is not a kind.
- Recovery: when a command finds the state lock poisoned, it takes the guard (`PoisonError::into_inner`), clears the poison (`Mutex::clear_poison`), and calls `AppState::recover`, which drops the import draft and every cache and reopens the open workspace from its file (a write that was cut short rolled back with its transaction); then the command runs. When reopening fails, the state has no workspace open and the command answers that error. The command whose work panicked still answers `Internal` with "An operation failed part-way, so what it was doing may not have been saved. Check, then try again; if it happens again, report it." (owner, 2026-10-20: a panic after a store committed has saved) The `poisoned()` message that asked for a restart goes.

**Tests:** every variant mapping; the TypeScript union matches the Rust enum (generated); a state whose lock was poisoned by a panicking closure answers the next command (`app_start`, then a data read) without a restart, with the draft dropped and the workspace reopened; a reopen that fails leaves no workspace open and says why; the panicking command's message.

**Commit:** `refactor(desktop): error kinds are one typed list, and a panic no longer needs a restart`

---

### Task 5: Settings problems, copied workspaces, bounded reads, merged mapping

**Files:** `src-tauri/src/app/settings.rs`, `workspaces.rs` (`AppStart`), `import.rs`; `crates/store/src/{directory.rs, workspace.rs, snapshot.rs}`; `ui/src/features/shell/` (the shell notice for a settings problem); `ui/src/locales/en.json`; tests. Move the desktop crate's repeated test set-up (temporary config and data folders, a state with the demo or a synthetic workspace open) into one `src-tauri/src/app/test_support.rs` used by the existing test files, without changing what they test.

**Interface:**

```rust
pub struct AppStart {
    // ...as today, plus:
    /// What went wrong with the settings file at start, when anything did: set aside
    /// (`SettingsSetAside`), or left in place and saving refused (`Settings`).
    pub settings_problem: Option<CommandError>,
}
```

**Rules:**
- Settings at start: a file that is missing gives the defaults. A file that is read but cannot be parsed is moved to `settings.json.unreadable` and reported once with kind `SettingsSetAside` ("Your settings file could not be read, so it was set aside as settings.json.unreadable and the defaults are in use. ..."). A file that cannot be read for another reason (permission, sharing violation, an I/O error) is left where it is, the defaults are used, and saving is refused with kind `Settings`, as when it cannot be moved aside: a transient read error never moves a good file aside. The shell shows `settings_problem` as a shell notice (DESIGN.md Shell notice) until dismissed.
- Copied workspaces: when two files in the folder hold the same workspace id, the file whose name sorts first (byte order) is listed as a workspace; each other is listed unreadable with kind `DuplicateWorkspace` ("This file is a copy of the workspace in <first file>. Two files with one workspace cannot both be opened; move this one to another folder to keep it."). Opening by id never picks a copy.
- Bounded import read: the import opens the file once, checks the size through the handle, and reads at most the limit plus one byte through the same handle, so a file that grows after the check is refused with the existing too-large kind and message, never read whole. If no size limit exists today, add one: 200 MB, kind `TooLarge` (an `ImportError` variant), message naming the size and the limit.
- Merged saved mapping: a commit that saves the mapping keeps every field of the saved mapping that this import did not map, and replaces those it did; a field this import mapped to "no column" removes that field.

**Tests:** each settings case (missing, unparsable, unreadable: permission on Unix, a file held with sharing denied on Windows under `cfg(windows)`), the set-aside file content kept, the notice shown and dismissed; duplicate ids (first name readable, copy listed with its reason, open by id opens the first); a growing file refused (a reader double whose second read returns more than the check saw, or a file truncated and regrown between check and read through the handle); mapping merge (a field kept, a field replaced, a field removed).

**Commit:** `fix(desktop): settings problems are reported, copies of a workspace are named, imports read within bounds`

---

### Task 6: Density and author name

**Files:** `src-tauri/src/app/settings.rs`, `mod.rs`, `commands.rs`, `ui/src/api/command-args.json`; `ui/src/app/actions/` (a `useDensitySetting` beside `useThemeSetting`); `ui/src/features/settings/`; `ui/src/main.tsx` or wherever the stored theme is applied before the first render; `DESIGN.md` (Settings form); tests.

**Interface:**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Density { #[default] Comfortable, Compact }
pub struct Settings {
    pub theme: Theme,
    pub density: Density,
    /// The name notes are signed with (from M4); trimmed, at most 80 characters; empty is none.
    pub author_name: String,
    pub workspace_dir: Option<String>,
    pub last_workspace: Option<String>,
}
// commands
pub async fn set_density(app, density: Density) -> Result<Settings, CommandError>;
pub async fn set_author_name(app, name: String) -> Result<Settings, CommandError>;
```

**Rules:** density is applied at once as `data-density` on the root element (DESIGN.md Foundations) and before the first render from the stored value, as the theme is, so a compact user never sees a comfortable frame. An author name longer than 80 characters after trimming is refused with kind `Settings` and a message naming the limit; the field shows the error inline and keeps the text. Saving the name happens on blur and on Enter, not on every key; a save in flight shows on the field (pending rule). A settings file without the new fields reads them as their defaults.

**Tests:** Rust round trip and defaults for an older file; name trimming and the limit; interface: density switch applies to the root at once and persists; the first render uses the stored density; the name saves on blur and Enter, not while typing; error state; axe.

**Commit:** `feat: density and author name in Settings`

---

### Task 7: Changing the workspace folder, with the offer to move the files

**Files:** new `src-tauri/src/app/folder.rs` with tests; `mod.rs`, `commands.rs`, `command-args.json`; `ui/src/features/settings/` (folder row, inline move choice, report); `ui/src/api/` (folder picker through `dialog:allow-open` with `directory: true`); `DESIGN.md` (Settings form: folder row); tests.

**Interface:**

```rust
pub struct FolderCheck {
    /// The folder as it will be used: absolute.
    pub path: String,
    /// The workspace files in the folder now in use that a move would take.
    pub movable: Vec<String>,
}
pub struct FolderMoved {
    /// The new start state: settings, the list of the new folder, the workspace reopened.
    pub start: AppStart,
    /// Files moved, by name.
    pub moved: Vec<String>,
    /// Files left in the old folder, each with why.
    pub left: Vec<UnreadableView>, // file name, path, kind, message
}
// commands
pub async fn check_workspace_folder(app, path: String) -> Result<FolderCheck, CommandError>;
pub async fn set_workspace_folder(app, path: Option<String>, move_files: bool)
    -> Result<FolderMoved, CommandError>;   // None: the default folder
```

**Rules:**
- A folder must be absolute (a relative path is refused with kind `FolderNotAbsolute`), exist or be creatable, be writable (a probe file is created and removed), and differ from the folder in use (kind `SameFolder`). Each refusal says what to do.
- Move: the open workspace is closed first. For each workspace file of the old folder (the files the store lists, readable or not; never another file): a name that exists in the new folder is left with kind `NameTaken`; otherwise the file is copied to a temporary name in the new folder, flushed, opened read-only and checked as a workspace of a supported version, renamed to its name, and only then is the original removed. A failure at any step removes the copy and leaves the original whole, with the step's kind and message. Files that are not workspaces stay.
- The settings are saved with the new folder only when the folder passed its checks, whether or not every file moved; a failure to save the settings reverts nothing on disk and is reported.
- The workspace that was open is reopened from the new folder if it moved, from the old folder if it did not (by path), and otherwise none is open.
- Interface: the folder row shows the path, "Change folder", "Use the default folder" (when not the default), and "Show in folder". After a folder is chosen and checked, an inline notice in the row says "Move N workspaces to the new folder?" with "Move them", "Leave them where they are", and "Cancel" (keyboard reachable, focus moves into the notice). While the move runs, the row shows progress and the rest of the settings are inert. The result: a notice listing what moved and each file left with its reason.

**Tests:** each refusal; a move of three files where one name is taken and one is held open (sharing denied on Windows, read-only directory entry on Unix) leaves exactly those two whole in the old folder; a failure after the copy (a double for the check step) removes the copy; the open workspace reopened from its new place; settings saved; "Leave them" switches without touching files; the default folder; interface flow with keyboard; axe.

**Commit:** `feat: change the workspace folder in Settings and move the workspaces there`

---

### Task 8: The search engine

**Files:** new `crates/core/src/search.rs` (tests in the file); `crates/core/src/lib.rs`; `src-tauri/src/app/search.rs`, `mod.rs`, `commands.rs`, `command-args.json`; `crates/cli/tests/perf.rs`; bindings.

**Interface:**

```rust
pub enum SearchKind { Line, Blocker, Person, Role, Remark, HoldType, Discipline, StressCalc }
/// A run of the text, marked when it matched the query.
pub struct TextPart { pub text: String, pub matched: bool }
pub struct SearchHit {
    pub kind: SearchKind,
    /// The value: a line ID, a blocker key, a name, a remark...; what choosing it acts on.
    pub value: String,
    /// The text shown, split into matched and unmatched parts.
    pub parts: Vec<TextPart>,
    /// A second line: the discipline of a blocker, the role of a person; empty when none.
    pub detail: String,
    /// Holds with this value in the snapshot, open and released.
    pub holds: usize,
    /// Every one of those holds is released.
    pub released: bool,
}
pub struct SearchGroup { pub kind: SearchGroupKind, pub hits: Vec<SearchHit>, pub total: usize }
pub enum SearchGroupKind { Lines, Blockers, People, Remarks, Holds }
pub struct SearchResults { pub query: String, pub groups: Vec<SearchGroup> }
pub fn search(dataset: &Dataset, query: &str, per_group: usize) -> SearchResults;
// command
pub async fn search(app, view: ViewRef, query: String) -> Result<SearchResults, CommandError>; // per_group 8
```

**Rules:** decision 3 for matching; decision 2 for groups (People holds names and roles; Holds holds hold types, disciplines, and stress calcs). Order within a group: matches at the start of the text, then at the start of a word, then elsewhere, then typo matches; ties by more holds, then by value. Groups come in the order Lines, Blockers, People, Remarks, Holds, and an empty group is left out. `total` counts every match of the group. `parts` joined is the shown text; typo matches mark the matched words. Blank values are not searchable. A remark is shown up to 120 characters with the match kept in view (cut before and after with "…", never through a match). The search reads the dataset only (no filter: decision 2). It is case and accent insensitive through one normalization used for both sides, so a match range maps back to the original text.

**Tests:** each kind found; substring before typo; start before word before inside; one and two edits by length; a swap is one edit; accents and case; white space runs; wildcard `78B01-573-*` finds only lines and matches whole IDs (`*-573-*`, `78B01*`); one character finds nothing; released-only values tagged; `total` beyond `per_group`; long remark cut around the match; parts rebuild the text; perf at 30,000 holds under 100 ms (release, best of three), at 10,000 recorded.

**Commit:** `feat(core): search lines, blockers, people, remarks, and hold values with typo tolerance`

---

### Task 9: The search field

**Files:** new `ui/src/features/search/{SearchField.tsx, results.tsx, choose.ts, *.test.tsx}`; `ui/src/features/shell/{TopBar.tsx, Shell.module.css}`; `ui/src/api/` (the search read through `useSnapshotQuery`); `ui/src/locales/en.json`; `DESIGN.md` (new "Search field" component: shape, results popover, groups, highlight, Released tag, states); tests.

**Rules:**
- In the top bar between the workspace switcher and the snapshot selector, up to `--layout-search-max-width`, shown only with a workspace that has a snapshot (otherwise absent, as nothing can be found). Placeholder "Search lines, blockers, people, remarks" with the `/` key shown.
- A combobox (React Aria) with a popover of grouped results: group headings with the group's total ("Lines · 12"), each hit's text with its matched parts in `--font-weight-semibold` and the primary text color (not color alone), its detail line, its hold count, and a "Released" tag when released. When a group has more than it shows, its last row says "N more in Lines" (Lines, People, Remarks: applies the query as the text filter and opens Lines; Blockers: opens Blockers with the text filter).
- The query is sent 150 ms after typing stops; an answer for an older query is never shown; while waiting, the previous results stay dimmed (refetch rule); first wait shows a one-line skeleton; no result says "Nothing matches "…". Press Enter to filter by this text." 
- Choosing a hit: decision 4, through the same navigation the screens use (`?line=`, `?blocker=`), and filters set through the filters state of the workspace. The field clears and the focus goes to the opened panel's heading, or to the table.
- Enter with no hit highlighted: decision 4 (text filter). Escape closes the popover, a second Escape clears the field, and the focus stays.
- `/` focuses the field from the page (Task 13 registers it; this task exposes a focus function).

**Tests:** results grouped and highlighted from a mocked command answer; debounce and stale answers; each choose path lands at the right address with the right filters; Enter applies the text filter on the current data screen, and on Lines from Settings; "N more" row; empty, loading, refetch, and error states; keyboard only; axe; absent without a snapshot.

**Commit:** `feat(ui): global search in the top bar`

---

### Task 10: Saved views in the workspace

**Files:** new `crates/store/src/views.rs` (tests in file); `crates/store/src/lib.rs`; new `src-tauri/src/app/views.rs`, `mod.rs`, `commands.rs`, `command-args.json`; `WorkspaceOpen` (carries the views); bindings.

**Interface:**

```rust
pub struct SavedView {
    /// Stable within the workspace: one more than the highest id ever given (kept in `meta`).
    pub id: i64,
    pub name: String,
    /// A data screen's address without its selection: path and query, as `/lines?mode=holds&sort=age`.
    pub address: String,
    pub filters: FilterSpec,
}
impl Workspace {
    pub fn saved_views(&self) -> Result<Vec<SavedView>, StoreError>;
    pub fn set_saved_views(&mut self, views: &[SavedView]) -> Result<(), StoreError>;
}
// WorkspaceOpen gains `views: Vec<SavedView>`.
// commands, each taking the workspace id it acts on and refusing another (WorkspaceNotFound):
pub async fn save_view(app, workspace: String, name: String, address: String, filters: FilterSpec) -> Result<Vec<SavedView>, CommandError>;
pub async fn rename_view(app, workspace: String, id: i64, name: String) -> Result<Vec<SavedView>, CommandError>;
pub async fn delete_view(app, workspace: String, id: i64) -> Result<Vec<SavedView>, CommandError>;
pub async fn restore_view(app, workspace: String, view: SavedView, index: usize) -> Result<Vec<SavedView>, CommandError>;
pub async fn move_view(app, workspace: String, id: i64, index: usize) -> Result<Vec<SavedView>, CommandError>;
```

**Rules:** decision 6. Refusals: an empty or too long name (`ViewName`), a name taken without regard to case (`ViewNameTaken`, naming the view), 100 views (`TooManyViews`), an address that does not start with one of the four data paths or that carries `line`, `hold`, or `blocker` (`ViewAddress`; the interface strips them, so this guards a bug), an unknown id (`ViewNotFound`). `restore_view` puts the view back with its id at `index` (clamped), refusing a name taken meanwhile. Each write is one transaction; a stored value that cannot be parsed reads as no views and is reported once as a warning in `WorkspaceOpen.warning` without being overwritten until the next save. Saved views are not part of the history bundle (M2 decides).

**Tests:** round trip; ids never reused after delete; every refusal; restore at its index and after a rename took its name; move; a damaged value; a workspace reopened keeps its views; commands refuse another workspace's id.

**Commit:** `feat(store): saved views kept in the workspace`

---

### Task 11: Saved views in the sidebar

**Files:** new `ui/src/features/views/{ViewsSection.tsx, SaveViewPopover.tsx, apply.ts, *.test.tsx}`; `ui/src/features/shell/Sidebar.tsx`; `ui/src/features/filters/FilterBar.tsx` (Save view); `ui/src/app/actions/` (a `useSavedViews` with the five mutations); `ui/src/locales/en.json`; `DESIGN.md` (new "Saved views" in the Sidebar section and "Save view popover"); tests.

**Rules:**
- Sidebar: a section titled "Saved views" under the data destinations and above Rules and Settings, listing every view by name (cut with a tooltip on focus when long). With none, the section shows one quiet line "Save the filters and screen you use often from the filter bar." In the rail, the section is one icon button that opens a menu of the views.
- Applying a view: sets the workspace's filters to the view's, then navigates to its address; the view's item is marked current (`aria-current`) while the address and filters equal the view's, and loses the mark as soon as either changes. Pressing the current view applies it again (resetting selection and scroll, as decision 13). A view whose filters name a field the snapshot lacks applies; the chip shows as Task 3 says.
- Each item has a menu button (always visible on the focused or current item, and reachable by keyboard on every item; never hover only): Rename, Move up, Move down, Delete. Rename edits in place (Enter saves, Escape cancels, errors inline). Delete removes at once and shows a toast "Deleted view <name>" with Undo (`restore_view` at its index); the toast follows the toast rules (Undo kept on push-out).
- Save view: a button at the trailing end of the filter bar on the four data screens (inert while a workspace action runs) opens a popover with a name field (proposed: the destination's name and the first chip's value, editable, selected) and Save; Enter saves; errors inline (taken name names the view and offers "Replace it", which deletes the old with undo and saves). After saving, the new view is current and the toast says "Saved view <name>".
- The address saved is the current address without `line`, `hold`, `blocker` (and without the Breakdown `open` groups, which are a selection too).

**Tests:** list, empty state, rail menu; apply sets filters and address; current mark appears and goes; re-press resets; rename, reorder, delete with undo (and undo after a rename took the name: error toast); save with default name, taken name and Replace, too long; inert during a workspace action; keyboard only; axe.

**Commit:** `feat(ui): saved views in the sidebar, saved from the filter bar`

---

### Task 12: The command palette

**Files:** new `ui/src/features/palette/{CommandPalette.tsx, items.ts, *.test.tsx}`; `ui/src/features/shell/{AppLayout.tsx, shortcuts.ts}`; `ui/src/locales/en.json`; `DESIGN.md` (new "Command palette" component: modal at `--z-modal` over `--color-scrim`, `--color-surface-overlay`, `--radius-lg`, `--shadow-modal`, `--duration-slow` open, width and height tokens, groups, item anatomy with shortcut); tests.

**Interface:**

```ts
export interface PaletteItem {
  id: string;
  group: "actions" | "destinations" | "views" | "snapshots" | "workspaces" | "lines";
  label: string;
  /** Words matched besides the label, as "dark" for Theme: Dark. */
  keywords?: readonly string[];
  shortcut?: string;
  run: () => void;
}
/** The fixed items for the app's state now: what is offered depends on workspace, snapshot,
 * screen, and whether a workspace action runs. */
export function paletteItems(context: PaletteContext): PaletteItem[];
/** Narrows fixed items by text: every word of the query is a prefix of a word of the label or
 * a keyword, without regard to case; order kept. Presentation only. */
export function narrow(items: readonly PaletteItem[], query: string): PaletteItem[];
```

**Rules:** decision 8. `Ctrl+K` opens it from anywhere, also from a text field; a second `Ctrl+K` or Escape closes it and returns the focus where it was. The field is focused on open with no text; with no text, Actions and Destinations show, then the five most recently used items (session) under "Recent". Lines come from the search command (Task 8, Line hits only, up to 8) for a query of 2 characters or more; choosing one opens it as Task 9 does. Choosing a destination, view, snapshot, or workspace does what its own control does (snapshot through the snapshot selector's action, workspace through the switcher's action; both are workspace actions and follow the pending rule). Export this view runs the screen's Ctrl+E item and is offered only where Ctrl+E works. Items whose action cannot run now (a workspace action running) are left out. An empty narrowing says "No command matches "…"".

**Tests:** `narrow`; offered items per state (no workspace, workspace without snapshot, data screen, Settings, during a workspace action); each group's item runs its action; lines from the mocked search; Ctrl+K from a text field; focus return; recent items; keyboard only; axe.

**Commit:** `feat(ui): command palette on Ctrl+K`

---

### Task 13: The shortcut sheet and `/`

**Files:** `ui/src/features/shell/{shortcuts.ts, ShortcutSheet.tsx, AppLayout.tsx}`; every place a shortcut is bound outside the registry today (the Export menu's Ctrl+E, table keys documented in DESIGN.md Table, Escape on the panel), which gain a registry entry for the sheet without moving their handling; `ui/src/locales/en.json`; `DESIGN.md` (new "Shortcut sheet" component); tests.

**Interface:**

```ts
export interface ShortcutEntry {
  shortcut: string;              // "Ctrl+K", "?", "Shift+Space"
  group: "go" | "actions" | "tables" | "panel";
  /** Catalog key of what it does. */
  label: string;
}
/** Every shortcut of the app, the sheet's single source. */
export const SHORTCUTS: readonly ShortcutEntry[];
```

**Rules:** decision 9. `?` (Shift+/ on US layouts; matched by the character typed) opens the sheet as a page shortcut (not in a text field, not under an overlay); `/` focuses the search field as a page shortcut. The sheet is a modal dialog listing groups and entries with keys drawn as key caps (`kbd`), closes on Escape, returns the focus. Every binding `shortcutBindings` and `useExportShortcut` register has an entry (a test compares them); every DataTable key named in DESIGN.md has an entry (a test reads the table keys from one exported list in DataTable).

**Tests:** opens on `?`, not in a field; `/` focuses search; registry and sheet agree; keys drawn; focus return; axe.

**Commit:** `feat(ui): the shortcut sheet, and / to search`

---

### Task 14: Spec, performance, and the size of the app

**Files:** `docs/superpowers/specs/2026-10-10-hold-explorer-desktop-design.md` (9.1 top bar search and saved views in the sidebar; 9.2 Settings as built; 9.5 as built; 10.1 search as built with decisions 2 to 4; 10.3 saved views as built with decisions 5 to 7; 14 settings problems, copied workspaces, folder move; 18 M1c-3 done, what moved to M1d); `crates/cli/tests/perf.rs` (search timing printed with the others); `README.md` (search, saved views, palette, shortcuts in a paragraph).

**Checks, reported with output:** the whole CI list; `pnpm tauri build --no-bundle` and the size of `target/release/hx-desktop` (under 25 MB; report the change from 17.96 MB); in the built app on the demo workspace: search finds a line by wildcard and a misspelt name; a saved view applies, renames, deletes with undo; Ctrl+K reaches a destination, a snapshot, a line, and the theme; `?` lists every shortcut; density compact and back; a folder change with a move; the window permissions are the four listed.

**Commit:** `docs: search, saved views, palette, and settings in the spec`

---

## Self-review against the scope

- Spec 10.1 global search: Tasks 7 (matching, groups, released, wildcard, typos), 8 (box, grouping, highlight, choose, Enter). Notes: M4 (decision 2).
- Spec 10.3 saved views: Tasks 10, 11 (destination, filters, grouping, sort; per workspace; local).
- Spec 9.5 keyboard: Ctrl+K Task 12; `/` and `?` Task 13; Ctrl+1 to 7, Ctrl+I, Ctrl+E, Esc exist.
- Spec 9.2 Settings: theme (exists), density and author name Task 6, data folder Task 7, About Task 6's page with Task 7's folder row; language stays English only (spec 19); update check M1d.
- Rust hardening listed for M1c-3: typed error kinds and panic recovery Task 4; settings set-aside surfaced, transient reads, duplicate ids, bounded read, merged mapping, shared desktop test fixtures Task 5; absolute workspace folder Task 7. Structured error data beside `message` (missing fields, sheet names) is left for when the interface needs it (no screen reads it today).
- Export beside Import: Task 1.
- Owner decisions: "(blank)" and the Blockers header Task 2; second click, dashed chip, open row marker Task 3; saved views in the sidebar Task 11; folder move Task 7; search choosing Task 9; full palette Task 12.

## Corrections during the build (2026-10-20)

- Decision 16 (owner, 2026-10-19): the Blockers export is named by blocker; "Step" follows as an optional column.
- Task 4 (owner, 2026-10-20): the panic message is "An operation failed part-way, so what it was doing may not have been saved. Check, then try again; if it happens again, report it."
- Task 5 (controller, from the Task 4 review, spec 5.3): a file with the workspace file extension that is not a SQLite database at all (damaged beyond recognition) is listed as unreadable with kind `NotAWorkspace` and a message saying it is damaged and to restore a copy, instead of being left out of the list in silence. A file without the workspace extension stays out of both lists, untouched. Test: a workspace-named file overwritten with text is listed unreadable; a stray `notes.txt` is not listed.
- Task 9 (owner, 2026-10-23): choosing a search result whose holds are all released (`released: true`) while the status filter would hide them also sets the status to All, so its holds show; the status control shows the change. A line or a blocker opens its panel as before, whatever the status.
