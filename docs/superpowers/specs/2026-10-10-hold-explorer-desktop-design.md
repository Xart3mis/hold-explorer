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

What a snapshot lacks is hidden and named, not shown empty. An optional column that is blank in every row of the snapshot (no hold ID, no hold released, no sizes, no stress calc, and so on) takes its table columns, its filter fields, its presets, and its facts in the detail panel out of view, and the filter bar says once, under its controls, which columns of the export the snapshot lacks, by their export names. A snapshot in which no hold is released says so, and offers the open holds only.

### 4.3 Required and optional columns

Required: `line_id`, `hold_remark`, `hold_type`. Everything else is optional. Any column the mapping does not recognize is stored as a custom field and offered as a filter and a grouping.

## 5. Architecture

### 5.1 Layers

- `crates/core`: a pure Rust library with no Tauri dependency. It owns the model, import, normalization, blocker rules, diff, statistics, and forecast. It is unit-tested on its own.
- `crates/export` (`hx-export`): everything a file or the clipboard receives. The sheets of every screen, Excel workbooks, CSV and tab-separated text, charts as SVG and PNG, the PDF status report, the embedded fonts, and the safe write of a file (whole or not at all). It depends on `core`, never on Tauri, and takes every word it writes from the interface's catalog.
- `crates/store`: SQLite schema, migrations, and queries. Depends on `core`.
- `crates/synth`: the seeded generator of synthetic PlantIM-shaped workbooks.
- `src-tauri`: a thin shell. Typed commands, application state, file dialogs, the update check, the single-instance guard, and the WebView2 check at startup.
- `ui`: React, TypeScript, Vite. Presentation only. It holds no business rules.

### 5.2 Contract between interface and core

The interface sends a `FilterSpec` and a view name. The core returns a finished view model: aggregates, rows, and deltas. TypeScript types are generated from the Rust types, so no type is written twice; the calls themselves are written once, in one module, and a shared fixture of every command's arguments is tested from both sides.

A command that reads the data in view is told which workspace and snapshot the interface is showing, and refuses to answer for another, so an answer can never be stored under the wrong view. A command that fails answers with the kind of the error and a message that says what happened, why, and how to fix it.

The core keeps the active workspace in memory. At the expected scale, each query answers in milliseconds. Import, bundle merge, and export run off the interface thread and report progress as events.

### 5.3 Storage

One SQLite file per workspace, in one workspace folder. The workspaces are the files in that folder; there is no separate list to fall out of step. A small global settings file holds the folder, theme, density, language, author name, and update preference.

Schema migrations run automatically when a newer executable opens older data. The app copies the file before migrating. An executable that meets data written by a newer version refuses to open it, asks the user to update, and writes nothing.

Before the app writes to a file, read-only checks show that it is a workspace of a version this executable supports. A file that is refused is left byte for byte as it was. A workspace left by an interrupted write (a crash or a power cut during a save) is restored to its last complete state when it is next opened.

The workspace list shows the workspaces that can be read and, apart from them, the workspace files that cannot, each with its reason: written by a newer version, damaged, or in use. One unreadable file never hides the others. A workspace is deleted only when the file is a workspace.

### 5.4 Network

The app makes no network request except the update check. Fonts and libraries are bundled. Everything works offline.

## 6. Import

### 6.1 Pipeline

1. Open a workbook (`.xlsx`, `.xlsm`, `.xlsb`, `.xls`, `.ods`) or a delimited text file (`.csv`, `.tsv`, `.txt`). Only a regular file of at most 256 MiB is read. In a workbook, choose the sheet named `data`; failing that, the first sheet whose header row maps the required columns; failing that, the first sheet with rows, and let the user pick another sheet in the mapping step. Read `info` when present. For delimited text, detect the encoding (a byte-order mark decides; otherwise UTF-8 when valid, else Windows-1252) and the delimiter (comma, semicolon, or tab, whichever splits the first line into the most fields).
2. Map columns. Known headers and aliases map automatically, ignoring case and treating runs of spaces, hyphens, and underscores alike. An unknown layout opens the mapping step. The mapping is saved per workspace by header, not by column position, so it applies to later files whose columns are in another order. It remembers which of several same-named columns holds which field, and which columns the user chose to leave unmapped.
3. Normalize every row (6.2).
4. Show the import review: project number, snapshot date and time with its source, open and released counts, skipped rows, warnings grouped by kind, target workspace. The user confirms or edits. A date known only from the file's modified time must be confirmed or replaced before the import is allowed. A snapshot on the same day can be kept beside the new one or replaced by it; only a snapshot the review offered can be replaced.
5. Write the snapshot in a single database transaction.
6. Open History on "Changes since previous snapshot" and show a notice. Before milestone 2 delivers that screen, the app opens Overview instead.

