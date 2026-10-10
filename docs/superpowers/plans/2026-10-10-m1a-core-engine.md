# M1a Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested Rust engine that reads a PlantIM holds export, normalizes it, derives blockers, and answers every query the first-release screens need, with a command-line tool that proves it end to end.

**Architecture:** A Cargo workspace with three crates. `hx-core` is a pure library: reader, column mapping, row parsing, blocker rules, an in-memory `Dataset`, filters, queries, and the solve order. `hx-synth` generates seeded synthetic PlantIM-shaped workbooks. `hx-cli` wires both into `synth` and `summary` commands. No Tauri, no database, no interface code in this plan.

**Tech Stack:** Rust 1.97 (edition 2021), calamine 0.36, rust_xlsxwriter 0.99, fancy-regex 0.19, regex 1, chrono 0.4, serde 1, thiserror 2, csv 1, clap 4. Node.js runs the legacy reference script in the parity test.

**Spec:** `docs/superpowers/specs/2026-10-10-hold-explorer-desktop-design.md`

## Where this plan sits

Milestone 1 of the spec is too large for one plan. It is split into four, each producing working, testable software:

| Plan | Delivers |
|---|---|
| **M1a (this plan)** | Core engine, synthetic generator, CLI, parity with the HTML tool's numbers. |
| M1b | `hx-store` (SQLite, workspaces, snapshots), Tauri shell, `PRODUCT.md` and `DESIGN.md`, design tokens, import flow. |
| M1c | Overview, Breakdown, Lines, detail panel, filter interface, global search, saved views, keyboard and command palette, settings. |
| M1d | Excel, CSV, and copy export; update check; WebView2 check; release pipeline. |

M1b, M1c, and M1d are written after the plan before them ships, so each is written against real code.

Deferred from M1a on purpose: date-range filters, custom-field filters, fuzzy global search (M1c, with their interface); a generator for edits between snapshots (M2).

## Global Constraints

- Real project files never enter the repository. Tests use `hx-synth` output only. `.gitignore` already excludes `*.xlsx`, `*.xls`, `*.holdx`.
- License: MIT. Copyright holder: Yassin Diab.
- Rust edition 2021. No `unsafe`. No `unwrap()` or `expect()` outside tests, except on values that cannot fail by construction, with a message saying why.
- Required input columns: `line_id`, `hold_remark`, `hold_type`. All other columns are optional.
- A blank discipline becomes `Unspecified`. A blank name, role, or hold type becomes `—`.
- A size of zero counts as absent.
- Terms in code and messages: Hold, Line, Blocker, Snapshot, Workspace, Saved view.
- Blocker key format: `<discipline>|<item>`, for example `Civil|577-PR-400`.
- Same input must give the same numbers as the HTML tool for open holds (Task 12 enforces this).
- Budget: load and summarize a 10,000-row workbook in under 2 s in a release build.
- Commit messages follow Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`).

## File Structure

```
Cargo.toml                         workspace manifest and shared dependency versions
LICENSE                            MIT
README.md                          what the project is, how to run tests
.github/workflows/ci.yml           test, lint, parity, performance
tools/parity/reference.mjs         legacy HTML-tool logic, kept verbatim, used only by the parity test
crates/core/Cargo.toml
crates/core/src/lib.rs             module list
crates/core/src/normalize.rs       text cleaning and grouping keys
crates/core/src/table.rs           Cell, RawTable, cell coercion
crates/core/src/model.rs           Hold
crates/core/src/mapping.rs         Field, aliases, ColumnMap
crates/core/src/error.rs           ImportError
crates/core/src/import.rs          RawTable + ColumnMap -> holds and skipped rows
crates/core/src/snapshot_date.rs   snapshot date detection
crates/core/src/rules.rs           blocker rules (port of the HTML tool's reason())
crates/core/src/reader.rs          xlsx / xls / csv -> info + RawTable
crates/core/src/load.rs            load_file: reader + mapping + parsing + snapshot date
crates/core/src/dataset.rs         Row, Dataset (holds with derived blocker and age)
crates/core/src/filter.rs          Dim, Status, FilterSpec
crates/core/src/query.rs           summary, group_by, matrix, lines
crates/core/src/solve.rs           solve order
crates/core/src/testkit.rs         shared test fixtures (compiled for tests only)
crates/synth/Cargo.toml
crates/synth/src/lib.rs            SynthConfig, SynthRow, generate, write_workbook
crates/synth/src/rng.rs            SplitMix64
crates/cli/Cargo.toml
crates/cli/src/main.rs             hx-cli synth | summary
crates/cli/tests/cli.rs            end-to-end CLI test
crates/cli/tests/parity.rs         parity against tools/parity/reference.mjs
crates/cli/tests/perf.rs           performance budget (ignored by default)
```

---

### Task 1: Workspace scaffold and text normalization

**Files:**
- Create: `Cargo.toml`, `LICENSE`, `README.md`
- Create: `crates/core/Cargo.toml`, `crates/core/src/lib.rs`, `crates/core/src/normalize.rs`

**Interfaces:**
- Consumes: nothing.
- Produces: `hx_core::normalize::{clean_text(&str) -> String, fold_key(&str) -> String, discipline_or_default(&str) -> String, or_dash(&str) -> String, UNSPECIFIED: &str, DASH: &str}`.

- [ ] **Step 1: Create the workspace manifest**

`Cargo.toml`:

```toml
[workspace]
resolver = "2"
members = ["crates/core"]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"

[workspace.dependencies]
calamine = { version = "0.36", features = ["chrono"] }
chrono = { version = "0.4", features = ["serde"] }
clap = { version = "4", features = ["derive"] }
csv = "1"
fancy-regex = "0.19"
regex = "1"
rust_xlsxwriter = "0.99"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tempfile = "3"
thiserror = "2"
```

- [ ] **Step 2: Create the core crate manifest**

`crates/core/Cargo.toml`:

```toml
[package]
name = "hx-core"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
calamine.workspace = true
chrono.workspace = true
csv.workspace = true
fancy-regex.workspace = true
regex.workspace = true
serde.workspace = true
thiserror.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

- [ ] **Step 3: Add LICENSE and README**

`LICENSE`:

```text
MIT License

Copyright (c) 2026 Yassin Diab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`README.md`:

```markdown
# Hold Explorer

Desktop app that reads the PlantIM "holds" export, shows which piping lines are on hold and why, tracks changes between exports, and recommends which blockers to solve first.

Status: early development. The design is in `docs/superpowers/specs/`.

## Development

    cargo test --workspace

The parity test needs Node.js on the PATH.

## Data policy

Real project files never enter this repository. Tests generate synthetic workbooks at run time with `hx-synth`.

## License

MIT
```

- [ ] **Step 4: Write the failing normalization tests**

`crates/core/src/lib.rs`:

```rust
pub mod normalize;
```

`crates/core/src/normalize.rs`:

```rust
//! Text cleaning shared by import, grouping, and blocker rules.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_text_collapses_whitespace_and_line_breaks() {
        assert_eq!(clean_text("  FIV/AIV   REPORT\n"), "FIV/AIV REPORT");
        assert_eq!(clean_text("a\r\n\tb"), "a b");
    }

    #[test]
    fn clean_text_removes_excel_carriage_return_escape() {
        assert_eq!(clean_text("P&ID update_x000D_\nrev 2"), "P&ID update rev 2");
        assert_eq!(clean_text("a_x000d_b"), "a b");
    }

    #[test]
    fn fold_key_ignores_case_and_spacing() {
        assert_eq!(fold_key("Fiv/Aiv  report "), fold_key("FIV/AIV REPORT\n"));
        assert_eq!(fold_key("Vendor Catalogue"), "VENDOR CATALOGUE");
    }

    #[test]
    fn blank_discipline_becomes_unspecified() {
        assert_eq!(discipline_or_default("   "), "Unspecified");
        assert_eq!(discipline_or_default(" Civil "), "Civil");
    }

    #[test]
    fn blank_label_becomes_dash() {
        assert_eq!(or_dash(""), "—");
        assert_eq!(or_dash(" Designer "), "Designer");
    }
}
```

- [ ] **Step 5: Run the tests and watch them fail**

Run: `cargo test -p hx-core normalize`
Expected: compile error, `cannot find function clean_text in this scope`.

- [ ] **Step 6: Implement normalization**

Insert above the `tests` module in `crates/core/src/normalize.rs`:

```rust
/// Shown when a hold has no discipline.
pub const UNSPECIFIED: &str = "Unspecified";

/// Shown when a hold has no name, role, or hold type.
pub const DASH: &str = "—";

/// Removes the literal `_x000D_` that Excel leaves in exported text, collapses
/// every run of whitespace (line breaks included) to one space, and trims.
pub fn clean_text(input: &str) -> String {
    let without_escape = input.replace("_x000D_", " ").replace("_x000d_", " ");
    without_escape.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Grouping key: cleaned and upper-cased, so remarks that differ only in case
/// or spacing group together.
pub fn fold_key(input: &str) -> String {
    clean_text(input).to_uppercase()
}

pub fn discipline_or_default(input: &str) -> String {
    let cleaned = clean_text(input);
    if cleaned.is_empty() {
        UNSPECIFIED.to_string()
    } else {
        cleaned
    }
}

pub fn or_dash(input: &str) -> String {
    let cleaned = clean_text(input);
    if cleaned.is_empty() {
        DASH.to_string()
    } else {
        cleaned
    }
}
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cargo test -p hx-core normalize`
Expected: `test result: ok. 5 passed`.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml Cargo.lock LICENSE README.md crates/core
git commit -m "feat(core): scaffold workspace and add text normalization"
```

---

### Task 2: Raw table, hold model, and column mapping

**Files:**
- Create: `crates/core/src/table.rs`, `crates/core/src/model.rs`, `crates/core/src/mapping.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `table::Cell { Empty, Text(String), Number(f64), Bool(bool), DateTime(NaiveDateTime) }` with `as_text() -> String`, `as_number() -> Option<f64>`, `as_bool() -> Option<bool>`, `as_datetime() -> Result<Option<NaiveDateTime>, String>`.
  - `table::RawTable { headers: Vec<String>, rows: Vec<Vec<Cell>> }`, `table::format_number(f64) -> String`.
  - `model::Hold` (fields listed in Step 3), derives `Default`.
  - `mapping::Field` (14 variants) with `ALL`, `REQUIRED`, `label()`, `aliases()`.
  - `mapping::ColumnMap { fields: BTreeMap<Field, usize>, extras: Vec<(usize, String)> }` with `auto(&[String]) -> ColumnMap`, `missing_required() -> Vec<Field>`, `is_limited() -> bool`.

- [ ] **Step 1: Write the failing tests for cells**

`crates/core/src/table.rs`:

```rust
//! Format-independent view of a sheet: a header row and rows of typed cells.

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn text(s: &str) -> Cell {
        Cell::Text(s.to_string())
    }

    #[test]
    fn numbers_print_without_trailing_zero() {
        assert_eq!(Cell::Number(4.0).as_text(), "4");
        assert_eq!(Cell::Number(1.5).as_text(), "1.5");
        assert_eq!(Cell::Number(87763.0).as_text(), "87763");
    }

    #[test]
    fn numbers_parse_from_text() {
        assert_eq!(text(" 6 ").as_number(), Some(6.0));
        assert_eq!(text("NR").as_number(), None);
        assert_eq!(Cell::Empty.as_number(), None);
    }

    #[test]
    fn booleans_accept_common_spellings() {
        assert_eq!(Cell::Bool(true).as_bool(), Some(true));
        assert_eq!(text("True").as_bool(), Some(true));
        assert_eq!(text("yes").as_bool(), Some(true));
        assert_eq!(text("0").as_bool(), Some(false));
        assert_eq!(Cell::Number(1.0).as_bool(), Some(true));
        assert_eq!(text("maybe").as_bool(), None);
        assert_eq!(Cell::Empty.as_bool(), None);
    }

    #[test]
    fn datetimes_parse_from_text_formats() {
        let expected = NaiveDate::from_ymd_opt(2026, 9, 2).unwrap();
        assert_eq!(
            text("2026-09-02 08:00:00.123").as_datetime().unwrap().unwrap().date(),
            expected
        );
        assert_eq!(text("2026-09-02").as_datetime().unwrap().unwrap().date(), expected);
        assert_eq!(text("02/09/2026").as_datetime().unwrap().unwrap().date(), expected);
        assert_eq!(text("09/02/2026 01:16 PM").as_datetime().unwrap().unwrap().date(), expected);
    }

    #[test]
    fn blank_datetime_is_none_and_garbage_is_error() {
        assert_eq!(Cell::Empty.as_datetime(), Ok(None));
        assert_eq!(text("  ").as_datetime(), Ok(None));
        assert_eq!(text("not a date").as_datetime(), Err("not a date".to_string()));
    }
}
```

- [ ] **Step 2: Implement cells**

Insert above the `tests` module in `crates/core/src/table.rs`:

```rust
use chrono::{NaiveDate, NaiveDateTime};

#[derive(Debug, Clone, PartialEq)]
pub enum Cell {
    Empty,
    Text(String),
    Number(f64),
    Bool(bool),
    DateTime(NaiveDateTime),
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct RawTable {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<Cell>>,
}

/// Prints whole numbers without a fractional part: `4`, not `4.0`.
pub fn format_number(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

const DATETIME_FORMATS: [&str; 3] = [
    "%Y-%m-%d %H:%M:%S%.f",
    "%Y-%m-%dT%H:%M:%S%.f",
    "%m/%d/%Y %I:%M %p",
];

const DATE_FORMATS: [&str; 4] = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"];

impl Cell {
    pub fn as_text(&self) -> String {
        match self {
            Cell::Empty => String::new(),
            Cell::Text(s) => s.clone(),
            Cell::Number(n) => format_number(*n),
            Cell::Bool(b) => b.to_string(),
            Cell::DateTime(d) => d.format("%Y-%m-%d %H:%M:%S").to_string(),
        }
    }

    pub fn as_number(&self) -> Option<f64> {
        match self {
            Cell::Number(n) => Some(*n),
            Cell::Text(s) => s.trim().parse().ok(),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Cell::Bool(b) => Some(*b),
            Cell::Number(n) => Some(*n != 0.0),
            Cell::Text(s) => match s.trim().to_ascii_lowercase().as_str() {
                "true" | "1" | "yes" => Some(true),
                "false" | "0" | "no" => Some(false),
                _ => None,
            },
            _ => None,
        }
    }

    /// `Ok(None)` for a blank cell, `Err(original text)` for a value that is
    /// present but is not a date.
    pub fn as_datetime(&self) -> Result<Option<NaiveDateTime>, String> {
        match self {
            Cell::Empty => Ok(None),
            Cell::DateTime(d) => Ok(Some(*d)),
            Cell::Text(s) => {
                let s = s.trim();
                if s.is_empty() {
                    return Ok(None);
                }
                for format in DATETIME_FORMATS {
                    if let Ok(parsed) = NaiveDateTime::parse_from_str(s, format) {
                        return Ok(Some(parsed));
                    }
                }
                for format in DATE_FORMATS {
                    if let Ok(parsed) = NaiveDate::parse_from_str(s, format) {
                        return Ok(parsed.and_hms_opt(0, 0, 0));
                    }
                }
                Err(s.to_string())
            }
            other => Err(other.as_text()),
        }
    }
}
```

- [ ] **Step 3: Add the hold model**

`crates/core/src/model.rs`:

```rust
use std::collections::BTreeMap;

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

/// One row of the export after normalization.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Hold {
    /// The `id` column. Absent in limited files.
    pub source_id: Option<i64>,
    pub line_id: String,
    pub name: String,
    pub role: String,
    /// Cleaned remark text, original case.
    pub remark: String,
    pub hold_type: String,
    pub discipline: String,
    pub created: Option<NaiveDateTime>,
    pub released: bool,
    pub release_remark: String,
    pub release_date: Option<NaiveDateTime>,
    /// `None` when blank or zero.
    pub model_size: Option<f64>,
    /// `None` when blank or zero.
    pub ldt_size: Option<f64>,
    pub stress_calc: String,
    /// Columns the mapping did not recognize, by header name.
    pub extra: BTreeMap<String, String>,
}
```

- [ ] **Step 4: Write the failing tests for mapping**

`crates/core/src/mapping.rs`:

```rust
//! Maps header names to known fields.

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn raw_export_maps_every_column() {
        let map = ColumnMap::auto(&headers(&[
            "id", "line_id", "name", "role", "hold_remark", "hold_type", "discipline", "date",
            "released", "release_remark", "release_date", "model_size", "ldt_size", "stress_calc",
        ]));
        assert_eq!(map.fields.len(), 14);
        assert_eq!(map.fields[&Field::LineId], 1);
        assert_eq!(map.fields[&Field::Created], 7);
        assert!(map.extras.is_empty());
        assert!(map.missing_required().is_empty());
        assert!(!map.is_limited());
    }

