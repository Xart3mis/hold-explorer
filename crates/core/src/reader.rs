//! Reads `.xlsx`, `.xlsm`, `.xlsb`, `.xls`, `.ods`, and delimited text (`.csv`, `.tsv`, `.txt`)
//! files into a raw table.

use std::collections::BTreeMap;
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::SystemTime;

use calamine::Ods;
use calamine::{
    open_workbook_auto_from_rs, open_workbook_from_rs, Data, DataType, Error as CalamineError,
    Range, Reader, Sheets, Xls, Xlsb, Xlsx,
};

use crate::error::ImportError;

use crate::mapping::ColumnMap;
use crate::table::{Cell, RawTable};

/// What a spreadsheet file holds: its information sheet and its data sheet.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct WorkbookData {
    /// Key and value pairs of the `info` sheet. Empty when there is none.
    pub(crate) info: BTreeMap<String, String>,
    /// Every sheet name of the workbook in workbook order; empty for delimited text.
    pub(crate) sheets: Vec<String>,
    /// The sheet the table was read from; for delimited text, `csv`.
    pub(crate) sheet_name: String,
    /// The header row and data rows of that sheet.
    pub(crate) table: RawTable,
    /// Cells holding an Excel error (#N/A, #REF!, ...) in the chosen sheet, read as blank.
    pub(crate) error_cells: usize,
}

fn unreadable(path: &Path, detail: impl ToString) -> ImportError {
    ImportError::Unreadable {
        path: path.display().to_string(),
        detail: detail.to_string(),
    }
}

/// The largest file that is read, in bytes.
pub(crate) const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;

/// Refuses what is not a regular file, or is larger than [`MAX_FILE_BYTES`], before anything is
/// read: a device or a named pipe could block or never end.
fn check_plain_file(path: &Path) -> Result<(), ImportError> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(ImportError::NotFound {
                path: path.display().to_string(),
            })
        }
        Err(e) => return Err(unreadable(path, e)),
    };
    if !metadata.is_file() {
        return Err(unreadable(
            path,
            "it is not a regular file (it is a folder, a device, or a pipe); choose an Excel workbook or a CSV file",
        ));
    }
    if metadata.len() > MAX_FILE_BYTES {
        let megabytes = |bytes: u64| bytes.div_ceil(1024 * 1024);
        return Err(unreadable(
            path,
            format!(
                "the file is {} MB, which is over the limit of {} MB; split the export into smaller files",
                megabytes(metadata.len()),
                megabytes(MAX_FILE_BYTES)
            ),
        ));
    }
    Ok(())
}

/// The bytes of a file and its modified time. The file is opened and read once. A missing file
/// is `NotFound`, an empty one is `EmptyFile`, one that is not a regular file or is larger than
/// [`MAX_FILE_BYTES`] is `Unreadable`, and any other I/O error is `Unreadable`.
pub(crate) fn read_file_bytes(path: &Path) -> Result<(Vec<u8>, Option<SystemTime>), ImportError> {
    check_plain_file(path)?;
    let read = || -> std::io::Result<(Vec<u8>, Option<SystemTime>)> {
        let mut file = std::fs::File::open(path)?;
        let modified = file.metadata().and_then(|m| m.modified()).ok();
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        Ok((bytes, modified))
    };
    match read() {
        Ok((bytes, _)) if bytes.is_empty() => Err(empty_file(path)),
        Ok(read) => Ok(read),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(ImportError::NotFound {
            path: path.display().to_string(),
        }),
        Err(e) => Err(unreadable(path, e)),
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

/// The text of a CSV file. A byte-order mark decides the encoding (UTF-8, UTF-16LE, UTF-16BE);
/// without one, valid UTF-8 is UTF-8 and anything else is Windows-1252.
fn decode_csv(bytes: &[u8]) -> String {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(rest).into_owned();
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return encoding_rs::UTF_16LE
            .decode_without_bom_handling(rest)
            .0
            .into_owned();
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return encoding_rs::UTF_16BE
            .decode_without_bom_handling(rest)
            .0
            .into_owned();
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => encoding_rs::WINDOWS_1252
            .decode_without_bom_handling(bytes)
            .0
            .into_owned(),
    }
}

/// Of comma, semicolon, and tab, the delimiter that splits the first non-blank line into the
/// most fields, not counting delimiters inside double quotes. A tie goes to the comma.
fn detect_delimiter(text: &str) -> u8 {
    let line = text.lines().find(|l| !l.trim().is_empty()).unwrap_or("");
    let mut best = (b',', 0usize);
    for candidate in *b",;\t" {
        let mut in_quotes = false;
        let mut count = 0usize;
        for ch in line.chars() {
            if ch == '"' {
                in_quotes = !in_quotes;
            } else if !in_quotes && ch == char::from(candidate) {
                count += 1;
            }
        }
        if count > best.1 {
            best = (candidate, count);
        }
    }
    best.0
}

/// The number of line breaks in `bytes`: `\r\n` counts once, a lone `\n` or `\r` once each.
fn count_line_breaks(bytes: &[u8]) -> usize {
    let mut count = 0;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' => {
                count += 1;
                if bytes.get(i + 1) == Some(&b'\n') {
                    i += 1;
                }
            }
            b'\n' => count += 1,
            _ => {}
        }
        i += 1;
    }
    count
}