The import review and the mapping step are page-level flows, not modal dialogs.

### 6.2 Normalization

- Trim text and collapse runs of whitespace, including line breaks, to one space.
- Remove the literal `_x000D_`.
- A blank discipline becomes `Unspecified`.
- Keep the cleaned original for display. Derive a case-folded key for grouping, so `FIV/AIV REPORT` and `fiv/aiv report` group together.
- A row with a blank `line_id` or an unparseable creation date is skipped, counted, and listed with its row number. The import continues.
- Date cells are read as dates. Text is read as a date in these shapes: `yyyy-mm-dd` and `yyyy/mm/dd`; `dd-Mon-yyyy`; and the numeric shapes `a/b/yyyy`, `a-b-yyyy`, `a.b.yyyy`; each with an optional 24-hour or AM/PM time. A number in a date column is read as an Excel serial date.
- The numeric shapes are ambiguous, so the day and month order is decided once per date column: a first component above 12 anywhere in the column means day-first, a second component above 12 means month-first. An undecided column takes the order of the other date column when that one is decided; otherwise day-first, as the HTML tool reads `d/m/yyyy`.
- A source `id` is used only when it is an exact whole number. Sizes must be finite and above zero. A number written with a decimal comma (`1,5`) is read as a number; a lone comma followed by three digits (`1,000`) is not, because it may be a thousands separator.
- Rows are reported by their real position: the sheet row in a workbook, the line in a text file.
- Two extra columns with the same header are both kept; the later ones are named `<name> (2)`, `<name> (3)`.
- The import never changes a value silently. Each of these keeps the hold and adds a warning to the review, with the row and the value: a release date that cannot be read; a `released` value that is not recognized (the hold is treated as open); a size that is not a number; an id that is not an exact whole number; an id already seen on an earlier row. One warning each is added for: a date column whose day and month order had to be assumed; cells holding spreadsheet errors, read as blank; repeated extra headers; a report date in the `info` sheet that cannot be read.

### 6.3 Snapshot date

In order of trust: the `info` sheet's Report Date; a date in the filename; the file's modified time. The app records which of the three it used, and the review shows the date with its source and lets the user change it; a date the user enters is recorded as entered by the user. The app never assumes the current year.

A filename date is used only when it is plausible:

- A written year must lie between 2000 and 2100. The date must not be earlier than the newest timestamp in the file.
- A date without a year takes the year of the newest timestamp in the file, or the following year when that would put it before that timestamp. It is accepted only within 92 days after the newest timestamp.
- No filename date may be more than one day after the file's modified time.
- A written-year date that fails these checks is not reinterpreted as a shorter date.

Timestamps outside 2000 to 2100 are ignored when finding the newest timestamp.

A snapshot's date and time are the file's own local date and time, as the export states them. The times the app records itself, when a workspace was created and when a snapshot was imported, are kept in UTC and shown in local time. The date field in the interface accepts years 2000 to 2100; the store itself refuses a date outside years 0000 to 9999, because such a date would sort out of order.

### 6.4 Workspace matching

A file whose project number matches a workspace targets that workspace. With no match, the user picks a workspace or creates one. The review always shows the target.

### 6.5 Guards

- The same file imported twice, detected by content hash, is refused with a message.
- A file older than the newest snapshot is accepted and placed in date order.
- Importing the same snapshots in any order yields the same stored content: the same snapshots, each with the same rows in the same order. Only internal row numbers and import times differ.
- A snapshot may replace an earlier one in the same transaction. Replacing or deleting a snapshot removes the rows that no other snapshot uses.
- A snapshot's number is never given to another snapshot, also after a deletion, so a reference to a deleted snapshot cannot come to mean a different one.

