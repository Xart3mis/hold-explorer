# M1c-2 Breakdown, Blockers, and the Full Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user breaks the snapshot in view down by any dimension, as a list or as a matrix of two dimensions; sees the full solve order of the blockers with its cumulative curve and opens any blocker in the panel; and finds on Overview the role bars, the top blockers, the top lines, and the stale holds, each leading to the screen that shows them.

**Architecture:** As M1c-1. The core gains a folded matrix, the detail of a blocker, a solve-order view, and the Overview's extra parts; the desktop crate exposes them as thin commands that check the view; the interface gains two chart components drawn in SVG (a heatmap and a line chart), the Breakdown and Blockers destinations, a group and a blocker in the detail panel, and the rest of Overview. The interface still computes nothing.

**Tech Stack:** As M1c-1. No new dependency: charts are SVG written by hand over the design tokens.

## Where this plan sits

M1 (Core) plans: M1a, M1b-1, M1b-2, M1b-3, and M1c-1 are merged. **M1c-2 (this plan)**: Breakdown, Blockers, the full Overview. M1c-3: global search, saved views, the command palette and shortcut sheet, the rest of Settings, and the Rust hardening items. M1d: export, update check, release pipeline.

When this plan is done, five destinations are real (Overview, Breakdown, Lines, Blockers, Settings) and four say "Soon" (History, People, Follow-up, Rules).

## How this plan is written

As M1c-1: each task gives files, the exact interface later tasks rely on, the rules, and the test cases; not the implementation. Test cases are the requirements and are written failing first. Where a library call does not behave as this plan assumes, the implementer reads the installed source, adapts, and reports it.

## Decisions this plan rests on