fn read_csv(path: &Path, bytes: &[u8]) -> Result<WorkbookData, ImportError> {
    let text = decode_csv(bytes);
    if text.trim().is_empty() {
        return Err(empty_file(path));
    }
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .delimiter(detect_delimiter(&text))
        .from_reader(text.as_bytes());

    let mut rows: Vec<Vec<Cell>> = Vec::new();
    let mut lines: Vec<usize> = Vec::new();
    // Line breaks before `counted_to`, so each record only scans the text since the last one.
    let (mut counted_to, mut breaks) = (0usize, 0usize);
    for (index, record) in reader.records().enumerate() {
        let record = record.map_err(|e| unreadable(path, e))?;
        let line = match record.position() {
            Some(p) => {
                // The position is where the reader stood before the record, not where the
                // record starts: it may sit before blank lines or between `\r` and `\n`.
                let bytes = text.as_bytes();
                let mut offset = (p.byte() as usize).min(bytes.len());
                while offset < bytes.len() && matches!(bytes[offset], b'\r' | b'\n') {
                    offset += 1;
                }
                if offset > counted_to {
                    breaks += count_line_breaks(&text.as_bytes()[counted_to..offset]);
                    counted_to = offset;
                }
                breaks + 1
            }
            None => index + 1,
        };
        lines.push(line);
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
        .map(|c| c.as_text().trim().to_string())
        .collect();

    Ok(WorkbookData {
        info: BTreeMap::new(),
        sheets: Vec::new(),
        sheet_name: "csv".to_string(),
        table: RawTable {
            headers,
            rows,
            row_numbers: lines,
        },
        error_cells: 0,
    })
}

/// Opens a workbook from bytes, choosing the format by the file extension as
/// `calamine::open_workbook_auto` does.
fn open_sheets<'a>(
    extension: &str,
    bytes: &'a [u8],
) -> Result<Sheets<Cursor<&'a [u8]>>, CalamineError> {
    let cursor = Cursor::new(bytes);
    Ok(match extension {
        "xls" | "xla" => {
            Sheets::Xls(open_workbook_from_rs::<Xls<_>, _>(cursor).map_err(CalamineError::Xls)?)
        }
        "xlsx" | "xlsm" | "xlam" => {
            Sheets::Xlsx(open_workbook_from_rs::<Xlsx<_>, _>(cursor).map_err(CalamineError::Xlsx)?)
        }
        "xlsb" => {
            Sheets::Xlsb(open_workbook_from_rs::<Xlsb<_>, _>(cursor).map_err(CalamineError::Xlsb)?)
        }
        "ods" => {
            Sheets::Ods(open_workbook_from_rs::<Ods<_>, _>(cursor).map_err(CalamineError::Ods)?)
        }
        _ => open_workbook_auto_from_rs(cursor)?,
    })
}

/// Reads the file at `path` into a [`WorkbookData`], choosing the data sheet itself. Fails with
/// `NotFound`, `EmptyFile`, `Unreadable`, or `NoDataSheet`.
#[cfg(test)]
pub(crate) fn read_workbook(path: &Path) -> Result<WorkbookData, ImportError> {
    let (bytes, _) = read_file_bytes(path)?;
    parse_workbook_bytes(path, &bytes, None)
}

