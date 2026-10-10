# Hold Explorer Desktop: Design

Date: 2026-10-10
Status: approved in brainstorming, section by section
Source material: `Hold Explorer.html` (single-file web tool), two PlantIM exports (one raw, one hand-trimmed)

## 1. Purpose

Hold Explorer is a desktop app for piping engineers and their leads. It reads the "holds" report exported from PlantIM, shows which piping lines are on hold and why, tracks how that changes from one export to the next, and recommends which blockers to solve first.

It replaces a single HTML file that embeds one data snapshot, depends on CDNs, keeps no history, and requires someone to trim the export by hand before use.

## 2. Glossary

One term per concept. The interface uses these words and no synonyms.

| Term | Meaning |
|---|---|
| Hold | One row of the export: a reason a line cannot proceed. Has a creation date and, once released, a release date. |
| Line | A piping line, identified by `line_id`. Treated as opaque text. A line is on hold while it has at least one open hold. |
| Blocker | The thing a hold waits for, derived from the hold remark by rules. Identity is owning discipline plus item, for example `Civil / 577-PR-400`. |
| Snapshot | One imported export file, stamped with the report date. |
| Workspace | One project's data: its snapshots, rules, mappings, saved views, notes. |
| Saved view | A named combination of destination, filters, grouping, and sort. |

## 3. Decisions

