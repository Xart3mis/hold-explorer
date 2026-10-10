//! From a file path to parsed holds, in two steps. [`open_file`] (or [`open_sheet`]) reads the
//! file into an [`Opened`]: the raw table, a content hash, and a proposed column mapping, which
//! a caller may show and edit. [`parse_opened`] turns an `Opened` and a mapping into a
//! [`Loaded`]. [`load_file`] runs both with the automatic mapping.

use std::collections::BTreeMap;
use std::fmt::Write;
use std::path::Path;

use chrono::{DateTime, Local, NaiveDateTime};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::ImportError;
use crate::import::{parse_table, Parsed};
use crate::mapping::ColumnMap;
use crate::reader::{parse_workbook_bytes, read_file_bytes};
use crate::snapshot_date::{parse_report_date, snapshot_date, SnapshotDate};
use crate::table::RawTable;
use crate::warning::{ImportWarning, WarningKind};

/// A file read but not yet parsed into holds: what the mapping screen shows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Opened {
    /// The file's name without its directory.
    pub file_name: String,
    /// The file's last-modified time in local time; `None` when the system does not give one.
    pub modified: Option<NaiveDateTime>,
    /// Lower-case hex SHA-256 of the file's bytes.
    pub content_hash: String,
    /// Key/value pairs from the workbook's information sheet; empty when it has none.
    pub info: BTreeMap<String, String>,
    /// Every sheet name of the workbook in workbook order, for a sheet picker; empty for
    /// delimited text.
    pub sheets: Vec<String>,
    /// The sheet the table was read from.
    pub sheet_name: String,
    /// The sheet's header row and data rows, before mapping.
    pub table: RawTable,
    /// The mapping `ColumnMap::auto` proposes for `table.headers`.
    pub auto_map: ColumnMap,
    /// How many cells held an Excel error such as `#N/A`; they were read as blank.
    pub error_cells: usize,
}

impl Opened {
    /// The first `rows` data rows as display text, one string per header.
    pub fn preview(&self, rows: usize) -> Vec<Vec<String>> {
        self.table
            .rows
            .iter()
            .take(rows)
            .map(|row| {
                (0..self.table.headers.len())
                    .map(|i| row.get(i).map(|c| c.as_text()).unwrap_or_default())
                    .collect()
            })
            .collect()
    }
}

/// A file read and parsed into holds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Loaded {
    /// The file's name without its directory.
    pub file_name: String,
    /// Lower-case hex SHA-256 of the file's bytes.
    pub content_hash: String,
    /// Key/value pairs from the workbook's information sheet; empty when it has none.
    pub info: BTreeMap<String, String>,
    /// The sheet the holds were read from.
    pub sheet_name: String,
    /// The headers of the table that was parsed, in column order. Pair with `map` to save the
    /// mapping (`ColumnMap::to_saved`).
    pub headers: Vec<String>,
    /// The column mapping that was used.
    pub map: ColumnMap,
    /// The holds, skipped rows, and warnings.
    pub parsed: Parsed,
    /// `None` when neither the file nor its name nor its timestamps give a date.
    pub snapshot: Option<SnapshotDate>,
}

/// Reads the file, choosing the data sheet of a workbook itself (the sheet named `data`, else
/// the first with the required columns, else the first with rows). Succeeds even when required
/// columns are not mapped.
pub fn open_file(path: &Path) -> Result<Opened, ImportError> {
    open_choosing(path, None)
}

/// Reads the file with the workbook sheet called `sheet` as the data sheet, whatever its
/// columns. An unknown name gives `NoDataSheet` listing the sheets; so does delimited text,
/// with an empty list, because it has no sheets.
pub fn open_sheet(path: &Path, sheet: &str) -> Result<Opened, ImportError> {
    open_choosing(path, Some(sheet))
}

fn open_choosing(path: &Path, sheet: Option<&str>) -> Result<Opened, ImportError> {
    let (bytes, modified) = read_file_bytes(path)?;
    let content_hash =
        Sha256::digest(&bytes)
            .iter()
            .fold(String::with_capacity(64), |mut hex, byte| {
                // Writing to a `String` cannot fail.
                let _ = write!(hex, "{byte:02x}");
                hex
            });
    let workbook = parse_workbook_bytes(path, &bytes, sheet)?;
    let auto_map = ColumnMap::auto(&workbook.table.headers);
    Ok(Opened {
        file_name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string(),
        modified: modified.map(|t| DateTime::<Local>::from(t).naive_local()),
        content_hash,
        info: workbook.info,
        sheets: workbook.sheets,
        sheet_name: workbook.sheet_name,
        table: workbook.table,
        auto_map,
        error_cells: workbook.error_cells,
    })
}