    #[test]
    fn trimmed_export_is_limited() {
        let map = ColumnMap::auto(&headers(&[
            "line_id", "name", "role", "hold_remark", "hold_type", "discipline",
        ]));
        assert!(map.missing_required().is_empty());
        assert!(map.is_limited());
    }

    #[test]
    fn headers_match_ignoring_case_spaces_and_hyphens() {
        let map = ColumnMap::auto(&headers(&[" Line ID ", "Hold-Remark", "HOLD TYPE"]));
        assert_eq!(map.fields[&Field::LineId], 0);
        assert_eq!(map.fields[&Field::Remark], 1);
        assert_eq!(map.fields[&Field::HoldType], 2);
    }

    #[test]
    fn unknown_headers_become_extras_and_blank_headers_are_ignored() {
        let map = ColumnMap::auto(&headers(&["line_id", "Area", "", "hold_type"]));
        assert_eq!(map.extras, vec![(1, "Area".to_string())]);
        assert_eq!(map.missing_required(), vec![Field::Remark]);
    }

    #[test]
    fn a_field_maps_to_its_first_matching_column() {
        let map = ColumnMap::auto(&headers(&["date", "created"]));
        assert_eq!(map.fields[&Field::Created], 0);
        assert_eq!(map.extras, vec![(1, "created".to_string())]);
    }
}
```

- [ ] **Step 5: Run the tests and watch them fail**

Add to `crates/core/src/lib.rs`:

```rust
pub mod mapping;
pub mod model;
pub mod normalize;
pub mod table;
```

Run: `cargo test -p hx-core mapping`
Expected: compile error, `cannot find type ColumnMap`.

- [ ] **Step 6: Implement mapping**

Insert above the `tests` module in `crates/core/src/mapping.rs`:

```rust
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Field {
    SourceId,
    LineId,
    Name,
    Role,
    Remark,
    HoldType,
    Discipline,
    Created,
    Released,
    ReleaseRemark,
    ReleaseDate,
    ModelSize,
    LdtSize,
    StressCalc,
}

impl Field {
    pub const ALL: [Field; 14] = [
        Field::SourceId,
        Field::LineId,
        Field::Name,
        Field::Role,
        Field::Remark,
        Field::HoldType,
        Field::Discipline,
        Field::Created,
        Field::Released,
        Field::ReleaseRemark,
        Field::ReleaseDate,
        Field::ModelSize,
        Field::LdtSize,
        Field::StressCalc,
    ];

    pub const REQUIRED: [Field; 3] = [Field::LineId, Field::Remark, Field::HoldType];

    /// The column name PlantIM uses. Shown in messages about missing columns.
    pub fn label(self) -> &'static str {
        self.aliases()[0]
    }

    /// Accepted header names, already in normalized form (see `header_key`).
    pub fn aliases(self) -> &'static [&'static str] {
        match self {
            Field::SourceId => &["id", "hold_id"],
            Field::LineId => &["line_id", "line", "line_no", "line_number"],
            Field::Name => &["name", "user", "raised_by"],
            Field::Role => &["role"],
            Field::Remark => &["hold_remark", "remark", "remarks", "hold_remarks"],
            Field::HoldType => &["hold_type", "type"],
            Field::Discipline => &["discipline", "causing_discipline"],
            Field::Created => &["date", "hold_date", "created", "created_at", "تاريخ"],
            Field::Released => &["released"],
            Field::ReleaseRemark => &["release_remark"],
            Field::ReleaseDate => &["release_date", "released_at"],
            Field::ModelSize => &["model_size"],
            Field::LdtSize => &["ldt_size"],
            Field::StressCalc => &["stress_calc", "stress_calculation"],
        }
    }
}

fn header_key(header: &str) -> String {
    header.trim().to_lowercase().replace(&[' ', '-'][..], "_")
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ColumnMap {
    /// Field to zero-based column index.
    pub fields: BTreeMap<Field, usize>,
    /// Unrecognized columns: index and header as written.
    pub extras: Vec<(usize, String)>,
}

impl ColumnMap {
    pub fn auto(headers: &[String]) -> ColumnMap {
        let mut map = ColumnMap::default();
        for (index, header) in headers.iter().enumerate() {
            let key = header_key(header);
            if key.is_empty() {
                continue;
            }
            let field = Field::ALL
                .into_iter()
                .find(|f| !map.fields.contains_key(f) && f.aliases().contains(&key.as_str()));
            match field {
                Some(field) => {
                    map.fields.insert(field, index);
                }
                None => map.extras.push((index, header.trim().to_string())),
            }
        }
        map
    }

    pub fn missing_required(&self) -> Vec<Field> {
        Field::REQUIRED
            .into_iter()
            .filter(|f| !self.fields.contains_key(f))
            .collect()
    }

    /// A limited file cannot identify holds exactly or tell released from removed.
    pub fn is_limited(&self) -> bool {
        !self.fields.contains_key(&Field::SourceId) || !self.fields.contains_key(&Field::Released)
    }
}
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cargo test -p hx-core`
Expected: `test result: ok. 15 passed`.

- [ ] **Step 8: Commit**

```bash
git add crates/core
git commit -m "feat(core): add raw table cells, hold model, and column mapping"
```

---

### Task 3: Row parsing

**Files:**
- Create: `crates/core/src/error.rs`, `crates/core/src/import.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `table::{Cell, RawTable}`, `mapping::{ColumnMap, Field}`, `model::Hold`, `normalize::{clean_text, discipline_or_default, or_dash}`.
- Produces:
  - `error::ImportError { Unreadable { path, detail }, NoDataSheet, MissingColumns(Vec<String>), Empty }`.
  - `import::SkippedRow { row_number: usize, reason: String }`.
  - `import::Parsed { holds: Vec<Hold>, skipped: Vec<SkippedRow>, limited: bool }`.
  - `import::parse_table(&RawTable, &ColumnMap) -> Result<Parsed, ImportError>`.

- [ ] **Step 1: Add the error type**

`crates/core/src/error.rs`:

```rust
use thiserror::Error;

/// Every message says what went wrong and what the user can do about it.
#[derive(Debug, Error, PartialEq)]
pub enum ImportError {
    #[error("Could not read {path}: {detail}. Check that the file is an Excel or CSV file and is not password-protected.")]
    Unreadable { path: String, detail: String },

    #[error("No sheet with hold data was found. Expected a sheet named \"data\" with the columns line_id, hold_remark, and hold_type.")]
    NoDataSheet,

    #[error("Missing required columns: {}. Map them to columns in your file.", .0.join(", "))]
    MissingColumns(Vec<String>),

    #[error("The file has a header row but no data rows.")]
    Empty,
}
```

- [ ] **Step 2: Write the failing tests**

`crates/core/src/import.rs`:

```rust
//! Turns a raw table into normalized holds.

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn text(s: &str) -> Cell {
        Cell::Text(s.to_string())
    }

    fn at(y: i32, m: u32, d: u32, h: u32) -> Cell {
        Cell::DateTime(NaiveDate::from_ymd_opt(y, m, d).unwrap().and_hms_opt(h, 0, 0).unwrap())
    }

    fn table() -> RawTable {
        let headers = [
            "id", "line_id", "name", "role", "hold_remark", "hold_type", "discipline", "date",
            "released", "release_date", "model_size", "ldt_size", "stress_calc", "Area",
        ];
        RawTable {
            headers: headers.iter().map(|s| s.to_string()).collect(),
            rows: vec![
                vec![
                    Cell::Number(1.0), text(" L-1 "), text("Engineer 01"), text("Designer"),
                    text("FIV/AIV REPORT\n"), text("MISC."), Cell::Empty, at(2026, 9, 1, 10),
                    Cell::Bool(false), Cell::Empty, text("4"), Cell::Number(0.0), text("NR"),
                    text("North"),
                ],
                vec![
                    Cell::Number(2.0), Cell::Empty, text("Engineer 02"), text("Designer"),
                    text("x"), text("MISC."), text("Civil"), at(2026, 9, 1, 11),
                    Cell::Bool(false), Cell::Empty, Cell::Empty, Cell::Empty, Cell::Empty,
                    Cell::Empty,
                ],
                vec![
                    Cell::Number(3.0), text("L-2"), text("Engineer 02"), text("Designer"),
                    text("x"), text("MISC."), text("Civil"), text("not a date"),
                    Cell::Bool(false), Cell::Empty, Cell::Empty, Cell::Empty, Cell::Empty,
                    Cell::Empty,
                ],
                vec![Cell::Empty; 14],
                vec![
                    Cell::Number(4.0), text("L-3"), Cell::Empty, Cell::Empty, Cell::Empty,
                    text("P&ID"), text("Civil"), text("2026-09-02 08:00:00.123"), text("True"),
                    at(2026, 9, 20, 9), Cell::Number(6.0), Cell::Number(6.0), Cell::Empty,
                    Cell::Empty,
                ],
            ],
        }
    }

    #[test]
    fn parses_and_normalizes_rows() {
        let t = table();
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        assert_eq!(parsed.holds.len(), 2);
        assert!(!parsed.limited);

        let first = &parsed.holds[0];
        assert_eq!(first.source_id, Some(1));
        assert_eq!(first.line_id, "L-1");
        assert_eq!(first.remark, "FIV/AIV REPORT");
        assert_eq!(first.discipline, "Unspecified");
        assert_eq!(first.model_size, Some(4.0));
        assert_eq!(first.ldt_size, None, "zero counts as absent");
        assert_eq!(first.stress_calc, "NR");
        assert!(!first.released);
        assert_eq!(first.extra.get("Area").map(String::as_str), Some("North"));

        let second = &parsed.holds[1];
        assert_eq!(second.line_id, "L-3");
        assert_eq!(second.name, "—");
        assert_eq!(second.role, "—");
        assert_eq!(second.remark, "");
        assert!(second.released);
        assert!(second.release_date.is_some());
        assert!(second.created.is_some());
        assert!(second.extra.is_empty());
    }

    #[test]
    fn skips_bad_rows_with_sheet_row_numbers() {
        let t = table();
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        let skipped: Vec<(usize, &str)> = parsed
            .skipped
            .iter()
            .map(|s| (s.row_number, s.reason.as_str()))
            .collect();
        assert_eq!(
            skipped,
            vec![(3, "blank line_id"), (4, "unparseable date \"not a date\"")]
        );
    }

    #[test]
    fn missing_required_columns_are_named() {
        let t = RawTable {
            headers: vec!["line_id".to_string(), "hold_type".to_string()],
            rows: vec![vec![text("L-1"), text("MISC.")]],
        };
        let err = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap_err();
        assert_eq!(err, ImportError::MissingColumns(vec!["hold_remark".to_string()]));
    }

    #[test]
    fn header_only_table_is_empty() {
        let t = RawTable {
            headers: vec!["line_id".into(), "hold_remark".into(), "hold_type".into()],
            rows: vec![],
        };
        let err = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap_err();
        assert_eq!(err, ImportError::Empty);
    }

    #[test]
    fn file_without_id_is_limited() {
        let t = RawTable {
            headers: vec!["line_id".into(), "hold_remark".into(), "hold_type".into()],
            rows: vec![vec![text("L-1"), text("x"), text("MISC.")]],
        };
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        assert!(parsed.limited);
        assert_eq!(parsed.holds[0].source_id, None);
    }
}
```

- [ ] **Step 3: Run the tests and watch them fail**

Add to `crates/core/src/lib.rs`:

```rust
pub mod error;
pub mod import;
pub mod mapping;
pub mod model;
pub mod normalize;
pub mod table;
```

Run: `cargo test -p hx-core import`
Expected: compile error, `cannot find function parse_table`.

- [ ] **Step 4: Implement row parsing**

Insert above the `tests` module in `crates/core/src/import.rs`:

```rust
use crate::error::ImportError;
use crate::mapping::{ColumnMap, Field};
use crate::model::Hold;
use crate::normalize::{clean_text, discipline_or_default, or_dash};
use crate::table::{Cell, RawTable};

#[derive(Debug, Clone, PartialEq)]
pub struct SkippedRow {
    /// One-based row number in the sheet, counting the header as row 1.
    pub row_number: usize,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Parsed {
    pub holds: Vec<Hold>,
    pub skipped: Vec<SkippedRow>,
    pub limited: bool,
}

fn size(cell: &Cell) -> Option<f64> {
    cell.as_number().filter(|n| *n > 0.0)
}

pub fn parse_table(table: &RawTable, map: &ColumnMap) -> Result<Parsed, ImportError> {
    let missing = map.missing_required();
    if !missing.is_empty() {
        return Err(ImportError::MissingColumns(
            missing.iter().map(|f| f.label().to_string()).collect(),
        ));
    }
    if table.rows.is_empty() {
        return Err(ImportError::Empty);
    }

    let cell = |row: &[Cell], field: Field| -> Cell {
        map.fields
            .get(&field)
            .and_then(|&index| row.get(index))
            .cloned()
            .unwrap_or(Cell::Empty)
    };

    let mut holds = Vec::with_capacity(table.rows.len());
    let mut skipped = Vec::new();

    for (index, row) in table.rows.iter().enumerate() {
        if row.iter().all(|c| matches!(c, Cell::Empty)) {
            continue;
        }
        let row_number = index + 2;

        let line_id = clean_text(&cell(row, Field::LineId).as_text());
        if line_id.is_empty() {
            skipped.push(SkippedRow { row_number, reason: "blank line_id".to_string() });
            continue;
        }
        let created = match cell(row, Field::Created).as_datetime() {
            Ok(value) => value,
            Err(raw) => {
                skipped.push(SkippedRow {
                    row_number,
                    reason: format!("unparseable date \"{raw}\""),
                });
                continue;
            }
        };

        let extra = map
            .extras
            .iter()
            .filter_map(|(column, name)| {
                let value = clean_text(&row.get(*column).map(Cell::as_text).unwrap_or_default());
                if value.is_empty() {
                    None
                } else {
                    Some((name.clone(), value))
                }
            })
            .collect();

        holds.push(Hold {
            source_id: cell(row, Field::SourceId).as_number().map(|n| n as i64),
            line_id,
            name: or_dash(&cell(row, Field::Name).as_text()),
            role: or_dash(&cell(row, Field::Role).as_text()),
            remark: clean_text(&cell(row, Field::Remark).as_text()),
            hold_type: or_dash(&cell(row, Field::HoldType).as_text()),
            discipline: discipline_or_default(&cell(row, Field::Discipline).as_text()),
            created,
            released: cell(row, Field::Released).as_bool().unwrap_or(false),
            release_remark: clean_text(&cell(row, Field::ReleaseRemark).as_text()),
            release_date: cell(row, Field::ReleaseDate).as_datetime().unwrap_or(None),
            model_size: size(&cell(row, Field::ModelSize)),
            ldt_size: size(&cell(row, Field::LdtSize)),
            stress_calc: clean_text(&cell(row, Field::StressCalc).as_text()),
            extra,
        });
    }

    Ok(Parsed { holds, skipped, limited: map.is_limited() })
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cargo test -p hx-core import`
Expected: `test result: ok. 5 passed`.

- [ ] **Step 6: Commit**

```bash
git add crates/core
git commit -m "feat(core): parse raw tables into normalized holds"
```

---

### Task 4: Snapshot date detection

**Files:**
- Create: `crates/core/src/snapshot_date.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `model::Hold`.
- Produces:
  - `snapshot_date::parse_report_date(&str) -> Option<NaiveDateTime>`.
  - `snapshot_date::snapshot_date(info: &BTreeMap<String, String>, file_name: &str, holds: &[Hold], file_modified: Option<NaiveDateTime>) -> Option<NaiveDateTime>`.

Order of trust (spec 6.3): the `info` sheet's `Report Date`; then the date in the filename, taking the year from the newest timestamp in the file; then the file's modified time. The current year is never assumed.

- [ ] **Step 1: Write the failing tests**

`crates/core/src/snapshot_date.rs`:

```rust
//! Works out when a snapshot was taken.

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").unwrap()
    }

    fn holds_with_newest(s: &str) -> Vec<Hold> {
        vec![
            Hold { created: Some(at("2026-02-01 00:00:00")), ..Default::default() },
            Hold {
                created: Some(at("2026-03-01 00:00:00")),
                release_date: Some(at(s)),
                ..Default::default()
            },
        ]
    }

    fn info(report_date: &str) -> BTreeMap<String, String> {
        BTreeMap::from([("Report Date".to_string(), report_date.to_string())])
    }

    #[test]
    fn report_date_from_info_sheet_wins() {
        let got = snapshot_date(
            &info("09/29/2026 01:16 PM"),
            "holds_07-Oct.xlsx",
            &holds_with_newest("2026-10-07 08:07:30"),
            Some(at("2026-10-10 15:00:00")),
        );
        assert_eq!(got, Some(at("2026-09-29 13:16:00")));
    }

    #[test]
    fn filename_with_month_name_takes_year_from_data() {
        let got = snapshot_date(
            &BTreeMap::new(),
            "holds_07-Oct.xlsx",
            &holds_with_newest("2026-10-07 08:07:30"),
            None,
        );
        assert_eq!(got, Some(at("2026-10-07 00:00:00")));
    }

    #[test]
    fn filename_with_numeric_day_and_month() {
        let got = snapshot_date(
            &BTreeMap::new(),
            "holds_29-9.xlsx",
            &holds_with_newest("2026-09-29 12:00:00"),
            None,
        );
        assert_eq!(got, Some(at("2026-09-29 00:00:00")));
    }

    #[test]
    fn filename_with_full_date_needs_no_data() {
        let got = snapshot_date(&BTreeMap::new(), "holds_2026-10-07.xlsx", &[], None);
        assert_eq!(got, Some(at("2026-10-07 00:00:00")));
    }

    #[test]
    fn january_file_after_december_data_rolls_into_next_year() {
        let got = snapshot_date(
            &BTreeMap::new(),
            "holds_02-Jan.xlsx",
            &holds_with_newest("2026-12-30 09:00:00"),
            None,
        );
        assert_eq!(got, Some(at("2027-01-02 00:00:00")));
    }

    #[test]
    fn falls_back_to_file_modified_time() {
        let modified = at("2026-10-10 15:00:00");
        let got = snapshot_date(&BTreeMap::new(), "export.xlsx", &[], Some(modified));
        assert_eq!(got, Some(modified));
    }

    #[test]
    fn unparseable_report_date_falls_through() {
        let got = snapshot_date(
            &info("yesterday"),
            "holds_07-Oct.xlsx",
            &holds_with_newest("2026-10-07 08:07:30"),
            None,
        );
        assert_eq!(got, Some(at("2026-10-07 00:00:00")));
    }

    #[test]
    fn nothing_to_go_on_gives_none() {
        assert_eq!(snapshot_date(&BTreeMap::new(), "export.xlsx", &[], None), None);
    }
}
```

- [ ] **Step 2: Run the tests and watch them fail**

Add `pub mod snapshot_date;` to `crates/core/src/lib.rs` (keep the list alphabetical).

Run: `cargo test -p hx-core snapshot_date`
Expected: compile error, `cannot find function snapshot_date`.

- [ ] **Step 3: Implement detection**

Insert above the `tests` module in `crates/core/src/snapshot_date.rs`:

```rust
use std::collections::BTreeMap;
use std::sync::OnceLock;

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use regex::Regex;