| Topic | Decision |
|---|---|
| Audience | Whole project organization: engineers and managers, non-technical users included. |
| Platforms | Windows 10/11 x64 and Linux x64. |
| Packaging | Portable single executable on Windows, no installer, no admin rights. AppImage on Linux. |
| Data location | User profile folder. `%APPDATA%\HoldExplorer\` on Windows, `~/.local/share/hold-explorer/` on Linux. |
| Distribution of data | The export file is passed around; each user imports it. History is local per user. |
| Input | Raw PlantIM export, untouched. Trimmed files still import as limited snapshots. |
| Workspaces | Several separate workspaces, each with its own history and settings. |
| Column schema | Automatic mapping with aliases, a mapping step for unknown layouts, mapping saved per workspace. Extra columns are kept as custom fields. |
| Line ID | Opaque text. No segment parsing. |
| Default scope | Open holds. A status filter offers Open, Released, All. |
| Language | English. All interface text lives in translation files so another language can be added without code changes. |
| Navigation | Restructured freely; every capability of the HTML tool is kept. |
| Visual character | Calm, roomy Overview and History; dense, table-led detail screens. Density setting. |
| Theme | Dark by default. Light available by setting or by following the system. |
| Branding | Neutral "Hold Explorer" identity. No company marks. |
| Updates | Notify only. The app checks GitHub Releases and links to the release page. |
| Repository | Public on GitHub, MIT license. Synthetic data only. |
| Technology | Tauri 2, Rust core, React and TypeScript interface. |
| Delivery | One design, four milestones, one implementation plan per milestone or part of one. |

## 4. Input data

### 4.1 Raw PlantIM export

The workbook has an `info` sheet and a `data` sheet. Other sheets are ignored.

`info` is a two-column key and value list. The app reads:

- `Generated From`: the PlantIM version string.
- `Project No.`: used to match a workspace.
- `Report Date`: formatted `MM/DD/YYYY hh:mm AM|PM`. Used as the snapshot date and time.

`data` has one header row and these columns:

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Stable hold identifier. |
| `line_id` | text | Required. |
| `name` | text | Person who raised the hold. |
| `role` | text | Role of that person. |
| `hold_remark` | text | Required column; individual cells may be blank. May contain line breaks and the literal `_x000D_`. |
| `hold_type` | text | Required. |
| `discipline` | text | The discipline that must act. Blank in about 12% of rows. |
| `date` | date-time | Creation time, millisecond precision. |
| `released` | boolean | |
| `release_remark` | text | Rarely filled. |
| `release_date` | date-time | Present on every released row. |
| `model_size` | text holding a number | Line size in the 3D model. Constant per line. |
| `ldt_size` | number | Line size in the line designation table. Constant per line. |
| `stress_calc` | text | Stress calculation number, or `NR` for not required. Constant per line. |

Observed scale: about 9,300 rows, 3,600 lines, 13 disciplines, 8 hold types, 5 roles, 49 names, 1,500 distinct remarks. Expected growth: 20,000 to 30,000 rows and up to 500 snapshots per workspace.

### 4.2 Limited files

A file that lacks `id` or `released` imports as a **limited** snapshot. The trimmed file in use today is one: open holds only, eight columns. Features that need the missing columns are disabled for a workspace that has only limited snapshots, and each disabled feature says which column it needs.

### 4.3 Required and optional columns

Required: `line_id`, `hold_remark`, `hold_type`. Everything else is optional. Any column the mapping does not recognize is stored as a custom field and offered as a filter and a grouping.

## 5. Architecture

### 5.1 Layers

- `crates/core`: a pure Rust library with no Tauri dependency. It owns the model, import, normalization, blocker rules, diff, statistics, forecast, and export. It is unit-tested on its own.
- `crates/store`: SQLite schema, migrations, and queries. Depends on `core`.
- `crates/synth`: the seeded generator of synthetic PlantIM-shaped workbooks.
- `src-tauri`: a thin shell. Typed commands, application state, file dialogs, the update check, the single-instance guard, and the WebView2 check at startup.
- `ui`: React, TypeScript, Vite. Presentation only. It holds no business rules.

### 5.2 Contract between interface and core

The interface sends a `FilterSpec` and a view name. The core returns a finished view model: aggregates, rows, and deltas. TypeScript types are generated from the Rust command signatures, so no type is written twice.

The core keeps the active workspace in memory. At the expected scale, each query answers in milliseconds. Import, bundle merge, and export run off the interface thread and report progress as events.

### 5.3 Storage

One SQLite file per workspace. A small global settings file holds the workspace list, theme, density, language, author name, and update preference.

Schema migrations run automatically when a newer executable opens older data. The app copies the file before migrating. An executable that meets data written by a newer version refuses to open it, asks the user to update, and writes nothing.

### 5.4 Network

The app makes no network request except the update check. Fonts and libraries are bundled. Everything works offline.

## 6. Import

### 6.1 Pipeline

1. Open an `.xlsx`, `.xls`, or `.csv` file. Choose the sheet named `data`; failing that, the first sheet whose header row maps the required columns. Read `info` when present.
2. Map columns. Known headers and aliases map automatically, case-insensitively and ignoring surrounding space. An unknown layout opens the mapping step.
3. Normalize every row (6.2).
4. Show the import review: project number, snapshot date and time, open and released counts, warnings, target workspace. The user confirms or edits.
5. Write the snapshot in a single database transaction.
6. Open History on "Changes since previous snapshot" and show a notice. Before milestone 2 delivers that screen, the app opens Overview instead.

The import review and the mapping step are page-level flows, not modal dialogs.

### 6.2 Normalization

- Trim text and collapse runs of whitespace, including line breaks, to one space.
- Remove the literal `_x000D_`.
- A blank discipline becomes `Unspecified`.
- Keep the cleaned original for display. Derive a case-folded key for grouping, so `FIV/AIV REPORT` and `fiv/aiv report` group together.
- A row with a blank `line_id` or an unparseable required date is skipped, counted, and listed with its row number. The import continues.

### 6.3 Snapshot date

In order of trust: the `info` sheet's Report Date; the day and month in the filename combined with the year of the newest timestamp in the file; the file's modified time. The review shows the result and lets the user change it. The app never assumes the current year.

### 6.4 Workspace matching

A file whose project number matches a workspace targets that workspace. With no match, the user picks a workspace or creates one. The review always shows the target.

### 6.5 Guards

- The same file imported twice, detected by content hash, is refused with a message.
- A file older than the newest snapshot is accepted and placed in date order.
- Importing the same snapshots in any order yields an identical database.

### 6.6 Bulk import

The user selects many files. The app lists the detected date for each, editable, then imports them in date order with progress.

### 6.7 Drag and drop

Dropping a file anywhere on the window starts an import.

## 7. Data model and history

### 7.1 Tables

- `snapshot`: date and time, source filename, content hash, row counts, full or limited, the `info` values.
- `hold`: identity. Carries the source `id` when the file has one.
- `hold_version`: the field values of a hold and the range of snapshots over which they held. A new row is written only when a value changes, which keeps 500 snapshots small.
- `line_version`: the same pattern for `model_size`, `ldt_size`, and `stress_calc`.
- Workspace-level tables for rules, overrides, remark merges, column mapping, age bands, saved views, notes, follow-ups, watchlist entries, and what-if scenarios.

### 7.2 Identity

With a source `id`, matching is exact. Without one, the app matches on line plus creation timestamp, then on the closest remark on the same line, and flags the pair "possible edit".

### 7.3 Events

The app derives these per hold between consecutive snapshots:

| Event | Condition |
|---|---|
| Added | First appearance. |
| Modified | A field changed. The event records the field, the old value, and the new value. |
| Released | `released` became true. The date is `release_date`. |
| Reopened | `released` went from true to false. |
| Removed from source | An open hold vanished from a later full snapshot. |

In a limited snapshot, a hold that vanishes is shown as "no longer in file", since the file cannot say whether it was released.

### 7.4 Trends

Trends are computed from creation and release dates, so the first import of a raw file already shows the full curve. Snapshots contribute what the file cannot show: edits and removals.

### 7.5 History bundle

A `.holdx` file holds a workspace's whole history in one SQLite file with a schema version. The export step has an "include my notes" checkbox. Merging a bundle adds missing snapshots and skips known ones. It never changes local rules or saved views. Notes that arrive in a bundle are added beside local notes as a thread; nothing is overwritten. Follow-up fields take the most recently edited value and keep the earlier value in their history. A bundle for a different project number produces a warning and the user decides.

### 7.6 Snapshot manager

Lists snapshots; lets the user change a snapshot's date or delete it. Deletion is undoable.

## 8. Blockers

### 8.1 Rules

Each workspace has an ordered rule list; the first match wins. There are three kinds: tag pattern, tie-in pattern, and keyword. A rule has a name, a blocker type, a match expression, an enabled flag, and a position.

The default rule set reproduces the HTML tool:

- Tag pattern: an optional three-digit unit, a one-to-five-letter code, and a two-to-five-digit number, for example `538-PR-100`. The code `UNIT` is skipped. `STRU` is reported as `STR`. The blocker type is the code; the item is the matched tag.
- Tie-in pattern: `T###-R###`. Type `TIE-IN`.
- Sixteen keywords, tested in this order: P&ID, SLEEPERS, MISC., FIV/AIV, LDT, LINE SIZE, DATA SHEET, ISOMETRIC, PLOT PLAN, INSTRUMENT TAG, PMC, PLATFORM, SUPPORT, GA DRAWING, VENDOR, STRUCTURE.
- No match: type `Other`; the item is the first 60 characters of the remark with a leading `HOLD`, `PENDING`, or `ON` removed.

