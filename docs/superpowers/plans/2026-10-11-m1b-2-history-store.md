# M1b-2 History Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each import as a snapshot in a per-workspace SQLite file, so that any stored snapshot can be read back as exactly the holds that were imported, in the same order, and workspaces can be created, listed, and matched by project number.

**Architecture:** A new crate `hx-store` on top of `hx-core`. A workspace is one SQLite file. Each distinct hold row is stored once in `row_state`, addressed by a content hash defined in `hx-core`; each snapshot stores an ordered, compact list of row-state references. Snapshots are self-contained, so import order cannot affect what is stored. `hx-cli` gains `ws` commands that prove the store end to end.

**Tech Stack:** Rust 1.97 (pinned), rusqlite 0.40 with bundled SQLite, sha2 (already a dependency of `hx-core`), serde_json, chrono. No Tauri and no interface code in this plan.

**Spec:** `docs/superpowers/specs/2026-10-10-hold-explorer-desktop-design.md`, sections 5.3, 6.4, 6.5, 7.
**Builds on:** `docs/superpowers/plans/2026-10-10-m1b-1-core-api-pass.md` (branch `m1b-api-pass`).

## Where this plan sits

| Plan | Delivers |
|---|---|
| M1b-1 (done) | API pass on `hx-core`. |
| **M1b-2 (this plan)** | Content hash of a hold row, generator of evolving snapshots, `hx-store`, workspace commands in the CLI. |
| M1b-3 | Tauri shell, `PRODUCT.md` and `DESIGN.md`, design tokens, import flow. |

## How this plan is written

As in M1b-1: each task gives the exact public interface, the rules, and the test cases; the implementer writes the code. The test cases are the requirements. An implementer may add tests but may not drop or soften one listed here.

Each task follows the same steps:

- [ ] Read the modules named under **Files** and the interfaces of earlier tasks.
- [ ] Write the listed tests. Run them. Record the failures (RED).
- [ ] Implement until they pass.
- [ ] Run `cargo fmt --all`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo doc --workspace --no-deps --locked`, `cargo test --workspace --locked`. All clean.
- [ ] Commit with the message given in the task.

## Decisions this plan rests on

1. **Storage model (decided by the user, replaces spec 7.1's version ranges):** distinct row states plus an ordered list per snapshot. File order is data: several results depend on it (a line's sizes come from its first hold, discipline lists and remark labels follow first appearance, solve-order ties go to the first blocker).
2. **Identity is not stored.** Matching holds between snapshots (by source id, else line and creation time, else closest remark) happens when snapshots are compared, in M2. Nothing in this plan needs it.
3. **A snapshot is identified by the content hash of its file.** Importing the same bytes twice is refused. The same snapshot date with different bytes is allowed; the caller may ask to replace an existing snapshot in the same transaction.
4. **Blockers and remark keys are never stored;** they are derived by rules when a dataset is built.
5. **One SQLite file per workspace**, in a directory the caller supplies. There is no separate registry: listing workspaces means reading that directory.

## Global Constraints

- Real project files never enter the repository. Tests build inputs with `hx-synth` in temporary directories.
- Rust edition 2021, toolchain 1.97.0, `rust-version = "1.88"`. `#![forbid(unsafe_code)]` and `#![warn(missing_docs)]` in every library crate. No `unwrap()` or `expect()` outside tests, except on values that cannot fail by construction, with a message saying why.
- A hold read back from the store equals the hold that was imported (`PartialEq` on `hx_core::model::Hold`): every field, timestamps to the nanosecond, sizes bit for bit, `extra` entry for entry.
- Holds of a snapshot come back in file order.
- An import either completes or changes nothing (one transaction).
- The store never opens a file written by a newer schema version, and never writes to it.
- Before a schema migration changes a file, a copy of the file is made beside it.
- All timestamps are stored as text `YYYY-MM-DDTHH:MM:SS.fffffffff` (nine fractional digits), so text order is time order.
- Every error message says what happened, why, and how to fix it.
- The parity tests and `tools/parity/reference.mjs` do not change. The existing performance limits stay.
- Terms in code and messages: Hold, Line, Blocker, Snapshot, Workspace, Saved view.
- Commit messages follow Conventional Commits.

## File Structure

