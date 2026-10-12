# M1c-1 Tables, Filters, Lines, and the Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user filters the snapshot in view with chips that show live counts, works down the Lines table (as lines or as holds) at 30,000 rows without a pause, and opens any line or hold in a panel beside the list.

**Architecture:** The core gains the queries a table and a filter picker need: pages, sorts, counts per filter value, and the detail of one line. The desktop crate exposes them as thin commands that check the view. The interface gains a virtualised table, one filter state shared by every data screen, the Lines destination, and the detail panel of the shell. The interface still computes nothing: it asks for a page, a count, or a detail, and shows the answer.

**Tech Stack:** As M1b-3: Rust 1.97, Tauri 2.12, `ts-rs` 12; TypeScript 6, React 19, React Router, TanStack Query, React Aria Components (its `Virtualizer` and `TableLayout` are new here), CSS Modules over design tokens, i18next; Vitest and Testing Library; pnpm. No new dependency.

## Where this plan sits

Milestone 1 (Core): M1a core engine, M1b-1 API pass, M1b-2 history store, and M1b-3 desktop shell are merged. M1c is split into three plans, as M1b was, because it holds three things a reviewer could accept or reject apart:

- **M1c-1 (this plan):** the table, the filters, Lines, and the detail panel.
- **M1c-2:** Breakdown (list and matrix), the solve-order list of Blockers with the blocker in the detail panel, and the full Overview (role bars, top blockers, top lines).
- **M1c-3:** global search, saved views, the command palette and the shortcut sheet, the rest of Settings (density, author name, data folder, About), and the Rust hardening items listed under "Left for later plans".

Then M1d: export, update check, release pipeline.

When this plan is done, Lines is a real destination, Overview answers to the filters and its bars lead to Lines, and seven destinations become six "Soon" screens.

## How this plan is written

As the M1b-3 plan: each task gives the files, the exact public interface that later tasks rely on, the rules, and the test cases. It does not give the implementation. The test cases are the requirements; each is written as a failing test first. Where a library call does not work as this plan assumes, the implementer reads the installed package, adapts, and reports what was adapted.

Facts about React Aria Components checked on 2026-10-13 against its documentation: `Virtualizer` with `layout={TableLayout}` windows the rows of a `Table`; a `Column` takes `width` and `minWidth` in pixels, percent, or `fr`, and no content-based size; `TableLoadMoreItem` placed last in a `TableBody` calls `onLoadMore` when it scrolls into view. The implementer confirms each against `react-aria-components` as installed before building on it.

## Decisions this plan rests on

1. **The table loads rows as the user scrolls; it does not offer the whole result behind one scrollbar.** A page is 200 rows. The table always says how many rows are loaded and how many exist ("400 of 9,312 holds"). To reach the other end of a list the user reverses the sort. Reason: React Aria builds its collection from every row it is given, so 30,000 rows cost more than the 100 ms a filter change may take; a hand-written grid with random access would mean hand-written keyboard and screen-reader behaviour, which the library gives us tested. This is an owner-visible choice; it is reversed by replacing one hook and one component.
2. **Column widths are declared, not measured from content.** A column says how many characters must fit (`chars`) or that it takes the remaining width (`flex`). The table turns characters into pixels with one measured character width per typeface. The widest line ID of the whole result comes from Rust with each page, so a line ID is never cut, as `DESIGN.md` requires.
3. **One table component.** `DataTable` is always virtualised. A table in the flow of a page is as tall as its rows up to a limit; a table that is the page fills the content area.
4. **Filters are session state per workspace, held by the interface.** They stay while the user moves between destinations and snapshots, and are forgotten when the app closes. Saved views (M1c-3) will store them. The interface holds the filter the user built; Rust decides what it matches.
5. **The detail panel reads its own data.** The selected line or hold is named in the address (`?line=`, `?hold=`), and the panel asks Rust for it. So the panel shows a line whatever the filters are, and a later saved view or search result can open one by address.
6. **A hold is addressed by its position in the snapshot** (its index in file order). Limited files have no hold id, and a position is stable for as long as the snapshot is.
7. **What the snapshot lacks is hidden and named.** A column or filter field whose export column is blank in every row of the snapshot is not shown, and the page says once which export columns are missing.
8. **Not in this plan:** the change tag and "New since previous snapshot" (M2), the watch star and notes (M4), the line timeline (M2), the blocker in the panel (M1c-2), export (M1d). Nothing is shown disabled for them.

## Global Constraints

- Real project files never enter the repository. Tests build inputs with `hx-synth` or small text files, in temporary directories.
- `hx-core` and `hx-store` do not depend on Tauri. `ts-rs` enters them only behind the cargo feature `ts`.
- A Tauri command contains no logic beyond the `blocking` helper, one call into `hx_desktop::app`, and the error mapping. Every command that reads the data in view takes `view: ViewRef` and calls `AppState::check_view` first.
- Every command has an entry in `ui/src/api/command-args.json`; the tests on both sides fail otherwise. No type that crosses the boundary is written by hand in `ui/`; `pnpm bindings` leaves `ui/src/bindings/` unchanged in CI.
- The interface computes no counts, ages, groups, dates, sorts, or blockers. It shows what commands return. Joining a list for display and formatting a number or date (in the one format module) are presentation.
- A screen reads the data of the snapshot in view only through `useSnapshotQuery` or `useSnapshotPages`, and changes the open workspace or the selection only through `workspaceAction()`. A table without a selection handler is read-only. The control that started an action shows the spinner; conflicting siblings are inert.
- Rust: edition 2021, toolchain 1.97.0; `hx-desktop` declares `rust-version = "1.90"`, the other crates `1.88`. `#![forbid(unsafe_code)]`. No `unwrap()` or `expect()` outside tests, except on values that cannot fail by construction, with a message saying why. No `#[allow]`. Every public item is documented.
- TypeScript is strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`, no `@ts-ignore`, no non-null assertion on a value that can be absent.
- Every user-facing string is in `ui/src/locales/en.json`. Terms: Hold, Line, Blocker, Snapshot, Workspace, Saved view. An error says what happened, why, and how to fix it.
- Interface rules of spec 13.1 bind every screen: all states for every component; skeletons on a first load; a refetch keeps the previous render, dimmed; an empty state names the next action; motion 150 to 250 ms on state changes only, and none under reduced motion; nothing by hover alone; WCAG AA in both themes; no colored side stripes, nested cards, gradient text, decorative glass, or hero-metric tiles.
- Colors, sizes, spacing, radii, and motion come from the tokens in `DESIGN.md`. A new token is added to `DESIGN.md` first; `pnpm tokens` regenerates the stylesheet; `node tools/design/check-tokens.mjs` and `node --test tools/design/` pass. Teal marks what can be acted on, is selected, or has focus; plain data is neutral gray. Nothing is purple.
- Never relax a supply-chain or security policy (package age rules, audit, the content security policy, the capability list) to get something installed or passing.
- The parity tests and `tools/parity/reference.mjs` do not change. Existing performance limits stay. `query::lines` and `query::holds` return what they return today for every call that exists today; `HoldPage` only gains two fields.
- Every action is reachable by keyboard, and focus is always visible.
- Commit messages follow Conventional Commits. No em dashes in documents or interface text.

## File Structure

```
crates/core/src/filter.rs          FilterSpec::without, default_age_bands
crates/core/src/query.rs           facet_counts, value_page, line_page, new sorts, positions
crates/core/src/detail.rs          new: HoldRef, ChainLink, LineDetail, line_detail
crates/core/src/dataset.rs         Dataset::absent_fields
crates/cli/tests/perf.rs           one more budget
src-tauri/src/app/snapshots.rs     view check, cache
src-tauri/src/app/data.rs          new: filter_options, filter_values, lines, holds, line_detail, hold_detail
src-tauri/src/app/data_tests.rs    new
src-tauri/src/commands.rs          seven commands (six of data, one that says what is open)
ui/src/text/                       new home of i18n.ts and format.ts (below api)
ui/src/api/commands.ts             data commands
ui/src/api/workspace-commands.ts   new: the commands that change the view
ui/src/app/view.ts                 useSnapshotQuery, useSnapshotPages, workspaceAction
ui/src/app/actions/                new: what useApp.ts held, one module per concern
ui/src/app/shell/                  new home of Page.tsx and context.ts (useShell)
ui/src/app/filters/                new: the filter state, toSpec, dimension helpers
ui/src/components/                 Tag, Disclosure, FactList, SectionTitle, ChoiceGroup,
                                   FilterChip, Popover, OptionList; DataTable rewritten
