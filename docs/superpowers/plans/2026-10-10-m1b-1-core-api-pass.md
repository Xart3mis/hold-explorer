# M1b-1 Core API Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the public API of `hx-core` so the store and the Tauri shell can be built on it without breaking changes: real row numbers, a warnings channel, serializable errors, robust CSV reading, a two-step load for the mapping screen, a filter shape that can grow, and unambiguous age fields.

**Architecture:** No new crate. Every task changes existing modules of `crates/core` and updates the callers in `crates/cli` in the same commit, so the workspace compiles and all tests pass after each task. Behavior that the parity tests pin does not change.

**Tech Stack:** Rust 1.97 (pinned), calamine 0.36, csv 1, encoding_rs, sha2, serde, thiserror, rust_xlsxwriter (tests only).

**Spec:** `docs/superpowers/specs/2026-10-10-hold-explorer-desktop-design.md`
**Previous plan and its carried items:** `docs/superpowers/plans/2026-10-10-m1a-core-engine.md`, section "Carried into M1b".

## Where this plan sits

M1b of the spec's first milestone is split into three plans:

| Plan | Delivers |
|---|---|
| **M1b-1 (this plan)** | API pass on `hx-core`. |
| M1b-2 | History model (snapshot versions, order-independent import) and the SQLite store with workspaces and import guards. |
| M1b-3 | Tauri shell, `PRODUCT.md` and `DESIGN.md`, design tokens, import flow. |

## How this plan is written

M1a's plan gave finished code for every step. This plan gives, for every task, the exact public interface, the rules, and the test cases, and leaves the implementation to the implementer. Two reasons: every task here modifies code that already compiles and has tests, so the code to write depends on what is there; and in M1a the defects that mattered came from gaps in requirements, never from transcription. The test cases are the requirements. An implementer may add tests but may not drop or soften one listed here.

Each task follows the same steps:

- [ ] Read the modules named under **Files**.
- [ ] Write the listed tests. Run them. Record the failures (RED).
- [ ] Implement until they pass, changing callers as needed.
- [ ] Run `cargo fmt --all`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo test --workspace --locked`. All clean.
- [ ] Commit with the message given in the task.

## Global Constraints

- Real project files never enter the repository. Tests build their inputs in temporary directories with `hx-synth`, `rust_xlsxwriter`, or literal text.
- Rust edition 2021, toolchain 1.97.0, `rust-version = "1.88"`. `#![forbid(unsafe_code)]` stays. No `unwrap()` or `expect()` outside tests, except on values that cannot fail by construction, with a message saying why.
- The five parity tests in `crates/cli/tests/parity.rs` keep their seeds, sizes, corpus, and assertions, and pass after every task. Adapting them to a changed signature is allowed; changing what they assert is not.
- `tools/parity/reference.mjs` does not change.
- The performance test passes unchanged at the end: 10,000 rows load in under 2 s and filter in under 100 ms in a release build.
- Every error and warning message says what happened, why, and how to fix it (spec 13.1).
- A blank discipline is `Unspecified`; a blank name, role, or hold type is `—`; a size of zero is absent; blocker key is `<discipline>|<item>`.
- Grouping and filtering by discipline, hold type, role, and name stay case-sensitive, as in the HTML tool.
- Terms in code and messages: Hold, Line, Blocker, Snapshot, Workspace, Saved view.
- Commit messages follow Conventional Commits.

## File Structure

```
crates/core/Cargo.toml             add encoding_rs, sha2; dev: rust_xlsxwriter, serde_json (present)
crates/core/src/table.rs           RawTable.row_numbers; serde derives
crates/core/src/reader.rs          row numbers, error-cell count, CSV delimiter and encoding, sheet list
crates/core/src/mapping.rs         header_key whitespace; duplicate extra headers
crates/core/src/error.rs           ImportError: variants by cause, Clone, Serialize
crates/core/src/warning.rs         NEW: ImportWarning, WarningKind
crates/core/src/import.rs          warnings; real row numbers
crates/core/src/load.rs            Opened, open_file, parse_opened, load_file, content hash, preview
crates/core/src/filter.rs          Dim::Custom, FieldFilter with dim, AgeBand, date ranges
crates/core/src/dataset.rs         age_days and duration_days
crates/core/src/query.rs           Group.label, Matrix labels, Summary.median_duration_days, holds(), LineQuery
crates/core/src/rules.rs           shared built-in rule set, Debug
crates/core/src/lib.rs             crate docs, #![warn(missing_docs)]
crates/cli/src/main.rs             callers; print warning count
crates/cli/tests/*.rs              callers only
```