/// Parses an opened file with the given mapping.
pub fn parse_opened(opened: &Opened, map: &ColumnMap) -> Result<Loaded, ImportError> {
    let mut parsed = parse_table(&opened.table, map)?;
    if opened.error_cells > 0 {
        parsed.warnings.push(ImportWarning {
            kind: WarningKind::ErrorCells,
            row_number: None,
            column: None,
            value: None,
            detail: format!(
                "{} cell(s) in the sheet \"{}\" hold an Excel error such as #N/A or #REF! and were read as blank. Fix those cells in the source file and import it again if they matter.",
                opened.error_cells, opened.sheet_name
            ),
        });
    }
    if let Some(text) = opened
        .info
        .get("Report Date")
        .filter(|t| !t.trim().is_empty())
    {
        if parse_report_date(text).is_none() {
            parsed.warnings.push(ImportWarning {
                kind: WarningKind::UnreadableReportDate,
                row_number: None,
                column: None,
                value: Some(text.clone()),
                detail: format!(
                    "The Report Date \"{text}\" in the information sheet could not be read, so the snapshot date comes from the file name or the file time. Write it like 09/29/2026 01:16 PM in the source, or enter the snapshot date yourself."
                ),
            });
        }
    }
    let snapshot = snapshot_date(
        &opened.info,
        &opened.file_name,
        &parsed.holds,
        opened.modified,
    );

    Ok(Loaded {
        file_name: opened.file_name.clone(),
        content_hash: opened.content_hash.clone(),
        info: opened.info.clone(),
        sheet_name: opened.sheet_name.clone(),
        headers: opened.table.headers.clone(),
        map: map.clone(),
        parsed,
        snapshot,
    })
}