ui/src/features/filters/           new: FilterBar, FilterPicker, StatusControl
ui/src/features/lines/             new: LinesPage, columns, sorts, presets
ui/src/features/detail/            new: DetailPanel, LineDetail, HoldDetail
ui/src/features/overview/          joins the filters; bars lead to Lines
ui/src/features/import/            follow-ups of Task 10
ui/src/dev/                        states for the new screens, a 30,000-row state
DESIGN.md                          sections added by Tasks 4 to 9
```

---

### Task 1: Core queries for tables, filter counts, and line detail

**Files:** `crates/core/src/{filter.rs, query.rs, dataset.rs, lib.rs}`, new `crates/core/src/detail.rs`, `crates/core/src/ts_tests.rs`, `crates/cli/tests/perf.rs`.

**Interface:**

```rust
// filter.rs
impl FilterSpec {
    /// This filter without its entries for `dim`: what a picker for `dim` counts against.
    pub fn without(&self, dim: &Dim) -> FilterSpec;
}
/// The age bands a workspace starts with: 0 to 13, 14 to 29, 30 to 59, 60 to 89, and 90 or more days.
pub fn default_age_bands() -> Vec<AgeBand>;

// query.rs
/// How many holds each choice of the filters that are not dimensions would keep, each counted
/// with that one filter replaced and every other part of `spec` in force.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FacetCounts {
    pub open: usize,           // status Open
    pub released: usize,       // status Released
    pub age_bands: Vec<usize>, // one per entry of `bands`, with `age_bands` set to that band alone
    pub size_mismatch: usize,  // size_mismatch Some(true)
    pub size_match: usize,     // size_mismatch Some(false)
}
pub fn facet_counts(ds: &Dataset, spec: &FilterSpec, bands: &[AgeBand]) -> FacetCounts;

/// The values of `dim` a picker offers.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ValuePage {
    /// How many values match `search`, before the limit.
    pub total: usize,
    /// The first `limit` of them, ordered as `group_by` orders groups.
    pub values: Vec<Group>,
}
/// Groups the holds kept by `spec.without(dim)` by `dim`, keeps the groups whose label contains
/// `search` (case-insensitive; an empty search keeps all), and returns the first `limit`.
pub fn value_page(ds: &Dataset, spec: &FilterSpec, dim: &Dim, search: &str, limit: usize) -> ValuePage;

pub enum LineSort { HoldsDesc, Easiest, OldestFirst,          // as today
    LineId, Blockers, Disciplines, ModelSize, LdtSize, StressCalc } // new
pub struct LineQuery { pub sort: LineSort, pub single_hold_only: bool,
    pub size_mismatch_only: bool, pub reverse: bool }          // two new fields, default false
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LinePage {
    /// Lines the query selects, before paging.
    pub total: usize,
    /// Characters of the longest line ID among them; 0 when there is none.
    pub widest_line_id: usize,
    pub rows: Vec<LineRow>,
}
pub fn line_page(ds: &Dataset, spec: &FilterSpec, query: &LineQuery, offset: usize, limit: Option<usize>) -> LinePage;

pub enum HoldSort { FileOrder, OldestFirst, LineId,            // as today
    Discipline, HoldType, Blocker, Name }                      // new
pub struct HoldQuery { pub sort: HoldSort, pub offset: usize, pub limit: Option<usize>,
    pub reverse: bool }                                        // new field, default false
pub struct HoldPage { pub total: usize, pub rows: Vec<Row>,
    /// The position in `Dataset::rows` of each entry of `rows`.
    pub positions: Vec<usize>,
    /// Characters of the longest line ID among the selected holds; 0 when there is none.
    pub widest_line_id: usize }

// dataset.rs
impl Dataset {
    /// The optional fields no row has a value for, in the order of `mapping::Field`: `SourceId`
    /// when no hold has one, `Released` when no hold is released, `Name`, `Role`, and
    /// `Discipline` when every row has the blank spelling, and so on for the others.
    pub fn absent_fields(&self) -> Vec<Field>;
}