---

### Task 1: Real row numbers

**Files:** `crates/core/src/table.rs`, `reader.rs`, `import.rs`, `crates/core/Cargo.toml` (dev-dependency `rust_xlsxwriter.workspace = true`).

**Why:** A skipped row is reported with its row number (spec 6.2). Today the number is `index + 2`, which is wrong when the sheet's used range does not start at row 1 and when a CSV has blank lines.

**Interface:**

```rust
pub struct RawTable {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<Cell>>,
    /// One-based row (sheet row or CSV line) of each entry of `rows`. May be empty for tables built by hand.
    pub row_numbers: Vec<usize>,
}
impl RawTable {
    /// The recorded row number of `rows[index]`, or `index + 2` when none was recorded.
    pub fn row_number(&self, index: usize) -> usize;
}
```

**Rules:**
- Workbook: the header is the first row of the sheet's used range; row numbers come from the range's start row.
- CSV: row numbers are line numbers in the file.
- `parse_table` uses `row_number` for skipped rows (and, from Task 2, warnings).
- Existing struct literals of `RawTable` in tests gain `..Default::default()`; their expectations do not change.

**Tests:**

| Input | Expected |
|---|---|
| Workbook written with `rust_xlsxwriter`: sheet `data`, header on sheet row 4 starting at column C, data on rows 5, 6, 7; the row-6 hold has a blank `line_id` | `read_workbook` gives `row_numbers == [5, 6, 7]`; `parse_table` skips one row with `row_number == 6` |
| CSV text `line_id,hold_remark,hold_type\n\nL-1,x,MISC.\n,y,MISC.\nL-2,z,P&ID\n` | two holds; one skipped row with `row_number == 4` |
| `RawTable` built by hand with empty `row_numbers` and a blank `line_id` in `rows[1]` | skipped `row_number == 3` |

**Commit:** `feat(core): report skipped rows by their real sheet row`

---

### Task 2: Import warnings and serde derives

**Files:** new `crates/core/src/warning.rs`; `import.rs`, `reader.rs`, `load.rs`, `table.rs`, `query.rs`, `lib.rs`; `crates/cli/src/main.rs`.

**Why:** Three silent coercions lose information the import review must show (spec 6.1 step 4): an unreadable release date, an unrecognized `released` value, and a date column whose day/month order was assumed. Error cells in a workbook are read as blank without a word. And the types that cross the Tauri boundary need serde derives.

**Interface:**

```rust
// warning.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WarningKind { UnreadableReleaseDate, UnrecognizedReleased, AssumedDateOrder, ErrorCells, DuplicateHeader }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImportWarning {
    pub kind: WarningKind,
    /// The row the warning is about, when it is about one row.
    pub row_number: Option<usize>,
    /// A full sentence for the import review.
    pub detail: String,
}

// import.rs
pub struct Parsed { pub holds: Vec<Hold>, pub skipped: Vec<SkippedRow>, pub warnings: Vec<ImportWarning>, pub limited: bool }

// reader.rs
pub struct WorkbookData { pub info: ..., pub sheet_name: String, pub table: RawTable, /// Cells holding an Excel error (#N/A, #REF!, ...) in the chosen sheet, read as blank.
    pub error_cells: usize }
```

**Rules:**
- A non-blank release date that cannot be read: the hold is kept, `release_date` is `None`, one `UnreadableReleaseDate` warning with the row number and the original text.
- A non-blank `released` cell that is not a recognized true or false value: the hold is kept as open, one `UnrecognizedReleased` warning with the row number and the original text.
- A date column that contains at least one ambiguous numeric date (`a/b/yyyy` shapes) and whose order was not decided by its own values or adopted from the other date column: one `AssumedDateOrder` warning, no row number, naming the column and saying it was read day-first.
- `load_file` adds one `ErrorCells` warning when `error_cells > 0`, giving the count.
- `DuplicateHeader` is produced in Task 4.
- Add `Serialize, Deserialize` to: `Cell`, `RawTable`, `DateOrder`, `SkippedRow`, `Parsed`, `WorkbookData`, `Loaded`, `LineSort`. (`ImportWarning`, `WarningKind` as above.)
- `hx-cli summary` adds a JSON key `warnings` with the number of warnings.