/// `open_file` then `parse_opened` with the automatic mapping.
pub fn load_file(path: &Path) -> Result<Loaded, ImportError> {
    let opened = open_file(path)?;
    let map = opened.auto_map.clone();
    parse_opened(&opened, &map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mapping::Field;
    use crate::snapshot_date::SnapshotSource;
    use hx_synth::{generate, write_workbook, SynthConfig};

    #[test]
    fn loads_a_plantim_workbook_end_to_end() {
        let cfg = SynthConfig::new(5, 60, 400);
        let rows = generate(&cfg);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.xlsx");
        write_workbook(&rows, &cfg, &path).unwrap();

        let loaded = load_file(&path).unwrap();
        assert_eq!(loaded.snapshot.map(|s| s.at), Some(cfg.report_date));
        assert_eq!(
            loaded.snapshot.map(|s| s.source),
            Some(SnapshotSource::InfoSheet)
        );
        assert!(!loaded.parsed.limited);
        assert!(loaded.parsed.skipped.is_empty());
        assert!(loaded.parsed.warnings.is_empty());
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
            loaded.snapshot.map(|s| s.at.to_string()),
            Some("2026-10-07 00:00:00".to_string())
        );
        assert_eq!(
            loaded.snapshot.map(|s| s.source),
            Some(SnapshotSource::FileName)
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
            ImportError::MissingColumns {
                missing: vec![Field::Remark, Field::HoldType]
            }
        );
    }

    fn synth_workbook(dir: &std::path::Path, name: &str, seed: u64) -> std::path::PathBuf {
        let cfg = SynthConfig::new(seed, 20, 50);
        let path = dir.join(name);
        write_workbook(&generate(&cfg), &cfg, &path).unwrap();
        path
    }

    #[test]
    fn open_file_hashes_and_previews_a_workbook() {
        let dir = tempfile::tempdir().unwrap();
        let path = synth_workbook(dir.path(), "holds.xlsx", 1);
        let a = open_file(&path).unwrap();
        let b = open_file(&path).unwrap();
        assert_eq!(a.content_hash, b.content_hash);
        assert_eq!(a.content_hash.len(), 64);
        assert!(a
            .content_hash
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)));
        assert_eq!(a.file_name, "holds.xlsx");
        assert!(a.modified.is_some());
        assert!(a.auto_map.missing_required().is_empty());
        let preview = a.preview(3);
        assert_eq!(preview.len(), 3);
        assert!(preview.iter().all(|r| r.len() == 14));
        assert!(a.preview(0).is_empty());
    }

    #[test]
    fn hash_is_sha256_of_the_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("abc.csv");
        std::fs::write(&path, "abc").unwrap();
        let opened = open_file(&path).unwrap();
        assert_eq!(
            opened.content_hash,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn different_workbooks_have_different_hashes() {
        let dir = tempfile::tempdir().unwrap();
        let a = open_file(&synth_workbook(dir.path(), "a.xlsx", 1)).unwrap();
        let b = open_file(&synth_workbook(dir.path(), "b.xlsx", 2)).unwrap();
        assert_ne!(a.content_hash, b.content_hash);
    }

    #[test]
    fn open_succeeds_without_required_columns_and_a_manual_map_parses() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("other.csv");
        std::fs::write(&path, "Line,Why,Kind\nL-1,x,MISC.\n").unwrap();
        let opened = open_file(&path).unwrap();
        let err = parse_opened(&opened, &opened.auto_map).unwrap_err();
        assert!(matches!(err, ImportError::MissingColumns { .. }), "{err:?}");

        let mut map = opened.auto_map.clone();
        map.fields.insert(Field::LineId, 0);
        map.fields.insert(Field::Remark, 1);
        map.fields.insert(Field::HoldType, 2);
        let loaded = parse_opened(&opened, &map).unwrap();
        assert_eq!(loaded.parsed.holds.len(), 1);
        assert_eq!(loaded.content_hash, opened.content_hash);
    }

    #[test]
    fn preview_never_returns_more_rows_than_exist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("two.csv");
        std::fs::write(&path, "a,b,c\n1,2,3\n4\n").unwrap();
        let opened = open_file(&path).unwrap();
        let preview = opened.preview(10);
        assert_eq!(preview.len(), 2);
        assert_eq!(preview[1], vec!["4", "", ""]);
    }

    #[test]
    fn a_saved_mapping_carries_to_a_file_with_another_column_order() {
        let dir = tempfile::tempdir().unwrap();
        let path_a = dir.path().join("a.csv");
        std::fs::write(&path_a, "Line,Why,Kind\nL-1,x,MISC.\n").unwrap();
        let opened = open_file(&path_a).unwrap();
        let fields = std::collections::BTreeMap::from([
            (Field::LineId, 0),
            (Field::Remark, 1),
            (Field::HoldType, 2),
        ]);
        let map = ColumnMap::from_fields(&opened.table.headers, fields);
        let loaded = parse_opened(&opened, &map).unwrap();
        let saved = loaded.map.to_saved(&loaded.headers);

        let path_b = dir.path().join("b.csv");
        std::fs::write(&path_b, "Kind,Line,Why\nMISC.,L-2,y\n").unwrap();
        let opened = open_file(&path_b).unwrap();
        let map = ColumnMap::auto_with(&opened.table.headers, &saved);
        let loaded = parse_opened(&opened, &map).unwrap();
        assert_eq!(loaded.parsed.holds.len(), 1);
        assert_eq!(loaded.parsed.holds[0].line_id, "L-2");
        assert_eq!(loaded.parsed.holds[0].remark, "y");
    }

    #[test]
    fn unreadable_report_date_warns_and_is_not_the_snapshot_source() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("report.xlsx");
        let mut book = rust_xlsxwriter::Workbook::new();
        let info = book.add_worksheet();
        info.set_name("info").unwrap();
        info.write_string(0, 0, "Report Date").unwrap();
        info.write_string(0, 1, "yesterday").unwrap();
        let data = book.add_worksheet();
        data.set_name("data").unwrap();
        for (i, h) in ["line_id", "hold_remark", "hold_type"].iter().enumerate() {
            data.write_string(0, i as u16, *h).unwrap();
            data.write_string(1, i as u16, ["L-1", "x", "MISC."][i])
                .unwrap();
        }
        book.save(&path).unwrap();

        let loaded = load_file(&path).unwrap();
        let found: Vec<_> = loaded
            .parsed
            .warnings
            .iter()
            .filter(|w| w.kind == WarningKind::UnreadableReportDate)
            .collect();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].row_number, None);
        assert_eq!(found[0].value.as_deref(), Some("yesterday"));
        assert_ne!(
            loaded.snapshot.map(|s| s.source),
            Some(SnapshotSource::InfoSheet)
        );
    }

    fn two_sheet_workbook(dir: &std::path::Path) -> std::path::PathBuf {
        let path = dir.join("two.xlsx");
        let mut book = rust_xlsxwriter::Workbook::new();
        let data = book.add_worksheet();
        data.set_name("data").unwrap();
        for (i, h) in ["line_id", "hold_remark", "hold_type"].iter().enumerate() {
            data.write_string(0, i as u16, *h).unwrap();
            data.write_string(1, i as u16, ["L-1", "x", "MISC."][i])
                .unwrap();
        }
        let other = book.add_worksheet();
        other.set_name("Other").unwrap();
        for (i, h) in ["Line", "Why", "Kind"].iter().enumerate() {
            other.write_string(0, i as u16, *h).unwrap();
        }
        other.write_string(1, 0, "L-9").unwrap();
        book.save(&path).unwrap();
        path
    }

    #[test]
    fn open_file_lists_sheets_and_open_sheet_chooses_one() {
        let dir = tempfile::tempdir().unwrap();
        let path = two_sheet_workbook(dir.path());
        let opened = open_file(&path).unwrap();
        assert_eq!(opened.sheets, vec!["data", "Other"]);
        assert_eq!(opened.sheet_name, "data");

        let other = open_sheet(&path, "Other").unwrap();
        assert_eq!(other.sheet_name, "Other");
        assert_eq!(other.table.headers, vec!["Line", "Why", "Kind"]);
        assert_eq!(other.sheets, vec!["data", "Other"]);
        assert!(!other.auto_map.missing_required().is_empty());
    }

    #[test]
    fn open_sheet_with_an_unknown_name_lists_the_sheets() {
        let dir = tempfile::tempdir().unwrap();
        let path = two_sheet_workbook(dir.path());
        let err = open_sheet(&path, "Nope").unwrap_err();
        assert_eq!(
            err,
            ImportError::NoDataSheet {
                sheets: vec!["data".into(), "Other".into()]
            }
        );
    }

    #[test]
    fn open_sheet_prefers_an_exact_name_over_a_loose_match() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("names.xlsx");
        let mut book = rust_xlsxwriter::Workbook::new();
        for (name, header) in [("Data ", "first"), ("data", "second"), ("Other", "third")] {
            let sheet = book.add_worksheet();
            sheet.set_name(name).unwrap();
            sheet.write_string(0, 0, header).unwrap();
            sheet.write_string(1, 0, "x").unwrap();
        }
        book.save(&path).unwrap();
        for (wanted, opened, header) in [
            ("Data ", "Data ", "first"),
            ("data", "data", "second"),
            ("OTHER", "Other", "third"),
        ] {
            let got = open_sheet(&path, wanted).unwrap();
            assert_eq!(got.sheet_name, opened, "{wanted:?}");
            assert_eq!(got.table.headers, vec![header], "{wanted:?}");
        }
        assert!(open_sheet(&path, "nope").is_err());
    }

    #[test]
    fn delimited_text_has_no_sheets() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.csv");
        std::fs::write(&path, "line_id,hold_remark,hold_type\nL-1,x,MISC.\n").unwrap();
        assert!(open_file(&path).unwrap().sheets.is_empty());
        let err = open_sheet(&path, "csv").unwrap_err();
        assert_eq!(err, ImportError::NoDataSheet { sheets: Vec::new() });
    }

    #[test]
    fn tab_and_text_files_are_read_as_delimited_text() {
        let dir = tempfile::tempdir().unwrap();
        let tsv = dir.path().join("a.tsv");
        std::fs::write(&tsv, "line_id\thold_remark\thold_type\nL-1\tx\tMISC.\n").unwrap();
        assert_eq!(load_file(&tsv).unwrap().parsed.holds.len(), 1);

        let text = "line_id\thold_remark\thold_type\r\nL-1\tx\tMISC.\r\n";
        let mut bytes = vec![0xFF, 0xFE];
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let txt = dir.path().join("b.txt");
        std::fs::write(&txt, &bytes).unwrap();
        assert_eq!(load_file(&txt).unwrap().parsed.holds.len(), 1);
    }
}