// detail.rs
/// A hold with its position in the snapshot, by which the interface asks for it again.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HoldRef { pub position: usize, pub row: Row }
/// One blocker of a line, and where it stands in the solve order.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ChainLink {
    pub key: String,          // `<discipline>|<item>`
    pub label: String,        // `<discipline> / <item>`, as `Group::label` writes a blocker
    pub kind: String,
    /// One-based place of the blocker in `plan.steps`; `None` when the plan has no step for it.
    pub step: Option<usize>,
    /// Lines the blocker is on, in the whole snapshot.
    pub lines: usize,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LineDetail {
    pub line_id: String,
    pub model_size: Option<f64>, pub ldt_size: Option<f64>,
    pub stress_calc: String, pub size_mismatch: bool,
    pub open: Vec<HoldRef>,      // file order
    pub released: Vec<HoldRef>,  // file order
    pub chain: Vec<ChainLink>,
}
/// Everything about one line; `None` when no hold of the snapshot is on it. `plan` is the solve
/// plan of the open holds of `ds` with no other filter and no step limit.
pub fn line_detail(ds: &Dataset, plan: &SolvePlan, line_id: &str) -> Option<LineDetail>;
```

All new types derive `TS` behind the `ts` feature, as their neighbours do, and are listed in `ts_tests.rs`.

**Rules:**
- `without` removes every `FieldFilter` whose `dim` equals `dim` and nothing else.
- The new line sorts: `LineId` ascending in byte order; `Blockers` and `Disciplines` most first; `ModelSize` and `LdtSize` largest first; `StressCalc` ascending without regard to case. A line without the sorted value (no size, blank stress calc, no age) comes last. Ties end in line ID ascending.
- The new hold sorts compare text without regard to case, ascending; `Blocker` compares the discipline, then the item. Ties stay in file order.
- `reverse` reverses the order among the rows that have the sorted value. Rows without it stay last, and ties still end as stated above. `reverse` on `FileOrder` is the file backwards.
- `size_mismatch_only` keeps the lines whose `LineRow::size_mismatch` is true. It combines with `single_hold_only` by AND.
- `lines(ds, spec, query)` equals `line_page(ds, spec, query, 0, None).rows`.
- Line attributes in `LineDetail` come from the line's first open hold, or from its first hold when none is open.
- `chain` lists each distinct blocker of the line's open holds once: those with a step first, by step; the others after, in order of first appearance.

**Tests (each first seen failing):**
- `without` drops both entries of a dimension named twice and keeps the entries of other dimensions, the status, the text, the bands, and the ranges.
- `default_age_bands` is the five bands of spec 11.3; an age of 13 is in the first only, 14 in the second only, 90 and 5,000 in the last.
- `facet_counts`: on a dataset built by hand, `open` and `released` ignore the status of `spec` and obey its field filters; each band count equals `summary` with that band alone; with a discipline filter set every count drops accordingly; `size_mismatch + size_match` equals the holds kept with no mismatch filter.
- `value_page`: counts ignore the spec's own entry for the dimension and obey the others; `search` matches the label without regard to case; `total` counts matches before the limit; a limit of 0 gives no values and the true total; a blocker is found by its label `Civil / 577-PR-400`.
- For each new `LineSort` and `HoldSort`: the order on a hand-built dataset, where rows without the value are, and where ties end. For `reverse`: the same dataset reversed among rows with a value, rows without one still last.
- `line_page`: `total` and `widest_line_id` do not depend on offset or limit; an offset at or past the total gives no rows; a multi-byte line ID counts characters, not bytes; `lines` equals page zero without a limit for every sort.
- `HoldPage::positions` names the row in `Dataset::rows` for every sort, with `reverse`, and on a later page.
- `absent_fields`: a dataset built by hand whose rows have no id, no release, no sizes, and no stress calc lists exactly `SourceId`, `Released`, `ReleaseRemark`, `ReleaseDate`, `ModelSize`, `LdtSize`, `StressCalc`, in that order; a dataset whose rows have every value lists none; one row with a value removes its field; the required fields are never listed.
- `line_detail`: unknown line gives `None`; open and released holds are split and in file order with true positions; attributes follow the first open hold; the chain is in step order with the stepless blocker last; a line with only released holds has an empty chain.
- `crates/cli/tests/perf.rs`, in the existing ignored release test or beside it: on 10,000 rows, `facet_counts` plus `value_page` for `Dim::Blocker` plus the first 200 rows of `line_page` complete in under 100 ms together. The existing limits are not changed.

**If the parity reference compares a printed `HoldPage`:** the two new fields would appear in the CLI's output. Do not change the reference; stop and report it.

**Verification:** `cargo test -p hx-core --all-features --locked`; `cargo clippy --workspace --all-targets --locked -- -D warnings`; the parity test passes untouched.

**Commit:** `feat(core): pages, sorts, filter counts, and line detail`

---

### Task 2: Data commands, the current-workspace command, and the cache

**Files:** `src-tauri/src/app/{mod.rs, snapshots.rs}`, new `src-tauri/src/app/data.rs` and `data_tests.rs`, `src-tauri/src/{commands.rs, lib.rs}`, `ui/src/api/{commands.ts, command-args.json}`, `ui/src/bindings/` (regenerated), `ui/src/test/ipc.ts` and `ui/src/dev/commands.ts` (default answers for the new commands).

**Interface:**

```rust
/// Most rows a data command returns in one answer.
pub const PAGE_ROWS: usize = 200;
/// Most values `filter_values` returns.
pub const PICKER_VALUES: usize = 200;

/// What the filter bar needs for the snapshot in view and a filter.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct FilterOptions {
    /// Holds the filter keeps.
    pub total: usize,
    pub facets: FacetCounts,
    /// The bands `facets.age_bands` counts, in order.
    pub age_bands: Vec<AgeBand>,
    /// Extra columns of the snapshot, by header name.
    pub custom_dims: Vec<String>,
    /// Optional fields the snapshot has no value for.
    pub absent: Vec<Field>,
}
/// A page of holds with their positions.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
pub struct HoldsView { pub total: usize, pub widest_line_id: usize, pub rows: Vec<HoldRef> }

impl AppState {
    pub fn filter_options(&mut self, spec: &FilterSpec, view: &ViewRef) -> Result<FilterOptions, CommandError>;
    pub fn filter_values(&mut self, spec: &FilterSpec, dim: &Dim, search: &str, view: &ViewRef) -> Result<ValuePage, CommandError>;
    pub fn lines(&mut self, spec: &FilterSpec, query: &LineQuery, offset: usize, view: &ViewRef) -> Result<LinePage, CommandError>;
    pub fn holds(&mut self, spec: &FilterSpec, query: &HoldQuery, view: &ViewRef) -> Result<HoldsView, CommandError>;
    pub fn line_detail(&mut self, line_id: &str, view: &ViewRef) -> Result<Option<LineDetail>, CommandError>;
    pub fn hold_detail(&mut self, position: usize, view: &ViewRef) -> Result<Option<HoldRef>, CommandError>;
    /// The open workspace as the state holds it, with the snapshot that is selected; `None`
    /// without one. It changes nothing: the selection, the cache, and a file open for import stay.
    pub fn current(&self) -> Result<Option<WorkspaceOpen>, CommandError>;
}
```

Commands (names and argument keys as the interface sends them): `filter_options { spec, view }`, `filter_values { spec, dim, search, view }`, `lines { spec, query, offset, view }`, `holds { spec, query, view }`, `line_detail { lineId, view }`, `hold_detail { position, view }`, `workspace_current {}`. In `commands.ts`: `api.filterOptions`, `api.filterValues`, `api.lines`, `api.holds`, `api.lineDetail`, `api.holdDetail`, `api.workspaceCurrent`.

**Rules:**
- With a workspace open and no snapshot, each data command answers as for an empty snapshot: zero counts, no rows, `None` for a detail. It is not an error.
- `lines` returns at most `PAGE_ROWS` rows from `offset`. `holds` treats a missing limit, or one above `PAGE_ROWS`, as `PAGE_ROWS`.
- `filter_options` uses `default_age_bands()`; per-workspace bands arrive with M4.
- The state keeps the id of the open workspace beside the workspace, set where the workspace is installed and cleared where it is closed, so `check_view` reads no file. The dataset cache holds the workspace id, the snapshot id, the dataset, and, once asked for, the solve plan of its open holds; `AppState::dataset` and a new `AppState::plan` are the only readers, and both take the snapshot id. Nothing of one workspace or snapshot can be served for another.
- The plan is built on the first `line_detail` of a snapshot and kept with the dataset.
- A new variant of a persisted or serialized enum is added only where this plan names it.

**Tests (`data_tests.rs`, through `AppState`, on a workspace built from `hx-synth`):**
- Every data command answers `ViewChanged` for another workspace id, another snapshot id, and `None` against a selected snapshot; `NoWorkspace` with none open; the empty answer for a workspace without snapshots.
- `filter_options`: `total` equals `overview(spec).summary.holds`; `custom_dims` lists the extra columns of a file that has two; `absent` for a file imported without the `released` and size columns lists those fields.
- `filter_values` never returns more than `PICKER_VALUES` values and reports the true total.
- `lines` and `holds`: two pages in a row hold no row twice and together equal the first 400 rows of the core query; a limit of 5,000 gives 200 rows.
- `line_detail`: a line of the snapshot answers; a line that is not there gives `None`; two calls build the plan once (a test-only counter, as `dataset_builds`).
- `hold_detail`: a position inside the snapshot answers with that row; one past the end gives `None`.
- After another workspace is opened, and after another snapshot is selected, the dataset and the plan are built anew; after `select_snapshot` with the selected id they are kept.
- `current` names the open workspace and the selected snapshot after open, select, and start; it is `None` after a start that reopens nothing; a call leaves the draft, the selection, and the cached dataset as they were (no dataset is built anew after it).
- The mock-runtime test of `commands.rs` passes with the seven new fixture entries, and its command-name test lists them.
- Interface: the command-args test passes for the new entries; `commands.test-d.ts` pins the result types.

**Verification:** `cargo test -p hx-desktop --locked`; `pnpm bindings` then `git status --porcelain ui/src/bindings` shows only the intended new and changed files, committed; `pnpm test`.

**Commit:** `feat(desktop): data commands for filters, lines, holds, and details`

---

### Task 3: Interface groundwork

**Files:** move `ui/src/app/{i18n.ts, format.ts}` and their tests to `ui/src/text/`; move `ui/src/features/shell/{Page.tsx, context.ts}` to `ui/src/app/shell/`; new `ui/src/api/workspace-commands.ts`; `ui/src/api/commands.ts`; `ui/src/app/view.ts` and its test; new `ui/src/app/actions/`; `ui/src/app/useApp.ts` removed; `eslint.config.js`; every importer of the moved modules.

**Why:** the M1b-3 final review listed these as the things to settle before the first new screen. Each is a rule that later tasks rely on.

**Interface:**

```ts
// ui/src/app/view.ts
export type ReadingName = "overview" | "filterOptions" | "filterValues" | "lines" | "holds"
  | "lineDetail" | "holdDetail";