**Tests:**

| Input (table built by hand unless stated) | Expected |
|---|---|
| released hold, release date text `soon` on the row numbered 7 | hold kept, `release_date == None`, one `UnreadableReleaseDate` with `row_number == Some(7)` and `detail` containing `soon` |
| `released` cell text `maybe` | hold kept, `released == false`, one `UnrecognizedReleased` whose `detail` contains `maybe` |
| `released` cell blank | no warning |
| creation dates `02/09/2026`, `03/09/2026`; no release column | one `AssumedDateOrder` whose `detail` names the creation date column |
| creation dates `02/09/2026`, `25/09/2026` | no `AssumedDateOrder` |
| creation dates all real date cells | no `AssumedDateOrder` |
| creation undecided, release column decides month-first | no `AssumedDateOrder` for either column |
| workbook (written with `rust_xlsxwriter`) with a formula cell that evaluates to an error in the data sheet, or, if such a cell cannot be written, a unit test of the cell conversion counting a `Data::Error` | `error_cells == 1`; `load_file` yields one `ErrorCells` warning containing `1` |
| synthetic workbook from `hx-synth` | `warnings` is empty |
| `serde_json` round trip of a `Parsed` with one hold, one skipped row, one warning | equal after the round trip |
| CLI test | `json["warnings"] == 0` |

**Commit:** `feat(core): report import warnings and derive serde on boundary types`

---

### Task 3: Import errors by cause, cloneable and serializable

**Files:** `crates/core/src/error.rs`, `reader.rs`, `import.rs`, `load.rs`; callers and tests that match on the old variants.

**Why:** The interface must show the right advice for each failure and must receive the error as data. Today a missing file is told to check for password protection, an empty CSV is told to add a sheet named `data`, and `MissingColumns` carries display strings instead of fields.

**Interface:**

```rust
#[derive(Debug, Clone, PartialEq, Error, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ImportError {
    NotFound { path: String },
    Unreadable { path: String, detail: String },
    EmptyFile { path: String },
    NoDataSheet { sheets: Vec<String> },
    MissingColumns { missing: Vec<Field> },
    Empty,
    NoHolds { skipped_rows: usize, example: String },
}
```

**Rules:**
- `NotFound`: the path does not exist. Message: the file was not found; it may have been moved or deleted; choose the file again.
- `Unreadable`: the file exists but is not a readable workbook or CSV (corrupt, password-protected, another format). Message keeps the detail and advises opening it in Excel and saving it as `.xlsx`, without a password.
- `EmptyFile`: a CSV or workbook with no content at all. Message: the file is empty; export the report again.
- `NoDataSheet { sheets }`: a workbook with sheets, none usable as data. Message lists the sheet names found and says a sheet named `data` with the required columns is expected.
- A sheet that cannot be read is no longer dropped silently: if no data sheet is found and at least one sheet failed to read, return `Unreadable` with that sheet's error as the detail.
- `MissingColumns { missing }`: message lists `Field::label()` of each, and says to map them to columns of the file.
- `Empty` and `NoHolds` keep their meaning and messages.

**Tests:**

| Input | Expected |
|---|---|
| path that does not exist | `NotFound`; message contains `not found` and does not contain `password` |
| text file named `fake.xlsx` | `Unreadable`; message contains `password` |
| zero-byte `empty.csv` | `EmptyFile` |
| workbook with only an `info` sheet | `NoDataSheet { sheets }` with `sheets == ["info"]`; message contains `info` |
| CSV with headers `Line,Why` | `MissingColumns { missing: [Field::Remark, Field::HoldType] }`; message contains `hold_remark, hold_type` |
| `serde_json::to_value` of that `MissingColumns` | `{"kind":"MissingColumns","missing":["Remark","HoldType"]}` |
| `serde_json` round trip of every variant | equal |
| every variant's message | ends with a sentence that tells the user what to do (assert a distinctive word of the advice for each) |

**Commit:** `feat(core)!: split import errors by cause and make them serializable`