/// Parses the bytes of a file; `path` only gives the extension and the error messages. The
/// format is chosen by the extension: `.csv`, `.tsv`, and `.txt` are delimited text, the rest
/// are workbooks. `sheet` names the data sheet of a workbook; `None` lets the reader choose it.
/// Delimited text has no sheets, so a `sheet` gives `SheetNotFound` with an empty list.
pub(crate) fn parse_workbook_bytes(
    path: &Path,
    bytes: &[u8],
    sheet: Option<&str>,
) -> Result<WorkbookData, ImportError> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(extension.as_str(), "csv" | "tsv" | "txt") {
        return match sheet {
            Some(sheet) => Err(ImportError::SheetNotFound {
                sheet: sheet.to_string(),
                sheets: Vec::new(),
            }),
            None => read_csv(path, bytes),
        };
    }

    let mut workbook = open_sheets(&extension, bytes).map_err(|e| unreadable(path, e))?;
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

    if let Some(wanted) = sheet {
        let exact = names.iter().find(|n| n.as_str() == wanted);
        let Some(name) = exact.or_else(|| names.iter().find(|n| is_named(n, wanted))) else {
            return Err(ImportError::SheetNotFound {
                sheet: wanted.to_string(),
                sheets: names,
            });
        };
        let range = workbook
            .worksheet_range(name)
            .map_err(|e| unreadable(path, format!("sheet \"{name}\": {e}")))?;
        let (table, error_cells) = table_from_range(&range);
        return Ok(WorkbookData {
            info,
            sheet_name: name.clone(),
            sheets: names.clone(),
            table,
            error_cells,
        });
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
                sheets: names,
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
    use crate::load::{INFO_PROJECT_NO, INFO_REPORT_DATE};
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
            wb.info.get(INFO_PROJECT_NO).map(String::as_str),
            Some("0000-TEST")
        );
        assert_eq!(
            wb.info.get(INFO_REPORT_DATE).map(String::as_str),
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

    fn load_bytes(name: &str, bytes: &[u8]) -> crate::load::Loaded {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(name);
        std::fs::write(&path, bytes).unwrap();
        crate::load::load_file(&path).unwrap()
    }

    #[test]
    fn semicolon_csv_is_read() {
        let loaded = load_bytes("s.csv", b"line_id;hold_remark;hold_type\nL-1;x;MISC.\n");
        assert_eq!(loaded.parsed.holds.len(), 1);
        assert_eq!(loaded.parsed.holds[0].line_id, "L-1");
    }

    #[test]
    fn tab_csv_is_read() {
        let loaded = load_bytes("t.csv", b"line_id\thold_remark\thold_type\nL-1\tx\tMISC.\n");
        assert_eq!(loaded.parsed.holds.len(), 1);
    }

    #[test]
    fn quoted_semicolons_do_not_change_a_comma_delimiter() {
        let loaded = load_bytes(
            "c.csv",
            b"line_id,hold_remark,hold_type\nL-1,\"a;b;c\",MISC.\n",
        );
        assert_eq!(loaded.parsed.holds[0].remark, "a;b;c");
    }

    #[test]
    fn delimiter_is_counted_outside_quotes_on_the_first_line() {
        let loaded = load_bytes(
            "q.csv",
            b"line_id;hold_remark;hold_type\nL-1;\"a,b,c\";MISC.\n",
        );
        assert_eq!(loaded.parsed.holds[0].remark, "a,b,c");
    }

    #[test]
    fn windows_1252_csv_is_decoded() {
        let loaded = load_bytes(
            "w.csv",
            b"line_id;name;hold_type;hold_remark\nL-1;M\xFCller;MISC.;x\n",
        );
        assert_eq!(loaded.parsed.holds[0].name, "M\u{fc}ller");
    }

    #[test]
    fn utf_16le_tab_delimited_csv_is_read() {
        let text = "line_id\thold_remark\thold_type\nL-1\tx\tMISC.\n";
        // `encoding_rs` cannot encode to UTF-16, so the units are written out by hand.
        let mut bytes = vec![0xFF, 0xFE];
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let loaded = load_bytes("u16.csv", &bytes);
        assert_eq!(loaded.parsed.holds.len(), 1);
        assert_eq!(loaded.parsed.holds[0].line_id, "L-1");
    }

    #[test]
    fn utf_16be_csv_is_read() {
        let text = "line_id,hold_remark,hold_type\nL-1,x,MISC.\n";
        let mut bytes = vec![0xFE, 0xFF];
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&unit.to_be_bytes());
        }
        let loaded = load_bytes("u16be.csv", &bytes);
        assert_eq!(loaded.parsed.holds.len(), 1);
    }

    #[test]
    fn untidy_headers_are_mapped() {
        let loaded = load_bytes(
            "h.csv",
            "Line  ID,Hold\u{a0}Remark,HOLD-TYPE\nL-1,x,MISC.\n".as_bytes(),
        );
        assert_eq!(loaded.parsed.holds.len(), 1);
        assert_eq!(loaded.parsed.holds[0].remark, "x");
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
    fn zero_byte_workbook_is_an_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("empty.xlsx");
        std::fs::write(&path, "").unwrap();
        let err = read_workbook(&path).unwrap_err();
        assert!(matches!(err, ImportError::EmptyFile { .. }), "{err:?}");
    }

    #[test]
    fn csv_of_only_blank_lines_is_an_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("blank.csv");
        std::fs::write(&path, "\n\n  \n\n").unwrap();
        let err = read_workbook(&path).unwrap_err();
        assert!(matches!(err, ImportError::EmptyFile { .. }), "{err:?}");
    }

    #[test]
    fn path_below_a_file_or_a_directory_is_an_error_not_an_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("file.txt");
        std::fs::write(&file, "line_id,hold_remark,hold_type\n").unwrap();
        // A path below a regular file is not "not found" on Unix; the real error decides.
        // Windows reports a missing path component there, so only Unix pins the variant.
        let err = read_workbook(&file.join("holds.xlsx")).unwrap_err();
        assert!(!matches!(err, ImportError::EmptyFile { .. }), "{err:?}");
        #[cfg(unix)]
        assert!(matches!(err, ImportError::Unreadable { .. }), "{err:?}");
        // A directory exists but cannot be read as a file.
        let err = read_workbook(dir.path()).unwrap_err();
        assert!(matches!(err, ImportError::Unreadable { .. }), "{err:?}");
    }

    #[test]
    fn a_file_over_the_size_limit_is_refused_before_it_is_read() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("huge.csv");
        // Sparse: no disk is used and nothing is read.
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_FILE_BYTES + 1).unwrap();
        let err = read_file_bytes(&path).unwrap_err();
        let ImportError::Unreadable { detail, .. } = &err else {
            panic!("{err:?}");
        };
        assert!(detail.contains("257 MB"), "{detail}");
        assert!(detail.contains("256 MB"), "{detail}");
        assert!(detail.contains("limit"), "{detail}");
    }

    #[test]
    fn a_directory_says_it_is_not_a_regular_file() {
        let dir = tempfile::tempdir().unwrap();
        let err = read_file_bytes(dir.path()).unwrap_err();
        let ImportError::Unreadable { detail, .. } = &err else {
            panic!("{err:?}");
        };
        assert!(detail.contains("not a regular file"), "{detail}");
    }

    #[cfg(unix)]
    #[test]
    fn a_device_is_refused_without_being_read() {
        let err = read_file_bytes(Path::new("/dev/null")).unwrap_err();
        let ImportError::Unreadable { detail, .. } = &err else {
            panic!("{err:?}");
        };
        assert!(detail.contains("not a regular file"), "{detail}");
    }

    // A named pipe cannot be made with the standard library alone, so only /dev/null covers
    // the non-regular case.

    #[cfg(unix)]
    #[test]
    fn permission_denied_file_is_unreadable_not_not_found() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("locked.csv");
        std::fs::write(&path, "line_id,hold_remark,hold_type\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::read(&path).is_ok() {
            return; // running with privileges that ignore file modes
        }
        let err = read_workbook(&path).unwrap_err();
        assert!(matches!(err, ImportError::Unreadable { .. }), "{err:?}");
    }

    #[test]
    fn upper_case_extension_reads_like_lower_case() {
        let cfg = SynthConfig::new(3, 40, 150);
        let rows = generate(&cfg);
        let dir = tempfile::tempdir().unwrap();
        let lower = dir.path().join("holds.xlsx");
        write_workbook(&rows, &cfg, &lower).unwrap();
        // A second directory: on Windows the two names are the same file.
        let upper_dir = tempfile::tempdir().unwrap();
        let upper = upper_dir.path().join("HOLDS.XLSX");
        std::fs::copy(&lower, &upper).unwrap();

        let a = read_workbook(&lower).unwrap();
        let b = read_workbook(&upper).unwrap();
        assert_eq!(b.sheet_name, a.sheet_name);
        assert_eq!(b.table.headers, a.table.headers);
        assert_eq!(b.table.headers, hx_synth::HEADERS);
        assert_eq!(b.table.rows.len(), rows.len());
    }

    #[test]
    fn unknown_extension_is_read_by_content_sniffing() {
        let cfg = SynthConfig::new(3, 40, 150);
        let rows = generate(&cfg);
        let dir = tempfile::tempdir().unwrap();
        let xlsx = dir.path().join("holds.xlsx");
        write_workbook(&rows, &cfg, &xlsx).unwrap();
        let dat = dir.path().join("holds.dat");
        std::fs::copy(&xlsx, &dat).unwrap();

        let wb = read_workbook(&dat).unwrap();
        assert_eq!(wb.table.headers, hx_synth::HEADERS);
        assert_eq!(wb.table.rows.len(), rows.len());
    }

    #[test]
    fn csv_row_numbers_count_crlf_and_blank_lines() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("crlf.csv");
        std::fs::write(
            &path,
            "\r\n\r\nline_id,hold_remark,hold_type\r\nL-1,x,MISC.\r\n\r\nL-2,y,P&ID\r\n",
        )
        .unwrap();
        let wb = read_workbook(&path).unwrap();
        assert_eq!(
            wb.table.headers,
            vec!["line_id", "hold_remark", "hold_type"]
        );
        assert_eq!(wb.table.row_numbers, vec![4, 6]);
    }

    #[test]
    fn utf_16le_csv_row_numbers_count_blank_lines() {
        let text = "line_id,hold_remark,hold_type\r\nL-1,x,MISC.\r\n\r\nL-2,y,P&ID\r\n";
        let mut bytes = vec![0xFF, 0xFE];
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("u16.csv");
        std::fs::write(&path, &bytes).unwrap();
        let wb = read_workbook(&path).unwrap();
        assert_eq!(wb.table.rows.len(), 2);
        assert_eq!(wb.table.row_numbers, vec![2, 4]);
    }

    #[test]
    fn workbook_with_only_an_info_sheet_has_no_data_sheet() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("info.xlsx");
        let mut book = rust_xlsxwriter::Workbook::new();
        let sheet = book.add_worksheet();
        sheet.set_name("info").unwrap();
        sheet.write_string(0, 0, INFO_PROJECT_NO).unwrap();
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

    fn csv_row_numbers(text: &[u8]) -> Vec<usize> {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rows.csv");
        std::fs::write(&path, text).unwrap();
        read_workbook(&path).unwrap().table.row_numbers
    }

    const H: &str = "line_id,hold_remark,hold_type";

    #[test]
    fn row_numbers_crlf_without_blank_lines() {
        let text = format!("{H}\r\nL-1,a,M\r\nL-2,b,M\r\nL-3,c,M\r\n");
        assert_eq!(csv_row_numbers(text.as_bytes()), vec![2, 3, 4]);
    }

    #[test]
    fn row_numbers_lf_one_blank_line_after_header() {
        let text = format!("{H}\n\nL-1,a,M\nL-2,b,M\nL-3,c,M\n");
        assert_eq!(csv_row_numbers(text.as_bytes()), vec![3, 4, 5]);
    }

    #[test]
    fn row_numbers_lf_two_blank_lines_between_rows() {
        let text = format!("{H}\nL-1,a,M\n\n\nL-2,b,M\n");
        assert_eq!(csv_row_numbers(text.as_bytes()), vec![2, 5]);
    }

    #[test]
    fn row_numbers_crlf_two_blank_lines_between_rows() {
        let text = format!("{H}\r\nL-1,a,M\r\n\r\n\r\nL-2,b,M\r\n");
        assert_eq!(csv_row_numbers(text.as_bytes()), vec![2, 5]);
    }

    #[test]
    fn row_numbers_crlf_quoted_field_spanning_two_lines() {
        let text = format!("{H}\r\nL-1,\"a\r\nb\",M\r\nL-2,c,M\r\n");
        assert_eq!(csv_row_numbers(text.as_bytes()), vec![2, 4]);
    }

    #[test]
    fn row_numbers_lf_leading_blank_lines_and_blank_between_rows() {
        let text = format!("\n\n{H}\nL-1,a,M\n\nL-2,b,M\n");
        assert_eq!(csv_row_numbers(text.as_bytes()), vec![4, 6]);
    }

    #[test]
    fn row_numbers_lone_cr_line_endings() {
        let text = format!("{H}\rL-1,a,M\rL-2,b,M\r");
        assert_eq!(csv_row_numbers(text.as_bytes()), vec![2, 3]);
    }

    #[test]
    fn row_numbers_utf_16le_crlf_without_blank_lines() {
        let text = format!("{H}\r\nL-1,a,M\r\nL-2,b,M\r\nL-3,c,M\r\n");
        let mut bytes = vec![0xFF, 0xFE];
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        assert_eq!(csv_row_numbers(&bytes), vec![2, 3, 4]);
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