use crate::model::Hold;

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// PlantIM writes the report date as `09/29/2026 01:16 PM`.
pub fn parse_report_date(text: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(text.trim(), "%m/%d/%Y %I:%M %p").ok()
}

fn newest_timestamp(holds: &[Hold]) -> Option<NaiveDateTime> {
    holds.iter().flat_map(|h| [h.created, h.release_date]).flatten().max()
}

fn full_date_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})").expect("pattern is a valid literal")
    })
}

fn month_name_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)(\d{1,2})[-_ .]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)")
            .expect("pattern is a valid literal")
    })
}

fn day_month_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(\d{1,2})[-_.](\d{1,2})").expect("pattern is a valid literal")
    })
}

fn number(text: &str) -> Option<u32> {
    text.parse().ok()
}

/// A date written in the filename. A filename without a year borrows the year
/// of the newest timestamp in the data; if that puts the date more than 180
/// days before the newest timestamp, the file belongs to the following year.
fn date_from_name(file_name: &str, newest: Option<NaiveDateTime>) -> Option<NaiveDate> {
    if let Some(c) = full_date_regex().captures(file_name) {
        let year: i32 = c[1].parse().ok()?;
        return NaiveDate::from_ymd_opt(year, number(&c[2])?, number(&c[3])?);
    }

    let (day, month) = if let Some(c) = month_name_regex().captures(file_name) {
        let name = c[2].to_lowercase();
        let month = MONTHS.iter().position(|m| *m == name)? as u32 + 1;
        (number(&c[1])?, month)
    } else if let Some(c) = day_month_regex().captures(file_name) {
        (number(&c[1])?, number(&c[2])?)
    } else {
        return None;
    };

    let newest = newest?.date();
    let candidate = NaiveDate::from_ymd_opt(newest.year(), month, day)?;
    if candidate < newest - Duration::days(180) {
        NaiveDate::from_ymd_opt(newest.year() + 1, month, day)
    } else {
        Some(candidate)
    }
}

pub fn snapshot_date(
    info: &BTreeMap<String, String>,
    file_name: &str,
    holds: &[Hold],
    file_modified: Option<NaiveDateTime>,
) -> Option<NaiveDateTime> {
    if let Some(reported) = info.get("Report Date").and_then(|v| parse_report_date(v)) {
        return Some(reported);
    }
    if let Some(date) = date_from_name(file_name, newest_timestamp(holds)) {
        return date.and_hms_opt(0, 0, 0);
    }
    file_modified
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cargo test -p hx-core snapshot_date`
Expected: `test result: ok. 8 passed`.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): detect snapshot date from info sheet, filename, or file time"
```

---

### Task 5: Blocker rules

**Files:**
- Create: `crates/core/src/rules.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `normalize::clean_text`.
- Produces: `rules::Blocker { kind: String, item: String }`, `rules::RuleSet::builtin() -> RuleSet`, `RuleSet::classify(&self, remark: &str) -> Blocker`.

This is a port of `reason()` in the HTML tool. The behavior must match exactly; Task 12 checks it against the original JavaScript.

Order of rules, first match wins:

1. **Tag.** The first match of the tag pattern whose letter code is not `UNIT`. `kind` is the letter code (`STRU` is reported as `STR`); `item` is the whole match with spaces removed.
2. **Tie-in.** `T###-R###`. `kind` is `TIE-IN`; `item` is the match.
3. **Keyword.** Sixteen patterns tested in order. `kind` and `item` are both the keyword label.
4. **Other.** `kind` is `Other`; `item` is the upper-cased remark with a leading `HOLD ` and then a leading `PENDING` or `ON` removed, cut to 60 characters, or `—` when nothing is left.

The tag pattern uses lookahead, which the `regex` crate does not support, so the tag rule uses `fancy-regex`. The other rules use `regex`.

- [ ] **Step 1: Write the failing tests**

`crates/core/src/rules.rs`:

```rust
//! Derives the blocker a hold waits for from its remark.

#[cfg(test)]
mod tests {
    use super::*;

    fn classify(remark: &str) -> (String, String) {
        let b = RuleSet::builtin().classify(remark);
        (b.kind, b.item)
    }

    fn pair(kind: &str, item: &str) -> (String, String) {
        (kind.to_string(), item.to_string())
    }

    #[test]
    fn tag_with_unit_prefix() {
        assert_eq!(
            classify("Hold Pending Civil Drawings for 577-PR-400"),
            pair("PR", "577-PR-400")
        );
        assert_eq!(classify("Pending 538-STR-006 issuance"), pair("STR", "538-STR-006"));
        assert_eq!(
            classify("Hold Pending Piping Platform Supports for 565-V-302"),
            pair("V", "565-V-302")
        );
    }

    #[test]
    fn tag_with_trailing_letter_and_brackets() {
        assert_eq!(classify("control valve(538-PV-3064A)"), pair("PV", "538-PV-3064A"));
    }

    #[test]
    fn tag_with_space_after_hyphen_is_joined() {
        assert_eq!(classify("pending 538-PR- 100"), pair("PR", "538-PR-100"));
    }

    #[test]
    fn stru_code_is_reported_as_str() {
        assert_eq!(classify("wait for 538-STRU-006"), pair("STR", "538-STRU-006"));
    }

    #[test]
    fn unit_code_is_skipped_in_favor_of_next_tag() {
        assert_eq!(classify("UNIT-577 hold for 538-V-104"), pair("V", "538-V-104"));
    }

    #[test]
    fn six_digit_number_is_not_a_tag() {
        assert_eq!(classify("AB-123456"), pair("Other", "AB-123456"));
    }

    #[test]
    fn tie_in() {
        assert_eq!(classify("Tie-in T123-R456 not confirmed"), pair("TIE-IN", "T123-R456"));
    }

    #[test]
    fn keywords_in_priority_order() {
        assert_eq!(classify("FIV/AIV REPORT\n"), pair("FIV/AIV", "FIV/AIV"));
        assert_eq!(classify("Hold Pending Xodus FIV/AIV Report"), pair("FIV/AIV", "FIV/AIV"));
        assert_eq!(classify("Isometric by vendor"), pair("ISOMETRIC", "ISOMETRIC"));
        assert_eq!(classify("Vendor Catalogue"), pair("VENDOR", "VENDOR"));
        assert_eq!(classify("P&ID update_x000D_\nrev 2 pending"), pair("P&ID", "P&ID"));
        assert_eq!(classify("updated PIDs needed"), pair("P&ID", "P&ID"));
        assert_eq!(classify("sleepers elevation"), pair("SLEEPERS", "SLEEPERS"));
        assert_eq!(
            classify("LINE SIZE to be confirmed by process"),
            pair("LINE SIZE", "LINE SIZE")
        );
        assert_eq!(classify("pending GA's from vendor"), pair("GA DRAWING", "GA DRAWING"));
        assert_eq!(classify("steel design not final"), pair("STRUCTURE", "STRUCTURE"));
    }

    #[test]
    fn other_strips_leading_hold_and_pending() {
        assert_eq!(
            classify("Hold pending IA layout for Unit 577"),
            pair("Other", "IA LAYOUT FOR UNIT 577")
        );
        assert_eq!(
            classify("Pending Issuing SMR for Cold Shoes for uninsulated lines"),
            pair("Other", "ISSUING SMR FOR COLD SHOES FOR UNINSULATED LINES")
        );
        assert_eq!(classify("on client decision"), pair("Other", "CLIENT DECISION"));
    }

    #[test]
    fn other_is_cut_to_sixty_characters() {
        let long = "x".repeat(80);
        assert_eq!(classify(&long).1.chars().count(), 60);
    }

    #[test]
    fn blank_remark_is_other_dash() {
        assert_eq!(classify(""), pair("Other", "—"));
        assert_eq!(classify("  \n "), pair("Other", "—"));
    }
}
```

- [ ] **Step 2: Run the tests and watch them fail**

Add `pub mod rules;` to `crates/core/src/lib.rs`.

Run: `cargo test -p hx-core rules`
Expected: compile error, `cannot find type RuleSet`.

- [ ] **Step 3: Implement the rules**

Insert above the `tests` module in `crates/core/src/rules.rs`:

```rust
use fancy_regex::Regex as LookaheadRegex;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::normalize::clean_text;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Blocker {
    /// Blocker type: a tag code such as `PR`, `TIE-IN`, a keyword label, or `Other`.
    pub kind: String,
    /// The specific thing waited for, such as `577-PR-400`.
    pub item: String,
}

/// An optional three-digit unit, a one-to-five-letter code, a hyphen, and a
/// two-to-five-digit number with an optional single trailing letter. The
/// number must not continue with another digit or with `-digit`.
const TAG_PATTERN: &str =
    r"\b(?:[0-9]{3}-)?([A-Z]{1,5})- ?([0-9]{2,5})(?:[A-Z](?![A-Z]))?(?![0-9]|-[0-9])";

const TIE_IN_PATTERN: &str = r"\bT[0-9]{3}-R[0-9]{3}\b";

/// Tested in this order; the first hit wins.
const KEYWORDS: [(&str, &str); 16] = [
    (r"P\s?&\s?IDS?\b|\bPIDS?\b", "P&ID"),
    (r"SLEEPER", "SLEEPERS"),
    (r"MISC", "MISC."),
    (r"FIV|AIV", "FIV/AIV"),
    (r"\bLDT\b", "LDT"),
    (r"LINE SIZE|HOLD SIZE", "LINE SIZE"),
    (r"DATA ?SHEET", "DATA SHEET"),
    (r"ISOMETRIC", "ISOMETRIC"),
    (r"PLOT PLAN", "PLOT PLAN"),
    (r"TAG NO", "INSTRUMENT TAG"),
    (r"PIPING MATERIAL CLASS|\bPMC\b", "PMC"),
    (r"PLATFORM", "PLATFORM"),
    (r"SUPPORT", "SUPPORT"),
    (r"\bGA\b|\bGA'S", "GA DRAWING"),
    (r"VENDOR", "VENDOR"),
    (r"STRUCTURE|STEEL|STRU", "STRUCTURE"),
];

pub struct RuleSet {
    tag: LookaheadRegex,
    tie_in: Regex,
    keywords: Vec<(Regex, &'static str)>,
    leading_hold: Regex,
    leading_pending: Regex,
}

impl RuleSet {
    /// The rules of the HTML tool.
    pub fn builtin() -> RuleSet {
        let literal = "pattern is a valid literal";
        RuleSet {
            tag: LookaheadRegex::new(TAG_PATTERN).expect(literal),
            tie_in: Regex::new(TIE_IN_PATTERN).expect(literal),
            keywords: KEYWORDS
                .iter()
                .map(|(pattern, label)| (Regex::new(pattern).expect(literal), *label))
                .collect(),
            leading_hold: Regex::new(r"^HOLD ").expect(literal),
            leading_pending: Regex::new(r"^(PENDING|ON) ?").expect(literal),
        }
    }

    pub fn classify(&self, remark: &str) -> Blocker {
        let upper = clean_text(remark).to_uppercase();

        let mut position = 0;
        while position < upper.len() {
            let Ok(Some(captures)) = self.tag.captures_from_pos(&upper, position) else {
                break;
            };
            let Some(whole) = captures.get(0) else { break };
            let code = captures.get(1).map(|m| m.as_str()).unwrap_or_default();
            if code == "UNIT" {
                position = whole.end();
                continue;
            }
            let kind = if code == "STRU" { "STR" } else { code };
            return Blocker {
                kind: kind.to_string(),
                item: whole.as_str().chars().filter(|c| !c.is_whitespace()).collect(),
            };
        }

        if let Some(found) = self.tie_in.find(&upper) {
            return Blocker { kind: "TIE-IN".to_string(), item: found.as_str().to_string() };
        }

        for (pattern, label) in &self.keywords {
            if pattern.is_match(&upper) {
                return Blocker { kind: label.to_string(), item: label.to_string() };
            }
        }

        let rest = self.leading_hold.replace(&upper, "");
        let rest = self.leading_pending.replace(&rest, "");
        let item: String = rest.chars().take(60).collect();
        Blocker {
            kind: "Other".to_string(),
            item: if item.is_empty() { "—".to_string() } else { item },
        }
    }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cargo test -p hx-core rules`
Expected: `test result: ok. 11 passed`.

If a test fails, fix the implementation, not the expectation: each expectation was derived from the original JavaScript.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): port blocker rules from the HTML tool"
```

---

### Task 6: Synthetic generator

**Files:**
- Create: `crates/synth/Cargo.toml`, `crates/synth/src/lib.rs`, `crates/synth/src/rng.rs`
- Modify: `Cargo.toml` (workspace members)

**Interfaces:**
- Consumes: nothing from `hx-core`.
- Produces:
  - `hx_synth::SynthConfig { seed: u64, lines: usize, holds: usize, released_ratio: f64, report_date: NaiveDateTime, project_no: String }` with `SynthConfig::new(seed, lines, holds) -> SynthConfig`.
  - `hx_synth::SynthRow { id: i64, line_id: String, name: String, role: String, remark: String, hold_type: String, discipline: Option<String>, created: NaiveDateTime, released: bool, release_date: Option<NaiveDateTime>, model_size: Option<String>, ldt_size: Option<f64>, stress_calc: Option<String> }`.
  - `hx_synth::generate(&SynthConfig) -> Vec<SynthRow>`.
  - `hx_synth::write_workbook(&[SynthRow], &SynthConfig, &Path) -> Result<(), rust_xlsxwriter::XlsxError>`.
  - `hx_synth::HEADERS: [&str; 14]`.

The generator owns its random numbers (SplitMix64), so output is identical on every platform and never changes with a dependency upgrade. All names and the project number are invented.

- [ ] **Step 1: Create the crate**

In the root `Cargo.toml`, change the members line to:

```toml
members = ["crates/core", "crates/synth"]
```

`crates/synth/Cargo.toml`:

```toml
[package]
name = "hx-synth"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
chrono.workspace = true
rust_xlsxwriter.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

- [ ] **Step 2: Write the failing tests for the random number generator**

`crates/synth/src/rng.rs`:

```rust
//! SplitMix64: small, fast, and identical on every platform.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_gives_same_sequence() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_differ() {
        assert_ne!(Rng::new(1).next_u64(), Rng::new(2).next_u64());
    }

    #[test]
    fn below_stays_in_range() {
        let mut rng = Rng::new(7);
        for _ in 0..1000 {
            assert!(rng.below(13) < 13);
        }
    }

    #[test]
    fn chance_extremes() {
        let mut rng = Rng::new(7);
        assert!(!rng.chance(0.0));
        assert!(rng.chance(1.0));
    }
}
```

- [ ] **Step 3: Implement the random number generator**

Insert above the `tests` module in `crates/synth/src/rng.rs`:

