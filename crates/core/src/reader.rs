//! Reads `.xlsx`, `.xls`, and `.csv` files into a raw table.

use std::collections::BTreeMap;
use std::path::Path;

use calamine::{open_workbook_auto, Data, DataType, Range, Reader};

use crate::error::ImportError;
use serde::{Deserialize, Serialize};

use crate::mapping::ColumnMap;
use crate::table::{Cell, RawTable};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkbookData {
    /// Key and value pairs of the `info` sheet. Empty when there is none.
    pub info: BTreeMap<String, String>,
    pub sheet_name: String,
    pub table: RawTable,
    /// Cells holding an Excel error (#N/A, #REF!, ...) in the chosen sheet, read as blank.
    pub error_cells: usize,
}

fn unreadable(path: &Path, detail: impl ToString) -> ImportError {
    ImportError::Unreadable {
        path: path.display().to_string(),
        detail: detail.to_string(),
    }
}

fn not_found(path: &Path) -> ImportError {
    ImportError::NotFound {
        path: path.display().to_string(),
    }
}

fn empty_file(path: &Path) -> ImportError {
    ImportError::EmptyFile {
        path: path.display().to_string(),
    }
}

fn to_cell(data: &Data) -> Cell {
    match data {
        Data::Empty | Data::Error(_) => Cell::Empty,
        Data::String(s) if s.trim().is_empty() => Cell::Empty,
        Data::String(s) => Cell::Text(s.clone()),
        Data::Int(i) => Cell::Number(*i as f64),
        Data::Float(f) => Cell::Number(*f),
        Data::Bool(b) => Cell::Bool(*b),
        Data::DateTime(_) => data
            .as_datetime()
            .map(Cell::DateTime)
            .unwrap_or(Cell::Empty),
        other => Cell::Text(other.to_string()),
    }
}

/// The table of a sheet and the number of Excel error cells in it.
fn table_from_range(range: &Range<Data>) -> (RawTable, usize) {
    let errors = range
        .rows()
        .flatten()
        .filter(|c| matches!(c, Data::Error(_)))
        .count();
    let mut rows = range.rows();
    let headers = match rows.next() {
        Some(first) => first
            .iter()
            .map(|c| to_cell(c).as_text().trim().to_string())
            .collect(),
        None => Vec::new(),
    };
    // `start()` is the zero-based position of the used range's first cell; the header is
    // its first row, so the first data row is one-based `start_row + 2`.
    let first_data_row = range.start().map_or(2, |(row, _)| row as usize + 2);
    let rows: Vec<Vec<Cell>> = rows.map(|row| row.iter().map(to_cell).collect()).collect();
    let table = RawTable {
        headers,
        row_numbers: (first_data_row..first_data_row + rows.len()).collect(),
        rows,
    };
    (table, errors)
}

fn is_named(name: &str, wanted: &str) -> bool {
    name.trim().eq_ignore_ascii_case(wanted)
}