1. **A Breakdown group expands in place to its lines** (spec 9.2; chosen by the owner on 2026-10-17 over opening it in the panel). The pinned React Aria Components 1.22.1 has expandable table rows (a tree grid: `hasChildItems`, `isExpanded`, the expanded keys of `useTreeGridState`); `DataTable` gains them. An expanded group shows its first 200 lines as child rows (read when it is expanded) and a last child row "Open all N lines in Lines" when there are more. Keyboard follows the tree grid pattern: Right expands, Left collapses or moves to the parent, Enter on a line row opens the line in the panel.
2. **A matrix shows at most 30 rows and 30 columns.** The rest of each dimension is folded into one "Other" row or column, counted by Rust. A cell of "Other" is not pressable; the folded values are named in its tooltip line count only. Remark by blocker would otherwise be a million cells.
3. **Charts are SVG over tokens, no chart library.** Two charts are needed (heatmap, cumulative line); a library would bring its own styles, motion, and accessibility model. Every chart has a table view, keyboard focus on its marks, and a tooltip that keyboard focus shows as well (spec 13.2).
4. **The solve order follows the filters.** The Blockers screen plans the blockers of the holds the filters keep. The line panel's chain keeps using the unfiltered plan of open holds (M1c-1), and says so.
5. **"Stale" is 90 days or more** (spec 11.3's default threshold) until M4 makes it a setting. Overview's attention list has one entry in M1: stale holds. Overdue follow-ups and watchlist changes arrive with M4 and are not shown disabled.
6. **Top blockers and top lines are the first ten of their orders:** blockers by holds, as `group_by` orders them; lines by holds, as the All preset orders them. Each list ends in a link to the full screen.
7. **Deltas are not in this plan** (M2), nor the open-holds trend (M2), nor "released since the previous snapshot" (M2).

## Global Constraints

Every constraint of the M1c-1 plan holds, unchanged:

- Real project files never enter the repository; tests build inputs with `hx-synth` or small text files in temporary directories.
- `hx-core` and `hx-store` do not depend on Tauri; `ts-rs` only behind the `ts` feature.
- A Tauri command contains no logic beyond the `blocking` helper, one call into `hx_desktop::app`, and the error mapping. Every command that reads the data in view takes `view: ViewRef` and calls `AppState::check_view` first. Every command has an entry in `ui/src/api/command-args.json`; generated bindings are committed and unchanged by `pnpm bindings` in CI.
- The interface computes no counts, ages, groups, dates, sorts, blockers, scales' domains from data it did not receive, or folds. It shows what commands return. Mapping a count to a length or a colour step on a scale whose domain the command gave is presentation.
- A screen reads snapshot data only through `useSnapshotQuery` or `useSnapshotPages`, and changes the view only through `workspaceAction()`. A table without a selection handler is read-only. The pending rule holds.
- Rust: edition 2021, toolchain 1.97.0; `hx-desktop` `rust-version = "1.90"`, others `1.88`; `#![forbid(unsafe_code)]`; no `unwrap()`/`expect()` outside tests except on values that cannot fail, with the reason; no `#[allow]`; every public item documented.
- TypeScript strict; no `any`, no `@ts-ignore`, no non-null assertion on a value that can be absent.
- Every user-facing string is in `ui/src/locales/en.json`; glossary terms; errors say what happened, why, and how to fix it.
- Spec 13.1 and 13.2 bind every screen and chart: all states; skeletons on first load; dimmed previous render on refetch; empty states name the next action; motion 150 to 250 ms on state changes only, none under reduced motion; nothing by hover alone; WCAG AA in both themes; banned patterns; charts with a tooltip, keyboard focus that shows what hover shows, and a table view; color follows the entity; no two value axes; status colors only for real states, with icon and label.
- Tokens only; a new token goes into `DESIGN.md` first, then `pnpm tokens`, the checker, and its tests. Teal for action, selection, focus, progress; plain data neutral gray; ramps blue; nothing purple. The chart palette is checked with the data visualization skill's validator in both themes.
- Never relax a supply-chain or security policy.
- Parity tests and `tools/parity/reference.mjs` unchanged; existing performance limits stay; `query::*` functions keep their results for existing calls.
- Keyboard reaches everything; focus always visible.
- Conventional Commits; no em dashes in documents or interface text.

## File Structure

```
crates/core/src/query.rs           matrix_top, stale_count
crates/core/src/detail.rs          BlockerDetail, blocker_detail
crates/core/src/solve.rs           SolveRow, solve_rows
src-tauri/src/app/data.rs          breakdown, matrix, solve_order, blocker_detail, group_lines
src-tauri/src/app/snapshots.rs     OverviewView extended
ui/src/components/charts/          Heatmap, LineChart, ChartTooltip, ChartTable (new)
ui/src/features/breakdown/         BreakdownPage, list mode, matrix mode, dims, address (new)
ui/src/components/DataTable/       expandable rows (tree grid)
ui/src/features/blockers/          BlockersPage, curve, steps table, address (new)
ui/src/features/detail/            BlockerDetail; selection gains blocker
ui/src/features/overview/          role bars, top blockers, top lines, attention list
DESIGN.md                          Chart foundations, Heatmap, Legend, Line chart, chart focus
```

---

### Task 1: Core: folded matrix, blocker detail, solve rows, stale count

**Files:** `crates/core/src/{query.rs, detail.rs, solve.rs, ts_tests.rs}`, `crates/cli/tests/perf.rs`.

**Interface:**

```rust
// query.rs
/// A matrix cut to the largest values of each dimension, the rest folded into "Other".
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FoldedMatrix {
    pub rows: Vec<Group>,          // at most max_rows, ordered as group_by orders them
    pub cols: Vec<Group>,          // at most max_cols
    /// Holds of the values folded into "Other"; None when nothing was folded.
    pub other_row: Option<Group>,  // key "", label "", holds and lines of the folded values
    pub other_col: Option<Group>,
    /// cells[r][c]: holds with row value r and column value c. When other_row is Some, the
    /// last row of cells is "Other"; when other_col is Some, the last column is.
    pub cells: Vec<Vec<usize>>,
    /// The largest entry of cells, for the colour scale; 0 when empty.
    pub max_cell: usize,
    /// How many values were folded into "Other" in each dimension.
    pub folded_rows: usize,
    pub folded_cols: usize,
}
pub fn matrix_top(ds: &Dataset, spec: &FilterSpec, row_dim: &Dim, col_dim: &Dim, max_rows: usize, max_cols: usize) -> FoldedMatrix;

/// Open holds the filter keeps whose age is at least `days`.
pub fn stale_count(ds: &Dataset, spec: &FilterSpec, days: i64) -> usize;

// solve.rs
/// One step of the solve order with what the interface shows of its blocker.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SolveRow {
    pub step: usize,          // one-based
    pub key: String,          // `<discipline>|<item>`
    pub label: String,        // `<discipline> / <item>`
    pub kind: String,
    pub discipline: String,
    pub holds: usize,
    pub gain: usize,
    pub cumulative: usize,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SolveView {
    pub rows: Vec<SolveRow>,
    /// Lines on hold among the kept holds: the end the cumulative curve climbs to.
    pub lines_on_hold: usize,
}
pub fn solve_view(ds: &Dataset, spec: &FilterSpec) -> SolveView;

// detail.rs
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LinkedBlocker { pub key: String, pub label: String, pub kind: String, pub shared_lines: usize }
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BlockerDetail {
    pub key: String, pub label: String, pub kind: String, pub discipline: String, pub item: String,
    pub holds: usize,
    /// Lines this blocker alone holds: solving it frees them.
    pub frees: Vec<String>,
    /// Lines it is on that other blockers also hold.
    pub shared: Vec<String>,
    /// Other blockers on its lines, most shared lines first, then by label.
    pub linked: Vec<LinkedBlocker>,
    /// Its oldest open hold; None when none has a creation date.
    pub oldest: Option<HoldRef>,
    /// Its place in the solve order of the same holds; None when no step ranks it.
    pub step: Option<usize>,
}
/// The detail of one blocker among the holds `spec` keeps; None when no kept hold has it.
pub fn blocker_detail(ds: &Dataset, spec: &FilterSpec, plan: &SolvePlan, key: &str) -> Option<BlockerDetail>;
```

**Rules:** `matrix_top` counts exactly as `matrix` does for the values it keeps, and the "Other" row and column hold the sum of everything folded (the Other by Other cell too). Sums of all cells equal the kept holds. `solve_view` is `solve_plan(ds, spec, None)` with each step's blocker looked up; its numbers equal the plan's. `blocker_detail` reads lines and blockers among the kept holds; `frees` and `shared` are in first-appearance order; `step` is the blocker's place in `plan`, the plan of the same spec.

**Tests (failing first):** on a hand-built dataset, `matrix_top` with room for everything equals `matrix`; with 2 by 2 it folds the rest into Other with the right sums, `folded_*` counts, and `max_cell`; an empty filter gives empty rows, no Other, `max_cell` 0. `stale_count` at 90: an open hold aged 89 is out, 90 in; released holds never count. `solve_view` rows equal the plan's steps in order, with labels; `lines_on_hold` equals `summary(...).lines`. `blocker_detail`: a blocker alone on a line frees it; one sharing a line lists it in `shared` and the other blocker in `linked` with the shared count; `oldest` is the hold with the greatest age; an unknown key gives `None`; a filter that removes its holds gives `None`. Perf (in the ignored release test): `matrix_top(Discipline, HoldType, 30, 30)` plus `solve_view` on 10,000 rows under 100 ms together.

**Commit:** `feat(core): folded matrix, solve rows, blocker detail, stale count`

---

### Task 2: Data commands for Breakdown, Blockers, and the full Overview

**Files:** `src-tauri/src/app/{data.rs, data_tests.rs, snapshots.rs, mod.rs}`, `src-tauri/src/{commands.rs, lib.rs}`, `ui/src/api/{commands.ts, command-args.json}`, `ui/src/bindings/`, `ui/src/app/view.ts` (`ReadingName`), test and development mocks as each later task needs them.

**Interface:**

```rust
pub const MATRIX_SIDE: usize = 30;
pub const GROUP_LINES: usize = 200;
pub const TOP_ITEMS: usize = 10;
pub const STALE_DAYS: i64 = 90;

impl AppState {
    pub fn breakdown(&mut self, spec: &FilterSpec, dim: &Dim, view: &ViewRef) -> Result<Vec<Group>, CommandError>;
    pub fn matrix(&mut self, spec: &FilterSpec, row_dim: &Dim, col_dim: &Dim, view: &ViewRef) -> Result<FoldedMatrix, CommandError>;
    pub fn solve_order(&mut self, spec: &FilterSpec, view: &ViewRef) -> Result<SolveView, CommandError>;
    pub fn blocker_detail(&mut self, spec: &FilterSpec, key: &str, view: &ViewRef) -> Result<Option<BlockerDetail>, CommandError>;
    /// A group of `dim`: its numbers and the first GROUP_LINES lines, as `line_page` gives them.
    pub fn group_detail(&mut self, spec: &FilterSpec, dim: &Dim, key: &str, view: &ViewRef) -> Result<Option<GroupDetail>, CommandError>;
}
#[derive(Serialize, TS)] pub struct GroupDetail { pub group: Group, pub lines: LinePage }
// OverviewView gains:
pub by_role: Vec<Group>,
pub top_blockers: Vec<Group>,   // first TOP_ITEMS of group_by(Blocker)
pub top_lines: Vec<LineRow>,    // first TOP_ITEMS of the All order
pub stale: StaleCount,          // { holds: usize, days: i64 }
```

Commands: `breakdown { spec, dim, view }`, `matrix { spec, rowDim, colDim, view }`, `solve_order { spec, view }`, `blocker_detail { spec, key, view }`, `group_detail { spec, dim, key, view }`; `overview` keeps its arguments.

**Rules:** the solve plan of a filter is built per request (under 30 ms at 10,000 rows) and not cached; the unfiltered plan of the cache stays for the line panel. A workspace without a snapshot gives empty answers. `group_detail` of a key the filter no longer keeps answers `None`.

**Tests:** each command: `ViewChanged` for another view, `NoWorkspace`, empty without a snapshot; `matrix` folds at `MATRIX_SIDE`; `solve_order` equals the core view; `blocker_detail` with a filter that removes the blocker answers `None`; `group_detail` lists at most `GROUP_LINES` lines with the true total; Overview's new parts equal the core functions. Mock-runtime fixture test with the five new entries.

**Commit:** `feat(desktop): commands for Breakdown, Blockers, and the full Overview`

---

### Task 3: Adaptive layout, and the owner's design answers

**Why:** the owner answered the four open design questions of M1c-1 on 2026-10-17: keep the filter bar's total everywhere (no change); at 1280 px the app must be generally more responsive and adaptive; change the font of the blocker column (blocker items are words such as "Stress" as often as tags, so they take the body face; line IDs stay monospace); and make sortable headers more obvious. Doing the layout now means Breakdown and Blockers are built on it.

**Files:** `DESIGN.md` (shell layout, Table, a new "Adapting to the window" rule); `ui/src/app/shell/`, `ui/src/features/shell/`; `ui/src/components/DataTable/*` (column priority, sortable header look); `ui/src/features/lines/*`, `ui/src/features/detail/*`, `ui/src/features/filters/*`, `ui/src/features/overview/*`; tests; gallery and development states.

**Rules and targets:**
- Design the layout for window widths from 1024 to 1920 and record it in `DESIGN.md` as breakpoints with tokens, not as one-off media queries. What adapts is the designer's call within the rules (for example: a sidebar the user can collapse to a narrow rail whose items keep their names for assistive technology and show them in text on focus and hover, never by hover alone; tighter page padding below 1440; tables giving each column a priority so the lowest-priority columns leave the table, and their values stay reachable in the detail panel, when the content area is narrow).
- Targets, checked in the browser at 1280 by 800 and 1024 by 640, both themes, both densities: Lines in line rows has no sideways scroll at 1280 (columns that leave are in the line panel); hold rows keep Age (or Duration) in view at 1280; Overview's tiles and bars fit without clipping; the detail panel beside or over the content as today; nothing the user needs is cut.
- The blocker column (and the blocker in the panel and in the picker) uses the body face; line IDs stay monospace. `DESIGN.md`'s rule on identifiers says which values are monospace and why.
- A sortable header looks pressable before it is sorted: an affordance at rest (for example a muted sort mark showing the direction a press will give), hover, focus, and pressed states; the sorted header keeps its stronger mark. Written in the Table section.
- The filter bar's total stays on every data screen (owner's answer); no change.