```rust
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Rng {
        Rng(seed)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A value in `0..n`. `n` must be greater than zero.
    pub fn below(&mut self, n: usize) -> usize {
        (self.next_u64() % n as u64) as usize
    }

    /// True with probability `p`.
    pub fn chance(&mut self, p: f64) -> bool {
        let unit = (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64;
        unit < p
    }

    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len())]
    }
}
```

- [ ] **Step 4: Write the failing tests for the generator**

`crates/synth/src/lib.rs`:

```rust
//! Seeded generator of synthetic PlantIM-shaped hold exports.
//!
//! Reproduces the quirks of the real export: blank disciplines, remarks with
//! trailing line breaks and the literal `_x000D_`, bulk rows that share one
//! timestamp, sizes of zero, and lines whose two sizes disagree.

pub mod rng;

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};

    fn rows() -> (SynthConfig, Vec<SynthRow>) {
        let cfg = SynthConfig::new(11, 300, 2000);
        let rows = generate(&cfg);
        (cfg, rows)
    }

    #[test]
    fn generation_is_deterministic() {
        let cfg = SynthConfig::new(11, 300, 2000);
        assert_eq!(generate(&cfg), generate(&cfg));
        assert_ne!(generate(&cfg), generate(&SynthConfig::new(12, 300, 2000)));
    }

    #[test]
    fn produces_requested_volume_with_unique_ids() {
        let (cfg, rows) = rows();
        assert_eq!(rows.len(), cfg.holds);
        let ids: HashSet<i64> = rows.iter().map(|r| r.id).collect();
        assert_eq!(ids.len(), rows.len());
        let lines: HashSet<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert!(lines.len() <= cfg.lines);
        assert!(lines.len() > cfg.lines / 2);
    }

    #[test]
    fn reproduces_real_quirks() {
        let (_, rows) = rows();
        assert!(rows.iter().any(|r| r.discipline.is_none()), "blank disciplines");
        assert!(rows.iter().any(|r| r.remark.ends_with('\n')), "trailing line break");
        assert!(rows.iter().any(|r| r.remark.contains("_x000D_")), "escaped carriage return");
        assert!(rows.iter().any(|r| r.ldt_size == Some(0.0)), "zero size");
        assert!(rows.iter().any(|r| r.released) && rows.iter().any(|r| !r.released));

        let mut by_time: HashMap<NaiveDateTime, usize> = HashMap::new();
        for r in &rows {
            *by_time.entry(r.created).or_default() += 1;
        }
        assert!(by_time.values().any(|n| *n >= 5), "bulk rows share a timestamp");
    }

    #[test]
    fn released_rows_have_a_release_date_after_creation_and_before_report() {
        let (cfg, rows) = rows();
        for r in &rows {
            assert!(r.created <= cfg.report_date);
            match (r.released, r.release_date) {
                (true, Some(d)) => assert!(d >= r.created && d <= cfg.report_date),
                (false, None) => {}
                other => panic!("inconsistent release state {other:?}"),
            }
        }
    }

    #[test]
    fn line_attributes_are_constant_per_line() {
        let (_, rows) = rows();
        let mut seen: HashMap<&str, (&Option<String>, &Option<f64>, &Option<String>)> =
            HashMap::new();
        for r in &rows {
            let attrs = (&r.model_size, &r.ldt_size, &r.stress_calc);
            let first = seen.entry(r.line_id.as_str()).or_insert(attrs);
            assert_eq!(*first, attrs);
        }
    }

    #[test]
    fn writes_a_workbook() {
        let (cfg, rows) = rows();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds_synth.xlsx");
        write_workbook(&rows, &cfg, &path).unwrap();
        assert!(std::fs::metadata(&path).unwrap().len() > 10_000);
    }
}
```

- [ ] **Step 5: Run the tests and watch them fail**

Run: `cargo test -p hx-synth`
Expected: the `rng` tests pass; the `lib` tests fail to compile with `cannot find type SynthConfig`.

- [ ] **Step 6: Implement the generator**

Insert between `pub mod rng;` and the `tests` module in `crates/synth/src/lib.rs`:

```rust
use std::path::Path;

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, Timelike};
use rust_xlsxwriter::{ExcelDateTime, Format, Workbook, XlsxError};

use rng::Rng;

pub const HEADERS: [&str; 14] = [
    "id", "line_id", "name", "role", "hold_remark", "hold_type", "discipline", "date", "released",
    "release_remark", "release_date", "model_size", "ldt_size", "stress_calc",
];

const ROLES: [&str; 5] =
    ["Designer", "Stress Analysis", "Stress Analysis QC", "Design QC", "Leader"];

const HOLD_TYPES: [&str; 8] = [
    "MISC.", "PIPING VENDOR DATA", "EQUIPMENT VENDOR DATA", "P&ID", "INSTRUMENT VENDOR DATA",
    "LINE SIZE", "PMC UPDATE", "3D MODEL CATALOG",
];

const DISCIPLINES: [&str; 12] = [
    "Civil", "Piping", "Process", "I&Cs", "PV", "S&LP", "Electrical", "Machinery", "Material",
    "PM", "Procurement", "Customer",
];

const SERVICES: [&str; 8] = ["FW", "VT", "SM", "LS", "IA", "PA", "HC", "FL"];
const SIZES: [f64; 8] = [1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 10.0, 12.0];

#[derive(Debug, Clone, PartialEq)]
pub struct SynthConfig {
    pub seed: u64,
    pub lines: usize,
    pub holds: usize,
    pub released_ratio: f64,
    pub report_date: NaiveDateTime,
    pub project_no: String,
}

impl SynthConfig {
    pub fn new(seed: u64, lines: usize, holds: usize) -> SynthConfig {
        SynthConfig {
            seed,
            lines,
            holds,
            released_ratio: 0.45,
            report_date: NaiveDate::from_ymd_opt(2026, 9, 29)
                .and_then(|d| d.and_hms_opt(13, 16, 0))
                .expect("constant date is valid"),
            project_no: "0000-TEST".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SynthRow {
    pub id: i64,
    pub line_id: String,
    pub name: String,
    pub role: String,
    /// Raw, as PlantIM would export it: may hold line breaks and `_x000D_`.
    pub remark: String,
    pub hold_type: String,
    pub discipline: Option<String>,
    pub created: NaiveDateTime,
    pub released: bool,
    pub release_date: Option<NaiveDateTime>,
    pub model_size: Option<String>,
    pub ldt_size: Option<f64>,
    pub stress_calc: Option<String>,
}

struct Line {
    id: String,
    unit: usize,
    model_size: Option<String>,
    ldt_size: Option<f64>,
    stress_calc: Option<String>,
}

fn whole(n: f64) -> String {
    format!("{}", n as i64)
}

fn make_line(rng: &mut Rng, index: usize) -> Line {
    let unit = 500 + rng.below(90);
    let id = format!(
        "{:02}{}{:02}-{}-{:04}-{}-{:03}",
        30 + rng.below(60),
        rng.pick(&['A', 'B', 'R']),
        1 + rng.below(10),
        unit,
        index,
        rng.pick(&SERVICES),
        1 + rng.below(3),
    );
    let size = *rng.pick(&SIZES);
    let model_size = if rng.chance(0.02) { None } else { Some(whole(size)) };
    let ldt_size = if rng.chance(0.09) {
        None
    } else if rng.chance(0.04) {
        Some(0.0)
    } else if rng.chance(0.2) {
        Some(*rng.pick(&SIZES))
    } else {
        Some(size)
    };
    let stress_calc = match rng.below(10) {
        0..=3 => None,
        4 => Some("NR".to_string()),
        _ => Some(format!("{}-001-FC-{:03}", unit, 1 + rng.below(40))),
    };
    Line { id, unit, model_size, ldt_size, stress_calc }
}

fn make_remark(rng: &mut Rng, unit: usize) -> String {
    if rng.chance(0.002) {
        return String::new();
    }
    match rng.below(14) {
        0 => format!("Hold Pending Civil Drawings for {unit}-PR-{:03}", 100 * (1 + rng.below(5))),
        1 => format!("Pending {unit}-STR-{:03} issuance", 1 + rng.below(9)),
        2 => "Hold Pending Xodus FIV/AIV Report".to_string(),
        3 => "FIV/AIV REPORT\n".to_string(),
        4 => "Isometric by vendor".to_string(),
        5 => format!("control valve({unit}-PV-{:04}A)", 3000 + rng.below(80)),
        6 => format!(
            "Hold Pending Piping Platform Supports for {unit}-V-{:03}",
            100 + rng.below(400)
        ),
        7 => format!("Tie-in T{:03}-R{:03} not confirmed", rng.below(1000), rng.below(1000)),
        8 => "Pending Issuing SMR for Cold Shoes for uninsulated lines".to_string(),
        9 => "P&ID update_x000D_\nrev 2 pending".to_string(),
        10 => "Vendor Catalogue".to_string(),
        11 => format!("Hold pending IA layout for Unit {unit}"),
        12 => "LINE SIZE to be confirmed by process".to_string(),
        _ => "sleepers elevation".to_string(),
    }
}

pub fn generate(cfg: &SynthConfig) -> Vec<SynthRow> {
    let mut rng = Rng::new(cfg.seed);
    let lines: Vec<Line> = (0..cfg.lines.max(1)).map(|i| make_line(&mut rng, i)).collect();
    let names: Vec<String> = (1..=30).map(|n| format!("Engineer {n:02}")).collect();

    let mut rows = Vec::with_capacity(cfg.holds);
    let mut bulk: Option<(NaiveDateTime, usize)> = None;

    for index in 0..cfg.holds {
        let created = match bulk {
            Some((when, left)) if left > 0 => {
                bulk = Some((when, left - 1));
                when
            }
            _ => {
                let when = cfg.report_date
                    - Duration::days(rng.below(330) as i64)
                    - Duration::seconds(rng.below(86_400) as i64)
                    - Duration::milliseconds(rng.below(1000) as i64);
                bulk = if rng.chance(0.1) { Some((when, 4 + rng.below(36))) } else { None };
                when
            }
        };

        let line = &lines[rng.below(lines.len())];
        let open_seconds = (cfg.report_date - created).num_seconds();
        let released = rng.chance(cfg.released_ratio) && open_seconds > 3600;
        let release_date = if released {
            Some(created + Duration::seconds(1 + rng.below((open_seconds - 1) as usize) as i64))
        } else {
            None
        };

        rows.push(SynthRow {
            id: 70_000 + index as i64,
            line_id: line.id.clone(),
            name: rng.pick(&names).clone(),
            role: rng.pick(&ROLES).to_string(),
            remark: make_remark(&mut rng, line.unit),
            hold_type: rng.pick(&HOLD_TYPES).to_string(),
            discipline: if rng.chance(0.12) {
                None
            } else {
                Some(rng.pick(&DISCIPLINES).to_string())
            },
            created,
            released,
            release_date,
            model_size: line.model_size.clone(),
            ldt_size: line.ldt_size,
            stress_calc: line.stress_calc.clone(),
        });
    }
    rows
}

fn excel_datetime(dt: NaiveDateTime) -> Result<ExcelDateTime, XlsxError> {
    let seconds = dt.second() as f64 + dt.nanosecond() as f64 / 1e9;
    ExcelDateTime::from_ymd(dt.year() as u16, dt.month() as u8, dt.day() as u8)?.and_hms(
        dt.hour() as u16,
        dt.minute() as u8,
        seconds,
    )
}

/// Writes an `info` sheet and a `data` sheet laid out like the PlantIM export.
pub fn write_workbook(rows: &[SynthRow], cfg: &SynthConfig, path: &Path) -> Result<(), XlsxError> {
    let mut workbook = Workbook::new();

    let info = workbook.add_worksheet();
    info.set_name("info")?;
    let pairs = [
        ("Generated From", "hx-synth synthetic generator".to_string()),
        ("Project No.", cfg.project_no.clone()),
        ("Report Name", "holds".to_string()),
        ("Report Date", cfg.report_date.format("%m/%d/%Y %I:%M %p").to_string()),
        ("Report Filter Params", "{}".to_string()),
    ];
    for (row, (key, value)) in pairs.iter().enumerate() {
        info.write_string(row as u32, 0, *key)?;
        info.write_string(row as u32, 1, value.as_str())?;
    }

    let data = workbook.add_worksheet();
    data.set_name("data")?;
    let timestamp = Format::new().set_num_format("yyyy-mm-dd hh:mm:ss.000");
    for (column, header) in HEADERS.iter().enumerate() {
        data.write_string(0, column as u16, *header)?;
    }
    for (index, r) in rows.iter().enumerate() {
        let row = (index + 1) as u32;
        data.write_number(row, 0, r.id as f64)?;
        data.write_string(row, 1, &r.line_id)?;
        data.write_string(row, 2, &r.name)?;
        data.write_string(row, 3, &r.role)?;
        if !r.remark.is_empty() {
            data.write_string(row, 4, &r.remark)?;
        }
        data.write_string(row, 5, &r.hold_type)?;
        if let Some(discipline) = &r.discipline {
            data.write_string(row, 6, discipline)?;
        }
        data.write_datetime_with_format(row, 7, &excel_datetime(r.created)?, &timestamp)?;
        data.write_boolean(row, 8, r.released)?;
        if let Some(released_at) = r.release_date {
            data.write_datetime_with_format(row, 10, &excel_datetime(released_at)?, &timestamp)?;
        }
        if let Some(size) = &r.model_size {
            data.write_string(row, 11, size)?;
        }
        if let Some(size) = r.ldt_size {
            data.write_number(row, 12, size)?;
        }
        if let Some(calc) = &r.stress_calc {
            data.write_string(row, 13, calc)?;
        }
    }

    workbook.save(path)
}
```

Note on integer types: `ExcelDateTime::from_ymd` and `and_hms` take small unsigned integers. If the compiler reports a different width than the casts above, change the cast to the type it names; the values always fit.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cargo test -p hx-synth`
Expected: `test result: ok. 10 passed`.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml Cargo.lock crates/synth
git commit -m "feat(synth): add seeded generator of PlantIM-shaped workbooks"
```

---

### Task 7: Workbook reader and `load_file`

**Files:**
- Create: `crates/core/src/reader.rs`, `crates/core/src/load.rs`
- Modify: `crates/core/src/lib.rs`, `crates/core/Cargo.toml`

**Interfaces:**
- Consumes: `table::{Cell, RawTable}`, `mapping::ColumnMap`, `import::{parse_table, Parsed}`, `snapshot_date::snapshot_date`, `error::ImportError`, and `hx_synth` in tests.
- Produces:
  - `reader::WorkbookData { info: BTreeMap<String, String>, sheet_name: String, table: RawTable }`.
  - `reader::read_workbook(&Path) -> Result<WorkbookData, ImportError>`.
  - `load::Loaded { info: BTreeMap<String, String>, sheet_name: String, map: ColumnMap, parsed: Parsed, snapshot: Option<NaiveDateTime> }`.
  - `load::load_file(&Path) -> Result<Loaded, ImportError>`.

Sheet choice (spec 6.1): the sheet named `data`; failing that, the first sheet whose headers map the required columns; failing that, the first sheet that has any rows, so the mapping step has something to show. The `info` sheet is never chosen as data.

- [ ] **Step 1: Add the test dependency**

In `crates/core/Cargo.toml`, replace the `[dev-dependencies]` section with:

```toml
[dev-dependencies]
hx-synth = { path = "../synth" }
tempfile.workspace = true
```

- [ ] **Step 2: Write the failing tests**

`crates/core/src/reader.rs`:

```rust
//! Reads `.xlsx`, `.xls`, and `.csv` files into a raw table.

#[cfg(test)]
mod tests {
    use super::*;
    use hx_synth::{generate, write_workbook, SynthConfig};

    #[test]
    fn reads_info_and_data_sheets_of_a_plantim_workbook() {
        let cfg = SynthConfig::new(3, 40, 150);
        let rows = generate(&cfg);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.xlsx");
        write_workbook(&rows, &cfg, &path).unwrap();

        let wb = read_workbook(&path).unwrap();
        assert_eq!(wb.sheet_name, "data");
        assert_eq!(wb.info.get("Project No.").map(String::as_str), Some("0000-TEST"));
        assert_eq!(wb.info.get("Report Date").map(String::as_str), Some("09/29/2026 01:16 PM"));
        assert_eq!(wb.table.headers, hx_synth::HEADERS);
        assert_eq!(wb.table.rows.len(), rows.len());
        assert!(matches!(wb.table.rows[0][7], Cell::DateTime(_)), "date column is typed");
        assert!(matches!(wb.table.rows[0][8], Cell::Bool(_)), "released column is typed");
    }

    #[test]
    fn reads_csv_with_byte_order_mark() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.csv");
        std::fs::write(
            &path,
            "\u{feff}line_id,hold_remark,hold_type\nL-1,\"FIV/AIV, report\",MISC.\nL-2,,P&ID\n",
        )
        .unwrap();

        let wb = read_workbook(&path).unwrap();
        assert_eq!(wb.table.headers, vec!["line_id", "hold_remark", "hold_type"]);
        assert_eq!(wb.table.rows.len(), 2);
        assert_eq!(wb.table.rows[0][1], Cell::Text("FIV/AIV, report".to_string()));
        assert_eq!(wb.table.rows[1][1], Cell::Empty);
        assert!(wb.info.is_empty());
    }

    #[test]
    fn missing_file_is_unreadable() {
        let err = read_workbook(std::path::Path::new("/no/such/holds.xlsx")).unwrap_err();
        assert!(matches!(err, ImportError::Unreadable { .. }));
    }

    #[test]
    fn text_file_named_xlsx_is_unreadable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fake.xlsx");
        std::fs::write(&path, "this is not a workbook").unwrap();
        let err = read_workbook(&path).unwrap_err();
        assert!(matches!(err, ImportError::Unreadable { .. }));
    }
}
```