fn read_csv(path: &Path) -> Result<WorkbookData, ImportError> {
    if !path.exists() {
        return Err(not_found(path));
    }
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_path(path)
        .map_err(|e| unreadable(path, e))?;

    let mut rows: Vec<Vec<Cell>> = Vec::new();
    let mut lines: Vec<usize> = Vec::new();
    for (index, record) in reader.records().enumerate() {
        let record = record.map_err(|e| unreadable(path, e))?;
        lines.push(record.position().map_or(index + 1, |p| p.line() as usize));
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
        return Err(empty_file(path));
    }
    lines.remove(0);
    let headers = rows
        .remove(0)
        .iter()
        .map(|c| {
            c.as_text()
                .trim_start_matches('\u{feff}')
                .trim()
                .to_string()
        })
        .collect();

    Ok(WorkbookData {
        info: BTreeMap::new(),
        sheet_name: "csv".to_string(),
        table: RawTable {
            headers,
            rows,
            row_numbers: lines,
        },
        error_cells: 0,
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

    if !path.exists() {
        return Err(not_found(path));
    }
    let mut workbook = open_workbook_auto(path).map_err(|e| unreadable(path, e))?;
    let names: Vec<String> = workbook.sheet_names().to_vec();

    let mut info = BTreeMap::new();
    if let Some(name) = names.iter().find(|n| is_named(n, "info")) {
        if let Ok(range) = workbook.worksheet_range(name) {
            for row in range.rows() {
                let key = row
                    .first()
                    .map(|c| to_cell(c).as_text())
                    .unwrap_or_default();
                let value = row.get(1).map(|c| to_cell(c).as_text()).unwrap_or_default();
                if !key.trim().is_empty() {
                    info.insert(key.trim().to_string(), value.trim().to_string());
                }
            }
        }
    }

    let mut tables: Vec<(String, RawTable, usize)> = Vec::new();
    let mut first_sheet_error: Option<String> = None;
    for name in names.iter().filter(|n| !is_named(n, "info")) {
        match workbook.worksheet_range(name) {
            Ok(range) => {
                let (table, errors) = table_from_range(&range);
                if !table.headers.is_empty() {
                    tables.push((name.clone(), table, errors));
                }
            }
            Err(e) => {
                first_sheet_error.get_or_insert_with(|| format!("sheet \"{name}\": {e}"));
            }
        }
    }

    let chosen = tables
        .iter()
        .position(|(name, _, _)| is_named(name, "data"))
        .or_else(|| {
            tables
                .iter()
                .position(|(_, t, _)| ColumnMap::auto(&t.headers).missing_required().is_empty())
        })
        .or_else(|| tables.iter().position(|(_, t, _)| !t.rows.is_empty()));

    match chosen {
        Some(index) => {
            let (sheet_name, table, error_cells) = tables.swap_remove(index);
            Ok(WorkbookData {
                info,
                sheet_name,
                table,
                error_cells,
            })
        }
        None if names.is_empty() => Err(empty_file(path)),
        None => Err(match first_sheet_error {
            Some(detail) => unreadable(path, detail),
            None => ImportError::NoDataSheet { sheets: names },
        }),
    }
}

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
        assert_eq!(
            wb.info.get("Project No.").map(String::as_str),
            Some("0000-TEST")
        );
        assert_eq!(
            wb.info.get("Report Date").map(String::as_str),
            Some("09/29/2026 01:16 PM")
        );
        assert_eq!(wb.table.headers, hx_synth::HEADERS);
        assert_eq!(wb.table.rows.len(), rows.len());
        assert!(
            matches!(wb.table.rows[0][7], Cell::DateTime(_)),
            "date column is typed"
        );
        assert!(
            matches!(wb.table.rows[0][8], Cell::Bool(_)),
            "released column is typed"
        );
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
        assert_eq!(
            wb.table.headers,
            vec!["line_id", "hold_remark", "hold_type"]
        );
        assert_eq!(wb.table.rows.len(), 2);
        assert_eq!(
            wb.table.rows[0][1],
            Cell::Text("FIV/AIV, report".to_string())
        );
        assert_eq!(wb.table.rows[1][1], Cell::Empty);
        assert!(wb.info.is_empty());
    }

    #[test]
    fn workbook_row_numbers_follow_the_used_range() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("offset.xlsx");
        let mut book = rust_xlsxwriter::Workbook::new();
        let sheet = book.add_worksheet();
        sheet.set_name("data").unwrap();
        for (i, h) in ["line_id", "hold_remark", "hold_type"].iter().enumerate() {
            sheet.write_string(3, 2 + i as u16, *h).unwrap();
        }
        for (r, line) in [(4u32, "L-1"), (5, ""), (6, "L-3")] {
            if !line.is_empty() {
                sheet.write_string(r, 2, line).unwrap();
            }
            sheet.write_string(r, 3, "x").unwrap();
            sheet.write_string(r, 4, "MISC.").unwrap();
        }
        book.save(&path).unwrap();

        let wb = read_workbook(&path).unwrap();
        assert_eq!(wb.table.row_numbers, vec![5, 6, 7]);
        let parsed =
            crate::import::parse_table(&wb.table, &ColumnMap::auto(&wb.table.headers)).unwrap();
        assert_eq!(parsed.holds.len(), 2);
        assert_eq!(parsed.skipped.len(), 1);
        assert_eq!(parsed.skipped[0].row_number, 6);
    }

    #[test]
    fn csv_row_numbers_are_file_lines() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.csv");
        std::fs::write(
            &path,
            "line_id,hold_remark,hold_type\n\nL-1,x,MISC.\n,y,MISC.\nL-2,z,P&ID\n",
        )
        .unwrap();
        let wb = read_workbook(&path).unwrap();
        let parsed =
            crate::import::parse_table(&wb.table, &ColumnMap::auto(&wb.table.headers)).unwrap();
        assert_eq!(parsed.holds.len(), 2);
        assert_eq!(parsed.skipped.len(), 1);
        assert_eq!(parsed.skipped[0].row_number, 4);
    }

    #[test]
    fn excel_error_cells_are_read_as_blank_and_counted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("errors.xlsx");
        let mut book = rust_xlsxwriter::Workbook::new();
        let sheet = book.add_worksheet();
        sheet.set_name("data").unwrap();
        for (i, h) in ["line_id", "hold_remark", "hold_type"].iter().enumerate() {
            sheet.write_string(0, i as u16, *h).unwrap();
        }
        sheet.write_string(1, 0, "L-1").unwrap();
        sheet.write_string(1, 1, "x").unwrap();
        sheet.write_string(1, 2, "MISC.").unwrap();
        sheet.write_string(2, 0, "L-2").unwrap();
        sheet
            .write_formula(
                2,
                1,
                rust_xlsxwriter::Formula::new("=NA()").set_result("#N/A"),
            )
            .unwrap();
        sheet.write_string(2, 2, "MISC.").unwrap();
        book.save(&path).unwrap();

        let wb = read_workbook(&path).unwrap();
        assert_eq!(wb.error_cells, 1);
        assert_eq!(wb.table.rows[1][1], Cell::Empty);

        let loaded = crate::load::load_file(&path).unwrap();
        let found: Vec<_> = loaded
            .parsed
            .warnings
            .iter()
            .filter(|w| w.kind == crate::warning::WarningKind::ErrorCells)
            .collect();
        assert_eq!(found.len(), 1);
        assert!(found[0].detail.contains('1'));
    }

    #[test]
    fn missing_file_is_not_found() {
        let err = read_workbook(std::path::Path::new("/no/such/holds.xlsx")).unwrap_err();
        assert!(matches!(err, ImportError::NotFound { .. }), "{err:?}");
        let message = err.to_string();
        assert!(message.contains("not found"), "{message}");
        assert!(!message.contains("password"), "{message}");
        let err = read_workbook(std::path::Path::new("/no/such/holds.csv")).unwrap_err();
        assert!(matches!(err, ImportError::NotFound { .. }), "{err:?}");
    }

    #[test]
    fn zero_byte_csv_is_an_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("empty.csv");
        std::fs::write(&path, "").unwrap();
        let err = read_workbook(&path).unwrap_err();
        assert!(matches!(err, ImportError::EmptyFile { .. }), "{err:?}");
    }

    #[test]
    fn workbook_with_only_an_info_sheet_has_no_data_sheet() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("info.xlsx");
        let mut book = rust_xlsxwriter::Workbook::new();
        let sheet = book.add_worksheet();
        sheet.set_name("info").unwrap();
        sheet.write_string(0, 0, "Project No.").unwrap();
        sheet.write_string(0, 1, "X").unwrap();
        book.save(&path).unwrap();
        let err = read_workbook(&path).unwrap_err();
        assert_eq!(
            err,
            ImportError::NoDataSheet {
                sheets: vec!["info".to_string()]
            }
        );
        assert!(err.to_string().contains("info"));
    }

    #[test]
    fn csv_with_unknown_headers_lists_the_missing_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("other.csv");
        std::fs::write(&path, "Line,Why\nL-1,x\n").unwrap();
        let err = crate::load::load_file(&path).unwrap_err();
        assert_eq!(
            err,
            ImportError::MissingColumns {
                missing: vec![
                    crate::mapping::Field::Remark,
                    crate::mapping::Field::HoldType
                ]
            }
        );
    }

    #[test]
    fn text_file_named_xlsx_is_unreadable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fake.xlsx");
        std::fs::write(&path, "this is not a workbook").unwrap();
        let err = read_workbook(&path).unwrap_err();
        assert!(matches!(err, ImportError::Unreadable { .. }));
        assert!(err.to_string().contains("password"));
    }
}