```
Cargo.toml                           add rusqlite to [workspace.dependencies]; add crates/store to members
crates/core/src/fingerprint.rs       NEW: canonical encoding and state hash of a hold
crates/core/src/load.rs              typed accessors for info-sheet values
crates/synth/src/lib.rs              evolve(): the next snapshot of a synthetic export
crates/store/Cargo.toml              NEW crate hx-store
crates/store/src/lib.rs              crate docs, re-exports
crates/store/src/error.rs            StoreError
crates/store/src/schema.rs           schema version 1, migration runner, backup
crates/store/src/codec.rs            varint list of row-state ids; timestamp text
crates/store/src/workspace.rs        Workspace: create, open, info, rename, projects, settings
crates/store/src/snapshot.rs         import, list, read holds, detail, delete, change date
crates/store/src/directory.rs        list workspaces in a directory, find by project number, delete
crates/cli/src/main.rs               `ws` subcommands
crates/cli/tests/store.rs            end-to-end tests through the CLI and the store
crates/cli/tests/perf.rs             store timings added
```

---

### Task 1: Content hash of a hold row, and info accessors

**Files:** new `crates/core/src/fingerprint.rs`; `crates/core/src/lib.rs`, `load.rs`.

**Why:** The store keeps each distinct hold row once. Two machines, and two versions of the app, must agree on what "the same row" means, so the definition lives in `hx-core`, is versioned, and is pinned by a test. `Hold` cannot derive `Eq` or `Hash` because of its `f64` sizes.

**Interface:**

```rust
// fingerprint.rs
/// Version of the canonical encoding. Changing the encoding requires a new version.
pub const STATE_HASH_VERSION: u32 = 1;

/// SHA-256 over the canonical encoding of every field of the hold.
pub fn state_hash(hold: &Hold) -> [u8; 32];

/// The canonical encoding itself, for tests and debugging.
pub fn canonical_bytes(hold: &Hold) -> Vec<u8>;

// load.rs
impl Loaded { pub fn project_no(&self) -> Option<&str>; }
impl Opened { pub fn project_no(&self) -> Option<&str>; }
/// Key of the project number in the info sheet.
pub const INFO_PROJECT_NO: &str = "Project No.";
/// Key of the report date in the info sheet.
pub const INFO_REPORT_DATE: &str = "Report Date";
```

**Rules:**
- The encoding starts with the version, then every field of `Hold` in declaration order, each prefixed by its byte length so that no two different holds share an encoding (`("ab","c")` and `("a","bc")` must differ).
- Absent optional values encode differently from present ones, including an empty present value.
- Timestamps encode with nanosecond precision. Sizes encode by their `f64` bit pattern.
- `extra` encodes its entries in key order, each key and value length-prefixed.
- `project_no` returns the trimmed value of `INFO_PROJECT_NO`, or `None` when absent or blank. `snapshot_date.rs` and the CLI use the two constants instead of string literals.

**Tests:**