`crates/core/src/load.rs`:

```rust
//! One call from a file path to parsed holds.

#[cfg(test)]
mod tests {
    use super::*;
    use hx_synth::{generate, write_workbook, SynthConfig};

    #[test]
    fn loads_a_plantim_workbook_end_to_end() {
        let cfg = SynthConfig::new(5, 60, 400);
        let rows = generate(&cfg);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.xlsx");
        write_workbook(&rows, &cfg, &path).unwrap();

        let loaded = load_file(&path).unwrap();
        assert_eq!(loaded.snapshot, Some(cfg.report_date));
        assert!(!loaded.parsed.limited);
        assert!(loaded.parsed.skipped.is_empty());
        assert_eq!(loaded.parsed.holds.len(), rows.len());

        let open = loaded.parsed.holds.iter().filter(|h| !h.released).count();
        assert_eq!(open, rows.iter().filter(|r| !r.released).count());

        for (hold, row) in loaded.parsed.holds.iter().zip(&rows) {
            assert_eq!(hold.source_id, Some(row.id));
            assert_eq!(hold.line_id, row.line_id);
            let drift = (hold.created.unwrap() - row.created).num_seconds().abs();
            assert!(drift <= 1, "timestamps survive the round trip");
            assert_eq!(hold.release_date.is_some(), row.released);
        }
    }

    #[test]
    fn csv_without_id_loads_as_limited() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds_07-Oct.csv");
        std::fs::write(
            &path,
            "line_id,hold_remark,hold_type,date\nL-1,x,MISC.,2026-10-01 09:00:00\n",
        )
        .unwrap();

        let loaded = load_file(&path).unwrap();
        assert!(loaded.parsed.limited);
        assert_eq!(loaded.parsed.holds.len(), 1);
        assert_eq!(
            loaded.snapshot.map(|s| s.to_string()),
            Some("2026-10-07 00:00:00".to_string())
        );
    }

    #[test]
    fn unknown_layout_reports_missing_columns() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("other.csv");
        std::fs::write(&path, "Line,Why\nL-1,x\n").unwrap();
        let err = load_file(&path).unwrap_err();
        assert_eq!(
            err,
            ImportError::MissingColumns(vec!["hold_remark".to_string(), "hold_type".to_string()])
        );
    }
}
```

- [ ] **Step 3: Run the tests and watch them fail**

Add `pub mod load;` and `pub mod reader;` to `crates/core/src/lib.rs`.

Run: `cargo test -p hx-core -- reader load`
Expected: compile error, `cannot find function read_workbook`.

- [ ] **Step 4: Implement the reader**

Insert above the `tests` module in `crates/core/src/reader.rs`:

```rust
use std::collections::BTreeMap;
use std::path::Path;

use calamine::{open_workbook_auto, Data, Range, Reader};

use crate::error::ImportError;
use crate::mapping::ColumnMap;
use crate::table::{Cell, RawTable};

#[derive(Debug, Clone, PartialEq)]
pub struct WorkbookData {
    /// Key and value pairs of the `info` sheet. Empty when there is none.
    pub info: BTreeMap<String, String>,
    pub sheet_name: String,
    pub table: RawTable,
}

fn unreadable(path: &Path, detail: impl ToString) -> ImportError {
    ImportError::Unreadable { path: path.display().to_string(), detail: detail.to_string() }
}

fn to_cell(data: &Data) -> Cell {
    match data {
        Data::Empty | Data::Error(_) => Cell::Empty,
        Data::String(s) if s.trim().is_empty() => Cell::Empty,
        Data::String(s) => Cell::Text(s.clone()),
        Data::Int(i) => Cell::Number(*i as f64),
        Data::Float(f) => Cell::Number(*f),
        Data::Bool(b) => Cell::Bool(*b),
        Data::DateTime(_) => data.as_datetime().map(Cell::DateTime).unwrap_or(Cell::Empty),
        other => Cell::Text(other.to_string()),
    }
}

fn table_from_range(range: &Range<Data>) -> RawTable {
    let mut rows = range.rows();
    let headers = match rows.next() {
        Some(first) => first.iter().map(|c| to_cell(c).as_text().trim().to_string()).collect(),
        None => Vec::new(),
    };
    RawTable { headers, rows: rows.map(|row| row.iter().map(to_cell).collect()).collect() }
}

fn is_named(name: &str, wanted: &str) -> bool {
    name.trim().eq_ignore_ascii_case(wanted)
}

fn read_csv(path: &Path) -> Result<WorkbookData, ImportError> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_path(path)
        .map_err(|e| unreadable(path, e))?;

    let mut rows: Vec<Vec<Cell>> = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|e| unreadable(path, e))?;
        rows.push(
            record
                .iter()
                .map(|value| {
                    if value.trim().is_empty() {
                        Cell::Empty
                    } else {
                        Cell::Text(value.to_string())
                    }
                })
                .collect(),
        );
    }
    if rows.is_empty() {
        return Err(ImportError::NoDataSheet);
    }
    let headers = rows
        .remove(0)
        .iter()
        .map(|c| c.as_text().trim_start_matches('\u{feff}').trim().to_string())
        .collect();

    Ok(WorkbookData {
        info: BTreeMap::new(),
        sheet_name: "csv".to_string(),
        table: RawTable { headers, rows },
    })
}

pub fn read_workbook(path: &Path) -> Result<WorkbookData, ImportError> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension == "csv" {
        return read_csv(path);
    }

    let mut workbook = open_workbook_auto(path).map_err(|e| unreadable(path, e))?;
    let names: Vec<String> = workbook.sheet_names().to_vec();

    let mut info = BTreeMap::new();
    if let Some(name) = names.iter().find(|n| is_named(n, "info")) {
        if let Ok(range) = workbook.worksheet_range(name) {
            for row in range.rows() {
                let key = row.first().map(|c| to_cell(c).as_text()).unwrap_or_default();
                let value = row.get(1).map(|c| to_cell(c).as_text()).unwrap_or_default();
                if !key.trim().is_empty() {
                    info.insert(key.trim().to_string(), value.trim().to_string());
                }
            }
        }
    }

    let mut tables: Vec<(String, RawTable)> = Vec::new();
    for name in names.iter().filter(|n| !is_named(n, "info")) {
        if let Ok(range) = workbook.worksheet_range(name) {
            let table = table_from_range(&range);
            if !table.headers.is_empty() {
                tables.push((name.clone(), table));
            }
        }
    }

    let chosen = tables
        .iter()
        .position(|(name, _)| is_named(name, "data"))
        .or_else(|| {
            tables
                .iter()
                .position(|(_, t)| ColumnMap::auto(&t.headers).missing_required().is_empty())
        })
        .or_else(|| tables.iter().position(|(_, t)| !t.rows.is_empty()));

    match chosen {
        Some(index) => {
            let (sheet_name, table) = tables.swap_remove(index);
            Ok(WorkbookData { info, sheet_name, table })
        }
        None => Err(ImportError::NoDataSheet),
    }
}
```

Note on calamine: `as_datetime` is an inherent method of `Data` in 0.36. If the compiler reports that it is not found, add `DataType` to the `calamine` import; in some versions it is a trait method.

- [ ] **Step 5: Implement `load_file`**

Insert above the `tests` module in `crates/core/src/load.rs`:

```rust
use std::collections::BTreeMap;
use std::path::Path;

use chrono::{DateTime, Local, NaiveDateTime};

use crate::error::ImportError;
use crate::import::{parse_table, Parsed};
use crate::mapping::ColumnMap;
use crate::reader::read_workbook;
use crate::snapshot_date::snapshot_date;

#[derive(Debug, Clone, PartialEq)]
pub struct Loaded {
    pub info: BTreeMap<String, String>,
    pub sheet_name: String,
    pub map: ColumnMap,
    pub parsed: Parsed,
    /// `None` when neither the file nor its name nor its timestamps give a date.
    pub snapshot: Option<NaiveDateTime>,
}

/// Reads a file with the automatic column mapping.
pub fn load_file(path: &Path) -> Result<Loaded, ImportError> {
    let workbook = read_workbook(path)?;
    let map = ColumnMap::auto(&workbook.table.headers);
    let parsed = parse_table(&workbook.table, &map)?;

    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    let modified = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| DateTime::<Local>::from(t).naive_local());
    let snapshot = snapshot_date(&workbook.info, file_name, &parsed.holds, modified);

    Ok(Loaded {
        info: workbook.info,
        sheet_name: workbook.sheet_name,
        map,
        parsed,
        snapshot,
    })
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cargo test -p hx-core -- reader load`
Expected: `test result: ok. 7 passed`.

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock crates/core
git commit -m "feat(core): read xlsx and csv files and load them end to end"
```

---

### Task 8: Dataset and filters

**Files:**
- Create: `crates/core/src/dataset.rs`, `crates/core/src/filter.rs`, `crates/core/src/testkit.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `model::Hold`, `rules::{Blocker, RuleSet}`, `normalize::fold_key`, `table::format_number`.
- Produces:
  - `dataset::Row { hold: Hold, blocker: Blocker, remark_key: String, age_days: Option<i64> }` with `blocker_key() -> String` and `size_mismatch() -> bool`.
  - `dataset::Dataset { snapshot: NaiveDateTime, rows: Vec<Row> }` with `Dataset::build(Vec<Hold>, &RuleSet, NaiveDateTime) -> Dataset`.
  - `filter::Dim { Discipline, HoldType, Role, Name, BlockerType, Blocker, Remark, LineId, ModelSize, StressCalc }` with `value(self, &Row) -> String`.
  - `filter::Status { Open, Released, All }` (default `Open`).
  - `filter::FieldFilter { values: Vec<String>, negate: bool }`.
  - `filter::FilterSpec { status, fields: BTreeMap<Dim, FieldFilter>, text: String, min_age_days: Option<i64>, max_age_days: Option<i64>, size_mismatch: Option<bool> }` with `matches(&self, &Row) -> bool` and `Default`.
  - `testkit::{at(&str) -> NaiveDateTime, hold(line, discipline, hold_type, remark, created_days_ago) -> Hold, sample() -> Dataset}` for tests in Tasks 8 to 10.

Age (spec 11.3): for an open hold, snapshot date minus creation date; for a released hold, release date minus creation date; in whole days, never negative.

- [ ] **Step 1: Add the shared fixture**

`crates/core/src/testkit.rs`:

```rust
//! Fixtures shared by unit tests. Compiled for tests only.

use chrono::{Duration, NaiveDateTime};

use crate::dataset::Dataset;
use crate::model::Hold;
use crate::rules::RuleSet;

pub fn at(text: &str) -> NaiveDateTime {
    NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S").unwrap()
}

pub fn snapshot() -> NaiveDateTime {
    at("2026-10-01 00:00:00")
}

pub fn hold(line: &str, discipline: &str, hold_type: &str, remark: &str, days_ago: i64) -> Hold {
    Hold {
        line_id: line.to_string(),
        name: "Engineer 01".to_string(),
        role: "Designer".to_string(),
        remark: remark.to_string(),
        hold_type: hold_type.to_string(),
        discipline: discipline.to_string(),
        created: Some(snapshot() - Duration::days(days_ago)),
        ..Default::default()
    }
}

/// Five holds on four lines. One hold (on L3) is released.
///
/// | line | discipline  | type  | remark             | state               | age |
/// |------|-------------|-------|--------------------|---------------------|-----|
/// | L1   | Civil       | MISC. | Pending 538-PR-100 | open                | 10  |
/// | L1   | Piping      | P&ID  | P&ID update        | open                | 40  |
/// | L2   | Civil       | MISC. | Pending 538-PR-100 | open                | 5   |
/// | L3   | Process     | P&ID  | P&ID update        | released after 30 d | 30  |
/// | L4   | Unspecified | MISC. | Vendor Catalogue   | open, sizes 4 and 6 | 1   |
pub fn sample() -> Dataset {
    let mut released = hold("L3", "Process", "P&ID", "P&ID update", 50);
    released.released = true;
    released.release_date = Some(snapshot() - Duration::days(20));

    let mut mismatched = hold("L4", "Unspecified", "MISC.", "Vendor Catalogue", 1);
    mismatched.model_size = Some(4.0);
    mismatched.ldt_size = Some(6.0);
    mismatched.stress_calc = "NR".to_string();

    Dataset::build(
        vec![
            hold("L1", "Civil", "MISC.", "Pending 538-PR-100", 10),
            hold("L1", "Piping", "P&ID", "P&ID update", 40),
            hold("L2", "Civil", "MISC.", "Pending 538-PR-100", 5),
            released,
            mismatched,
        ],
        &RuleSet::builtin(),
        snapshot(),
    )
}
```

- [ ] **Step 2: Write the failing tests**

`crates/core/src/dataset.rs`:

```rust
//! Holds of one snapshot with their derived values.

#[cfg(test)]
mod tests {
    use crate::testkit::sample;

    #[test]
    fn derives_blocker_key_and_remark_key() {
        let ds = sample();
        assert_eq!(ds.rows[0].blocker.kind, "PR");
        assert_eq!(ds.rows[0].blocker_key(), "Civil|538-PR-100");
        assert_eq!(ds.rows[1].blocker_key(), "Piping|P&ID");
        assert_eq!(ds.rows[4].blocker_key(), "Unspecified|VENDOR");
        assert_eq!(ds.rows[0].remark_key, "PENDING 538-PR-100");
    }

    #[test]
    fn age_runs_to_snapshot_for_open_and_to_release_for_released() {
        let ds = sample();
        let ages: Vec<Option<i64>> = ds.rows.iter().map(|r| r.age_days).collect();
        assert_eq!(ages, vec![Some(10), Some(40), Some(5), Some(30), Some(1)]);
    }

    #[test]
    fn age_is_unknown_without_a_creation_date() {
        let mut ds = sample();
        ds.rows[0].hold.created = None;
        let rebuilt = super::Dataset::build(
            ds.rows.iter().map(|r| r.hold.clone()).collect(),
            &crate::rules::RuleSet::builtin(),
            ds.snapshot,
        );
        assert_eq!(rebuilt.rows[0].age_days, None);
    }

    #[test]
    fn size_mismatch_needs_both_sizes() {
        let ds = sample();
        assert!(ds.rows[4].size_mismatch());
        assert!(!ds.rows[0].size_mismatch());
    }
}
```

`crates/core/src/filter.rs`:

```rust
//! Which holds a view shows.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::sample;

    fn count(spec: &FilterSpec) -> usize {
        sample().rows.iter().filter(|r| spec.matches(r)).count()
    }

    fn field(dim: Dim, values: &[&str], negate: bool) -> FilterSpec {
        let mut spec = FilterSpec::default();
        spec.fields.insert(
            dim,
            FieldFilter { values: values.iter().map(|s| s.to_string()).collect(), negate },
        );
        spec
    }

    #[test]
    fn default_shows_open_holds() {
        assert_eq!(count(&FilterSpec::default()), 4);
    }

    #[test]
    fn status_released_and_all() {
        assert_eq!(count(&FilterSpec { status: Status::Released, ..Default::default() }), 1);
        assert_eq!(count(&FilterSpec { status: Status::All, ..Default::default() }), 5);
    }

    #[test]
    fn values_in_one_field_combine_with_or() {
        assert_eq!(count(&field(Dim::Discipline, &["Civil"], false)), 2);
        assert_eq!(count(&field(Dim::Discipline, &["Civil", "Piping"], false)), 3);
    }

    #[test]
    fn is_not_excludes_values() {
        assert_eq!(count(&field(Dim::Discipline, &["Civil"], true)), 2);
    }

    #[test]
    fn different_fields_combine_with_and() {
        let mut spec = field(Dim::Discipline, &["Civil", "Piping"], false);
        spec.fields.insert(
            Dim::HoldType,
            FieldFilter { values: vec!["P&ID".to_string()], negate: false },
        );
        assert_eq!(count(&spec), 1);
    }

    #[test]
    fn empty_value_list_does_not_filter() {
        assert_eq!(count(&field(Dim::Discipline, &[], false)), 4);
    }

    #[test]
    fn blocker_and_blocker_type_dimensions() {
        assert_eq!(count(&field(Dim::BlockerType, &["PR"], false)), 2);
        assert_eq!(count(&field(Dim::Blocker, &["Piping|P&ID"], false)), 1);
    }

    #[test]
    fn text_matches_several_fields_ignoring_case() {
        assert_eq!(count(&FilterSpec { text: "vendor".into(), ..Default::default() }), 1);
        assert_eq!(count(&FilterSpec { text: "l1".into(), ..Default::default() }), 2);
        assert_eq!(count(&FilterSpec { text: "538-pr".into(), ..Default::default() }), 2);
        assert_eq!(count(&FilterSpec { text: "  ".into(), ..Default::default() }), 4);
    }

    #[test]
    fn age_range() {
        assert_eq!(count(&FilterSpec { min_age_days: Some(10), ..Default::default() }), 2);
        assert_eq!(count(&FilterSpec { max_age_days: Some(5), ..Default::default() }), 2);
        assert_eq!(
            count(&FilterSpec {
                min_age_days: Some(5),
                max_age_days: Some(10),
                ..Default::default()
            }),
            2
        );
    }

    #[test]
    fn size_mismatch_flag() {
        assert_eq!(count(&FilterSpec { size_mismatch: Some(true), ..Default::default() }), 1);
        assert_eq!(count(&FilterSpec { size_mismatch: Some(false), ..Default::default() }), 3);
    }
}
```