---

### Task 4: CSV delimiter and encoding, header whitespace, duplicate headers

**Files:** `crates/core/src/reader.rs`, `mapping.rs`, `import.rs`, `warning.rs` users; `crates/core/Cargo.toml` (`encoding_rs`; add it to `[workspace.dependencies]` at the version already in `Cargo.lock`).

**Why:** Excel on a European locale saves CSV with semicolons and in Windows-1252; "Unicode Text" is tab-delimited UTF-16. Today the first gives "missing columns" for all three required columns and the second gives "unreadable". Headers with a doubled or non-breaking space do not map. Two unrecognized columns with the same header overwrite each other.

**Rules:**
- Encoding: a UTF-8, UTF-16LE, or UTF-16BE byte-order mark decides. Without one: valid UTF-8 is UTF-8; otherwise the bytes are decoded as Windows-1252.
- Delimiter: of `,`, `;`, and tab, the one that splits the first non-blank line into the most fields, counting only delimiters outside double quotes; a tie goes to the comma.
- Header matching: before lookup, a header is trimmed, lower-cased, every run of whitespace (non-breaking space included) and every hyphen becomes one underscore.
- Unrecognized headers that repeat: the first keeps its name; later ones are named `<name> (2)`, `<name> (3)`, and each produces one `DuplicateHeader` warning naming the header. All values are kept in `Hold.extra` under those names.
- A recognized field that appears twice keeps today's rule: the first column wins and the later column becomes an extra under its header name.

**Interface change:** `ColumnMap::auto` keeps its signature. The duplicate-header warnings are produced where the mapping is applied to rows (`parse_table`), since `ColumnMap` is data the user can edit.

**Tests:**

| Input | Expected |
|---|---|
| `line_id;hold_remark;hold_type\nL-1;x;MISC.\n` | one hold, line `L-1` |
| tab-delimited equivalent | one hold |
| `line_id,hold_remark,hold_type\nL-1,"a;b;c",MISC.\n` | comma chosen; remark is `a;b;c` |
| `line_id;hold_remark;hold_type\nL-1;"a,b,c";MISC.\n` | semicolon chosen; remark is `a,b,c` |
| Windows-1252 bytes: header line, then `L-1;M\xFCller;MISC.` with columns `line_id;name;hold_type` plus a remark column | `name == "Müller"` |
| UTF-16LE with byte-order mark, tab-delimited | one hold |
| UTF-8 with byte-order mark | header `line_id` recognized (existing test keeps passing) |
| headers `Line  ID` (two spaces), `Hold\u{a0}Remark`, `HOLD-TYPE` | all three map |
| headers `line_id, hold_remark, hold_type, Area, Area, Area` with values `N, S, E` | `extra` has `Area: N`, `Area (2): S`, `Area (3): E`; two `DuplicateHeader` warnings |
| headers `date, created` | first maps to the creation date; `created` is an extra (existing rule) and no `DuplicateHeader` warning |

**Commit:** `feat(core): read semicolon, tab, and non-UTF-8 CSV files and tolerate untidy headers`

---

### Task 5: Two-step load for the mapping screen

**Files:** `crates/core/src/load.rs`, `reader.rs`; `crates/core/Cargo.toml` (`sha2`; add to `[workspace.dependencies]`); callers in `crates/cli`.

**Why:** The mapping step (spec 6.1 step 2) needs the file's headers and some rows before the columns are mapped, then parses with the user's mapping. Today `load_file` maps automatically and discards the table on failure. The store (M1b-2) needs a content hash to refuse a file imported twice (spec 6.5).

**Interface:**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Opened {
    pub file_name: String,
    pub modified: Option<NaiveDateTime>,
    /// Lower-case hex SHA-256 of the file's bytes.
    pub content_hash: String,
    pub info: BTreeMap<String, String>,
    pub sheet_name: String,
    pub table: RawTable,
    /// The mapping `ColumnMap::auto` proposes for `table.headers`.
    pub auto_map: ColumnMap,
    pub error_cells: usize,
}
impl Opened {
    /// The first `rows` data rows as display text, one string per header.
    pub fn preview(&self, rows: usize) -> Vec<Vec<String>>;
}