### 6.6 Bulk import

The user selects many files. The app lists the detected date for each, editable, then imports them in date order with progress.

### 6.7 Drag and drop

Dropping a file anywhere on the window starts an import.

## 7. Data model and history

### 7.1 Tables

- `snapshot`: date and time with its source, source filename, content hash, row counts, full or limited, the `info` values, the headers and the mapping used, the skipped rows and the warnings, and the ordered list of its rows.
- `row_state`: one record for each distinct hold row, all fields included. A row that is identical in 500 snapshots is stored once.
- A row state is addressed by a hash of its content: every field in a fixed order, each with its length, under a version number. Two rows that compare equal have the same hash; a zero size hashes alike whatever its sign. A new hash version needs a migration that rehashes the stored rows.
- A snapshot's ordered list refers to row states, so the file order of the holds is kept exactly and a snapshot read back from the store gives the same numbers as the file it came from. One list takes 20 to 30 KB for 10,000 holds, which keeps 500 snapshots near 15 MB.
- Each snapshot is complete in itself, so the order in which snapshots are imported cannot affect what is stored, and deleting a snapshot affects no other.
- Sizes and stress calc are stored with each hold row, as the export gives them.
- Workspace-level tables for rules, overrides, remark merges, column mapping, age bands, saved views, notes, follow-ups, watchlist entries, and what-if scenarios.

### 7.2 Identity

Identity is not stored; it is worked out when two snapshots are compared. With a source `id`, matching is exact. Without one, the app matches on line plus creation timestamp, then on the closest remark on the same line, and flags the pair "possible edit". Rows that are identical in every field are matched one to one in file order.

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

A line is freed only when all of its blockers are solved. The solve order ranks blockers greedily: each step takes the blocker that frees the most lines given the steps before it. Ties are broken by the HTML tool's score (lines freed times 1000, plus the sum of `1 / remaining blockers` over the lines it only advances), and exact ties go to the blocker that appears first in the file. The list is complete, not capped at 20 steps as in the HTML tool, and shows lines freed per step and a cumulative curve.

The Blockers screen ranks the blockers of the holds the filters keep, so the order answers the filters like every other number; it is worked out for each request and not kept. The chain of a line in the detail panel keeps the order of all open holds of the snapshot, whatever the filters, so a line's chain does not change while the user filters the list it was opened from.

This differs from the HTML tool in one case, by decision: the HTML tool compares only its score, so a blocker on about 2,000 or more partly blocked lines can outrank a blocker that frees a line. Hold Explorer never ranks a blocker that frees nothing above one that frees a line.

### 8.6 Graph

Nodes are blockers; node size is the number of lines blocked; an edge joins two blockers that block the same line, weighted by shared lines. The solve order is drawn as a numbered path through the graph. A slider limits the graph to the top N blockers.

### 8.7 Detail

A selected blocker shows the lines freed if it alone is solved, the lines still blocked by others, its linked blockers, its oldest hold, and its change since the previous snapshot. A selected line shows its own chain: every blocker that must fall, in solve order.

As built in M1 (the change since the previous snapshot waits for M2): the panel reads the blocker under the filters of the bar. A fact list gives its discipline, its holds, how many lines it frees on its own and how many other blockers also hold, and its step in the solve order of the same holds, or "Not ranked". Then "Frees on its own" and "Also held by others" list those lines, each opening the line; "Linked blockers" lists the other blockers on its lines, most shared lines first, each opening that blocker; "Oldest hold" opens its oldest open hold. A list shows its first 50 and says how many there are; under a list of lines "Show all on Lines" closes the panel and opens Lines with the blocker added to the filters. When the filters keep none of its holds the panel says so and offers to clear them. Each blocker of a line's chain opens that blocker. A blocker of blank remarks is a blocker like any other: its item is the mark the engine writes for a blank cell, so it ranks, opens, and can be selected.

### 8.8 What-if

The user ticks blockers as solved. The app shows lines freed now, lines one blocker away, and holds cleared, and re-ranks the remaining solve order live. A scenario is saved by name per workspace and can be exported. A scenario never changes real data.