Blockers are derived data. Changing a rule recomputes blockers for every snapshot.

### 8.2 Rules editor

Shows, live: the number of holds each rule catches, the unclassified remarks sorted by hold count, and a test box for a sample remark.

### 8.3 Manual override

The user assigns a remark to a blocker by hand. The override applies to every hold with that remark, present and future, and wins over the rules.

### 8.4 Remark clean-up

The app suggests near-duplicate remarks. The user accepts or rejects each suggestion. An accepted merge groups the remarks under one canonical text. Source data is never altered and every merge is reversible.

### 8.5 Solve order

A line is freed only when all of its blockers are solved. The solve order ranks blockers greedily: each step takes the blocker that frees the most lines given the steps before it, with ties broken by partial progress on lines still blocked by several blockers. The list is complete, not capped at 20 steps as in the HTML tool, and shows lines freed per step and a cumulative curve.

### 8.6 Graph

Nodes are blockers; node size is the number of lines blocked; an edge joins two blockers that block the same line, weighted by shared lines. The solve order is drawn as a numbered path through the graph. A slider limits the graph to the top N blockers.

### 8.7 Detail

A selected blocker shows the lines freed if it alone is solved, the lines still blocked by others, its linked blockers, its oldest hold, and its change since the previous snapshot. A selected line shows its own chain: every blocker that must fall, in solve order.

### 8.8 What-if

The user ticks blockers as solved. The app shows lines freed now, lines one blocker away, and holds cleared, and re-ranks the remaining solve order live. A scenario is saved by name per workspace and can be exported. A scenario never changes real data.

## 9. Screens