/// Reads the file. Succeeds even when required columns are not mapped.
pub fn open_file(path: &Path) -> Result<Opened, ImportError>;
/// Parses an opened file with the given mapping.
pub fn parse_opened(opened: &Opened, map: &ColumnMap) -> Result<Loaded, ImportError>;
/// `open_file` then `parse_opened` with the automatic mapping.
pub fn load_file(path: &Path) -> Result<Loaded, ImportError>;

pub struct Loaded {
    pub file_name: String,
    pub content_hash: String,
    pub info: BTreeMap<String, String>,
    pub sheet_name: String,
    pub map: ColumnMap,
    pub parsed: Parsed,
    pub snapshot: Option<SnapshotDate>,
}
```

**Rules:**
- The file is read once; the hash is of exactly the bytes read.
- `preview` pads short rows with empty strings and never returns more rows than exist.
- `load_file` keeps its behavior for callers that only use `parsed`, `snapshot`, `info`, `sheet_name`, `map`.

**Tests:**

| Input | Expected |
|---|---|
| synthetic workbook, opened twice | same `content_hash`, 64 lower-case hex characters; `auto_map.missing_required()` empty; `preview(3)` has 3 rows of 14 strings; `preview(0)` empty |
| two synthetic workbooks with different seeds | different hashes |
| CSV `Line,Why,Kind\nL-1,x,MISC.\n` | `open_file` succeeds; `parse_opened` with `auto_map` fails with `MissingColumns`; with a hand-built map (`LineId: 0`, `Remark: 1`, `HoldType: 2`) it yields one hold |
| CSV of two rows, `preview(10)` | 2 rows |
| synthetic workbook through `load_file` | same holds, snapshot, and limited flag as before this task (existing end-to-end test passes unchanged apart from field access) |

**Commit:** `feat(core): open a file before mapping and hash its content`

---

### Task 6: Filter shape that can grow

**Files:** `crates/core/src/filter.rs`, `query.rs`, `solve.rs`, `testkit.rs`; callers in `crates/cli`.

**Why:** Extra columns must be usable as filters and groupings (spec 4.3), but `Dim` is a `Copy` enum used as a map key, which cannot carry a column name through JSON. The spec's filter list (10.2) includes several age bands at once and date ranges, which the current fields cannot express. Fixing the shape after saved views exist would break them.

**Interface:**

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Dim { Discipline, HoldType, Role, Name, BlockerType, Blocker, Remark, LineId, ModelSize, StressCalc,
    /// An extra column, by the name it has in `Hold.extra`.
    Custom(String) }
impl Dim { pub fn value(&self, row: &Row) -> String; }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FieldFilter { pub dim: Dim, pub values: Vec<String>, #[serde(default)] pub negate: bool }

/// Inclusive bounds in days. A missing bound is open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AgeBand { pub min_days: Option<i64>, pub max_days: Option<i64> }

/// Inclusive calendar-date bounds. A missing bound is open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DateRange { pub from: Option<NaiveDate>, pub to: Option<NaiveDate> }

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct FilterSpec {
    pub status: Status,
    /// Combined with AND. Values inside one entry combine with OR.
    pub fields: Vec<FieldFilter>,
    pub text: String,
    /// Combined with OR. Empty means no age filter.
    pub age_bands: Vec<AgeBand>,
    pub created: DateRange,
    pub released: DateRange,
    pub size_mismatch: Option<bool>,
}
```

Functions that took `dim: Dim` take `dim: &Dim`.

**Rules:**
- `Dim::Custom(name)` has the value of `hold.extra[name]`, or the empty string.
- Two entries on the same dimension both apply (AND).
- A hold with no age matches no age band. With no band, age is not filtered.
- `created` filters on the creation date; `released` on the release date. A hold without that date fails a range that has any bound.
- An entry with an empty `values` list does not filter (as now).
- JSON: `Dim::Discipline` is `"Discipline"`; `Dim::Custom("Area")` is `{"Custom":"Area"}`.

**Tests:** all existing filter, query, and solve tests pass with the same expected counts after adapting how the spec is built. New:

| Case | Expected on `testkit::sample()` (five holds; open ages 10, 40, 5, 1; one released) |
|---|---|
| bands `[0..=5]` and `[40..]` | 3 open holds |
| band `[..=5]` | 2 |
| band `[10..=10]` | 1 |
| no bands | 4 |
| two entries: discipline in (Civil, Piping), then discipline not Civil | 1 |
| `Dim::Custom("Area")` equals `North` on a dataset where one hold has `extra["Area"] = "North"` | 1; `group_by` on that dimension gives keys `North` and the empty string |
| `created.from` = the creation date of the 5-day-old hold | 2 (ages 5 and 1) |
| `released` range with a bound, status `All` | only the released hold can match |
| `{}` deserializes | equals `FilterSpec::default()` |
| JSON round trip of a spec using every field, including `Custom` | equal |
| `serde_json::to_string(&Dim::Custom("Area".into()))` | `{"Custom":"Area"}` |

**Commit:** `feat(core)!: give filters custom dimensions, several age bands, and date ranges`

---

### Task 7: Unambiguous ages, labels for groups, hold rows, and the single-hold preset

**Files:** `crates/core/src/dataset.rs`, `query.rs`, `filter.rs`, `testkit.rs`; callers in `crates/cli`.

**Why:** `Row.age_days` means age for open holds and duration for released ones, so a view of all holds mixes them. Grouping by remark can only show the upper-cased key, though the spec keeps the cleaned original for display (6.2). The Lines screen needs hold rows and a "Single hold" preset (spec 9.2), which no query provides.

**Interface:**

```rust
pub struct Row {
    pub hold: Hold,
    pub blocker: Blocker,
    pub remark_key: String,
    /// Open holds only: calendar days from creation to the snapshot.
    pub age_days: Option<i64>,
    /// Released holds only: calendar days from creation to release.
    pub duration_days: Option<i64>,
}
impl Row {
    /// `age_days` for an open hold, `duration_days` for a released one.
    pub fn days(&self) -> Option<i64>;
}

pub struct Summary { pub holds: usize, pub lines: usize, pub single_hold_lines: usize,
    /// Lower median over open holds in the selection.
    pub median_age_days: Option<i64>,
    /// Lower median over released holds in the selection.
    pub median_duration_days: Option<i64> }

pub struct Group { pub key: String, /// What to show for this group.
    pub label: String, pub holds: usize, pub lines: usize }

pub struct Matrix { pub rows: Vec<String>, pub row_labels: Vec<String>, pub cols: Vec<String>, pub col_labels: Vec<String>, pub cells: Vec<Vec<usize>> }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct LineQuery { pub sort: LineSort, /// Keep only lines with exactly one hold in the selection.
    pub single_hold_only: bool }

pub fn lines(ds: &Dataset, spec: &FilterSpec, query: &LineQuery) -> Vec<LineRow>;
/// The selected holds, in file order.
pub fn holds(ds: &Dataset, spec: &FilterSpec) -> Vec<Row>;
```

`LineSort` gains `Default` (`HoldsDesc`). `Row` gains `Deserialize`.

**Rules:**
- Age bands (Task 6) test `Row::days()`.
- `LineRow.oldest_age_days` is the greatest `age_days` among the line's selected open holds.
- `Group.label`: for `Dim::Remark`, the cleaned remark of the first hold in the group; for `Dim::Blocker`, `<discipline> / <item>`; for a group whose key is empty, `(blank)`; otherwise the key.
- `Matrix` labels follow the same rule.
- Every number the parity tests compare stays the same.

**Tests:** existing dataset, filter, query, and solve tests pass with the same expected values after adapting field names. New:

| Case | Expected |
|---|---|
| `sample()`: open rows | `age_days` 10, 40, 5, 1 and `duration_days` `None` |
| `sample()`: released row | `age_days == None`, `duration_days == Some(30)`, `days() == Some(30)` |
| `summary` with status `All` | `median_age_days == Some(5)`, `median_duration_days == Some(30)` |
| `summary` with status `Open` | `median_duration_days == None` |
| `group_by(Dim::Remark)` on open holds | the group with key `PENDING 538-PR-100` has label `Pending 538-PR-100` |
| `group_by(Dim::Blocker)` | the group with key `Civil|538-PR-100` has label `Civil / 538-PR-100` |
| `group_by(Dim::StressCalc)` | the group with the empty key has label `(blank)` |
| `matrix(Discipline, HoldType)` | `row_labels == rows`, `col_labels == cols`, cells unchanged |
| `lines` with `single_hold_only` | lines `L2`, `L4` |
| `lines` default query | same as `HoldsDesc` before |
| `holds` default spec | 4 rows in file order: L1, L1, L2, L4 |
| `holds` with status `All` | 5 rows |
| JSON round trip of `LineQuery`; `{}` | equal; default |