## 9. Screens

### 9.1 Shell

- Top bar: workspace switcher, global search, snapshot selector, Import.
- Left sidebar with labeled destinations: Overview, Breakdown, Lines, Blockers, History, People, Follow-up; then Rules and Settings. A destination that is not built yet is listed like the others with a quiet "Soon" tag, and opens a screen that says what the destination will show and that it is not available in this version. With no workspace open there is no sidebar; the top bar then leads to the workspaces and to Settings.
- A page below a destination shows a breadcrumb above its title: the ancestors as links and the page itself last. A destination shows none. The workspace is not part of the trail.
- A filter bar under the page header of every data screen (Overview, Breakdown, Lines, and Blockers), and on no other page. The status comes first and cannot be removed; then one chip per active filter, "Add filter", "Clear all" while a filter is set, and at the trailing end the number of holds the filters keep. While an action on the workspace runs, the bar keeps its place and says why nothing can be changed.
- Right panel for the selected line, hold, or blocker. The list stays visible: from the wide breakpoint up the panel sits beside the content, which narrows; below it, it overlays the right edge. The selection is part of the address (`?line=<line ID>`, `?hold=<position>`, `?blocker=<key>`), so the panel reads its own data whatever the filters are; a blocker is the one selection read under the filters (section 8.7). A hold is addressed by its position in the snapshot, its place in file order, because a limited file has no hold ID; a position means nothing in another snapshot, so a snapshot switch drops a hold selection and keeps a line or a blocker selection, whose keys are text. Opening, creating, or building another workspace (the demo included) drops all three. Escape closes the panel and gives the focus back to the row that opened it.
- The snapshot selector defaults to the newest snapshot. Choosing an older one shows the data as it stood then, and a banner names the snapshot in view.
- The window is from 1024 px wide to any width; the owner works at 1280 px on a laptop and on large monitors. The layout adapts at two breakpoints and nowhere else: from 1280 px the panel sits beside the content (below, it overlays the right edge), and from 1440 px the content has its full padding. The sidebar is full or a rail of icons by the user's choice, at every width, and is never collapsed by the window. A table gives its columns a priority: when it is too narrow, the columns of lowest priority leave it, a line under it names them, and their values are in the panel of the row; the column that names the row and the sorted column never leave.

### 9.2 Destinations

**Overview.** A row of stat tiles (open holds, lines on hold, single-hold lines, released since the previous snapshot, median age), each with its delta. The open-holds trend. Bars by discipline, hold type, and role. Top blockers and top lines. An attention list: stale holds, overdue follow-ups, watchlist changes. Every number drills through to a filtered screen.