- [ ] **Step 3: Run the tests and watch them fail**

Replace `crates/core/src/lib.rs` with:

```rust
pub mod dataset;
pub mod error;
pub mod filter;
pub mod import;
pub mod load;
pub mod mapping;
pub mod model;
pub mod normalize;
pub mod reader;
pub mod rules;
pub mod snapshot_date;
pub mod table;

#[cfg(test)]
pub(crate) mod testkit;
```

Run: `cargo test -p hx-core -- dataset filter`
Expected: compile error, `cannot find type Dataset`.

- [ ] **Step 4: Implement the dataset**

Insert above the `tests` module in `crates/core/src/dataset.rs`:

```rust
use chrono::NaiveDateTime;
use serde::Serialize;

use crate::model::Hold;
use crate::normalize::fold_key;
use crate::rules::{Blocker, RuleSet};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Row {
    pub hold: Hold,
    pub blocker: Blocker,
    /// Case-folded remark, for grouping.
    pub remark_key: String,
    /// Open: days from creation to the snapshot. Released: days from creation to release.
    pub age_days: Option<i64>,
}

impl Row {
    /// Blocker identity: owning discipline plus item.
    pub fn blocker_key(&self) -> String {
        format!("{}|{}", self.hold.discipline, self.blocker.item)
    }

    pub fn size_mismatch(&self) -> bool {
        matches!((self.hold.model_size, self.hold.ldt_size), (Some(a), Some(b)) if a != b)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Dataset {
    pub snapshot: NaiveDateTime,
    /// In file order. Several queries depend on first-appearance order.
    pub rows: Vec<Row>,
}

impl Dataset {
    pub fn build(holds: Vec<Hold>, rules: &RuleSet, snapshot: NaiveDateTime) -> Dataset {
        let rows = holds
            .into_iter()
            .map(|hold| {
                let end = if hold.released { hold.release_date } else { Some(snapshot) };
                let age_days = match (hold.created, end) {
                    (Some(created), Some(end)) => Some((end - created).num_days().max(0)),
                    _ => None,
                };
                Row {
                    blocker: rules.classify(&hold.remark),
                    remark_key: fold_key(&hold.remark),
                    age_days,
                    hold,
                }
            })
            .collect();
        Dataset { snapshot, rows }
    }
}
```

- [ ] **Step 5: Implement filters**

Insert above the `tests` module in `crates/core/src/filter.rs`:

```rust
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::dataset::Row;
use crate::table::format_number;

/// A dimension holds can be grouped and filtered by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Dim {
    Discipline,
    HoldType,
    Role,
    Name,
    BlockerType,
    Blocker,
    Remark,
    LineId,
    ModelSize,
    StressCalc,
}

impl Dim {
    pub fn value(self, row: &Row) -> String {
        match self {
            Dim::Discipline => row.hold.discipline.clone(),
            Dim::HoldType => row.hold.hold_type.clone(),
            Dim::Role => row.hold.role.clone(),
            Dim::Name => row.hold.name.clone(),
            Dim::BlockerType => row.blocker.kind.clone(),
            Dim::Blocker => row.blocker_key(),
            Dim::Remark => row.remark_key.clone(),
            Dim::LineId => row.hold.line_id.clone(),
            Dim::ModelSize => row.hold.model_size.map(format_number).unwrap_or_default(),
            Dim::StressCalc => row.hold.stress_calc.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum Status {
    #[default]
    Open,
    Released,
    All,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct FieldFilter {
    /// Values combine with OR. An empty list does not filter.
    pub values: Vec<String>,
    /// "Is not": keep rows whose value is not in the list.
    pub negate: bool,
}

/// Fields combine with AND.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct FilterSpec {
    pub status: Status,
    pub fields: BTreeMap<Dim, FieldFilter>,
    /// Case-insensitive substring of line, remark, name, hold type, discipline, or blocker item.
    pub text: String,
    pub min_age_days: Option<i64>,
    pub max_age_days: Option<i64>,
    pub size_mismatch: Option<bool>,
}

impl FilterSpec {
    pub fn matches(&self, row: &Row) -> bool {
        match self.status {
            Status::Open if row.hold.released => return false,
            Status::Released if !row.hold.released => return false,
            _ => {}
        }

        for (dim, filter) in &self.fields {
            if filter.values.is_empty() {
                continue;
            }
            let value = dim.value(row);
            let listed = filter.values.contains(&value);
            if listed == filter.negate {
                return false;
            }
        }

        if let Some(min) = self.min_age_days {
            if row.age_days.is_none_or(|age| age < min) {
                return false;
            }
        }
        if let Some(max) = self.max_age_days {
            if row.age_days.is_none_or(|age| age > max) {
                return false;
            }
        }
        if let Some(wanted) = self.size_mismatch {
            if row.size_mismatch() != wanted {
                return false;
            }
        }

        let needle = self.text.trim().to_lowercase();
        if !needle.is_empty() {
            let haystacks = [
                &row.hold.line_id,
                &row.hold.remark,
                &row.hold.name,
                &row.hold.hold_type,
                &row.hold.discipline,
                &row.blocker.item,
            ];
            if !haystacks.iter().any(|h| h.to_lowercase().contains(&needle)) {
                return false;
            }
        }

        true
    }
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cargo test -p hx-core -- dataset filter`
Expected: `test result: ok. 14 passed`.

- [ ] **Step 7: Commit**

```bash
git add crates/core
git commit -m "feat(core): add dataset with derived blockers and ages, and filters"
```

---

### Task 9: Queries

**Files:**
- Create: `crates/core/src/query.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `dataset::{Dataset, Row}`, `filter::{Dim, FilterSpec}`.
- Produces:
  - `query::Summary { holds: usize, lines: usize, single_hold_lines: usize, median_age_days: Option<i64> }`, `query::summary(&Dataset, &FilterSpec) -> Summary`.
  - `query::Group { key: String, holds: usize, lines: usize }`, `query::group_by(&Dataset, &FilterSpec, Dim) -> Vec<Group>` sorted by holds descending, then key ascending.
  - `query::Matrix { rows: Vec<String>, cols: Vec<String>, cells: Vec<Vec<usize>> }`, `query::matrix(&Dataset, &FilterSpec, row_dim: Dim, col_dim: Dim) -> Matrix`; `cells[r][c]` counts holds.
  - `query::LineRow { line_id, holds: usize, disciplines: Vec<String>, hold_types: Vec<String>, blockers: usize, oldest_age_days: Option<i64>, model_size: Option<f64>, ldt_size: Option<f64>, stress_calc: String, size_mismatch: bool }`.
  - `query::LineSort { HoldsDesc, Easiest, OldestFirst }`, `query::lines(&Dataset, &FilterSpec, LineSort) -> Vec<LineRow>`.

Rules that parity depends on:
- `LineRow.disciplines` and `hold_types` list values in order of first appearance.
- `Easiest` sorts by number of disciplines, then number of holds, then the first-appearing discipline, then line ID. This is the HTML tool's order.
- The median is the lower median: element `(n - 1) / 2` of the sorted ages.

- [ ] **Step 1: Write the failing tests**

`crates/core/src/query.rs`:

```rust
//! Aggregations behind Overview, Breakdown, and Lines.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filter::Status;
    use crate::testkit::sample;

    fn open() -> FilterSpec {
        FilterSpec::default()
    }

    fn keys(groups: &[Group]) -> Vec<(&str, usize, usize)> {
        groups.iter().map(|g| (g.key.as_str(), g.holds, g.lines)).collect()
    }

    #[test]
    fn summary_of_open_holds() {
        let s = summary(&sample(), &open());
        assert_eq!(
            s,
            Summary { holds: 4, lines: 3, single_hold_lines: 2, median_age_days: Some(5) }
        );
    }

    #[test]
    fn summary_of_nothing() {
        let spec = FilterSpec { text: "no such text".into(), ..Default::default() };
        let s = summary(&sample(), &spec);
        assert_eq!(
            s,
            Summary { holds: 0, lines: 0, single_hold_lines: 0, median_age_days: None }
        );
    }

    #[test]
    fn groups_sort_by_holds_then_key() {
        let groups = group_by(&sample(), &open(), Dim::Discipline);
        assert_eq!(
            keys(&groups),
            vec![("Civil", 2, 2), ("Piping", 1, 1), ("Unspecified", 1, 1)]
        );
    }

    #[test]
    fn groups_follow_the_status_filter() {
        let all = FilterSpec { status: Status::All, ..Default::default() };
        let groups = group_by(&sample(), &all, Dim::HoldType);
        assert_eq!(keys(&groups), vec![("MISC.", 3, 3), ("P&ID", 2, 2)]);
    }

    #[test]
    fn groups_by_blocker_type() {
        let groups = group_by(&sample(), &open(), Dim::BlockerType);
        assert_eq!(keys(&groups), vec![("PR", 2, 2), ("P&ID", 1, 1), ("VENDOR", 1, 1)]);
    }

    #[test]
    fn matrix_counts_holds_per_cell() {
        let m = matrix(&sample(), &open(), Dim::Discipline, Dim::HoldType);
        assert_eq!(m.rows, vec!["Civil", "Piping", "Unspecified"]);
        assert_eq!(m.cols, vec!["MISC.", "P&ID"]);
        assert_eq!(m.cells, vec![vec![2, 0], vec![0, 1], vec![1, 0]]);
    }

    #[test]
    fn line_rows_aggregate_their_holds() {
        let rows = lines(&sample(), &open(), LineSort::HoldsDesc);
        let ids: Vec<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert_eq!(ids, vec!["L1", "L2", "L4"]);

        let l1 = &rows[0];
        assert_eq!(l1.holds, 2);
        assert_eq!(l1.disciplines, vec!["Civil", "Piping"]);
        assert_eq!(l1.hold_types, vec!["MISC.", "P&ID"]);
        assert_eq!(l1.blockers, 2);
        assert_eq!(l1.oldest_age_days, Some(40));
        assert!(!l1.size_mismatch);

        let l4 = &rows[2];
        assert_eq!(l4.model_size, Some(4.0));
        assert_eq!(l4.ldt_size, Some(6.0));
        assert_eq!(l4.stress_calc, "NR");
        assert!(l4.size_mismatch);
    }

    #[test]
    fn easiest_puts_single_discipline_single_hold_lines_first() {
        let rows = lines(&sample(), &open(), LineSort::Easiest);
        let ids: Vec<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert_eq!(ids, vec!["L2", "L4", "L1"]);
    }

    #[test]
    fn oldest_first() {
        let rows = lines(&sample(), &open(), LineSort::OldestFirst);
        let ids: Vec<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert_eq!(ids, vec!["L1", "L2", "L4"]);
    }
}
```

- [ ] **Step 2: Run the tests and watch them fail**

Add `pub mod query;` to `crates/core/src/lib.rs`.

Run: `cargo test -p hx-core query`
Expected: compile error, `cannot find function summary`.

- [ ] **Step 3: Implement the queries**

Insert above the `tests` module in `crates/core/src/query.rs`:

```rust
use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::Serialize;

use crate::dataset::{Dataset, Row};
use crate::filter::{Dim, FilterSpec};