### 9.1 Shell

- Top bar: workspace switcher, global search, snapshot selector, Import.
- Left sidebar with labeled destinations: Overview, Breakdown, Lines, Blockers, History, People, Follow-up; then Rules and Settings.
- Filter chips under the top bar on every data screen.
- Right panel for the selected line, hold, or blocker. The list stays visible.
- The snapshot selector defaults to the newest snapshot. Choosing an older one shows the data as it stood then, and a banner names the snapshot in view.

### 9.2 Destinations

**Overview.** A row of stat tiles (open holds, lines on hold, single-hold lines, released since the previous snapshot, median age), each with its delta. The open-holds trend. Bars by discipline, hold type, and role. Top blockers and top lines. An attention list: stale holds, overdue follow-ups, watchlist changes. Every number drills through to a filtered screen.

**Breakdown.** One screen with a group-by switcher: discipline, hold type, role, blocker type, blocker, remark, size, stress calc, custom fields. List mode shows bars with hold and line counts and deltas; a row expands to its lines. Matrix mode shows a heatmap of any two dimensions, discipline by hold type by default; a cell opens its lines.

**Lines.** A table: holds, disciplines, blockers, oldest age, sizes, stress calc, size-mismatch flag, change tag, watch star. Presets: All, Single hold, Easiest to release, Oldest first, Size mismatch, New since previous snapshot. The table switches between line rows and hold rows. "Easiest to release" orders lines by fewest disciplines, then fewest holds.

**Blockers.** Section 8.

**History.** Four tabs. Compare: pick two snapshots; see added, released, modified (old and new value), reopened, and removed holds, and lines cleared and lines newly on hold. Trends: open holds over time, opened against released per week, forecast. Performance: section 11.4. Snapshots: section 7.6.

**People.** Per name: holds raised, open, released, oldest open, median age, with role. Sorted by name by default. No ranking colors.

**Follow-up.** Watchlist, notes, and follow-ups due and overdue.

**Rules.** Blocker rules, overrides, remark merges, age bands, column mapping.

**Settings.** Theme, density, language, author name, update check, data folder, About.

### 9.3 Line detail

Attributes (sizes, stress calc, mismatch), open and released holds, timeline, blocker chain, notes, watch toggle. A line is flagged as a size mismatch when both sizes are present and differ. A size of zero counts as absent.

### 9.4 First run

A welcome screen with a drop zone, "Open history bundle", and "Open demo workspace". The demo workspace is built from synthetic data.

### 9.5 Keyboard

`Ctrl+K` opens the command palette (jump to a line, a destination, a snapshot, or an action). `/` focuses search. `Ctrl+1` to `Ctrl+7` switch destinations. `Ctrl+I` imports. `Ctrl+E` exports. Arrow keys move through tables. `Esc` closes the panel. `?` shows the shortcut sheet. The main flow can be completed by keyboard alone.

## 10. Search, filters, export

### 10.1 Global search

One box matches line ID, remark, name, role, hold type, discipline, blocker, stress calc, and notes. Results are grouped by kind (Lines, Holds, Blockers, People, Remarks) with the match highlighted. Search tolerates typos and accepts a wildcard in line IDs, as in `78B01-573-*`. Choosing a result opens its detail; pressing Enter applies the text as a filter on the current screen. Search covers the selected snapshot, open and released; released results are labeled.

### 10.2 Filters

Fields: status, discipline, hold type, role, name, blocker type, blocker, age band, created date range, release date range, size, stress calc, size mismatch, has note, watched, changed since previous snapshot, custom fields, text.

Several values in one field combine with OR. Different fields combine with AND. Each field supports "is not". The filter picker shows a live count for each value, given the other active filters. Filters stay active while the user moves between destinations. "Clear all" is always visible.

### 10.3 Saved views

A saved view stores destination, filters, grouping, and sort under a name. Saved views are per workspace and local.

### 10.4 Export

Every data screen has an export menu:

- **Excel, this view**: what the screen shows, with the active filters.
- **Excel, full workbook**: summary, breakdowns, cross-tabs of holds and of lines, and the data.
- **CSV**: the current rows, UTF-8 with a byte-order mark so Excel opens it correctly.
- **Copy**: the table or the selected rows to the clipboard, tab-separated; the list of line IDs; a chart as a PNG file or to the clipboard.