As built in M1 (deltas, the trend, and released since the previous snapshot wait for M2; overdue follow-ups and watchlist changes for M4): the tiles, then the parts two to a row from 1280 px and in one column below: bars by discipline, hold type, and role, each of which filters by its value and opens Lines; "Top blockers", the ten blockers with the most of the holds the filters keep, each opening Blockers with that blocker in the panel; "Top lines", the ten lines with the most holds, each opening the line in Lines; and "Needs attention" with one entry, the open holds of 90 days or more ("stale", section 11.3's default until M4 makes it a setting), which opens exactly those holds in Lines, oldest first. A label cut by its column is read whole in a tooltip on focus. The page names the holds after the status of the filters ("Released holds by discipline"), and the third tile reads "Lines with one hold" once a filter is set, because it then counts the holds the filters keep.

**Breakdown.** One screen with a group-by switcher: discipline, hold type, role, blocker type, blocker, remark, size, stress calc, custom fields. List mode shows bars with hold and line counts and deltas; a row expands to its lines. Matrix mode shows a heatmap of any two dimensions, discipline by hold type by default; a cell opens its lines.

As built in M1 (deltas wait for M2): the group-by list also offers name, and leaves out a dimension whose column the snapshot lacks. List mode is a table of groups (label, a neutral bar of its share, holds, lines) that stays quick with thousands of groups. A group expands in place (the owner's choice of 2026-10-17, over opening it in the panel): its first 200 lines are read when it opens, each opening the line in the panel, and a last row "Open all N lines in Lines" adds the group to the filters and opens Lines. Open groups are kept in the address (`/breakdown?mode=list&by=<dimension>&open=<keys>`) and close when the dimension changes. Matrix mode shows at most 30 rows and 30 columns; the rest of each dimension is folded by the core into one "All others" row and column, whose cells cannot be pressed because they are not one value. A cell press puts both values into the filters, in place of what those fields had, and opens the holds in Lines. Rows and columns are two selects that cannot hold the same dimension, with a swap control; the address keeps them (`mode=matrix&rows=<dimension>&cols=<dimension>`). The heatmap has a legend, a tooltip on focus and hover, arrow keys across its cells, and a table view.

**Lines.** A table: holds, disciplines, hold types, blockers, oldest age, sizes, stress calc, size-mismatch flag, change tag, watch star. Presets: All, Single hold, Easiest to release, Oldest first, Size mismatch, New since previous snapshot. The table switches between line rows and hold rows; hold rows show the line, discipline, hold type, remark, blocker, blocker type, name, role, and created date, then the age of an open hold, or the release date and the duration of a released one. "Easiest to release" orders lines by fewest disciplines, then fewest holds. A sortable header sorts by its column and a second press reverses it; rows without the sorted value stay last in both directions. The mode, the preset or sort, and the selection are kept in the address, so a saved view can keep them later.

As built in M1c-export: every column of every table sorts, by a press on its header and a second press to reverse it, with rows lacking the value last in both directions. Lines and the hold rows are sorted by Rust; the tables the interface holds whole (Breakdown groups, Blockers steps, the table views of charts) order the rows they hold by values a command returned. Two tables stay unsortable: the import mapping preview, which shows the first rows of the file in file order so that a column can be recognized, and the skipped rows of the import review, which are a sample that sorting would misrepresent. Several rows are selected as in Excel: a plain click selects one row and opens its panel; Ctrl+click adds or removes a row; Shift+click selects the range from the last pressed row; Ctrl+Space toggles the focused row and Shift+Space selects the range; Shift+Up and Shift+Down extend; Ctrl+A selects every loaded row; Escape clears the selection and closes the panel. The open row among the selected rows is marked by a deeper tint. The page holds the selection, never the address, and clears it when the rows are read again for another result.

Rows load as the user scrolls, 200 at a time, and never more than 5,000 in one table; the whole result is not offered behind one scrollbar. A count line under the table always says how many rows are loaded and how many exist ("400 of 9,312 holds"), and once 5,000 are loaded it says to narrow the filters or reverse the sort to reach the rest. Column widths are declared, not measured from what the rows hold, and a line ID is never cut: the widest line ID of the whole result comes with each page.

**Blockers.** Section 8.

As built in M1 (the graph, the what-if, and the rules editor wait for M3): the cumulative curve of lines freed against step, up to the lines on hold the filters keep, with the sentence "N of M lines freed after K steps" for the step in focus; then the steps table: step, blocker, type, discipline, holds, lines freed by the step, and lines freed so far. The table and the curve share one selection, kept in the address (`?blocker=<key>`), which opens the blocker in the panel; the curve's points are reached by arrow keys and pressed with Enter, and it has a table view. The steps are not paged, and every step is built into the table: a filter change takes 0.26 to 0.41 s to draw with 2,561 steps and 0.4 to 0.66 s with 11,894 (a snapshot of 30,000 holds), so this screen does not yet meet section 17's 100 ms; paging the steps as Lines pages its rows is open for the owner.

**History.** Four tabs. Compare: pick two snapshots; see added, released, modified (old and new value), reopened, and removed holds, and lines cleared and lines newly on hold. Trends: open holds over time, opened against released per week, forecast. Performance: section 11.4. Snapshots: section 7.6.

**People.** Per name: holds raised, open, released, oldest open, median age, with role. Sorted by name by default. No ranking colors.

**Follow-up.** Watchlist, notes, and follow-ups due and overdue.

**Rules.** Blocker rules, overrides, remark merges, age bands, column mapping.

**Settings.** Theme, density, language, author name, update check, data folder, About.

### 9.3 Line detail

Attributes (sizes, stress calc, mismatch), open and released holds, timeline, blocker chain, notes, watch toggle. A line is flagged as a size mismatch when both sizes are present and differ. A size of zero counts as absent.

### 9.4 First run

The first screen is the list of workspaces, with a drop zone, "Open history bundle", and "Open demo workspace". It greets nobody and says what can be done. The demo workspace is built from synthetic data: four weekly snapshots. Workspace files that cannot be read are listed apart with the reason.

### 9.5 Keyboard

`Ctrl+K` opens the command palette (jump to a line, a destination, a snapshot, or an action). `/` focuses search. `Ctrl+1` to `Ctrl+7` switch destinations. `Ctrl+I` imports. `Ctrl+E` exports. Arrow keys move through tables. `Esc` closes the panel. `?` shows the shortcut sheet. The main flow can be completed by keyboard alone.

## 10. Search, filters, export

### 10.1 Global search

One box matches line ID, remark, name, role, hold type, discipline, blocker, stress calc, and notes. Results are grouped by kind (Lines, Holds, Blockers, People, Remarks) with the match highlighted. Search tolerates typos and accepts a wildcard in line IDs, as in `78B01-573-*`. Choosing a result opens its detail; pressing Enter applies the text as a filter on the current screen. Search covers the selected snapshot, open and released; released results are labeled.

### 10.2 Filters

Fields: status, discipline, hold type, role, name, blocker type, blocker, age band, created date range, release date range, size, stress calc, size mismatch, has note, watched, changed since previous snapshot, custom fields, text.

Several values in one field combine with OR. Different fields combine with AND. Each field supports "is not". The filter picker shows a live count for each value, given the other active filters, and says how many more values exist when the list is cut. Filters belong to a workspace for the session: they stay active while the user moves between destinations and snapshots, opening another workspace shows that workspace's filters of this session, and they are forgotten when the app closes (saved views will store them). "Clear all" is shown whenever a filter beyond the status is set, and also sets the status back to Open. A field whose export column the snapshot lacks is not offered (section 4.2).

### 10.3 Saved views

A saved view stores destination, filters, grouping, and sort under a name. Saved views are per workspace and local.

### 10.4 Export

Every data screen (Overview, Breakdown, Lines, Blockers) has an Export menu in its page header, and `Ctrl+E` runs "Excel, this view" (never while a text field has the focus or an overlay is open). Items run at once with the columns and rows remembered for the screen. A workspace without a snapshot shows no Export menu (the owner is asked to confirm this over an inert menu). Items that do not apply to a screen are left out, not shown disabled.

- **Excel, this view**: what the screen shows, with the active filters.
- **Full workbook**: one action, which is also "every screen at once": About, Summary, a breakdown sheet for each dimension the snapshot has, two cross-tabs of discipline by hold type (holds and lines), Lines, Holds, and Solve order, all under the current filters.
- **CSV**: the current rows, UTF-8 with a byte-order mark so Excel opens it correctly. Not offered on Overview, whose view is several tables.
- **Copy**: the table, the selected rows, or the list of line IDs to the clipboard, tab-separated; a chart as an image to the clipboard. On Breakdown the matrix copies and saves the holds cross-tab.
- **Charts**: Overview's four (by discipline, hold type, role, and top blockers), the Breakdown bars or heatmap, and the Blockers curve save as PNG or SVG, or copy.
- **Status report (PDF)**: section 10.5.
- **Columns and rows**: a panel, anchored to the menu, that sets the columns and the rows (all, loaded, or selected) and the status for a screen, and remembers them per screen on this computer (browser storage, as the sidebar is; not in the settings file).

Rules that bind every file. Words come from the interface's catalog through `ExportText` (the labels by key and the twelve short month names); Rust writes numbers and dates. Files are drawn in the light theme whatever the app's theme, with colors from `DESIGN.md`. A file is written whole or not at all: into a temporary file in the target folder, then renamed over the target. In Lines and Holds the request names the sort and Rust orders the rows as the screen does; for tables the interface holds whole, the request carries the row keys in the order on screen.

CSV and copied text write flags as the catalog's Yes and No. A text cell that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return gets a leading single quote, so that a spreadsheet never reads it as a formula; cells that are not text never do.

Workbooks use real Excel tables, a frozen header, date and number formats, and wrapped remarks. Text is in Excel's automatic black. Ages are colored by the five default age bands (none, then four light blue steps), cross-tabs by a two-step light blue scale, and hold counts by a neutral data bar. Each workbook has an "About this export" sheet: workspace, snapshot (or "No snapshot" when there is none), filters, app version, and the time with its UTC offset. A sheet that would pass Excel's row limit is refused with a message to narrow the filters.

Charts print the value of every colored heatmap cell (text down to 9 px, then a wider image); bars show 30 values plus "All others".

### 10.5 Reports

- **Status report (PDF)**: A4 portrait. A header with the workspace, the snapshot date, the time made with its UTC offset, and the active filters; the stat tiles without deltas; bars by discipline, hold type, and role (15 values each, the rest in "All others"); the top blockers and the head of the solve order with its curve; the oldest open holds; and the stale holds. Remarks wrap to four lines. Deltas, the trend, and changes since the previous snapshot arrive with M2 and are not drawn empty. The PDF is untagged; accessibility tagging is on the owner's backlog.
- **Changes report (Excel and PDF)**: produced from Compare (M2), one section per kind of change.

Reports render identically on Windows and Linux (a golden hash in the tests), embed their fonts (Public Sans and Reddit Mono, read from no system font), and need no external program.

### 10.6 After saving

A notice offers "Open file" and "Show in folder". "Open file" works only for a file saved in this session; "Show in folder" reveals it. A copy says what was copied. Filenames follow `HoldExplorer_<workspace>_<view>_<snapshot date>`, and `export_save` refuses a file name whose extension does not match the format.

## 11. Follow-up, aging, performance, forecast

### 11.1 Notes and follow-ups

A note attaches to a hold, a line, or a blocker and records text, author, and time. Several notes on one target form a thread. The author name defaults to the operating-system user name and is editable.

A target has at most one follow-up: owner, expected release date, and status (Open, In progress, Waiting, Done). Changes are kept in a history. A follow-up is overdue when its expected date has passed and its target is still on hold. Notes follow a hold by identity across snapshots. When the hold is released, its follow-up closes automatically and remains visible as resolved.

### 11.2 Watchlist

The user stars lines, blockers, and saved views. The Follow-up screen shows each with its current state and its change since the previous snapshot. Bulk add accepts a pasted list of line IDs or a column picked from a file. Unknown IDs are reported.

### 11.3 Aging

The age of an open hold is the snapshot date minus the creation date. The duration of a released hold is the release date minus the creation date. Both are differences between calendar dates, in days: a hold created yesterday evening is one day old this morning. Age bands are set per workspace; the default is 0-13, 14-29, 30-59, 60-89, and 90+ days. One stale threshold, 90 days by default, feeds the attention list.

### 11.4 Performance

Median and 90th-percentile days to release by discipline, hold type, and blocker type. Opened against released per week. The age distribution of open holds. A direction marker compares the last four weeks with the four before. Performance needs release dates.

### 11.5 Forecast

The forecast projects the open-holds curve from weekly opened and released counts over a recent window of 4, 8 (default), or 12 weeks. It shows a range drawn from week-to-week variation and is labeled an estimate. When the net rate is zero or rising, it says that open holds are not decreasing at the current rate and gives no date. An optional target (count and date) is drawn as a reference. The forecast follows the active filters.

## 12. Update check

At startup, at most once a day, the app reads the latest GitHub release. If a newer version exists, it shows a quiet notice with a link to the release page and a "Skip this version" choice. A failed check is silent. A setting turns the check off.

## 13. Design direction

- **Register**: product interface. The tool should disappear into the task. Familiar patterns are a feature.
- **Color**: restrained. Tinted neutrals and one accent, used for the primary action, the current selection, and state. A fuller palette appears only inside charts. The accent is teal, chosen by the owner; nothing is purple. Plain data is drawn in neutral gray, so that teal always means something can be acted on; ramps are blue. The exact values, and the checks that hold them, are in `DESIGN.md`.
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
- Destructive actions (delete a snapshot, delete a note, reverse a merge) offer undo instead of a confirmation prompt. Where an action cannot be undone yet (replacing a snapshot during import), the choice itself says so.
- While an action runs, the control that started it shows that it is working; controls beside it that would conflict are inert and show nothing.
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

- An import failure names its cause and its fix: a file that is not found; a file that cannot be read (not a workbook or text file, corrupt, password-protected, or not permitted); an empty file; no recognizable sheet (the sheets found are listed); a chosen sheet that is not in the file; missing required columns (listed, and the mapping step opens); no data rows; or no row from which a hold could be read (the message gives the number of skipped rows and an example).
- An import either completes or changes nothing. A workspace whose last write was interrupted opens in its last complete state.
- A workspace file that cannot be opened is named with its reason and what to do: update the app, close the other program, or restore a copy. It is never changed and never hides other workspaces.
- An export to a file that is open elsewhere says to close the file or choose another name (kind `FileInUse`). A folder that cannot be written, a name whose extension does not match the format, and a clipboard that cannot be set each say what happened and how to fix it. Nothing is left half written.
- A second launch focuses the running window; two instances never write the same data.
- A settings file that cannot be read is set aside, never overwritten; when it cannot even be set aside, the app works with defaults and refuses to save settings until the file is dealt with. A failure to save settings never stops a workspace from opening.
- The window may ask the system for three things only: to choose a file to open, to choose where to save a file, and to show a file in its folder. Its permissions are exactly four: `core:default`, `dialog:allow-open`, `dialog:allow-save`, and `opener:allow-reveal-item-in-dir`. The app itself opens a file it has just written, with the system's program for that file, through a command that accepts only a path saved in this session, and no other file. It cannot open web addresses, and its pages can load nothing from another host.
- A crash writes a log to the data folder. About offers "Copy diagnostics". The app sends no telemetry.
- When WebView2 is missing on Windows, a native message with a download link appears before any window opens. The per-user WebView2 installer needs no admin rights.

## 15. Testing

- Core logic is written test-first: normalization, rules (with cases taken from the HTML tool's behavior), identity, diff, blockers, forecast.
- A test checks that every import order yields the same stored content.
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

- The same input gives the same numbers as the HTML tool for open holds, except for the solve-order case described in 8.5.
- A 10,000-row import completes in under 2 s. A filter change responds in under 100 ms. A cold start takes under 2 s.
- The Windows executable is under 25 MB and runs without admin rights or installation on Windows 11 and on an updated Windows 10.
- Every feature except the update check works offline.
- The main flow can be completed by keyboard alone.
- The repository contains no real project data.

## 18. Milestones

Each milestone ships a usable app. Each gets its own implementation plan, or several when the milestone is large.

**M1 Core.** Project setup; `PRODUCT.md` and `DESIGN.md`; synthetic generator; import flow with mapping and review; workspaces; shell; Overview, Breakdown, Lines; detail panel; built-in rules; solve-order list; filters; global search; saved views; Excel, CSV, and copy export (completed by M1c-export: every column sorts, several rows are selected, and the Export menu writes Excel, CSV, copied text, charts as SVG and PNG, and the PDF status report); default age bands; keyboard and command palette; settings; update check; release pipeline. M1 reaches parity with the HTML tool. M1 stores every import as a snapshot and always shows the newest one; the schema is history-capable from the start, so M2 needs no data migration. Deltas, comparison, and viewing older snapshots arrive in M2, and until then stat tiles show values without deltas.

**M2 History.** Multiple snapshots, events, bulk import, snapshot manager, viewing an older snapshot, Compare, the changes screen after import, delta badges, Trends, line timeline, history bundle, changes report in Excel.

**M3 Blockers.** Rules editor, overrides, remark clean-up, graph with solve path, line chain, what-if scenarios.

**M4 Follow-up and reports.** Notes, follow-ups, watchlist, age-band settings, Performance, Forecast, People. (The PDF status report and chart PNG export moved to M1c-export; the changes report stays with Compare in M2.)

## 19. Out of scope

- Parsing line IDs into segments.
- macOS and Windows on ARM builds.
- An installer, self-update, and code signing.
- Company branding.
- A shared or networked database; live connection to PlantIM.
- Interface languages other than English (the structure allows them later).
- A presentation mode and a separate data-checks panel.