**Commit:** `feat(core)!: separate age from duration, label groups, and add hold rows and the single-hold preset`

---

### Task 8: Shared built-in rules, documentation, and a lint that keeps it documented

**Files:** `crates/core/src/rules.rs`, `lib.rs`, every module of `crates/core`; callers of `RuleSet::builtin()` in `crates/core` tests and `crates/cli`.

**Why:** `RuleSet::builtin()` compiles about twenty patterns on every call; the shell will call it per command. The public API is undocumented, and the next two plans are written against it.

**Interface:**

```rust
impl RuleSet {
    /// The rules of the HTML tool, compiled once and shared.
    pub fn builtin() -> &'static RuleSet;
}
impl std::fmt::Debug for RuleSet { /* prints the number of keyword rules, not the patterns */ }
```

**Rules:**
- `crates/core/src/lib.rs` gets crate documentation: one paragraph on what the crate does, then the pipeline in order (open, map, parse, build a dataset, filter, query, solve), naming the function for each step.
- `#![warn(missing_docs)]` in `crates/core/src/lib.rs`. Every public item, field, and variant gets a doc comment that says what it means, not what its type is. Documented behavior includes: the lower median; first-appearance order where queries rely on it; case-sensitive grouping; that `LineRow` sizes come from the line's first selected hold.
- No behavior change.

**Tests:**

| Case | Expected |
|---|---|
| `std::ptr::eq(RuleSet::builtin(), RuleSet::builtin())` | true |
| `format!("{:?}", RuleSet::builtin())` | contains `16` |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | clean with `missing_docs` on |
| `cargo doc -p hx-core --no-deps` | builds without warnings |

**Commit:** `docs(core): document the public API and share the built-in rules`

---

### Task 9: Whole-plan verification

**Files:** none, unless a check fails.

- [ ] `cargo fmt --all -- --check`
- [ ] `cargo clippy --workspace --all-targets --locked -- -D warnings`
- [ ] `cargo test --workspace --locked`
- [ ] `cargo test --release -p hx-cli --test perf --locked -- --ignored --nocapture`: budgets hold; record the three timings.
- [ ] `git diff main -- tools/parity/reference.mjs` is empty.
- [ ] `git diff main -- crates/cli/tests/parity.rs`: only call-site adaptations; seeds, sizes, corpus entries, and assertions unchanged.
- [ ] `git ls-files | grep -Ei '\.(xlsx|xls|holdx|csv)$'` prints nothing.
- [ ] `hx-cli synth` then `hx-cli summary` by hand on a file in `/tmp`; the JSON has `warnings: 0` and the same numbers as before this plan for the same seed.

---

## What exists when this plan is done

- `hx-core` has the API the store and the shell will use: `open_file`, `parse_opened`, `Loaded` with a content hash and warnings, serializable errors, `FilterSpec` with custom dimensions, `holds`, `lines` with `LineQuery`, labeled groups, and separate age and duration.
- All M1a behavior is unchanged where the parity tests pin it.

## Carried items covered

| Carried item (M1a plan, "Carried into M1b") | Task |
|---|---|
| Real row numbers for skipped rows | 1 |
| Serde derives on import types; `MissingColumns` as fields; `load_file` with a mapping | 2, 3, 5 |
| Warnings channel for silent coercions | 2 |
| `Unreadable` split by cause; empty CSV and unreadable sheet messages | 3 |
| CSV delimiter and encoding; header whitespace; duplicate extra headers | 4 |
| `FilterSpec` custom dimensions and several age bands | 6 |
| `Group` display label | 7 |
| `Row.age_days` split | 7 |
| Hold rows query and single-hold preset | 7 |
| Public API documentation; `RuleSet::builtin()` cost | 8 |
| 64-bit integers in generated TypeScript | M1b-3, when the generator is configured |
| Case-sensitive grouping of discipline, type, role, name | kept by decision (HTML tool parity), documented in Task 8 |