Workbooks use real Excel tables, a frozen header, date and number formats, wrapped remarks, and age and hold-count colors. Each has an "About this export" sheet: workspace, snapshot, filters, app version, time.

### 10.5 Reports

- **Status report (PDF)**: workspace and snapshot header; stat tiles with deltas; trend; breakdown charts; top blockers and solve order; changes since the previous snapshot; oldest holds. The report states the active filters.
- **Changes report (Excel and PDF)**: produced from Compare, one section per kind of change.

Reports render identically on Windows and Linux, embed their fonts, and need no external program.

### 10.6 After saving

A notice offers "Open file" and "Show in folder". Filenames follow `HoldExplorer_<workspace>_<view>_<snapshot date>`.

## 11. Follow-up, aging, performance, forecast

### 11.1 Notes and follow-ups

A note attaches to a hold, a line, or a blocker and records text, author, and time. Several notes on one target form a thread. The author name defaults to the operating-system user name and is editable.

A target has at most one follow-up: owner, expected release date, and status (Open, In progress, Waiting, Done). Changes are kept in a history. A follow-up is overdue when its expected date has passed and its target is still on hold. Notes follow a hold by identity across snapshots. When the hold is released, its follow-up closes automatically and remains visible as resolved.

### 11.2 Watchlist

The user stars lines, blockers, and saved views. The Follow-up screen shows each with its current state and its change since the previous snapshot. Bulk add accepts a pasted list of line IDs or a column picked from a file. Unknown IDs are reported.

### 11.3 Aging

The age of an open hold is the snapshot date minus the creation date. The duration of a released hold is the release date minus the creation date. Age bands are set per workspace; the default is 0-13, 14-29, 30-59, 60-89, and 90+ days. One stale threshold, 90 days by default, feeds the attention list.

### 11.4 Performance

Median and 90th-percentile days to release by discipline, hold type, and blocker type. Opened against released per week. The age distribution of open holds. A direction marker compares the last four weeks with the four before. Performance needs release dates.

### 11.5 Forecast

The forecast projects the open-holds curve from weekly opened and released counts over a recent window of 4, 8 (default), or 12 weeks. It shows a range drawn from week-to-week variation and is labeled an estimate. When the net rate is zero or rising, it says that open holds are not decreasing at the current rate and gives no date. An optional target (count and date) is drawn as a reference. The forecast follows the active filters.

## 12. Update check

At startup, at most once a day, the app reads the latest GitHub release. If a newer version exists, it shows a quiet notice with a link to the release page and a "Skip this version" choice. A failed check is silent. A setting turns the check off.

## 13. Design direction

- **Register**: product interface. The tool should disappear into the task. Familiar patterns are a feature.
- **Color**: restrained. Tinted neutrals and one accent, used for the primary action, the current selection, and state. A fuller palette appears only inside charts.
- **Scene**: a piping engineer at a desk, working down the hold list between modeling sessions; a lead showing Overview on a meeting-room screen in the weekly hold review.
- **Theme**: dark by default, light available. Both are designed, not derived by inversion.
- **Anchors**: Linear for density and keyboard use; Stripe Dashboard for a calm overview and good tables; Excel for grid behavior this audience already knows.

### 13.1 Rules for the interface

- One sans-serif family, bundled. A fixed type scale. Tabular figures in tables; proportional figures on stat tiles. Monospace for line IDs and tags.
- Every component ships all its states: default, hover, focus, active, disabled, loading, error.
- A first load shows skeletons. A refetch holds the previous render, dimmed. An empty state teaches the next action.
- Motion lasts 150 to 250 ms, marks state changes only, and respects the reduced-motion setting.
- An error message says what happened, why, and how to fix it.
- Nothing is available by hover alone.
- Destructive actions (delete a snapshot, delete a note, reverse a merge) offer undo instead of a confirmation prompt.
- Contrast meets WCAG AA.
- Banned: colored side-stripe accents, nested cards, gradient text, decorative glass effects, and the gradient hero-metric tile.

### 13.2 Rules for charts