export interface SnapshotQueryOptions<Data, Params extends readonly unknown[]> {
  name: ReadingName;
  params: Params;
  /** Calls the command with the view and the params the key names. */
  read: (view: ViewRef, ...params: Params) => Promise<Data>;
  /** False while the reading has nothing to ask for; default true. */
  enabled?: boolean;
}
export function useSnapshotQuery<Data, Params extends readonly unknown[]>(
  options: SnapshotQueryOptions<Data, Params>): UseQueryResult<Data>;

export interface Paged<Row> { total: number; rows: readonly Row[] }
export interface SnapshotPages<Row, Page extends Paged<Row>> {
  /** Every row loaded so far, in order. */
  rows: readonly Row[];
  /** The first page as answered: its total, and whatever else the command says once. */
  first: Page | undefined;
  total: number | undefined;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  /** True on a first load: nothing to show yet. */
  isPending: boolean;
  /** True while the rows shown are those of the filter, sort, or view of before. */
  isPlaceholderData: boolean;
  error: Error | null;
  refetch: () => void;
}
export function useSnapshotPages<Row, Page extends Paged<Row>, Params extends readonly unknown[]>(options: {
  name: ReadingName; params: Params;
  read: (view: ViewRef, offset: number, ...params: Params) => Promise<Page>;
}): SnapshotPages<Row, Page>;
```

`ui/src/app/actions/`: `start.ts` (`useStart()`: the application start and `isBusy`), `workspaces.ts` (`useWorkspaceActions()`: open, create, rename), `snapshots.ts` (`useSnapshotActions()`: select), `theme.ts` (`useThemeSetting()`), `demo.ts` (`useDemo()`), `import.ts` (`useImportCommit()`). Each keeps the behaviour and the tests it has in `useApp` today; `useApp` goes.

**Rules:**
- Layers, enforced by lint: `ui/src/text/` imports nothing of the app; `ui/src/api/` may import `text` and `bindings` only; `ui/src/components/` may import `text`, `design`, and `bindings`; `ui/src/app/` may import all of those; `ui/src/features/` may import all of them.
- `ui/src/api/workspace-commands.ts` holds the commands that change the open workspace or the selection (`workspace_create`, `workspace_open`, `workspace_rename`, `snapshot_select`, `demo_create`, `import_commit`, `app_start`). Lint allows its import from `ui/src/app/` only, so a feature cannot send one outside `workspaceAction()`. The rule that matched `api.<name>` member access is removed with the names it guarded.
- `useSnapshotPages` shares the reading function of `useSnapshotQuery` (extract it; one implementation of the `ViewChanged` handling). The next offset is the number of rows loaded. Its key is the same prefix as every snapshot key, so an action on the workspace drops and re-reads it.
- A change of `params` shows the rows of before as placeholder data until the first page of the new params arrives; it never shows rows of two params mixed.
- After five `ViewChanged` answers in a row the hook asks `workspace_current`, not `app_start`: the Rust side is asked what it holds and is not made to start over, so a file open for import and the selection survive. The answer replaces `open` in the cached start. When it names another view than the one the interface showed, the shell shows a notice from the catalog that says the workspace or snapshot on screen was brought back in step with the app, and that an action that seems missing should be done again. When it names the same view and the command still refuses, the screen gets `ViewUnsettled` as today. A hook whose screen is gone asks nothing.
- `app_start` is then called once, when the page loads, and nowhere else. The comment at the top of `view.ts` is rewritten to say what happens now.
- A command that changes a snapshot's data (none in this plan; the first is M2's date edit) invalidates `keys.snapshots`. Write this beside the rule at the top of `view.ts`.

**Tests:**
- Lint: a fixture file under `ui/src/features/` that imports `workspace-commands` fails; a file under `ui/src/api/` that imports `../app/...` fails; both rules have a passing counterpart. (Run ESLint on fixtures from a test, as the existing lint tests do, or add them if none exist.)
- `useSnapshotQuery`: `read` receives the params in order; the key contains them; the existing `view.test.tsx` cases pass unchanged in meaning.
- `useSnapshotPages`: the first page is read at offset 0; `loadMore` reads at the number of rows loaded; `hasMore` is false when rows equal total; a second `loadMore` while one is in flight sends nothing; new params keep the old rows as placeholder and replace them whole; a workspace action drops the pages and reads page zero again for the new view; `ViewChanged` on a later page is re-read, not shown.
- The five-refusal case: `workspace_current` is asked and `app_start` is not; the cached start takes the answer; the notice appears once when the view differed and not when it was the same; a hook whose screen is gone asks nothing.
- Every test of `useApp.test.tsx` lives on under the action module it belongs to.

**Verification:** `pnpm lint && pnpm typecheck && pnpm test` (also with `CI=1`); `pnpm build && pnpm check:dist`.

**Commit:** `refactor(ui): layer text below api, split actions, page snapshot readings`

---

### Task 4: Shared components and design additions

**Files:** `DESIGN.md`; new folders under `ui/src/components/`: `Tag`, `Disclosure`, `FactList`, `SectionTitle`, `ChoiceGroup`, `FilterChip`, `Popover`, `OptionList`; `ui/src/components/{Button, BarRow, ToastRegion}`; `ui/src/components/index.ts`; `ui/src/features/import/` (uses the shared pieces; its local copies go); `ui/src/dev/gallery.tsx`.

**Design work first, in `DESIGN.md`:** add or complete a section, with anatomy and every state, for: Disclosure row; Fact list (ruled label and value pairs); Section title; Choice group (radio); Popover; Option list (single and multiple choice, with a count per option, a search field above, and a line for "more values exist, type to narrow"); Menu (it is used and not specified). Add the rules: where an error goes (the shell notice for what outlives a page, an inline notice beside what failed, the field for what the user typed); which pages are form width, content width, or full width; the reasons line under a disabled primary button; that progress is one of the things teal may mark. Heatmap cell and legend stay with M1c-2.

**Interface:**

```ts
<Tag tone="neutral" | "info" | "warning" | "danger" | "success" icon?>{text}</Tag>   // a state tone requires an icon
<Disclosure title summary? defaultExpanded?>{children}</Disclosure>
<FactList items={[{ label, value }]} />
<SectionTitle level={2 | 3}>{text}</SectionTitle>
<ChoiceGroup label value onChange options={[{ value, label, description? }]} isDisabled? />
<FilterChip field value isNegated? onPress onRemove isDisabled? />      // Backspace or Delete removes
<AddFilterChip onPress isDisabled? />
<Popover trigger={ReactElement} aria-label placement?>{children}</Popover>
<OptionList aria-label selectionMode="single" | "multiple" options={[{ key, label, count? }]}
  selectedKeys onSelectionChange isLoading? emptyText footer? />