**Tests:** column priority (which columns leave at which width, and that a dropped column's value is in the panel); the collapsed sidebar's names for assistive technology and keyboard; the sortable header's attributes at rest, hover, focus, sorted; the blocker column's class; screenshots before and after at 1280 and 1024 compared in the report.

**Commit:** `feat(ui): adapt the layout to the window, and make sortable headers plain to see`

---

### Task 4: Chart foundations and the two charts

**Files:** `DESIGN.md` (new sections: Chart foundations, Heatmap, Legend, Line chart, Chart focus and tooltip, Chart table view); `ui/src/components/charts/{Heatmap.tsx, LineChart.tsx, ChartTooltip.tsx, ChartTable.tsx, scale.ts}` with tests and stylesheets; gallery entries; `tools/design/` if the checker needs the new pairs.

**Design work first,** with the data visualization skill: the sequential blue ramp's steps for heatmap cells in both themes (from the existing chart palette; validated with its script, results recorded); cell size, gap (the 2 px surface gap), and the zero cell; the legend (a stepped ramp with its domain from the command); the line chart's marks (2 px line, 8 px markers on focus, recessive grid, one axis), the projected or forecast parts are not in this plan; how focus moves (arrow keys across cells and points), what the tooltip shows, and the table view toggle shared by every chart.

**Interface:**

```ts
<Heatmap aria-label rows={{ key, label }[]} cols={{ key, label }[]} cells={number[][]} max={number}
  otherRow? otherCol? onCellPress?={(rowKey, colKey) => void} formatCell={(n) => string} />
<LineChart aria-label points={{ x: number, y: number, label: string }[]} yMax={number}
  xLabel yLabel formatY onPointPress? />
<ChartTable ... />   // the table view of either, a read-only DataTable
// scale.ts: step(value, max, steps): number   // which ramp step a value takes
```

**Rules:** colour from the ramp step only; a zero cell is the surface with a hairline, not the lightest step; every cell and point is reachable by arrow keys from one tab stop, with Home and End; the tooltip shows on focus at once and on hover after `--delay-tooltip`; Enter presses a pressable cell; "Other" cells are never pressable; the table view shows the same numbers; reduced motion removes every transition.

**Tests:** step boundaries; zero cells; keyboard movement across rows and columns and into Other; Enter presses only real cells; tooltip on focus; the table view's rows equal the chart's data; `axe` with the chart and with the table view.

**Commit:** `feat(ui): heatmap and line chart over the design tokens`

---

### Task 5: Expandable table rows, and Breakdown list mode

**Files:** `ui/src/components/DataTable/*` (expandable rows) and the Table section of `DESIGN.md`; new `ui/src/features/breakdown/{BreakdownPage.tsx, ListMode.tsx, dims.ts, address.ts}` with tests; `ui/src/app/{destinations.ts, router.tsx}`; `ui/src/locales/en.json`; development mocks.

**DataTable first:** optional props `childRows?: (item) => { rows, isLoading, error, more } | undefined`, `expandedKeys`, `onExpandedChange` (the screen holds the expanded keys and reads the children); child rows use their own columns renderer (`childColumns`) sharing the parent's tracks; the row count line counts top-level rows; virtualisation, the count line, load-more, `resultKey`, and selection keep working with rows expanded. Confirm the tree grid API in the installed `react-aria-components` 1.22.1 and `react-stately` 3.51.0 before building; adapt and report. `DESIGN.md` gains the expanded row: the chevron, indentation, child row look, loading and error child rows.

**What it shows:** header "Breakdown" with a view switch (List, Matrix); a group-by select (Discipline, Hold type, Role, Name, Blocker type, Blocker, Remark, Size, Stress calc, then custom dimensions; the ones `absent` lists are left out); the filter bar; a table of groups: label, a neutral bar proportional to holds (scale domain from the largest group the command returned), holds, lines. Address: `/breakdown?mode=list&by=<dimId>`.

**Rules:** pressing a group (or Right, or the chevron) expands it; its child rows are read with `group_detail` when it expands (skeleton child rows meanwhile; an error child row with a retry); the child rows show line ID, holds, disciplines, oldest; a line child row opens the line in the detail panel (`?line=`); a last child row "Open all N lines in Lines" adds the group's value to the filters and opens Lines. Expanded groups are kept in the address (`open=<key>,<key>`) and closed when the group-by changes. Empty states as Lines'.

**Tests:** DataTable: expand and collapse by pointer, Right, Left; child loading, error, and retry rows; aria-level and aria-expanded; virtualisation with a group of 200 lines expanded; selection and focus across parent and child rows. Page: request per dimension; dims hidden by `absent`; address round trip including open groups; expanding asks `group_detail` once and shows its lines; a line child opens the panel; "Open all" sets the filter and navigates; group-by change closes groups; `Ctrl+2` opens it; no "Soon" tag; `axe`.

**Commit:** `feat(ui): expandable table rows and Breakdown list mode`

---

### Task 6: Breakdown, matrix mode

**Files:** `ui/src/features/breakdown/{MatrixMode.tsx}` with tests; `address.ts`; catalog; mocks.

**What it shows:** two selects (rows, columns; default Discipline by Hold type; the same dimension cannot be both), the heatmap with its legend, the folded counts ("12 more disciplines in Other"), and the table view toggle. Address: `mode=matrix&rows=<dimId>&cols=<dimId>`.

**Rules:** a cell press adds both values to the filters (replacing those fields' entries) and opens Lines; Other cells are not pressable; a swap control exchanges rows and columns.

**Tests:** default request; swap; same-dimension prevention; a cell press sets two chips and opens Lines; Other cell inert; table view; address round trip; `axe`.

Note for the screen: `FoldedMatrix.other_row` has the empty key that a real blank group also has; treat Other apart from the groups wherever a key is used.

**Commit:** `feat(ui): Breakdown matrix mode`

---

### Task 7: Blockers destination

**Files:** new `ui/src/features/blockers/{BlockersPage.tsx, columns.tsx, address.ts}` with tests; destinations and router; catalog; mocks.

**What it shows:** header "Blockers"; the filter bar; the cumulative curve (lines freed against step, y up to `lines_on_hold`, with the line "N of M lines freed after K steps" for the focused point); the steps table: step, blocker (label, identifier), type, discipline, holds, lines freed, cumulative. Selecting a step opens the blocker panel (Task 8).

**Rules:** the curve's point press selects that step's blocker; table and curve share the selection; no paging (the steps of one snapshot are at most a few thousand); the table uses `DataTable` with a fill height.

**Tests:** request with the spec; curve points equal the rows; selection from table and from curve writes `?blocker=<key>`; empty and error states; `Ctrl+4`; `axe`.

**Commit:** `feat(ui): Blockers destination with the solve order and its curve`

---

### Task 8: The blocker in the detail panel

**Files:** `ui/src/features/detail/{BlockerDetail.tsx, selection.ts, LineDetail.tsx}`; `ui/src/app/selection.ts`; `DESIGN.md` (Detail panel section); catalog; mocks.

**What it shows:** the blocker's label (identifier) and type; facts: holds, step in the solve order of the current filters or "Not ranked"; "Frees on its own" (count and the list of lines, each opening the line); "Also held by others" (count and list); "Linked blockers" (label, shared lines, each opening that blocker); "Oldest hold" (opens the hold).

**Rules:** `?blocker=<key>` is a selection like line and hold, dropped on a workspace change; kept on a snapshot change (a key is stable text). The line panel's chain entries become links to their blocker. The panel reads `blocker_detail` with the current filters; when the filters remove it, the panel says so and offers to clear the filters.

**Tests:** the facts and lists; links to line, hold, linked blocker; from the line panel's chain; filters removing it; dropped and kept as above; focus rules as for lines; `axe`.

**Commit:** `feat(ui): blocker detail panel`

---

### Task 9: The full Overview

**Files:** `ui/src/features/overview/*` with tests; `DESIGN.md` (Overview: naming by status, the attention list); catalog; mocks.

**What it shows, in order:** the tiles (as now); bars by discipline, hold type, and role; "Top blockers" (ten, label and holds, each opening Blockers with that blocker selected) and "Top lines" (ten, line ID and holds, each opening the line in Lines); "Needs attention": stale holds ("N holds open for 90 days or more", opening Lines in hold rows with the age band 90+ and the Oldest first sort), with a warning tag and icon (a real state). When none is stale the list says so in one line.

**Rules:** every number leads to the screen that shows it; the label "Single-hold lines" becomes "Lines with one hold" when a filter is set, since it then counts holds among those kept (ledger item). `DESIGN.md` records Overview's naming by status.

**Tests:** each new part renders from the command; each link sets the right filters and address; the stale entry with 0 and with some; status naming; `axe`.

**Commit:** `feat(ui): role bars, top blockers and lines, and the attention list on Overview`

---

### Task 10: Carry-over items from M1c-1

**Files:** as each item needs.

Items listed as "later" by the M1c-1 reviews that touch what this plan builds on:
- The filter options cache `custom_dims` and `absent_fields` with the dataset (R4).
- `ValuePage` gains `more: usize`, so the picker shows no subtraction (F M10).
- A filter on a column the snapshot in view lacks (its field is in `FilterOptions.absent`): the chip stays, marked "Not in this snapshot", and `toSpec` leaves that field out of what it sends until a snapshot has the column again; the user's choice is kept, never silently applied to empty values (F M6).
- "Waiting for the workspace." while a workspace opens, "Waiting for the snapshot." while a snapshot is selected (F M4).
- `refetch` of both reading hooks respects `enabled` (A7).

**Tests:** one per item, failing first.

**Commit:** `fix: carry-over items from M1c-1`

---

### Task 11: Whole-plan verification and design audit

As M1c-1's Task 11: every verification step (Rust, interface, bindings, tokens, build, `check:dist`, binary size, release performance with timings, parity, no data files); the design audit of Breakdown (both modes, groups expanded), Blockers, the blocker panel, and Overview, in both themes and densities at 1280 and 1920; the palette validator for the heatmap ramp; a keyboard-only walk (Overview to a top blocker, its linked blocker, a line it frees; Breakdown matrix cell to Lines; back); the spec (9.2 Breakdown, Blockers, Overview; 8.5 to 8.7 as far as built), the README, and the plan's post-review corrections.

**Commit:** `docs: record M1c-2 in the spec, the plan, and the README`

---

## What exists when this plan is done

Breakdown in two modes with groups that expand to their lines, Blockers with the solve order and its curve, the blocker panel, and the full Overview of M1 (deltas and trend wait for M2). Five destinations real, four "Soon".

## Spec coverage of this plan

| Spec | Covered by | Left |
|---|---|---|
| 9.2 Overview: tiles, bars by discipline, hold type, role; top blockers and lines; attention list; drill-through | Tasks 1, 2, 9 | deltas, trend, released since previous (M2); overdue follow-ups, watchlist (M4) |
| 9.2 Breakdown: group-by switcher, list with bars and counts, matrix heatmap, cell opens its lines | Tasks 1 to 6 | deltas (M2) |
| 8.5 solve order, complete, gain per step, cumulative curve | Tasks 1, 2, 7 | |
| 8.7 blocker detail: frees alone, still blocked, linked, oldest hold | Tasks 1, 2, 8 | change since previous (M2); line chain links (done in 8) |
| 8.6 graph, 8.8 what-if, 8.1 to 8.4 rules editor, overrides, clean-up | | M3 |
| 13.2 charts: tooltip, keyboard, table view, one axis, ramp, validator | Task 4 | |

## Post-review corrections (2026-10-18)

The plan was executed task by task, each task reviewed on its own and corrected until its review was clean, then verified as a whole with a design audit in Task 11. Where this plan's interfaces and the repository differ, the repository is right. The spec was updated to match (sections 8.5, 8.7, 9.1, 9.2).

Decisions made during execution:

| Decision | Effect |
|---|---|
| A Breakdown group expands in place to its lines (owner, 2026-10-17) | Decision 1 of this plan; no group in the panel, and no `?group=` selection (Task 5). |
| The owner's answers to the four design questions of M1c-1 (2026-10-17) | The filter bar's total stays on every data screen; the layout adapts at 1280 px and 1440 px; the blocker column, and the blocker in the panel and the picker, take the body face; a sortable header shows a muted mark at rest (Task 3). |
| A comprehensive export as its own plan, M1c-export, right after this one and before M1c-3 (owner, 2026-10-17) | Scope: spec 10.4 to 10.6 (Excel of this view and the full workbook, CSV, copy, the notice after saving), every screen at once in one workbook with a sheet per screen for the current filters, chosen columns and scope (all, loaded, or selected rows; open or released) remembered per screen, charts as PNG or SVG to a file or the clipboard, and the PDF status report brought forward from M4. |
| The sidebar is never collapsed by the window (Task 3) | It is full or a rail by the user's choice at every width, kept in the browser's storage of the app; a layout that changed by itself while the user resizes would move what they were about to press. |

| Area | Plan said | Now |
|---|---|---|
| Core (Task 1) | `SolveView` as written, with the number of unranked blockers in an earlier draft of the brief. | `SolveView.unranked` was removed: without a step limit every blocker gets a step, so it was always 0, and the Blockers screen shows no unranked line. `query::blocker_label`, `Row::blocker_label()`, and `BlockerNode::blocker_label()` write the one label format. |
| Adaptive layout (Task 3) | Breakpoints and tokens, designer's call. | Two breakpoints, `--layout-breakpoint-wide` (1280 px, the panel beside the content) and `--layout-breakpoint-roomy` (1440 px, full page padding); the root carries `data-window="small"`, `"medium"`, or `"large"`. A table column may have a priority, and a table given priorities must be given the sentence that names what left ("Not shown at this width: ..."); the row header, the sorted column, and the last column that takes a share never leave. The sidebar collapses to a 48 px rail. The page padding switches in `app.css` under `data-window`, outside the token checker, which has no column for window sizes. |
| Charts (Task 4) | `Heatmap` with rows, cols, cells, max, `otherRow?`, `otherCol?`; `LineChart` with points, `yMax`, and `onPointPress`. | `Heatmap` also needs `rowsLabel`, `colsLabel`, and `valueLabel` (the corner, the tooltip, and the table view need names), `otherRow` and `otherCol` are the catalog names of the fold, and it takes `view`, `isLoading`, `isStale`, and `emptyState`. `LineChart` also has `labelName`, `formatX`, `selectedIndex`, and `onActiveChange` (Blockers shares its selection with the table), and `onPointPress(point, index)`. The view toggle is `ChartViewToggle`; the screen holds the view. The heatmap is a grid of elements, not SVG, so its labels can be cut with an ellipsis and stay in view while it scrolls. |
| Breakdown list (Task 5) | `open=<key>,<key>`; a skeleton of child rows while a group is read. | Each key of `open=` is percent-encoded, since a remark holds commas. One skeleton child row stands for a group being read. A group the filters no longer keep shows a notice child row with Collapse. The table keeps the lines of the open groups and of the last ten it closed, so turning a group is one render. Group-by offers name as well, and calls the model size "Model size". |
| Breakdown matrix (Task 6) | A cell press opens Lines. | It opens the hold rows of Lines, because a cell counts holds. The fold is labelled "All others", so a real value named "Other" reads apart from it. Both modes' parts can sit in one address, so switching modes keeps the list's state; the chart or table choice is component state. |
| Blockers (Task 7) | A curve and a steps table sharing the selection. | As planned. The selection `?blocker=<key>` is kept on a snapshot change and dropped on a workspace change, and the result keys of Blockers and Breakdown include the snapshot, so a dimmed result of another snapshot is never pressed. The columns read "Freed by this step" and "Freed so far". |
| Blocker panel (Task 8) | "Frees on its own" and "Also held by others" as full lists. | Each list, and the linked blockers, shows its first 50 and says how many there are. Under a list of lines "Show all on Lines" (no count, because Lines then shows the freed and the shared lines together) opens Lines with the blocker added to the filters, and closes the panel on the way. One focus rule, `useTableDetailFocus`, serves the tables of Lines, Breakdown, and Blockers; the focus returns to the curve when the panel was opened from it. The line panel's chain entries open their blocker. |
| Overview (Task 9) | Top blockers and lines as bar rows. | `BarRow` gained an opening variant (`opens`, a plain button that is never pressed) and `isIdentifier` (a line ID in the monospace face). The top lists have no "Show as table" switch. `StaleCount` also carries whether the ages are known (`ages_known`, counted in the core), so the attention list can say that the age of the holds is not known instead of that none is stale. The third tile reads "Lines with one hold" under any filter, the status included. |
| Carry-over (Task 10) | `toSpec` in the interface leaves out a field whose column the snapshot lacks. | The leaving out moved to Rust: `FilterSpec::applicable` in the core strips every part that needs an absent column, and `in_view` is the one path all ten filter commands take, for built-in and custom fields alike; `ui/src/api/filter-needs.json` says which part needs which column and is tested from both sides. `FilterOptions.inactive` marks the chips, which stay, muted, with the words "(not in this snapshot)". The filter options cache the snapshot's columns with its dataset, and `ValuePage` gained `more`. |
| Design audit (Task 11) | Fix or record every finding. | Fixed: a bar row whose label is cut (a top blocker such as "Instrumentation and control / Client" at every width) now shows the whole label in a tooltip on keyboard focus and under the pointer, as the breadcrumb already did (`useIsCut` is shared; `DESIGN.md`, Bar row). A table now builds the rows of another result as one new collection: React placed each new row of a kept collection by walking past every other new row, so a status change on Blockers with 11,894 steps blocked the window for 2.1 s; it now takes 0.4 to 0.66 s. A core test confirms the open question of Task 9's review: a blank remark gives the blocker item the engine writes for a blank cell, never an empty one, so such a blocker ranks, is among the top blockers when it has the holds, and opens in the panel. Recorded for the owner, below. |

Measured on the final code (Linux, release build, 10,000 rows): import 119 ms, filtered views 6.8 ms, filter counts with a picker page and the first 200 lines 12.6 ms, a page of 200 holds 0.8 ms, the full solve order 21.1 ms, the folded matrix with the solve rows 26.8 ms (budget 100 ms), import into a workspace 37 ms, read back as a dataset 61 ms. Application binary 12.2 MiB on Linux (limit 25 MB). In the interface (production bundle of the development page, mocked commands, headless Chromium, 1920 by 1080), from the press to two frames after the change: a Breakdown group of the 1,500 by blocker turns in 72 to 107 ms (the first, which reads its lines, 152 ms); selecting a line on Lines (30,000 holds) 117 to 139 ms and selecting a step on Blockers (11,894 steps) 118 to 129 ms, the first of each, which also opens the panel, 169 to 227 ms; a status change draws its dimmed state in 21 to 45 ms on every screen, and a result already read is drawn in 44 to 48 ms on Overview, 114 to 130 ms on Lines, 0.26 to 0.41 s on Blockers with 2,561 steps, and 0.4 to 0.66 s with 11,894. A result not read before adds the fixed delay of the mocked command (120 to 250 ms) and is not a measure of the app.

Open for the owner after the audit, not blocking:

- **Blockers is slower than the 100 ms of a filter change.** Every step is built into the table, and the component library builds each row with its cells: 0.26 to 0.41 s with 2,561 steps and 0.4 to 0.66 s with 11,894. Paging the steps 200 at a time, as Lines pages its rows, would bring it under the budget; Task 7 chose no paging when the steps were thought to be a few thousand at most. Lines draws a result already read in 114 to 130 ms, over the 72 ms M1c-1 measured on its own machine; not traced further.
- **A blocker of blank remarks is labelled with the engine's mark for a blank cell**, an em dash after "Piping / ", on Overview, Breakdown, Blockers, and in the panel. M1c-1 replaced that mark with the table's own mark for no value in hold rows. A label such as "Piping / (no remark)" would read better, but the label is written by the core and the parity reference compares blockers, so it is a decision of its own.
- **Reaching a linked blocker by keyboard takes about a hundred presses of Tab** in the panel of a large blocker, past the two lists of up to 50 lines. Each list could be one stop with arrow keys inside it, or the linked blockers could come before the lines.
- **No key goes back.** After a matrix cell opens Lines, `Ctrl+2` returns to Breakdown in list mode, not to the matrix; the browser's back works in the address but has no shortcut in the app. A back shortcut (Alt+Left) and a remembered mode per destination are candidates for M1c-3 with the shortcut sheet.
- **The Blockers curve is dominated by its tail.** With thousands of steps the first fifty, where most lines are freed, take a few pixels at the left; a zoom to the first steps, or a logarithmic step axis, would show them.
- **At 1920 px the child rows of a Breakdown group** write the oldest age at the far end of the share column, about 1,400 px from the line ID it belongs to. At 1024 by 640 the Blockers table under the curve shows three steps; the curve's share of the height could be smaller there.
- **Top blockers' label column** is the width of every bar label (180 px), while the bar beside it has room to spare; a wider label column for blockers would cut fewer labels.

Not verified by this plan, and why: the app in a real window (no virtual display on the machine that ran the work; every screen was checked in a headless Chromium against mocked commands), the tooltip of a cut bar row label in WebKitGTK and WebView2, sticky labels and scroll padding of the heatmap in the real webviews, and the timings above in the real app with the Rust commands (the interface was measured with mocked commands).

Carried into later plans: the minor findings of the task reviews kept in the working notes (among them: the focus hand-off from a leaving column, aria-describedby naming a tooltip not yet drawn, the order of the kept groups, the blocker not named in the panel's filtered empty state, and a hand-typed `?open=` without `by`).