- Thirteen disciplines exceed the eight-color ceiling. Discipline bars use one color. The graph and stacked trends color the six largest disciplines and fold the rest into "Other". Labels always carry identity.
- Color follows the entity, never its rank; filtering never repaints the survivors.
- The heatmap uses one hue from light to dark. Age bands use an ordered ramp.
- Status colors are reserved for real states (overdue, stale) and always come with an icon and a label.
- The forecast range is a lighter band of the series hue; the projected part of the line is dashed.
- No chart has two value axes.
- Every chart has a tooltip, keyboard focus that shows what hover shows, and a table view.
- The chart palette is checked with the validator script in both themes.

### 13.3 Design context files

Milestone 1 begins by writing `PRODUCT.md` and `DESIGN.md` from this document, so the design skills have their context during the build.

## 14. Error handling

- An import failure names its cause and its fix: an unreadable or password-protected file, no recognizable sheet, missing required columns (listed, and the mapping step opens), or zero rows.
- An import either completes or changes nothing.
- An export to a file that is open elsewhere says to close the file or choose another name.
- A second launch focuses the running window; two instances never write the same data.
- A crash writes a log to the data folder. About offers "Copy diagnostics". The app sends no telemetry.
- When WebView2 is missing on Windows, a native message with a download link appears before any window opens. The per-user WebView2 installer needs no admin rights.

## 15. Testing

- Core logic is written test-first: normalization, rules (with cases taken from the HTML tool's behavior), identity, diff, blockers, forecast.
- A property test checks that any import order yields the same database.
- A parity test checks that counts and solve order match the HTML tool's logic on the same synthetic input.
- The synthetic generator is seeded and reproduces the real quirks: blank disciplines, `_x000D_`, trailing line breaks, bulk timestamps, and edits and releases between snapshots. It serves the tests, the demo workspace, and screenshots.
- Export tests reopen the written workbook and check its content. Each schema version has a migration test.
- End-to-end tests drive the built app through import, filter, and export; compare; and what-if. CI runs a smoke test on Windows.
- CI checks the performance budgets in section 17.

## 16. Packaging and release

- Windows: `HoldExplorer.exe`, x64, portable. Linux: an x64 AppImage. Each release publishes SHA-256 checksums.
- GitHub Actions builds both on a version tag and attaches them to the release.
- The executable starts unsigned. Windows SmartScreen warns on the first run of a downloaded file; the README explains this. Code signing can be added later without a design change.
- Real project files never enter the repository. `.gitignore` excludes workbooks and bundles.

## 17. Acceptance

- The same input gives the same numbers as the HTML tool for open holds.
- A 10,000-row import completes in under 2 s. A filter change responds in under 100 ms. A cold start takes under 2 s.
- The Windows executable is under 25 MB and runs without admin rights or installation on Windows 11 and on an updated Windows 10.
- Every feature except the update check works offline.
- The main flow can be completed by keyboard alone.
- The repository contains no real project data.

## 18. Milestones

Each milestone ships a usable app. Each gets its own implementation plan, or several when the milestone is large.

**M1 Core.** Project setup; `PRODUCT.md` and `DESIGN.md`; synthetic generator; import flow with mapping and review; workspaces; shell; Overview, Breakdown, Lines; detail panel; built-in rules; solve-order list; filters; global search; saved views; Excel, CSV, and copy export; default age bands; keyboard and command palette; settings; update check; release pipeline. M1 reaches parity with the HTML tool. M1 stores every import as a snapshot and always shows the newest one; the schema is history-capable from the start, so M2 needs no data migration. Deltas, comparison, and viewing older snapshots arrive in M2, and until then stat tiles show values without deltas.

**M2 History.** Multiple snapshots, events, bulk import, snapshot manager, viewing an older snapshot, Compare, the changes screen after import, delta badges, Trends, line timeline, history bundle, changes report in Excel.

**M3 Blockers.** Rules editor, overrides, remark clean-up, graph with solve path, line chain, what-if scenarios.

**M4 Follow-up and reports.** Notes, follow-ups, watchlist, age-band settings, Performance, Forecast, People, PDF reports, chart PNG export.

## 19. Out of scope

- Parsing line IDs into segments.
- macOS and Windows on ARM builds.
- An installer, self-update, and code signing.
- Company branding.
- A shared or networked database; live connection to PlantIM.
- Interface languages other than English (the structure allows them later).
- A presentation mode and a separate data-checks panel.