<Button isPending? reservesPendingSpace? ... />      // room for the spinner is an explicit prop
<BarRow ... />   // props are a union: a static row has no onPress; a pressable row requires one
```

**Rules:**
- The three local tags of the import flow, its disclosure row, its ruled list, its section titles, and its radio group are replaced by the shared components; the screens look as they did (compare screenshots of the development page before and after, both themes).
- A bar group is a list for assistive technology: each row is a list item that says its label and its value.
- Toasts: a fourth toast never drops one that carries an undo; when a focused toast goes, focus moves to the next toast, or back to where it was before the toast took it; toasts are reached in the order they appeared.
- A count in an option is formatted by the format module and right-aligned on tabular figures; an option with a count of 0 stays choosable and is written in the muted ink.
- Every new component is in the gallery with all its states, in both themes.

**Tests:** for each new component: its roles and names; keyboard use (Disclosure toggles on Enter and Space; ChoiceGroup moves with arrows; FilterChip removes on Backspace and Delete and on its remove button, and does neither when disabled; Popover closes on Escape and returns focus to its trigger; OptionList selects with Space and reports the keys); the disabled and loading states; `axe` finds nothing. `Tag` with a state tone and no icon is a type error (`.test-d.tsx`). `BarRow` static with `onPress` is a type error. The toast cases above. The import tests pass unchanged in meaning.

**Verification:** `node tools/design/check-tokens.mjs`; `node --test tools/design/`; `pnpm tokens` leaves `tokens.css` in step; `pnpm lint && pnpm typecheck && pnpm test`; the gallery looked at in a headless browser in both themes.

**Commit:** `feat(ui): shared tag, disclosure, fact list, choice group, chip, popover, and option list`

---

### Task 5: The virtualised table and its column model

**Files:** `DESIGN.md` (Table section); `ui/src/components/DataTable/{DataTable.tsx, DataTable.module.css, DataTable.test.tsx}`, new `ui/src/components/DataTable/{columns.ts, measure.ts}` with tests; every caller of `DataTable` (Overview's table view, the mapping preview, the skipped rows and warnings of the review, the workspace table); `ui/src/test/setup.ts` (the size mocks a virtualised list needs in jsdom); `ui/src/dev/` (a table state with 30,000 rows loaded 200 at a time).

**Interface:**

```ts
/** How wide a column is. `chars`: room for that many characters of its typeface. `flex`: a share of the width that is left, never narrower than `minChars`. */
export type ColumnSize = { chars: number } | { flex: number; minChars: number };

export interface DataTableColumn<Item> {
  id: string; header: string; cell: (item: Item) => ReactNode;
  kind?: "text" | "number" | "identifier";
  size: ColumnSize;                       // required: replaces `width`
  isSupporting?: boolean; isRowHeader?: boolean; allowsSorting?: boolean;
}