| Case | Expected |
|---|---|
| two equal holds built separately | same hash |
| change each field in turn (16 single-field variations, including `None` versus `Some("")`-like cases for each optional field, a timestamp differing by one nanosecond, a size differing in the last bit, one extra entry added, one extra value changed) | every hash differs from the base and from each other |
| holds with (`name` `ab`, `role` `c`) and (`name` `a`, `role` `bc`) | different hashes |
| `extra` built by inserting keys in two different orders | same hash |
| a fixed, fully populated hold written out in the test | its hash equals a hex string pinned in the test (compute it once, paste it; the test's purpose is to fail if the encoding ever changes without a version bump) |
| every hold of a 2,000-row synthetic file | number of distinct hashes equals number of distinct holds under `PartialEq` |
| info with `Project No.` of ` 0000-TEST ` | `project_no() == Some("0000-TEST")`; blank or missing gives `None` |

**Commit:** `feat(core): define the content hash of a hold row`

---

### Task 2: Evolving synthetic snapshots

**Files:** `crates/synth/src/lib.rs`.

**Why:** Testing a history store needs a series of exports of the same project in which most rows repeat, some are released, some are edited, some disappear, and some are new.

**Interface:**

```rust
/// What `evolve` changed, for tests to assert against.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Evolution { pub released: usize, pub edited: usize, pub removed: usize, pub added: usize }

/// The export `days` later: same project, later report date.
pub fn evolve(rows: &[SynthRow], cfg: &SynthConfig, seed: u64, days: i64) -> (Vec<SynthRow>, SynthConfig, Evolution);
```

**Rules:**
- The returned config has the same project number and a report date `days` later.
- Of the open rows, about 5% are released with a release date between the old and the new report date. Released rows stay released, unchanged.
- About 1% of the open rows get an edited remark (same id, same creation date). About 0.5% of all rows are removed.
- About 3% new rows are added at the end, with ids above every existing id and creation dates between the two report dates, on existing lines.
- Every other row is identical to its input, and the relative order of surviving rows is kept.
- The result is deterministic in `(rows, cfg, seed, days)` and uses the crate's own generator.

**Tests:** on a 2,000-row base with seed 7 and 3 days: determinism (same inputs, same output; different seed, different output); the report date moved by 3 days; ids stay unique; at least 85% of output rows are equal to an input row; each count in `Evolution` is above zero and matches a recount done by the test (released: open before and released after, by id; edited: same id, different remark; removed: ids gone; added: ids new); released rows have release dates inside the interval; surviving rows keep their relative order; three chained evolutions each write a workbook that `hx_core::load::load_file` reads with no skipped rows and no warnings.

**Commit:** `feat(synth): evolve a synthetic export into its next snapshot`

---

### Task 3: Store crate, schema, and migrations

**Files:** root `Cargo.toml`; new `crates/store/{Cargo.toml, src/lib.rs, src/error.rs, src/schema.rs}`.

**Interface:**

```rust
// error.rs
#[derive(Debug, Clone, PartialEq, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum StoreError {
    /// The file is not a Hold Explorer workspace.
    NotAWorkspace { path: String },
    /// The file was written by a newer version of the app.
    NewerSchema { path: String, found: u32, supported: u32 },
    /// The same file was imported before.
    AlreadyImported { snapshot_id: i64, taken_at: NaiveDateTime, file_name: String },
    /// No snapshot has this id.
    SnapshotNotFound { snapshot_id: i64 },
    /// A workspace file could not be read or written.
    Io { path: String, detail: String },
    /// The database reported an error.
    Database { detail: String },
    /// Stored data could not be understood.
    Corrupt { detail: String },
}

// schema.rs
/// The schema version this build reads and writes.
pub const SCHEMA_VERSION: u32 = 1;
pub(crate) struct Migration { pub to: u32, pub sql: &'static str }
pub(crate) fn migrate(conn: &mut Connection, path: &Path, migrations: &[Migration]) -> Result<(), StoreError>;
```

**Schema version 1** (`PRAGMA user_version = 1`, `PRAGMA application_id` set to a constant chosen in this task so that a foreign SQLite file is recognized as not a workspace):

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE project (project_no TEXT PRIMARY KEY) STRICT;
CREATE TABLE setting (key TEXT PRIMARY KEY, value_json TEXT NOT NULL) STRICT;
CREATE TABLE row_state (
  id INTEGER PRIMARY KEY,
  hash BLOB NOT NULL UNIQUE,
  source_id INTEGER,
  line_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
  remark TEXT NOT NULL, hold_type TEXT NOT NULL, discipline TEXT NOT NULL,
  created TEXT, released INTEGER NOT NULL, release_remark TEXT NOT NULL, release_date TEXT,
  model_size REAL, ldt_size REAL, stress_calc TEXT NOT NULL,
  extra_json TEXT NOT NULL
) STRICT;
CREATE TABLE snapshot (
  id INTEGER PRIMARY KEY,
  taken_at TEXT NOT NULL,
  date_source TEXT NOT NULL,
  detected_at TEXT,
  detected_source TEXT,
  file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL,
  limited INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  open_count INTEGER NOT NULL,
  info_json TEXT NOT NULL,
  headers_json TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  skipped_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  rows BLOB NOT NULL
) STRICT;
CREATE INDEX snapshot_taken_at ON snapshot (taken_at, imported_at, id);
```

**Rules:**
- `migrate` reads `user_version`. Equal to the newest: nothing happens. Lower: copy the file to `<file name>.backup-v<old version>` beside it (overwriting an older backup of the same name), then apply each later migration in order, each in its own transaction that also sets `user_version`. Higher than the newest: `NewerSchema`, and the file is not modified in any way.
- A file whose `application_id` is neither zero-with-no-tables (a new file) nor the app's id, or that is not a SQLite database, is `NotAWorkspace`.
- Foreign keys are on. The journal mode is the default (one file per workspace, no side files left behind after a clean close).
- A failed migration leaves the file at the version it had.

**Tests:** a new file ends at version 1 with all five tables; opening it again changes nothing and makes no backup; `migrate` with a test-only list of three migrations applied to a version-1 file ends at version 3, with a backup file `…backup-v1` whose `user_version` is 1; a test-only migration whose SQL fails leaves the version and the data unchanged; a file with `user_version` 99 gives `NewerSchema { found: 99, supported: 1 }` and its bytes are unchanged (compare a hash of the file before and after); a text file and a SQLite file created by something else (a table `foo`, no application id) both give `NotAWorkspace` and are unchanged; every `StoreError` variant round-trips through JSON, serializes with `kind`, and has a message that ends with advice.

**Commit:** `feat(store): add the workspace schema and migration runner`

---

### Task 4: Workspaces

**Files:** new `crates/store/src/workspace.rs`, `directory.rs`; `lib.rs`.

**Interface:**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub project_numbers: Vec<String>,
    pub created_at: NaiveDateTime,
    pub path: PathBuf,
    pub snapshot_count: usize,
    /// Date of the newest snapshot.
    pub latest_taken_at: Option<NaiveDateTime>,
}

pub struct Workspace { /* connection, path */ }

impl Workspace {
    /// Creates `<dir>/<id>.holdx-ws` and returns it open.
    pub fn create(dir: &Path, name: &str) -> Result<Workspace, StoreError>;
    pub fn open(path: &Path) -> Result<Workspace, StoreError>;
    pub fn info(&self) -> Result<WorkspaceInfo, StoreError>;
    pub fn rename(&mut self, name: &str) -> Result<(), StoreError>;
    pub fn add_project_number(&mut self, project_no: &str) -> Result<(), StoreError>;
    pub fn remove_project_number(&mut self, project_no: &str) -> Result<(), StoreError>;
    pub fn saved_mapping(&self) -> Result<Option<SavedMapping>, StoreError>;
    pub fn set_saved_mapping(&mut self, mapping: &SavedMapping) -> Result<(), StoreError>;
}

/// Every workspace file in `dir`, sorted by name then id. Files that are not workspaces are skipped.
pub fn list_workspaces(dir: &Path) -> Result<Vec<WorkspaceInfo>, StoreError>;
/// Workspaces whose project numbers include `project_no`.
pub fn find_by_project(dir: &Path, project_no: &str) -> Result<Vec<WorkspaceInfo>, StoreError>;
/// Deletes the workspace file.
pub fn delete_workspace(path: &Path) -> Result<(), StoreError>;
```

**Rules:**
- The id is 16 lower-case hex characters, unique per creation (derive it from the name, the current time in nanoseconds, the process id, and a per-process counter, hashed; no random-number dependency). `create` never overwrites an existing file.
- Names are trimmed; a blank name is replaced by `Untitled workspace`. Two workspaces may share a name.
- Project numbers are trimmed and compared exactly; adding one twice is not an error; blank is ignored.
- `open` runs `migrate`.
- `list_workspaces` on a directory that does not exist returns an empty list. A workspace written by a newer version appears in no list and causes no error; opening it directly gives `NewerSchema`.
- The extension `.holdx-ws` is added to `.gitignore`.

**Tests:** create then open gives the same info; `info` shows zero snapshots and no latest date; rename persists across reopen; project numbers add, deduplicate, remove, and persist; the saved mapping is `None` at first and round-trips (use a mapping with a repeated key and an unmapped column); two creations with the same name in the same directory give two files with different ids; `list_workspaces` returns both sorted, skips a stray text file and a foreign SQLite file, and returns an empty list for a missing directory; `find_by_project` returns only matching workspaces and nothing for an unknown number; `delete_workspace` removes the file and a second call reports `Io` with the path; a workspace with `user_version` 99 is skipped by `list_workspaces`.

**Commit:** `feat(store): create, list, and match workspaces`

---

### Task 5: Import and read back a snapshot

**Files:** new `crates/store/src/codec.rs`, `snapshot.rs`; `workspace.rs`, `lib.rs`.

**Interface:**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotInfo {
    pub id: i64,
    pub taken_at: NaiveDateTime,
    pub date_source: SnapshotSource,
    pub file_name: String,
    pub content_hash: String,
    pub imported_at: NaiveDateTime,
    pub limited: bool,
    pub row_count: usize,
    pub open_count: usize,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ImportOptions {
    /// Delete this snapshot in the same transaction, replacing it with the new one.
    pub replace: Option<i64>,
}

impl Workspace {
    /// Stores `loaded` as a snapshot dated `taken`.
    pub fn import(&mut self, loaded: &Loaded, taken: SnapshotDate, options: &ImportOptions) -> Result<SnapshotInfo, StoreError>;
    /// The holds of a snapshot, in file order.
    pub fn holds(&self, snapshot_id: i64) -> Result<Vec<Hold>, StoreError>;
    /// The snapshot's holds as a dataset dated by the snapshot.
    pub fn dataset(&self, snapshot_id: i64, rules: &RuleSet) -> Result<Dataset, StoreError>;
}

// codec.rs
pub(crate) fn encode_ids(ids: &[i64]) -> Vec<u8>;
pub(crate) fn decode_ids(bytes: &[u8]) -> Result<Vec<i64>, StoreError>;
pub(crate) fn encode_time(t: NaiveDateTime) -> String;
pub(crate) fn decode_time(s: &str) -> Result<NaiveDateTime, StoreError>;
```

**Rules:**
- `import` runs in one transaction: refuse with `AlreadyImported` if the content hash exists (unless that snapshot is the one named in `replace`); delete the snapshot named in `replace` if any (`SnapshotNotFound` if it does not exist); for each hold compute `hx_core::fingerprint::state_hash` and insert its row state unless the hash is already there; write the snapshot with the ordered list of row-state ids, the counts, the info sheet, the headers, the mapping, the skipped rows, and the warnings.
- When `taken.source` is `SnapshotSource::User` and `loaded.snapshot` holds a detected date, the detected date and its source are stored in `detected_at` and `detected_source`; otherwise those are null.
- Adding the project number of `loaded` (if any) to the workspace is the caller's choice, not part of `import`.
- The id list is encoded as unsigned LEB128 values, one per row, in file order. `decode_ids` rejects truncated input and values that do not fit as `Corrupt`.
- `holds` returns exactly what was imported (see Global Constraints). A row-state id missing from `row_state` is `Corrupt`.
- `dataset` equals `Dataset::build(holds, rules, taken_at)`.
- The 10,000-row import takes under 1 s and reading it back as a dataset under 300 ms in a release build (asserted in Task 8).

**Tests:**

| Case | Expected |
|---|---|
| codec: empty list, one id, ids 0, 1, 127, 128, 16383, 16384, `i64::MAX`, 10,000 increasing ids | round trip; 10,000 ids below 16,384 take at most 20,000 bytes |
| codec: truncated bytes; a 10-byte value that overflows | `Corrupt` |
| time: `2026-10-01T09:00:00.123456789`, a whole second, the minimum and maximum dates the app accepts (years 2000 and 2100) | round trip; encoded strings sort in time order |
| import a 2,000-row synthetic file | `row_count` 2,000; `open_count` equals the open holds; `holds(id) == loaded.parsed.holds` |
| import a file whose holds use every field: extras, a blank remark, sizes 0.75 and absent, a creation timestamp with nanoseconds, no source id, a released hold with a release remark | `holds` equal, field for field |
| import the same `Loaded` twice | second is `AlreadyImported` naming the first snapshot; the database is unchanged (row counts of both tables) |
| a file with 500 identical rows (same every field) | 500 holds read back; one row state stored |
| import the next evolved snapshot | number of row states grows by at most the number of new and changed rows reported by `Evolution` (added + edited + released), not by the row count |
| `replace` an existing snapshot | old snapshot gone, new one present, one transaction; `replace` of an unknown id gives `SnapshotNotFound` and stores nothing |
| `taken` from the user while a date was detected | `detected_at` and `detected_source` stored (checked through Task 6's detail, or by a direct query here) |
| `dataset(id, RuleSet::builtin())` | equals `Dataset::build(loaded.parsed.holds.clone(), RuleSet::builtin(), taken.at)` |
| a failure in the middle of an import (simulate by importing with `replace` pointing at a missing id after valid data) | nothing written |

**Commit:** `feat(store): import a snapshot and read it back exactly`

---

### Task 6: Snapshot listing, detail, deletion, and date change

**Files:** `crates/store/src/snapshot.rs`, `workspace.rs`.

**Interface:**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotDetail {
    pub info: SnapshotInfo,
    /// The date the app detected, when the user replaced it.
    pub detected: Option<SnapshotDate>,
    pub info_sheet: BTreeMap<String, String>,
    pub headers: Vec<String>,
    pub mapping: ColumnMap,
    pub skipped: Vec<SkippedRow>,
    pub warnings: Vec<ImportWarning>,
}

impl Workspace {
    /// Oldest first: by date, then by time of import, then by id.
    pub fn snapshots(&self) -> Result<Vec<SnapshotInfo>, StoreError>;
    /// The newest snapshot by the same order.
    pub fn latest(&self) -> Result<Option<SnapshotInfo>, StoreError>;
    pub fn snapshot(&self, snapshot_id: i64) -> Result<SnapshotInfo, StoreError>;
    pub fn snapshot_detail(&self, snapshot_id: i64) -> Result<SnapshotDetail, StoreError>;
    /// Snapshots dated on the same calendar day as `at`.
    pub fn snapshots_on(&self, at: NaiveDateTime) -> Result<Vec<SnapshotInfo>, StoreError>;
    /// Deletes a snapshot and the row states no other snapshot uses.
    pub fn delete_snapshot(&mut self, snapshot_id: i64) -> Result<(), StoreError>;
    /// Sets a date entered by the user, keeping the first detected date.
    pub fn set_snapshot_date(&mut self, snapshot_id: i64, at: NaiveDateTime) -> Result<SnapshotInfo, StoreError>;
}
```

**Rules:**
- `delete_snapshot` removes the snapshot and then every row state that no remaining snapshot lists, in one transaction. Deleting the last snapshot leaves `row_state` empty.
- `set_snapshot_date` sets `taken_at` and the source `User`. If the snapshot had no stored detected date and its previous source was not `User`, the previous date and source become the detected ones; a detected date already stored is kept.
- Unknown ids give `SnapshotNotFound`.

**Tests:** three evolved snapshots imported in the order 2, 1, 3 list as 1, 2, 3 and `latest` is 3; two snapshots with the same date list by import time; `snapshots_on` finds both for any time on that day and none for the next day; `snapshot_detail` returns the info sheet, headers, mapping, skipped rows, and warnings of what was imported (use a file that produces at least one skipped row and one warning of each of two kinds); deleting the middle snapshot leaves the other two readable and equal to their imports, and the row-state count equals the number of distinct states of the remaining two; deleting all leaves both tables empty; `set_snapshot_date` on a snapshot dated from the info sheet stores that date as detected with source `InfoSheet` and reorders the list; a second date change keeps the first detected date; unknown ids give `SnapshotNotFound` for each method.

**Commit:** `feat(store): list, inspect, delete, and re-date snapshots`

---

### Task 7: Import order cannot matter

**Files:** `crates/store/src/snapshot.rs` (tests, and a test-support function), `crates/store/src/lib.rs`.

**Why:** Spec 6.5: importing the same snapshots in any order yields the same result. The storage model makes this true by construction; this task proves it and guards it.

**Interface:**

```rust
/// A description of everything stored that does not depend on row ids or import times:
/// per snapshot (ordered by date, then content hash): date, source, file name, content hash,
/// counts, and the state hashes of its rows in order; plus the set of all stored state hashes.
pub fn logical_dump(workspace: &Workspace) -> Result<String, StoreError>;
```

**Tests:**
- Four chained synthetic snapshots (base plus three evolutions, 1,500 rows) imported into six workspaces in six different orders, including oldest-first and newest-first: all six `logical_dump` values are equal.
- For each order, every snapshot's `holds` equals its import.
- The number of row states is the number of distinct holds across all four files, and is less than 1.25 times the row count of the largest file.
- Import, delete, and re-import of one snapshot gives the same `logical_dump` as never deleting it.
- The workspace file after the four imports is smaller than 4 times the size after the first import alone.

**Commit:** `test(store): prove stored content is independent of import order`

---

### Task 8: Workspace commands in the CLI, and performance

**Files:** `crates/cli/src/main.rs`, `crates/cli/Cargo.toml`; new `crates/cli/tests/store.rs`; `crates/cli/tests/perf.rs`.

**Interface (commands):**

```
hx-cli ws create <dir> <name>            prints the workspace info as JSON
hx-cli ws list <dir>                     prints a JSON array of workspace infos
hx-cli ws import <workspace-file> <file> [--date <YYYY-MM-DD[THH:MM:SS]>] [--replace <snapshot-id>]
                                         prints the snapshot info as JSON, with "warnings" and "skipped" counts
hx-cli ws snapshots <workspace-file>     prints a JSON array of snapshot infos, oldest first
hx-cli ws summary <workspace-file> [--snapshot <id>]
                                         the same JSON as `hx-cli summary`, from the stored snapshot (newest by default)
```

**Rules:**
- `ws import` uses the automatic mapping extended by the workspace's saved mapping (`ColumnMap::auto_with`), stores the mapping that was used as the workspace's saved mapping, and adds the file's project number to the workspace when it has one.
- The snapshot date is `--date` when given (source `User`), otherwise the detected date; with neither, the command fails and says to pass `--date`.
- Errors go to standard error as the error's message; the exit code is non-zero.

**Tests (`crates/cli/tests/store.rs`, driving the binary):** create, import a synthetic file, list, snapshots, summary; the `ws summary` JSON equals the `summary` JSON of the same file key for key (`snapshot`, `project`, `summary`, `by_discipline`, `by_hold_type`, `top_lines`, `solve`, `limited`, `skipped`, `warnings`); importing the same file again fails with a message containing `already`; importing an evolved file adds a second snapshot and `ws summary` then reports the newer one while `--snapshot <first id>` reports the first; `--date 2026-01-02` stores that date; a file with no detectable date and no `--date` fails with a message containing `--date`; `ws list` shows the project number after import; a second workspace's `ws import` of a CSV with headers `Kind,Line,Why` fails on missing columns (no saved mapping there).

**Performance (`perf.rs`, release, ignored by default, existing limits unchanged):** importing the 10,000-row `Loaded` into a new workspace takes under 1 s; `dataset` for it takes under 300 ms; print both with the other timings.

**Commit:** `feat(cli): add workspace commands backed by the store`

---

### Task 9: Whole-plan verification

- [ ] `cargo fmt --all -- --check`
- [ ] `cargo clippy --workspace --all-targets --locked -- -D warnings`
- [ ] `cargo doc --workspace --no-deps --locked` without warnings
- [ ] `cargo test --workspace --locked`
- [ ] `cargo test --release -p hx-cli --test perf --locked -- --ignored --nocapture`; record every timing
- [ ] `git diff m1b-api-pass -- tools/parity/reference.mjs crates/cli/tests/parity.rs` is empty
- [ ] `git ls-files | grep -Ei '\.(xlsx|xls|holdx|holdx-ws|csv|db|sqlite)$'` prints nothing
- [ ] By hand in a temporary directory: `hx-cli synth`, `ws create`, `ws import`, `ws summary`; the summary equals `hx-cli summary` of the same file

---

## What exists when this plan is done

- `hx-store` persists snapshots exactly and lists, inspects, deletes, and re-dates them; workspaces can be created, listed, and matched by project number; the saved mapping lives in the workspace.
- `hx-cli ws …` imports files into a workspace file and reports from stored snapshots.
- M1b-3 wraps `hx-core` and `hx-store` in Tauri commands.

## Spec coverage of this plan

| Spec section | Task |
|---|---|
| 5.3 one SQLite file per workspace; migrations with a copy first; refusal of newer data | 3, 4 |
| 6.1 step 5 one transaction | 5 |
| 6.4 workspace matching by project number | 4, 8 |
| 6.5 same file refused; older file accepted; any import order gives the same result | 5, 6, 7 |
| 7.1 snapshots and row states | 3, 5 |
| 7.6 snapshot manager: list, change date, delete | 6 |
| 15 migration test; generator of edits and releases between snapshots | 2, 3 |

Left for later plans: 7.2 identity and 7.3 events (M2, at comparison time); 7.5 history bundle (M2); undo of snapshot deletion (M1b-3 or M2, at the interface); workspace-level tables for rules, saved views, notes, watchlist (the plans that introduce those features, each as a schema migration).