fn filtered<'a>(ds: &'a Dataset, spec: &'a FilterSpec) -> impl Iterator<Item = &'a Row> {
    ds.rows.iter().filter(move |row| spec.matches(row))
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Summary {
    pub holds: usize,
    pub lines: usize,
    pub single_hold_lines: usize,
    pub median_age_days: Option<i64>,
}

pub fn summary(ds: &Dataset, spec: &FilterSpec) -> Summary {
    let mut per_line: HashMap<&str, usize> = HashMap::new();
    let mut ages: Vec<i64> = Vec::new();
    let mut holds = 0;
    for row in filtered(ds, spec) {
        holds += 1;
        *per_line.entry(row.hold.line_id.as_str()).or_default() += 1;
        if let Some(age) = row.age_days {
            ages.push(age);
        }
    }
    ages.sort_unstable();
    Summary {
        holds,
        lines: per_line.len(),
        single_hold_lines: per_line.values().filter(|n| **n == 1).count(),
        median_age_days: if ages.is_empty() { None } else { Some(ages[(ages.len() - 1) / 2]) },
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Group {
    pub key: String,
    pub holds: usize,
    pub lines: usize,
}

pub fn group_by(ds: &Dataset, spec: &FilterSpec, dim: Dim) -> Vec<Group> {
    let mut groups: BTreeMap<String, (usize, BTreeSet<&str>)> = BTreeMap::new();
    for row in filtered(ds, spec) {
        let entry = groups.entry(dim.value(row)).or_default();
        entry.0 += 1;
        entry.1.insert(row.hold.line_id.as_str());
    }
    let mut out: Vec<Group> = groups
        .into_iter()
        .map(|(key, (holds, lines))| Group { key, holds, lines: lines.len() })
        .collect();
    out.sort_by(|a, b| b.holds.cmp(&a.holds).then_with(|| a.key.cmp(&b.key)));
    out
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Matrix {
    pub rows: Vec<String>,
    pub cols: Vec<String>,
    /// `cells[r][c]` is the number of holds with row value `rows[r]` and column value `cols[c]`.
    pub cells: Vec<Vec<usize>>,
}

pub fn matrix(ds: &Dataset, spec: &FilterSpec, row_dim: Dim, col_dim: Dim) -> Matrix {
    let rows: Vec<String> = group_by(ds, spec, row_dim).into_iter().map(|g| g.key).collect();
    let cols: Vec<String> = group_by(ds, spec, col_dim).into_iter().map(|g| g.key).collect();
    let row_index: HashMap<&str, usize> =
        rows.iter().enumerate().map(|(i, k)| (k.as_str(), i)).collect();
    let col_index: HashMap<&str, usize> =
        cols.iter().enumerate().map(|(i, k)| (k.as_str(), i)).collect();

    let mut cells = vec![vec![0usize; cols.len()]; rows.len()];
    for row in filtered(ds, spec) {
        let r = row_index[row_dim.value(row).as_str()];
        let c = col_index[col_dim.value(row).as_str()];
        cells[r][c] += 1;
    }
    Matrix { rows, cols, cells }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LineRow {
    pub line_id: String,
    pub holds: usize,
    /// In order of first appearance.
    pub disciplines: Vec<String>,
    /// In order of first appearance.
    pub hold_types: Vec<String>,
    /// Number of distinct blockers.
    pub blockers: usize,
    pub oldest_age_days: Option<i64>,
    pub model_size: Option<f64>,
    pub ldt_size: Option<f64>,
    pub stress_calc: String,
    pub size_mismatch: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineSort {
    /// Most holds first.
    HoldsDesc,
    /// Fewest disciplines, then fewest holds: the lines cheapest to free.
    Easiest,
    /// Oldest open hold first.
    OldestFirst,
}

fn push_unique(list: &mut Vec<String>, value: &str) {
    if !list.iter().any(|v| v == value) {
        list.push(value.to_string());
    }
}

pub fn lines(ds: &Dataset, spec: &FilterSpec, sort: LineSort) -> Vec<LineRow> {
    let mut index: HashMap<&str, usize> = HashMap::new();
    let mut out: Vec<LineRow> = Vec::new();
    let mut blocker_keys: Vec<Vec<String>> = Vec::new();

    for row in filtered(ds, spec) {
        let position = *index.entry(row.hold.line_id.as_str()).or_insert_with(|| {
            out.push(LineRow {
                line_id: row.hold.line_id.clone(),
                holds: 0,
                disciplines: Vec::new(),
                hold_types: Vec::new(),
                blockers: 0,
                oldest_age_days: None,
                model_size: row.hold.model_size,
                ldt_size: row.hold.ldt_size,
                stress_calc: row.hold.stress_calc.clone(),
                size_mismatch: row.size_mismatch(),
            });
            blocker_keys.push(Vec::new());
            out.len() - 1
        });
        let line = &mut out[position];
        line.holds += 1;
        push_unique(&mut line.disciplines, &row.hold.discipline);
        push_unique(&mut line.hold_types, &row.hold.hold_type);
        push_unique(&mut blocker_keys[position], &row.blocker_key());
        line.oldest_age_days = line.oldest_age_days.max(row.age_days);
    }
    for (line, keys) in out.iter_mut().zip(&blocker_keys) {
        line.blockers = keys.len();
    }

    match sort {
        LineSort::HoldsDesc => {
            out.sort_by(|a, b| b.holds.cmp(&a.holds).then_with(|| a.line_id.cmp(&b.line_id)));
        }
        LineSort::Easiest => {
            out.sort_by(|a, b| {
                a.disciplines
                    .len()
                    .cmp(&b.disciplines.len())
                    .then_with(|| a.holds.cmp(&b.holds))
                    .then_with(|| a.disciplines.first().cmp(&b.disciplines.first()))
                    .then_with(|| a.line_id.cmp(&b.line_id))
            });
        }
        LineSort::OldestFirst => {
            out.sort_by(|a, b| {
                Reverse(a.oldest_age_days)
                    .cmp(&Reverse(b.oldest_age_days))
                    .then_with(|| a.line_id.cmp(&b.line_id))
            });
        }
    }
    out
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cargo test -p hx-core query`
Expected: `test result: ok. 9 passed`.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): add summary, grouping, matrix, and line queries"
```

---

### Task 10: Solve order

**Files:**
- Create: `crates/core/src/solve.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `dataset::Dataset`, `filter::FilterSpec`.
- Produces:
  - `solve::BlockerNode { key: String, discipline: String, kind: String, item: String, holds: usize, lines: Vec<String> }`.
  - `solve::Step { key: String, gain: usize, cumulative: usize, freed: Vec<String> }`.
  - `solve::SolvePlan { nodes: Vec<BlockerNode>, steps: Vec<Step> }`.
  - `solve::solve_plan(&Dataset, &FilterSpec, max_steps: Option<usize>) -> SolvePlan`. `None` runs until no step frees or advances any line.

The algorithm is the HTML tool's `mapData()` (spec 8.5). A line is freed when every blocker on it is solved. Each step scores every unsolved blocker: 1000 for each line it would free now, plus `1 / remaining` for each line it only advances, where `remaining` is the number of unsolved blockers still on that line. The highest score wins; on a tie, the blocker that appeared first in the file wins. Nodes and their lines are kept in first-appearance order because the floating-point sum, and so the tie-breaks, depend on it.

- [ ] **Step 1: Write the failing tests**

`crates/core/src/solve.rs`:

```rust
//! Which blockers to solve first.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::RuleSet;
    use crate::testkit::{hold, sample, snapshot};

    /// L1 and L2 wait for A. L3 waits for A and B. L4 waits for B and C. L5 waits for C.
    fn chain() -> Dataset {
        let a = "Pending 538-PR-100";
        let b = "Pending 538-PR-200";
        let c = "Pending 538-PR-300";
        Dataset::build(
            vec![
                hold("L1", "Civil", "MISC.", a, 1),
                hold("L2", "Civil", "MISC.", a, 1),
                hold("L3", "Civil", "MISC.", a, 1),
                hold("L3", "Civil", "MISC.", b, 1),
                hold("L4", "Civil", "MISC.", b, 1),
                hold("L4", "Civil", "MISC.", c, 1),
                hold("L5", "Civil", "MISC.", c, 1),
            ],
            &RuleSet::builtin(),
            snapshot(),
        )
    }

    fn brief(plan: &SolvePlan) -> Vec<(&str, usize, usize)> {
        plan.steps.iter().map(|s| (s.key.as_str(), s.gain, s.cumulative)).collect()
    }

    #[test]
    fn nodes_keep_first_appearance_order_and_count_holds() {
        let plan = solve_plan(&chain(), &FilterSpec::default(), None);
        let nodes: Vec<(&str, usize, usize)> =
            plan.nodes.iter().map(|n| (n.key.as_str(), n.holds, n.lines.len())).collect();
        assert_eq!(
            nodes,
            vec![
                ("Civil|538-PR-100", 3, 3),
                ("Civil|538-PR-200", 2, 2),
                ("Civil|538-PR-300", 2, 2),
            ]
        );
        assert_eq!(plan.nodes[0].kind, "PR");
        assert_eq!(plan.nodes[0].lines, vec!["L1", "L2", "L3"]);
    }

    #[test]
    fn greedy_order_frees_most_lines_first_and_breaks_ties_by_appearance() {
        let plan = solve_plan(&chain(), &FilterSpec::default(), None);
        assert_eq!(
            brief(&plan),
            vec![
                ("Civil|538-PR-100", 2, 2),
                ("Civil|538-PR-200", 1, 3),
                ("Civil|538-PR-300", 2, 5),
            ]
        );
        assert_eq!(plan.steps[0].freed, vec!["L1", "L2"]);
        assert_eq!(plan.steps[1].freed, vec!["L3"]);
        assert_eq!(plan.steps[2].freed, vec!["L4", "L5"]);
    }

    #[test]
    fn max_steps_caps_the_plan() {
        let plan = solve_plan(&chain(), &FilterSpec::default(), Some(1));
        assert_eq!(brief(&plan), vec![("Civil|538-PR-100", 2, 2)]);
    }

    #[test]
    fn plan_follows_the_filter() {
        let plan = solve_plan(&sample(), &FilterSpec::default(), None);
        assert_eq!(
            brief(&plan),
            vec![
                ("Civil|538-PR-100", 1, 1),
                ("Piping|P&ID", 1, 2),
                ("Unspecified|VENDOR", 1, 3),
            ]
        );
    }

    #[test]
    fn empty_selection_gives_empty_plan() {
        let spec = FilterSpec { text: "no such text".into(), ..Default::default() };
        let plan = solve_plan(&sample(), &spec, None);
        assert!(plan.nodes.is_empty());
        assert!(plan.steps.is_empty());
    }
}
```

Check of the second test by hand. Step 1 scores: A frees L1 and L2 and advances L3 (2 blockers left), 2000.5; B advances L3 and L4, 1.0; C frees L5 and advances L4, 1000.5. A wins. Step 2: L3 now has one blocker left, so B scores 1000.5 and C scores 1000.5; B appeared first and wins, freeing L3. Step 3: C frees L4 and L5.

Check of the fourth test. Open rows: L1 has `Civil|538-PR-100` and `Piping|P&ID`; L2 has `Civil|538-PR-100`; L4 has `Unspecified|VENDOR`. Step 1: the PR blocker frees L2 and advances L1, 1000.5; P&ID advances L1, 0.5; VENDOR frees L4, 1000. PR wins with a gain of 1. Step 2: P&ID now frees L1, 1000; VENDOR frees L4, 1000; P&ID appeared first.

- [ ] **Step 2: Run the tests and watch them fail**

Add `pub mod solve;` to `crates/core/src/lib.rs`.

Run: `cargo test -p hx-core solve`
Expected: compile error, `cannot find function solve_plan`.

- [ ] **Step 3: Implement the solve order**

Insert above the `tests` module in `crates/core/src/solve.rs`:

```rust
use std::collections::HashMap;

use serde::Serialize;

use crate::dataset::Dataset;
use crate::filter::FilterSpec;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BlockerNode {
    /// `<discipline>|<item>`.
    pub key: String,
    pub discipline: String,
    /// Blocker type.
    pub kind: String,
    pub item: String,
    pub holds: usize,
    /// Lines this blocker is on, in order of first appearance.
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Step {
    pub key: String,
    /// Lines freed by this step.
    pub gain: usize,
    /// Lines freed by this step and all steps before it.
    pub cumulative: usize,
    pub freed: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SolvePlan {
    /// Every blocker, in order of first appearance.
    pub nodes: Vec<BlockerNode>,
    pub steps: Vec<Step>,
}

pub fn solve_plan(ds: &Dataset, spec: &FilterSpec, max_steps: Option<usize>) -> SolvePlan {
    let mut nodes: Vec<BlockerNode> = Vec::new();
    let mut node_index: HashMap<String, usize> = HashMap::new();
    let mut node_lines: Vec<Vec<usize>> = Vec::new();

    let mut line_ids: Vec<String> = Vec::new();
    let mut line_index: HashMap<String, usize> = HashMap::new();
    let mut line_nodes: Vec<Vec<usize>> = Vec::new();

    for row in ds.rows.iter().filter(|row| spec.matches(row)) {
        let key = row.blocker_key();
        let node = match node_index.get(&key) {
            Some(&existing) => existing,
            None => {
                nodes.push(BlockerNode {
                    key: key.clone(),
                    discipline: row.hold.discipline.clone(),
                    kind: row.blocker.kind.clone(),
                    item: row.blocker.item.clone(),
                    holds: 0,
                    lines: Vec::new(),
                });
                node_lines.push(Vec::new());
                node_index.insert(key, nodes.len() - 1);
                nodes.len() - 1
            }
        };
        nodes[node].holds += 1;

        let line = match line_index.get(&row.hold.line_id) {
            Some(&existing) => existing,
            None => {
                line_ids.push(row.hold.line_id.clone());
                line_nodes.push(Vec::new());
                line_index.insert(row.hold.line_id.clone(), line_ids.len() - 1);
                line_ids.len() - 1
            }
        };
        if !line_nodes[line].contains(&node) {
            line_nodes[line].push(node);
            node_lines[node].push(line);
        }
    }

    for (node, lines) in nodes.iter_mut().zip(&node_lines) {
        node.lines = lines.iter().map(|&l| line_ids[l].clone()).collect();
    }

    // Unsolved blockers left on each line.
    let mut remaining: Vec<usize> = line_nodes.iter().map(Vec::len).collect();
    let mut freed = vec![false; line_ids.len()];
    let mut solved = vec![false; nodes.len()];
    let mut steps: Vec<Step> = Vec::new();
    let mut cumulative = 0;
    let limit = max_steps.unwrap_or(nodes.len());

    while steps.len() < limit {
        let mut best: Option<usize> = None;
        let mut best_score = 0.0_f64;
        for (node, lines) in node_lines.iter().enumerate() {
            if solved[node] {
                continue;
            }
            let mut gain = 0usize;
            let mut partial = 0.0_f64;
            for &line in lines {
                if freed[line] {
                    continue;
                }
                if remaining[line] == 1 {
                    gain += 1;
                } else {
                    partial += 1.0 / remaining[line] as f64;
                }
            }
            let score = gain as f64 * 1000.0 + partial;
            // Strictly greater: on a tie the earlier blocker keeps the lead.
            if score > best_score {
                best_score = score;
                best = Some(node);
            }
        }
        let Some(node) = best else { break };

        let mut freed_now = Vec::new();
        for &line in &node_lines[node] {
            remaining[line] -= 1;
            if remaining[line] == 0 && !freed[line] {
                freed[line] = true;
                freed_now.push(line_ids[line].clone());
            }
        }
        solved[node] = true;
        cumulative += freed_now.len();
        steps.push(Step {
            key: nodes[node].key.clone(),
            gain: freed_now.len(),
            cumulative,
            freed: freed_now,
        });
    }

    SolvePlan { nodes, steps }
}
```

`remaining[line] -= 1` cannot underflow: a line counts every blocker on it once, and each blocker is solved once.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cargo test -p hx-core solve`
Expected: `test result: ok. 5 passed`.

- [ ] **Step 5: Run the whole core suite**

Run: `cargo test -p hx-core`
Expected: all tests pass, no warnings.

- [ ] **Step 6: Commit**

```bash
git add crates/core
git commit -m "feat(core): add greedy solve order for blockers"
```

---

### Task 11: Command-line tool

**Files:**
- Create: `crates/cli/Cargo.toml`, `crates/cli/src/main.rs`, `crates/cli/tests/cli.rs`
- Modify: `Cargo.toml` (workspace members)

**Interfaces:**
- Consumes: `hx_core::load::load_file`, `hx_core::dataset::Dataset`, `hx_core::rules::RuleSet`, `hx_core::filter::{Dim, FilterSpec}`, `hx_core::query::{summary, group_by, lines, LineSort}`, `hx_core::solve::solve_plan`, `hx_synth::{SynthConfig, generate, write_workbook}`.
- Produces: the `hx-cli` binary.
  - `hx-cli synth --out <file> [--seed N] [--lines N] [--holds N]` writes a synthetic workbook.
  - `hx-cli summary <file>` prints JSON with the keys `snapshot`, `project`, `sheet`, `limited`, `skipped`, `summary`, `by_discipline`, `by_hold_type`, `top_lines`, `solve`.

- [ ] **Step 1: Create the crate**

In the root `Cargo.toml`, change the members line to:

```toml
members = ["crates/core", "crates/synth", "crates/cli"]
```

`crates/cli/Cargo.toml`:

```toml
[package]
name = "hx-cli"
version.workspace = true
edition.workspace = true
license.workspace = true

[[bin]]
name = "hx-cli"
path = "src/main.rs"

[dependencies]
clap.workspace = true
hx-core = { path = "../core" }
hx-synth = { path = "../synth" }
serde_json.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

- [ ] **Step 2: Write the failing test**

`crates/cli/tests/cli.rs`:

```rust
use std::process::Command;

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_hx-cli"))
}

#[test]
fn synth_then_summary_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("holds.xlsx");

    let made = cli()
        .args(["synth", "--seed", "9", "--lines", "80", "--holds", "500", "--out"])
        .arg(&file)
        .output()
        .unwrap();
    assert!(made.status.success(), "{}", String::from_utf8_lossy(&made.stderr));

    let out = cli().arg("summary").arg(&file).output().unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));

    let json: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(json["snapshot"], "2026-09-29 13:16:00");
    assert_eq!(json["project"], "0000-TEST");
    assert_eq!(json["sheet"], "data");
    assert_eq!(json["limited"], false);
    assert_eq!(json["skipped"], 0);

    let holds = json["summary"]["holds"].as_u64().unwrap();
    assert!(holds > 0 && holds < 500, "open holds only, got {holds}");
    assert!(json["summary"]["lines"].as_u64().unwrap() > 0);
    assert!(!json["by_discipline"].as_array().unwrap().is_empty());
    assert!(!json["by_hold_type"].as_array().unwrap().is_empty());
    assert!(json["top_lines"].as_array().unwrap().len() <= 10);
    assert!(!json["solve"].as_array().unwrap().is_empty());
}

#[test]
fn summary_of_missing_file_fails_with_a_message() {
    let out = cli().args(["summary", "/no/such/file.xlsx"]).output().unwrap();
    assert!(!out.status.success());
    let message = String::from_utf8_lossy(&out.stderr);
    assert!(message.contains("Could not read"), "{message}");
}
```

- [ ] **Step 3: Run the test and watch it fail**

Create a placeholder so the crate compiles:

`crates/cli/src/main.rs`:

```rust
fn main() {}
```

Run: `cargo test -p hx-cli --test cli`
Expected: both tests fail. `synth_then_summary_round_trip` panics while parsing the empty output as JSON; `summary_of_missing_file_fails_with_a_message` fails because the placeholder exits successfully.

- [ ] **Step 4: Implement the tool**

Replace `crates/cli/src/main.rs` with:

```rust
use std::error::Error;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::query::{group_by, lines, summary, LineSort};
use hx_core::rules::RuleSet;
use hx_core::solve::solve_plan;
use hx_synth::{generate, write_workbook, SynthConfig};
use serde_json::json;

#[derive(Parser)]
#[command(name = "hx-cli", version, about = "Hold Explorer engine from the command line")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Write a synthetic PlantIM-shaped workbook.
    Synth {
        #[arg(long)]
        out: PathBuf,
        #[arg(long, default_value_t = 1)]
        seed: u64,
        #[arg(long, default_value_t = 3600)]
        lines: usize,
        #[arg(long, default_value_t = 9300)]
        holds: usize,
    },
    /// Read a holds file and print a JSON summary of its open holds.
    Summary { file: PathBuf },
}

fn run(cli: Cli) -> Result<(), Box<dyn Error>> {
    match cli.command {
        Cmd::Synth { out, seed, lines, holds } => {
            let cfg = SynthConfig::new(seed, lines, holds);
            write_workbook(&generate(&cfg), &cfg, &out)?;
            eprintln!("Wrote {} holds to {}", holds, out.display());
        }
        Cmd::Summary { file } => {
            let loaded = load_file(&file)?;
            let snapshot = loaded
                .snapshot
                .ok_or("Could not work out the snapshot date. Rename the file to include it, for example holds_2026-10-07.xlsx.")?;
            let project = loaded.info.get("Project No.").cloned();
            let limited = loaded.parsed.limited;
            let skipped = loaded.parsed.skipped.len();

            let ds = Dataset::build(loaded.parsed.holds, &RuleSet::builtin(), snapshot);
            let open = FilterSpec::default();
            let top_lines: Vec<_> =
                lines(&ds, &open, LineSort::HoldsDesc).into_iter().take(10).collect();

            let report = json!({
                "snapshot": snapshot.to_string(),
                "project": project,
                "sheet": loaded.sheet_name,
                "limited": limited,
                "skipped": skipped,
                "summary": summary(&ds, &open),
                "by_discipline": group_by(&ds, &open, Dim::Discipline),
                "by_hold_type": group_by(&ds, &open, Dim::HoldType),
                "top_lines": top_lines,
                "solve": solve_plan(&ds, &open, Some(10)).steps,
            });
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
    }
    Ok(())
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cargo test -p hx-cli --test cli`
Expected: `test result: ok. 2 passed`.

- [ ] **Step 6: Try it by hand**

Run:

```bash
cargo run -q -p hx-cli -- synth --out /tmp/hx-demo.xlsx --holds 2000 --lines 600
cargo run -q -p hx-cli -- summary /tmp/hx-demo.xlsx | head -20
rm /tmp/hx-demo.xlsx
```

Expected: `Wrote 2000 holds to /tmp/hx-demo.xlsx`, then JSON beginning with `"snapshot": "2026-09-29 13:16:00"`.

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml Cargo.lock crates/cli
git commit -m "feat(cli): add synth and summary commands"
```

---

### Task 12: Parity with the HTML tool, performance budget, and CI

**Files:**
- Create: `tools/parity/reference.mjs`, `crates/cli/tests/parity.rs`, `crates/cli/tests/perf.rs`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: everything above.
- Produces: no new library interface. Produces the proof that the Rust engine gives the HTML tool's numbers, a performance check, and CI.

`reference.mjs` holds the HTML tool's logic unchanged: `reason`, `tagOf`, `grp`, `easy`, and `mapData`. Do not tidy, rename, or modernize it. Its value is that it is the original.

The test feeds the same open holds to both sides. The Rust side goes through the full pipeline: generator, workbook file, reader, parser, dataset. The JavaScript side receives the generator's raw rows, shaped as the HTML tool's `fromObjs` would shape them.

- [ ] **Step 1: Add the reference script**

`tools/parity/reference.mjs`:

```js
// Reference implementation: the logic of the original "Hold Explorer.html",
// copied without change. Used only by crates/cli/tests/parity.rs.
// Input:  path to a JSON array of {l, n, r, m, t, d} (open holds, file order).
// Output: JSON on stdout.
import { readFileSync } from 'node:fs';

var R = JSON.parse(readFileSync(process.argv[2], 'utf8'));
var BL = {};

var KW=[[/P\s?&\s?IDS?\b|\bPIDS?\b/,'P&ID'],[/SLEEPER/,'SLEEPERS'],[/MISC/,'MISC.'],[/FIV|AIV/,'FIV/AIV'],[/\bLDT\b/,'LDT'],[/LINE SIZE|HOLD SIZE/,'LINE SIZE'],[/DATA ?SHEET/,'DATA SHEET'],[/ISOMETRIC/,'ISOMETRIC'],[/PLOT PLAN/,'PLOT PLAN'],[/TAG NO/,'INSTRUMENT TAG'],[/PIPING MATERIAL CLASS|\bPMC\b/,'PMC'],[/PLATFORM/,'PLATFORM'],[/SUPPORT/,'SUPPORT'],[/\bGA\b|\bGA'S/,'GA DRAWING'],[/VENDOR/,'VENDOR'],[/STRUCTURE|STEEL|STRU/,'STRUCTURE']];
var TAG=/\b(?:\d{3}-)?([A-Z]{1,5})-\s?(\d{2,5})(?:[A-Z](?![A-Z]))?(?!\d|-\d)/g;
function tagOf(u){TAG.lastIndex=0;var g;while(g=TAG.exec(u))if(g[1]!=='UNIT')return g;return null}
function reason(m){
  var s=String(m||'').replace(/_x000D_/gi,' ').replace(/\s+/g,' ').trim(),u=s.toUpperCase(),g;
  if(g=tagOf(u))return [g[1]==='STRU'?'STR':g[1],g[0].replace(/\s/g,'')];
  if(g=/\bT\d{3}-R\d{3}\b/.exec(u))return ['TIE-IN',g[0]];
  for(var i=0;i<KW.length;i++)if(KW[i][0].test(u))return [KW[i][1],KW[i][1]];
  var c=u.replace(/^HOLD /,'').replace(/^(PENDING|ON) ?/,'').slice(0,60);
  return ['Other',c||'—'];
}
function grp(rows,f){
  var g={};
  rows.forEach(function(x){var k=x[f];var o=g[k]=g[k]||{k:k,rows:[],ls:{}};o.rows.push(x);o.ls[x.l]=(o.ls[x.l]||0)+1});
  return Object.keys(g).map(function(k){var o=g[k];o.nl=Object.keys(o.ls).length;return o}).sort(function(a,b){return b.rows.length-a.rows.length});
}
function easy(){return Object.keys(BL).map(function(l){var r=BL[l],d={},t={};r.forEach(function(x){d[x.d]=1;t[x.t]=1});return {l:l,n:r.length,d:Object.keys(d),t:Object.keys(t)}}).sort(function(a,b){return a.d.length-b.d.length||a.n-b.n||(a.d[0]<b.d[0]?-1:a.d[0]>b.d[0]?1:0)||(a.l<b.l?-1:1)})}
function mapData(){
  var N={},LK={},E2={};
  R.forEach(function(x){
    var k=x.d+'|'+x.e,o=N[k]=N[k]||{k:k,d:x.d,z:x.z,e:x.e,ls:{},n:0,lk:0};
    o.n++;o.ls[x.l]=1;(LK[x.l]=LK[x.l]||{})[k]=1;
  });
  Object.keys(LK).forEach(function(l){
    var ks=Object.keys(LK[l]);
    for(var i=0;i<ks.length;i++)for(var j=i+1;j<ks.length;j++){
      var a=ks[i]<ks[j]?ks[i]:ks[j],b=ks[i]<ks[j]?ks[j]:ks[i],id=a+'\u0002'+b,e=E2[id];
      if(!e){e=E2[id]={a:a,b:b,ls:[]};N[a].lk++;N[b].lk++}
      e.ls.push(l);
    }
  });
  var rem={},fr={},sv={},plan=[],cum=0,keys=Object.keys(N);
  Object.keys(LK).forEach(function(l){rem[l]=Object.keys(LK[l]).length});
  for(var s=0;s<20;s++){
    var best=null,bs=0;
    keys.forEach(function(k){
      if(sv[k])return;
      var g=0,p=0;
      Object.keys(N[k].ls).forEach(function(l){if(fr[l])return;if(rem[l]===1)g++;else p+=1/rem[l]});
      var sc=g*1000+p;
      if(sc>bs){bs=sc;best=k}
    });
    if(!best)break;
    var f=[];
    Object.keys(N[best].ls).forEach(function(l){rem[l]--;if(rem[l]===0&&!fr[l]){fr[l]=1;f.push(l)}});
    sv[best]=1;cum+=f.length;plan.push({k:best,gain:f.length,cum:cum,ls:f});
  }
  return {N:N,LK:LK,E:Object.keys(E2).map(function(k){return E2[k]}),plan:plan};
}

// Same set-up as setRows() in the original.
R.forEach(function(x){var r=reason(x.m);x.z=r[0];x.e=r[1]});
R.forEach(function(x){(BL[x.l]=BL[x.l]||[]).push(x)});

function counts(f){var o={};grp(R,f).forEach(function(g){o[g.k]=[g.rows.length,g.nl]});return o}
var ls=Object.keys(BL);
process.stdout.write(JSON.stringify({
  holds:R.length,
  lines:ls.length,
  single:ls.filter(function(l){return BL[l].length===1}).length,
  by:{d:counts('d'),t:counts('t'),r:counts('r'),z:counts('z')},
  easy:easy().map(function(o){return o.l}),
  plan:mapData().plan.map(function(p){return {k:p.k,gain:p.gain,cum:p.cum}})
}));
```

- [ ] **Step 2: Write the parity test**

`crates/cli/tests/parity.rs`:

```rust
//! Proves the Rust engine gives the numbers of the original HTML tool.
//! Needs `node` on the PATH.

use std::process::Command;

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::query::{group_by, lines, summary, LineSort};
use hx_core::rules::RuleSet;
use hx_core::solve::solve_plan;
use hx_synth::{generate, write_workbook, SynthConfig, SynthRow};
use serde_json::{json, Map, Value};

const REFERENCE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tools/parity/reference.mjs");

/// The rows as the HTML tool's `fromObjs` would hand them to its views.
fn legacy_input(rows: &[SynthRow]) -> Value {
    Value::Array(
        rows.iter()
            .filter(|r| !r.released)
            .map(|r| {
                json!({
                    "l": r.line_id.trim(),
                    "n": r.name,
                    "r": r.role,
                    "m": r.remark,
                    "t": r.hold_type,
                    "d": r.discipline.clone().unwrap_or_else(|| "Unspecified".to_string()),
                })
            })
            .collect(),
    )
}

fn counts(ds: &Dataset, dim: Dim) -> Value {
    let mut map = Map::new();
    for group in group_by(ds, &FilterSpec::default(), dim) {
        map.insert(group.key, json!([group.holds, group.lines]));
    }
    Value::Object(map)
}

fn check(seed: u64, line_count: usize, hold_count: usize) {
    let cfg = SynthConfig::new(seed, line_count, hold_count);
    let rows = generate(&cfg);
    let dir = tempfile::tempdir().unwrap();

    let workbook = dir.path().join("holds.xlsx");
    write_workbook(&rows, &cfg, &workbook).unwrap();
    let input = dir.path().join("legacy.json");
    std::fs::write(&input, serde_json::to_vec(&legacy_input(&rows)).unwrap()).unwrap();

    let output = Command::new("node")
        .arg(REFERENCE)
        .arg(&input)
        .output()
        .expect("the parity test needs Node.js on the PATH");
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let legacy: Value = serde_json::from_slice(&output.stdout).unwrap();

    let loaded = load_file(&workbook).unwrap();
    let ds = Dataset::build(loaded.parsed.holds, &RuleSet::builtin(), loaded.snapshot.unwrap());
    let open = FilterSpec::default();

    let s = summary(&ds, &open);
    assert_eq!(legacy["holds"], json!(s.holds), "seed {seed}: holds");
    assert_eq!(legacy["lines"], json!(s.lines), "seed {seed}: lines");
    assert_eq!(legacy["single"], json!(s.single_hold_lines), "seed {seed}: single-hold lines");

    assert_eq!(legacy["by"]["d"], counts(&ds, Dim::Discipline), "seed {seed}: by discipline");
    assert_eq!(legacy["by"]["t"], counts(&ds, Dim::HoldType), "seed {seed}: by hold type");
    assert_eq!(legacy["by"]["r"], counts(&ds, Dim::Role), "seed {seed}: by role");
    assert_eq!(legacy["by"]["z"], counts(&ds, Dim::BlockerType), "seed {seed}: by blocker type");

    let easiest: Vec<String> =
        lines(&ds, &open, LineSort::Easiest).into_iter().map(|l| l.line_id).collect();
    assert_eq!(legacy["easy"], json!(easiest), "seed {seed}: easiest-to-release order");

    let plan: Vec<Value> = solve_plan(&ds, &open, Some(20))
        .steps
        .iter()
        .map(|step| json!({ "k": step.key, "gain": step.gain, "cum": step.cumulative }))
        .collect();
    assert_eq!(legacy["plan"], json!(plan), "seed {seed}: solve order");
}

#[test]
fn matches_the_html_tool_on_a_small_file() {
    check(1, 60, 300);
}

#[test]
fn matches_the_html_tool_on_a_dense_file() {
    // Few lines and many holds: many lines share blockers, so the solve order has real ties.
    check(2, 120, 2500);
}

#[test]
fn matches_the_html_tool_at_real_scale() {
    check(3, 3600, 9300);
}
```

- [ ] **Step 3: Run the parity test**

Run: `cargo test -p hx-cli --test parity`
Expected: `test result: ok. 3 passed`.

A failure here means the port differs from the original. Read the assertion message to see which number differs, then fix the Rust code in the module that produces it (`rules.rs` for `by blocker type`, `query.rs` for the counts and the easiest order, `solve.rs` for the solve order). Never edit `reference.mjs` to make the test pass.

- [ ] **Step 4: Write the performance test**

`crates/cli/tests/perf.rs`:

```rust
//! Performance budget from the spec. Ignored by default because a debug build
//! is far slower than what ships. Run with:
//!     cargo test --release -p hx-cli --test perf -- --ignored

use std::time::{Duration, Instant};

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::query::{group_by, lines, summary, LineSort};
use hx_core::rules::RuleSet;
use hx_core::solve::solve_plan;
use hx_synth::{generate, write_workbook, SynthConfig};

#[test]
#[ignore = "run in a release build"]
fn ten_thousand_rows_load_in_under_two_seconds_and_filter_in_under_100_ms() {
    let cfg = SynthConfig::new(4, 3600, 10_000);
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("holds.xlsx");
    write_workbook(&generate(&cfg), &cfg, &path).unwrap();

    let started = Instant::now();
    let loaded = load_file(&path).unwrap();
    let ds = Dataset::build(loaded.parsed.holds, &RuleSet::builtin(), loaded.snapshot.unwrap());
    let import = started.elapsed();
    assert!(import < Duration::from_secs(2), "import took {import:?}");

    let spec = FilterSpec { text: "pr".to_string(), ..Default::default() };
    let started = Instant::now();
    let s = summary(&ds, &spec);
    let groups = group_by(&ds, &spec, Dim::Discipline);
    let rows = lines(&ds, &spec, LineSort::HoldsDesc);
    let views = started.elapsed();
    assert!(s.holds > 0 && !groups.is_empty() && !rows.is_empty());
    assert!(views < Duration::from_millis(100), "filtered views took {views:?}");

    let started = Instant::now();
    let plan = solve_plan(&ds, &FilterSpec::default(), None);
    let solve = started.elapsed();
    assert!(!plan.steps.is_empty());
    assert!(solve < Duration::from_secs(2), "full solve order took {solve:?}");
}
```

- [ ] **Step 5: Run the performance test**

Run: `cargo test --release -p hx-cli --test perf -- --ignored`
Expected: `test result: ok. 1 passed`.

If the solve-order assertion fails, the cause is the per-step rescan of every blocker. Report the measured time before changing the algorithm: the parity test fixes its results, so any optimization must keep the scores and the first-appearance tie-break identical.

- [ ] **Step 6: Add CI**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Format
        run: cargo fmt --all -- --check
      - name: Lint
        run: cargo clippy --workspace --all-targets -- -D warnings
      - name: Test
        run: cargo test --workspace
      - name: Performance budget
        run: cargo test --release -p hx-cli --test perf -- --ignored
```

- [ ] **Step 7: Run every check CI runs**

Run:

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Expected: no formatting changes left uncommitted, no clippy warnings, every test passes. Fix any clippy finding in the code it names; do not add `#[allow]`.

- [ ] **Step 8: Confirm no data file is tracked**

Run: `git ls-files | grep -Ei '\.(xlsx|xls|holdx)$' ; echo "exit=$?"`
Expected: no file names, then `exit=1`.

- [ ] **Step 9: Commit**

```bash
git add tools crates/cli .github
git commit -m "test: prove parity with the HTML tool and add performance budget and CI"
```

---

## What exists when this plan is done

- `cargo test --workspace` passes on Linux and Windows, including three parity runs against the original JavaScript.
- `hx-cli summary <file>` reads a real PlantIM export and prints its open-hold summary, breakdowns, top lines, and solve order.
- `hx-core` exposes every query the Overview, Breakdown, Lines, and Blockers screens need. M1b wraps it in Tauri commands and adds storage.

## Spec coverage of this plan

| Spec section | Task |
|---|---|
| 4.1 raw export columns, 4.3 required and optional columns | 2, 3 |
| 4.2 limited files | 2, 3, 7 |
| 6.1 steps 1 to 3 (open, choose sheet, map, normalize) | 2, 3, 7 |
| 6.2 normalization and skipped rows | 1, 3 |
| 6.3 snapshot date | 4 |
| 8.1 default rules | 5 |
| 8.5 solve order | 10 |
| 9.2 Overview numbers, Breakdown list and matrix, Lines presets | 9 |
| 9.3 size mismatch | 3, 8 |
| 10.2 filters: status, fields with OR, AND, and "is not", text, age, size mismatch | 8 |
| 11.3 age | 8 |
| 14 import error messages | 3, 7 |
| 15 synthetic generator, parity test, performance check | 6, 12 |
| 16 no real data in the repository | 12 |
| 17 same numbers as the HTML tool; import under 2 s; filter under 100 ms | 12 |

Left for later plans, by design: 6.1 steps 4 to 6 and 6.4 to 6.7 (import review, workspace matching, guards, bulk import, drag and drop) in M1b; 7 (storage) in M1b; 9, 10.1, 10.3 (interface, search, saved views) in M1c; 10.4 (export), 12 (update check), 16 (release pipeline) in M1d.
