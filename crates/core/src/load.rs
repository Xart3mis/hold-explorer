//! One call from a file path to parsed holds.

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

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
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