export interface DataTableProps<Item> {
  // as today: aria-label, columns, rows, rowKey, selectedKey, onSelectionChange, sort,
  // onSortChange, rowActions, density, isLoading, skeletonRows, isStale, emptyState, className
  /** `fill`: the table takes the height of its container and scrolls inside it. Otherwise it is as tall as its rows, up to `maxRows`, then scrolls. Default `{ maxRows: 12 }`. */
  height?: "fill" | { maxRows: number };
  /** Rows in the whole result, when `rows` is only the part loaded. */
  totalRows?: number;
  /** The count line, written by the caller from the catalog: "200 of 3,612 lines". */
  countText?: (shown: number, total: number) => string;
  /** Called when the end of the loaded rows comes into view. */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

// columns.ts
/** Pixel widths for the layout: `chars` times the width of one character of the column's typeface, plus the cell padding on both sides. */
export function columnWidth(size: ColumnSize, kind: DataTableColumnKind, widths: CharWidths, paddingX: number): { width: number | `${number}fr`; minWidth: number };
// measure.ts
export interface CharWidths { text: number; mono: number }
/** The width of the digit zero in the table face and in the monospace face, measured once the fonts are ready, and again when they change. */
export function useCharWidths(): CharWidths;
```

**Rules:**
- Only the rows near the visible part are in the document. Row height and header height come from the density tokens (through `token-values.ts`), per the density on the table or the root.
- Behaviour kept from today: arrow keys, Home, End, Page Up, and Page Down move the focused row; in a table with a selection handler Enter or a click selects; a table without one marks nothing and answers to no pointer; sortable headers; the header gains its shadow once rows scroll beneath it; skeleton rows on a first load, never focusable; `isStale` dims the rows; the empty state sits under the header.
- The focused row is kept in the document while it is scrolled away, so focus is never lost to the page.
- The count line is a live status region outside the scroller: it reads the count text, and "loading more" while `isLoadingMore`. `aria-rowcount` is the total when it is known.
- When the last loaded row comes near the visible part and `onLoadMore` is given, it is called once per arrival. A row of skeletons marks the place while `isLoadingMore`.
- An identifier is never cut: its column is sized by the caller from the widest value. A text cell is cut with an ellipsis; assistive technology still reads the whole text, and the detail panel shows it in full, so nothing depends on a tooltip.
- When the declared widths exceed the table, it scrolls sideways and the row-header column stays in view.
- Where the layout cannot be measured (tests), `useCharWidths` answers fixed stand-in values named as such; no screen depends on them.
- `DESIGN.md`: the Table section says how columns are sized, that rows load as the user scrolls and how the count line reads, the load-more row, and the sideways scroll with the pinned first column.

**Tests:**
- With 5,000 rows given, fewer than 100 row elements are rendered, and scrolling the scroller renders later rows.
- `aria-rowcount` equals `totalRows`; the status region reads the count text; while `isLoadingMore` it says so.
- `onLoadMore` is called once when the end comes into view, not again until `rows` grows, and never without rows or while loading.
- Keyboard: Down, Up, Home, End, Page Down move the focus; End on 5,000 rows focuses the last one and it is rendered; Enter selects in a selectable table and does nothing in a read-only one.
- `columnWidth`: `chars: 10` with a character width of 8 and padding 12 gives 104; a flex column gives `"<n>fr"` and a minimum from `minChars`; identifier columns use the monospace width.
- A read-only table has no `aria-selected` on any row; `isStale` and `isLoading` behave as before; the empty state shows.
- A render-count test: changing an unrelated prop of the parent of a table with 5,000 rows renders no more row elements than are visible.
- Every existing caller's test passes; each caller declares sizes for its columns.
- In the development page with 30,000 rows loaded: typing a filter that swaps the rows responds without a visible pause; record the measured time of one re-render in the report (target under 50 ms in a development build).

**Verification:** `pnpm lint && pnpm typecheck && pnpm test` (also `CI=1`); the development page looked at in both themes and both densities at 1280 by 800 and 1920 by 1080; screenshots kept in the working notes.

**Commit:** `feat(ui): virtualise the table and size columns by declaration`

---

### Task 6: Filter state and the filter bar

**Files:** new `ui/src/app/filters/{state.tsx, spec.ts, dims.ts}` with tests; new `ui/src/features/filters/{FilterBar.tsx, StatusControl.tsx, FilterBar.module.css}` with tests; `ui/src/app/shell/` (the bar's place in the layout); `ui/src/features/shell/AppLayout.tsx`; `ui/src/features/overview/OverviewPage.tsx`; `ui/src/api/filter.ts`; `DESIGN.md` (Filter chip section: the status control); `ui/src/locales/en.json`.

**Interface:**

```ts
// ui/src/app/filters/state.tsx
export interface FilterValue { key: string; label: string }
export interface FieldEntry { dim: Dim; values: readonly FilterValue[]; negate: boolean }
export interface Filters {
  status: Status;
  fields: readonly FieldEntry[];
  text: string;
  ageBands: readonly AgeBand[];
  created: DateRange;
  released: DateRange;
  sizeMismatch: boolean | null;
}
export const defaultFilters: Filters;                 // status Open, nothing else
export function useFilters(): {
  filters: Filters;
  /** The filter as the commands take it. The same object while the filters are the same. */
  spec: FilterSpec;
  isDefault: boolean;
  set: (next: Filters) => void;
  update: (change: (current: Filters) => Filters) => void;
  clear: () => void;
};
// spec.ts
export function toSpec(filters: Filters): FilterSpec;
// dims.ts
export function dimId(dim: Dim): string;              // "Discipline", "Custom:Area"
export function dimName(dim: Dim): string;            // from the catalog; a custom dimension is its header
```

`<FilterBar />` takes no props: it reads `useFilters()` and the `filterOptions` reading.

**Rules:**
- The filters belong to a workspace for the session: opening another workspace shows that workspace's filters of this session, or the default; selecting another snapshot keeps them. They are not written to disk.
- The bar is under the page header of every data destination (Overview and Lines after this plan), at `--layout-filterbar-height`, and absent on Settings, the welcome page, the import flow, and the "Soon" screens.
- Status is always first and is not a pill, because it cannot be removed: a control that shows Open, Released, or All with the count of each from `facets`. Then one chip per active filter, in the order they were added; then "Add filter"; then "Clear all" while anything but the status differs from the default. "Clear all" also sets the status back to Open.
- A chip reads the field name and its values: one value by its label; two as "A, B"; more as the first and "+n". A negated field reads "is not". The age band, date range, size mismatch, and text filters each have one chip.
- The total the filter keeps is written at the end of the bar ("2,418 holds"), from `FilterOptions.total`, dimmed while it is read again.
- While a workspace action runs, every chip is disabled as `DESIGN.md` says, with the line that says why.
- Removing a chip moves focus to the chip after it, or to "Add filter".
- A released filter field, or the status Released and All, is not offered when `absent` lists `Released`; the bar says once, in the caption ink, which export columns the snapshot lacks, by their export names.
- Overview sends `useFilters().spec` in place of the fixed open-holds filter. `openHoldsFilter()` stays as the definition of the default spec, and `toSpec(defaultFilters)` equals it and the shared fixture `open-holds-filter.json`.
- This task builds the bar, the status control, the chips, and removal. It also creates `ui/src/features/filters/FilterPicker.tsx` as a popover that shows only the name of the field it was opened for; "Add filter" and a press on a chip open it. Task 7 fills it. The tests of this task set filters through `useFilters()`.

**Tests:**
- `toSpec`: the default equals the fixture; each part maps to its field; an entry without values is left out; `negate` is carried; the result is the same object for the same filters (memo).
- State: a filter set in workspace A is there after a visit to workspace B and back, and after a snapshot switch; `clear` gives the default; a new session starts at the default.
- Bar: the chips for each kind of filter, their texts for one, two, and five values and for "is not"; remove by button and by Backspace, with focus going where the rule says; "Clear all" appears only when something is set and resets the status; the status control shows the three counts and changes the status; everything is disabled with its reason while an action runs; the total is shown and dimmed on a refetch; the missing-columns line when `absent` is not empty; `axe` finds nothing.
- Overview: changing a filter re-reads the overview with that spec, and shows the previous numbers dimmed meanwhile; with the default filters the request equals today's.
- The bar is on Overview and not on Settings.

**Verification:** `pnpm lint && pnpm typecheck && pnpm test`; the development page with filters set, both themes.

**Commit:** `feat(ui): filter state shared by data screens, and the filter bar`

---

### Task 7: The filter picker with live counts

**Files:** new `ui/src/features/filters/{FilterPicker.tsx, fields.ts, FieldValues.tsx, AgeBands.tsx, DateRangeFields.tsx, FilterPicker.module.css}` with tests; `ui/src/features/filters/FilterBar.tsx`; `ui/src/text/format.ts` (an age band's label, a date range's label); `DESIGN.md` (Filter picker section); `ui/src/locales/en.json`; `ui/src/dev/`.

**What it is:** "Add filter" and a press on a chip open a popover. Opened from "Add filter" it lists the fields; choosing one shows that field's editor. Opened from a chip it shows that field's editor at once.

**Fields, in this order** (`fields.ts`, pinned by a test): Discipline, Hold type, Role, Name, Blocker type, Blocker, Remark, Line, Age, Created, Released on, Size, Stress calc, Size mismatch, Text, then one per custom dimension by its header. A field whose export column the snapshot lacks is not listed. Has note, Watched, and Changed since previous snapshot arrive with the milestones that bring their data and are not listed.

**Rules:**
- A dimension field shows an option list of its values with the count each would keep, read with `filterValues` for the current spec and the text typed in the search field above the list (debounced through a deferred value, not a timer of our own). A ticked value applies at once; the list stays open; the counts are read again and the previous counts stay, dimmed, meanwhile.
- A ticked value that the answer no longer lists is shown first, with the label it was picked under and the count 0, so it can be unticked.
- When `total` exceeds the values returned, a line under the list says how many more exist and to type to narrow.
- "Is" and "Is not" are a choice above the list; it applies to the whole field.
- Age shows the bands of `FilterOptions.age_bands` as a multiple choice with the count of each; a band's label is written by the format module ("0 to 13 days", "90 days or more").
- Created and Released on show two date fields, From and To. A date is sent when it is complete and valid; From after To is said at the fields and nothing is sent.
- Size mismatch is a single choice of Yes and No with the counts of `facets`. Text is one field, applied on Enter and on leaving the field.
- Escape closes the popover and returns focus to what opened it. Tab order inside is the search field, the choice, the list.
- Pressing a field in the list of fields that already has a chip opens that field's editor with its values ticked.

**Tests:**
- The field list and its order; with `absent` naming the size fields, stress calc, and `Released`, the list has no Size, Stress calc, Size mismatch, or Released on; a snapshot with two custom columns lists both last.
- Dimension field: `filter_values` is asked with the spec, the dimension, and the search text; ticking a value adds a chip and asks again with the new spec; unticking the last value removes the chip; a ticked value missing from the answer shows with 0; the more-values line; "Is not" sets `negate`; the list shows its loading state on a first read and dims on a re-read.
- Age, dates, size mismatch, and text each produce the spec they should; an invalid date range sends nothing and says why.
- Keyboard only: open "Add filter", choose Discipline, tick two values, close with Escape; focus is on "Add filter"; two values are in one chip.
- A press on a chip opens its editor; `axe` finds nothing with the popover open.

**Verification:** `pnpm lint && pnpm typecheck && pnpm test` (also `CI=1`); the picker looked at in the development page in both themes, with a dimension of 1,500 values.

**Commit:** `feat(ui): filter picker with live counts`

---

### Task 8: The Lines destination

**Files:** new `ui/src/features/lines/{LinesPage.tsx, lineColumns.tsx, holdColumns.tsx, sorts.ts, presets.ts, address.ts, LinesPage.module.css}` with tests; `ui/src/app/{destinations.ts, router.tsx}`; `ui/src/features/overview/OverviewPage.tsx` (bars lead to Lines); `ui/src/components/StatTile/` (a pressable tile, with its states in `DESIGN.md`); `ui/src/text/format.ts` (a list of names, a size, days); `ui/src/locales/en.json`; `ui/src/dev/`; `DESIGN.md` (the preset row, if it needs a rule of its own).

**What it shows:** a page header "Lines" with a switch between Lines and Holds; under it the filter bar; a row of presets (Lines mode only); the table, which fills the rest of the content area.

**Columns.** Lines mode: Line (identifier, row header, sized by `widest_line_id`), Holds, Disciplines (the names joined as a list), Hold types, Blockers, Oldest (days), Model size, LDT size, Stress calc, and a warning tag "Size mismatch" with an icon where the flag is set. Holds mode: Line, Discipline, Hold type, Remark (flex), Blocker (the item, identifier), Blocker type (supporting), Name, Role, Created; then by status: Open adds Age; Released adds Released on and Duration; All adds a Status tag, Released on, and Days. A column whose field `absent` lists is left out.

**Presets** (`presets.ts`): All (`HoldsDesc`), Single hold (`single_hold_only`), Easiest to release (`Easiest`), Oldest first (`OldestFirst`), Size mismatch (`size_mismatch_only`). One preset is marked when the query equals it; none when the user has sorted by a header. Size mismatch is left out when the snapshot lacks a size column.

**The address** (`address.ts`) holds the page's own state, so a saved view can keep it later: `/lines?rows=holds&sort=<sort>&reverse=1&single=1&mismatch=1`. Missing parts mean the defaults: lines, the All preset. `parseLinesAddress(search) -> LinesState` and `linesAddress(state) -> string` are each other's inverse; an unknown value falls back to the default without an error.

**Rules:**
- Rows come from `useSnapshotPages` with `api.lines` or `api.holds`; the params are the spec and the query. A filter, sort, or mode change keeps the rows of before, dimmed, until the first new page is there, and returns the scroll to the top.
- A sortable header asks for its sort (`sorts.ts`: one table from column and direction to `sort` and `reverse`, and back, for both modes). A second press reverses it. `Easiest` belongs to its preset only.
- The count line reads "200 of 3,612 lines" or "200 of 9,312 holds", with the numbers formatted.
- Selecting a row sets `?line=<id>` in Lines mode or `?hold=<position>` in Holds mode, keeping the rest of the address; the selected row is marked from the address. Task 9 gives the panel; in this task the address and the mark are tested.
- Empty states: no snapshot in the workspace (leads to Import); no row for these filters (offers "Clear all"); no row for this preset (says which preset and offers All).
- An error from the command is an inline danger notice above the table with a retry; the rows of before stay.
- On Overview, a bar of the discipline group and of the hold-type group is pressable: it adds that value to the filters (replacing that field's entry) and opens Lines. The stat tiles "Lines on hold" and "Single-hold lines" open Lines with the All and the Single hold preset.
- `destinations.ts` marks `lines` as available; its "Soon" screen and tag go with that one change.

**Tests:**
- `sorts.ts`: every sortable column maps to its sort and back, in both directions, for both modes; `presets.ts`: each preset's query, and which preset a query is.
- `address.ts`: round trips for every state; garbage falls back to the defaults.
- Page: the first request is `lines` with the default query and offset 0; scrolling to the end asks for offset 200; the count line; pressing "Holds" asks `holds` and shows the hold columns for each of the three statuses; a header press sends the mapped sort and a second press reverses it; choosing a preset sends its query and marks it; a filter change sends the new spec, dims the old rows, and replaces them.
- With `absent` naming the size fields and stress calc, there is no size, stress calc, or mismatch column and no Size mismatch preset.
- The three empty states and the error notice with retry.
- Selecting a row writes the address; a page opened at `/lines?rows=holds&hold=17` marks that row when it is loaded.
- Overview: pressing the Civil bar opens Lines with a Discipline chip "Civil"; the two tiles open their presets; keyboard reaches each.
- `Ctrl+3` opens Lines; the sidebar item has no "Soon" tag; `axe` finds nothing.

**Verification:** `pnpm lint && pnpm typecheck && pnpm test` (also `CI=1`); the development page with 30,000 holds, both modes, both themes, both densities; screenshots kept.

**Commit:** `feat(ui): Lines destination with presets, sorting, and hold rows`

---

### Task 9: The detail panel

**Files:** new `ui/src/features/detail/{DetailPanel.tsx, LineDetail.tsx, HoldDetail.tsx, selection.ts, Detail.module.css}` with tests; `ui/src/features/shell/{AppLayout.tsx, Shell.module.css}`; `ui/src/features/lines/LinesPage.tsx`; `DESIGN.md` (Detail panel section); `ui/src/locales/en.json`; `ui/src/dev/`.

**Interface:**

```ts
// selection.ts
export type Selection = { kind: "line"; lineId: string } | { kind: "hold"; position: number } | null;
/** The selection the address names, and functions that give the address with another selection or none. */
export function useSelection(): { selection: Selection; select: (next: Selection) => void; close: () => void };
```

**What it shows.** A region at the right of the shell, `--layout-detail-width` wide, with a labelled heading, a close button, and its own scroll.

- A line: the line ID (monospace, copyable by a button with a text label); a fact list of model size, LDT size, stress calc, and a warning tag when the sizes differ; "Blockers to clear" as an ordered list, each with its label, its type, its place in the solve order ("Step 3") or "Not in the solve order", and how many lines it blocks; "Open holds" and "Released holds" as lists of holds, each with discipline, hold type, the full remark, who raised it, when, and its age or duration. A press on a hold opens that hold.
- A hold: a breadcrumb back to its line; the full remark; a fact list of line, discipline, hold type, name, role, created, age or (released on, duration, release remark), blocker and blocker type, the source id when there is one, and every extra column with a value.

**Rules:**
- The panel shows while the address of a data destination names a selection. It reads `lineDetail` or `holdDetail` through `useSnapshotQuery`, so it follows the snapshot in view.
- From `--layout-breakpoint-wide` up it sits beside the content, which narrows; below, it overlays the right edge with `--shadow-overlay`. It enters by a transform over `--duration-slow` and in place under reduced motion. The list stays visible and usable in both cases.
- Escape closes it when focus is in the panel or on the table, and focus returns to the row that opened it, or to the table when that row is gone. Opening it by Enter moves focus to its heading; opening it by a click leaves focus on the row.
- A line that has no hold in the snapshot in view, and a position past the end, show an empty state that says so and offers to close; it is not an error.
- When another snapshot is selected, a hold selection is dropped from the address (a position means nothing in another snapshot); a line selection stays.
- First load: skeletons in the shape of the sections. A re-read keeps the previous content, dimmed. An error is an inline notice in the panel with a retry.
- Sections a limited snapshot cannot fill (released holds without `Released`, sizes without the size columns) are left out, not shown empty.
- The panel is a `complementary` landmark named by its heading. The shortcut list of the shell gains nothing here; Escape is handled where the panel is.

**Tests:**
- `useSelection`: reads `?line=` and `?hold=`; `select` keeps the other parts of the address; `close` removes both; a hold position that is not a whole number is no selection.
- Line panel: asks `line_detail` with the id and the view; shows facts, the chain in order with step numbers and the stepless text, both hold lists; a press on a hold selects it; the copy button writes the line ID and says so.
- Hold panel: asks `hold_detail`; shows every fact, extras included; an open hold shows age and no release facts; the breadcrumb opens the line.
- Enter on a row opens the panel and focuses its heading; Escape closes it and focus is on that row; a click leaves focus on the row; Escape with focus in a popover of the filter bar closes the popover only.
- A snapshot switch with a hold open closes the panel; with a line open, the panel re-reads for the new view.
- The empty state for an unknown line; skeletons; dimmed re-read; the error with retry.
- With `absent` naming `Released` and the size fields, the panel has no released section and no size facts. (The panel reads `filterOptions` for `absent`, as the bar does.)
- At 1,100 px wide the panel overlays; at 1,400 px the content narrows (assert the layout class or attribute, not pixels). `axe` finds nothing with the panel open.

**Verification:** `pnpm lint && pnpm typecheck && pnpm test` (also `CI=1`); the development page: a line and a hold, both themes, at 1100, 1280, and 1920 wide; keyboard-only pass through Lines, open, close.

**Commit:** `feat(ui): detail panel for a line and a hold`

---

### Task 10: Import flow follow-ups

**Files:** `ui/src/features/import/{ImportReviewPage.tsx, review.ts, ImportMappingPage.tsx, ImportSheetPage.tsx, leave.tsx}` and their tests.

**Why:** three items the M1b-3 final review left for this plan. The first guards the one destructive choice of the app.

**Rules:**
- Before the commit is sent, the review page compares what it is about to send with what the last target check answered for: the date and the time, whether the date was confirmed, the target, and `replace`. When any differs, nothing is sent, the target is checked again, and the page says that the choices changed and asks to confirm again.
- The pending rule on the sheet and the mapping pages: the control that started a reading shows the spinner; the others on the page are inert meanwhile.
- A late Cancel never ends an import that was started after it: the cancel is tied to the file it was pressed for (its content hash), and its answer is ignored when another file is open by then.

**Tests:**
- For each of time, confirmation, target, and replace: change it after the check and before Import; no `import_commit` is sent; a new `import_check_target` is; the page says why. With nothing changed the commit is sent as today.
- Sheet page: while a sheet is being read, the other sheets and Continue are inert and only the pressed one shows the spinner. Mapping page the same for Continue.
- Cancel pressed on file A, then file B opened before the answer: B's draft is still there after the answer.

**Verification:** `pnpm lint && pnpm typecheck && pnpm test` (also `CI=1`).

**Commit:** `fix(ui): check every import choice before sending, and tie a cancel to its file`

---

### Task 11: Whole-plan verification and design audit

**Files:** `README.md` (what the app does now); `docs/superpowers/specs/2026-10-10-hold-explorer-desktop-design.md` only where this plan's decisions change what it says (9.1, 9.2, 10.2); this plan (a "Post-review corrections" section when there are any).

**Steps:**
- [ ] `cargo fmt --all -- --check`; `cargo clippy --workspace --all-targets --locked -- -D warnings`; `cargo doc --workspace --no-deps --locked` without warnings; `cargo test --workspace --locked`.
- [ ] `cargo test --release -p hx-cli --test perf --locked -- --ignored --nocapture`; record the timings.
- [ ] `pnpm lint`; `pnpm typecheck`; `pnpm test` and `CI=1 pnpm test`; `pnpm bindings` and `pnpm tokens` leave no change; `node tools/design/check-tokens.mjs`; `node --test tools/design/`.
- [ ] `pnpm build`; `pnpm check:dist`; `pnpm tauri build --no-bundle`; record the binary size (limit 25 MB).
- [ ] The parity test and `tools/parity/reference.mjs` are untouched (`git diff main -- tools/parity crates/cli/tests/parity.rs` is empty).
- [ ] No data file is tracked (`git ls-files | grep -Ei '\.(xlsx|xlsm|xls|csv|holdx-ws)$'` prints nothing).
- [ ] Design audit with the design skills against `PRODUCT.md` and `DESIGN.md`: the filter bar, the picker, Lines in both modes, and the panel, in both themes and both densities; the six diagnostic questions of the usability skill for Lines; every finding fixed or recorded with its reason.
- [ ] Keyboard-only walk in the development page: open Lines, add a filter, sort, open a line, open one of its holds, go back to the line, close, clear the filters.
- [ ] The spec says what the app now does where this plan decided something: rows load as the user scrolls (9.2 Lines), filters are per workspace for the session (10.2), a hold is addressed by position, absent columns are hidden and named.

**Commit:** `docs: record M1c-1 in the spec and the README`

---

## What exists when this plan is done

- A table that stays quick at 30,000 rows, with declared column widths, in every place the app shows rows.
- Filters with live counts, shared by Overview and Lines, per workspace for the session.
- The Lines destination: line rows and hold rows, five presets, sorting by header, 200 rows at a time.
- A detail panel for a line (attributes, blockers to clear in solve order, holds) and for a hold.
- Overview answers to the filters, and its bars and two tiles lead to Lines.
- Six destinations still say "Soon": Breakdown, Blockers, History, People, Follow-up, Rules.

## Spec coverage of this plan

| Spec | Covered by | Left |
|---|---|---|
| 5.2 contract: view check, typed boundary | Tasks 2, 3 | |
| 9.1 filter chips on every data screen | Task 6 | global search in the top bar (M1c-3) |
| 9.1 right panel, list stays visible | Task 9 | blocker in the panel (M1c-2) |
| 9.2 Lines: table, presets, line and hold rows | Tasks 1, 2, 8 | change tag, "New since previous snapshot" (M2); watch star (M4) |
| 9.2 Overview: every number drills through | Task 8 (bars, two tiles) | the rest of Overview (M1c-2) |
| 9.3 line detail: attributes, holds, blocker chain | Tasks 1, 9 | timeline (M2); notes and watch (M4) |
| 9.5 arrow keys in tables, Esc closes the panel | Tasks 5, 9 | palette, `/`, `?` (M1c-3) |
| 10.2 filters: fields, OR and AND, "is not", live counts, stay across destinations, "Clear all" | Tasks 1, 6, 7 | has note, watched, changed (with their data) |
| 11.3 default age bands | Task 1 | per-workspace bands (M4) |
| 4.2 limited snapshots say what they lack | Tasks 1, 6, 8, 9 | |
| 13.1 interface rules; 17 filter change under 100 ms | every task; Tasks 1, 5 | |

## Items of the M1b-3 review notes and where they went

| Item | Where |
|---|---|
| Virtualise `DataTable`, decide the column model | Task 5 |
| Import flow's local pieces into `components` and `DESIGN.md` | Task 4 |
| Split `useApp`; move `Page` and `useShell`; text and format below `api` | Task 3 |
| `read` receives params; typed reading names; view-changing commands split out | Task 3 |
| A read-only "what do you hold" command in place of the `app_start` reset; tell the user | Tasks 2, 3 |
| Review page's second guard; pending rule on mapping and sheet pages; late Cancel | Task 10 |
| `DESIGN.md`: error placement, page widths, reasons line, progress and teal, menu | Task 4 |
| Toast items; `Button` pending room; `BarRow` union; list semantics of bar groups | Task 4 |
| Dataset cache keyed by workspace and snapshot; workspace id in the state | Task 2 |
| Heatmap cell and legend in `DESIGN.md` | M1c-2 |

## Left for later plans

- **M1c-2:** Breakdown list and matrix; Blockers solve-order list and the blocker in the panel; full Overview.
- **M1c-3:** global search; saved views (the address of Task 8 and the filters of Task 6 are what a view stores); command palette and shortcut sheet; Settings (density, author name, data folder, About). Rust: first frame for theme System; a typed union of error kinds with structured data; recovery after a panic without a restart; a settings set-aside or block surfaced in `AppStart`; no set-aside on a transient read error; an absolute workspace folder; duplicate-id workspace files listed as unreadable; a bounded file read; merging the saved mapping; shared test fixtures in the desktop crate.
- **Open for the owner, not blocking:** whether leaving the import flow by the sidebar should keep the file open; whether the stat figures are large enough on a meeting-room screen; whether rows loading as the user scrolls (decision 1) is acceptable or a full scrollbar is wanted.
