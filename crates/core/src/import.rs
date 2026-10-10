//! Turns a raw table into normalized holds.

use crate::error::ImportError;
use crate::mapping::{ColumnMap, Field};
use crate::model::Hold;
use crate::normalize::{clean_text, discipline_or_default, or_dash};
use crate::table::{ambiguous_parts, Cell, DateOrder, RawTable};
use crate::warning::{ImportWarning, WarningKind};
use serde::{Deserialize, Serialize};

/// Why a data row was left out of the import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SkipKind {
    /// The row's line ID is blank, so it belongs to no line.
    BlankLineId,
    /// The row's creation date is present but cannot be read as a date.
    UnreadableDate,
}

/// A data row that was left out of the import.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SkippedRow {
    /// One-based row of the sheet, or line of a delimited text file, as the file shows it.
    pub row_number: usize,
    /// Why the row was skipped.
    pub kind: SkipKind,
    /// The value that caused the skip, as found in the file; `None` for a blank line ID.
    pub value: Option<String>,
    /// Why the row was skipped as a sentence fragment, for example `blank line_id`.
    pub reason: String,
}

/// The result of parsing a table into holds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Parsed {
    /// The holds read, in row order. Never empty.
    pub holds: Vec<Hold>,
    /// Rows left out, in row order. Entirely empty rows are not listed.
    pub skipped: Vec<SkippedRow>,
    /// Things the import changed or assumed.
    pub warnings: Vec<ImportWarning>,
    /// True when the file has no `id` or no `released` column (see `ColumnMap::is_limited`).
    pub limited: bool,
}

fn is_blank(cell: &Cell) -> bool {
    match cell {
        Cell::Empty => true,
        Cell::Text(text) => text.trim().is_empty(),
        _ => false,
    }
}

/// A model or LDT size: `Ok(None)` when blank or zero, `Err(text)` when the value is present
/// but is not a finite number of zero or more.
fn size(cell: &Cell) -> Result<Option<f64>, String> {
    if is_blank(cell) {
        return Ok(None);
    }
    match cell.as_number() {
        Some(n) if n >= 0.0 => Ok((n > 0.0).then_some(n)),
        _ => Err(cell.as_text().trim().to_string()),
    }
}

/// Day/month order of one date column, from its text cells of the shape `a/b/yyyy`
/// (also `a-b-yyyy`, `a.b.yyyy`). A first part above 12 means day-first; otherwise a second
/// part above 12 means month-first; otherwise the column is undecided (`None`).
fn decided_date_order<'a>(cells: impl IntoIterator<Item = &'a Cell>) -> Option<DateOrder> {
    let mut month_first = false;
    for cell in cells {
        let Cell::Text(text) = cell else { continue };
        let Some((first, second)) = ambiguous_parts(text) else {
            continue;
        };
        if first > 12 {
            return Some(DateOrder::DayFirst);
        }
        if second > 12 {
            month_first = true;
        }
    }
    month_first.then_some(DateOrder::MonthFirst)
}

/// The order of one date column; an undecided column is read day-first, because the original
/// tool reads `d/m/yyyy`.
#[cfg(test)]
fn infer_date_order<'a>(cells: impl IntoIterator<Item = &'a Cell>) -> DateOrder {
    decided_date_order(cells).unwrap_or(DateOrder::DayFirst)
}

/// Turns a raw table into holds using `map`. Rows with a blank `line_id` or an unreadable
/// creation date are skipped and reported in [`Parsed::skipped`]; blank rows are dropped
/// silently. Fails when a required column is not mapped, the table has no rows, or no row
/// could be read.
pub fn parse_table(table: &RawTable, map: &ColumnMap) -> Result<Parsed, ImportError> {
    let missing = map.missing_required();
    if !missing.is_empty() {
        return Err(ImportError::MissingColumns { missing });
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

    let order_of = |field: Field| {
        let column = map.fields.get(&field).copied();
        decided_date_order(
            table
                .rows
                .iter()
                .filter_map(|row| column.and_then(|index| row.get(index))),
        )
    };
    // A column that cannot decide its own order takes the other column's; with neither
    // decided, both are day-first.
    let (created, release) = (order_of(Field::Created), order_of(Field::ReleaseDate));
    let created_order = created.or(release).unwrap_or(DateOrder::DayFirst);
    let release_order = release.or(created).unwrap_or(DateOrder::DayFirst);

    let mut warnings = Vec::new();
    for (field, own, other) in [
        (Field::Created, created, release),
        (Field::ReleaseDate, release, created),
    ] {
        let Some(&column) = map.fields.get(&field) else {
            continue;
        };
        let has_ambiguous = table.rows.iter().any(|row| {
            matches!(row.get(column), Some(Cell::Text(text)) if ambiguous_parts(text).is_some_and(|(first, second)| first != second))
        });
        if own.is_none() && other.is_none() && has_ambiguous {
            let name = table
                .headers
                .get(column)
                .map_or(field.label(), String::as_str);
            warnings.push(ImportWarning {
                kind: WarningKind::AssumedDateOrder,
                row_number: None,
                column: Some(name.to_string()),
                value: None,
                detail: format!(
                    "The dates in column \"{name}\" such as 02/09/2026 could be day/month or month/day, and no value settles it, so they were read day-first. If they are month-first, change the dates to an unambiguous form such as 2026-09-02 in the source and import again."
                ),
            });
        }
    }

    // Unrecognized columns that share a name keep the first name and number the later ones;
    // `ColumnMap::extra_names` decides the names, because the map is data a user can edit.
    let names = map.extra_names();
    for (extra, unique) in map.extras.iter().zip(&names) {
        if *unique != extra.name {
            warnings.push(ImportWarning {
                kind: WarningKind::DuplicateHeader,
                row_number: None,
                column: Some(extra.name.clone()),
                value: None,
                detail: format!(
                    "The column header \"{}\" appears more than once, so its later columns were named \"{unique}\" and so on. Rename the headers in the source if you want different names, and import again.",
                    extra.name
                ),
            });
        }
    }
    let extra_names: Vec<(usize, &String)> = map
        .extras
        .iter()
        .map(|extra| extra.column)
        .zip(&names)
        .collect();

    let header_of = |field: Field| -> Option<String> {
        map.fields
            .get(&field)
            .and_then(|&index| table.headers.get(index))
            .cloned()
    };
    let mut seen_ids = std::collections::HashSet::new();
    let mut holds = Vec::with_capacity(table.rows.len());
    let mut skipped = Vec::new();

    for (index, row) in table.rows.iter().enumerate() {
        if row.iter().all(|c| matches!(c, Cell::Empty)) {
            continue;
        }
        let row_number = table.row_number(index);

        let line_id = clean_text(&cell(row, Field::LineId).as_text());
        if line_id.is_empty() {
            skipped.push(SkippedRow {
                row_number,
                kind: SkipKind::BlankLineId,
                value: None,
                reason: "blank line_id".to_string(),
            });
            continue;
        }
        let created = match cell(row, Field::Created).as_datetime(created_order) {
            Ok(value) => value,
            Err(raw) => {
                skipped.push(SkippedRow {
                    row_number,
                    kind: SkipKind::UnreadableDate,
                    reason: format!("unparseable date \"{raw}\""),
                    value: Some(raw),
                });
                continue;
            }
        };

        let extra = extra_names
            .iter()
            .filter_map(|(column, name)| {
                let value = clean_text(&row.get(*column).map(Cell::as_text).unwrap_or_default());
                if value.is_empty() {
                    None
                } else {
                    Some(((*name).clone(), value))
                }
            })
            .collect();

        let source_id = {
            let value = cell(row, Field::SourceId);
            let id = value.as_id();
            let raw = value.as_text().trim().to_string();
            if id.is_none() && !is_blank(&value) {
                warnings.push(ImportWarning {
                    kind: WarningKind::UnreadableId,
                    row_number: Some(row_number),
                    column: header_of(Field::SourceId),
                    detail: format!(
                        "Row {row_number}: the id \"{raw}\" is not an exact whole number, so the hold has no id. Correct the value in the source and import again."
                    ),
                    value: Some(raw),
                });
            } else if id.is_some_and(|id| !seen_ids.insert(id)) {
                warnings.push(ImportWarning {
                    kind: WarningKind::DuplicateId,
                    row_number: Some(row_number),
                    column: header_of(Field::SourceId),
                    detail: format!(
                        "Row {row_number}: the id \"{raw}\" was already used by an earlier row, so two holds share it. Make the ids unique in the source and import again."
                    ),
                    value: Some(raw),
                });
            }
            id
        };

        let released = {
            let value = cell(row, Field::Released);
            match value.as_bool() {
                Some(flag) => flag,
                None => {
                    let raw = value.as_text().trim().to_string();
                    if !raw.is_empty() {
                        warnings.push(ImportWarning {
                            kind: WarningKind::UnrecognizedReleased,
                            row_number: Some(row_number),
                            column: header_of(Field::Released),
                            detail: format!(
                                "Row {row_number}: the released value \"{raw}\" is not a recognized true or false value, so the hold is treated as open. Correct the value in the source (for example TRUE or FALSE) and import again."
                            ),
                            value: Some(raw),
                        });
                    }
                    false
                }
            }
        };

        let release_date = match cell(row, Field::ReleaseDate).as_datetime(release_order) {
            Ok(date) => date,
            Err(raw) => {
                warnings.push(ImportWarning {
                    kind: WarningKind::UnreadableReleaseDate,
                    row_number: Some(row_number),
                    column: header_of(Field::ReleaseDate),
                    detail: format!(
                        "Row {row_number}: the release date \"{raw}\" could not be read as a date, so the hold has no release date. Correct the value in the source and import again."
                    ),
                    value: Some(raw),
                });
                None
            }
        };

        let mut sizes = [None, None];
        for (slot, field) in sizes.iter_mut().zip([Field::ModelSize, Field::LdtSize]) {
            match size(&cell(row, field)) {
                Ok(value) => *slot = value,
                Err(raw) => warnings.push(ImportWarning {
                    kind: WarningKind::UnreadableSize,
                    row_number: Some(row_number),
                    column: header_of(field),
                    detail: format!(
                        "Row {row_number}: the size \"{raw}\" is not a number of zero or more, so the hold has no size. Correct the value in the source and import again."
                    ),
                    value: Some(raw),
                }),
            }
        }
        let [model_size, ldt_size] = sizes;

        holds.push(Hold {
            source_id,
            line_id,
            name: or_dash(&cell(row, Field::Name).as_text()),
            role: or_dash(&cell(row, Field::Role).as_text()),
            remark: clean_text(&cell(row, Field::Remark).as_text()),
            hold_type: or_dash(&cell(row, Field::HoldType).as_text()),
            discipline: discipline_or_default(&cell(row, Field::Discipline).as_text()),
            created,
            released,
            release_remark: clean_text(&cell(row, Field::ReleaseRemark).as_text()),
            release_date,
            model_size,
            ldt_size,
            stress_calc: clean_text(&cell(row, Field::StressCalc).as_text()),
            extra,
        });
    }

    if holds.is_empty() {
        return Err(match skipped.first() {
            None => ImportError::Empty,
            Some(first) => ImportError::NoHolds {
                skipped_rows: skipped.len(),
                example: format!("row {}: {}", first.row_number, first.reason),
            },
        });
    }

    Ok(Parsed {
        holds,
        skipped,
        warnings,
        limited: map.is_limited(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mapping::ExtraColumn;
    use chrono::NaiveDate;

    fn text(s: &str) -> Cell {
        Cell::Text(s.to_string())
    }

    fn at(y: i32, m: u32, d: u32, h: u32) -> Cell {
        Cell::DateTime(
            NaiveDate::from_ymd_opt(y, m, d)
                .unwrap()
                .and_hms_opt(h, 0, 0)
                .unwrap(),
        )
    }

    fn table() -> RawTable {
        let headers = [
            "id",
            "line_id",
            "name",
            "role",
            "hold_remark",
            "hold_type",
            "discipline",
            "date",
            "released",
            "release_date",
            "model_size",
            "ldt_size",
            "stress_calc",
            "Area",
        ];
        RawTable {
            headers: headers.iter().map(|s| s.to_string()).collect(),
            rows: vec![
                vec![
                    Cell::Number(1.0),
                    text(" L-1 "),
                    text("Engineer 01"),
                    text("Designer"),
                    text("FIV/AIV REPORT\n"),
                    text("MISC."),
                    Cell::Empty,
                    at(2026, 9, 1, 10),
                    Cell::Bool(false),
                    Cell::Empty,
                    text("4"),
                    Cell::Number(0.0),
                    text("NR"),
                    text("North"),
                ],
                vec![
                    Cell::Number(2.0),
                    Cell::Empty,
                    text("Engineer 02"),
                    text("Designer"),
                    text("x"),
                    text("MISC."),
                    text("Civil"),
                    at(2026, 9, 1, 11),
                    Cell::Bool(false),
                    Cell::Empty,
                    Cell::Empty,
                    Cell::Empty,
                    Cell::Empty,
                    Cell::Empty,
                ],
                vec![
                    Cell::Number(3.0),
                    text("L-2"),
                    text("Engineer 02"),
                    text("Designer"),
                    text("x"),
                    text("MISC."),
                    text("Civil"),
                    text("not a date"),
                    Cell::Bool(false),
                    Cell::Empty,
                    Cell::Empty,
                    Cell::Empty,
                    Cell::Empty,
                    Cell::Empty,
                ],
                vec![Cell::Empty; 14],
                vec![
                    Cell::Number(4.0),
                    text("L-3"),
                    Cell::Empty,
                    Cell::Empty,
                    Cell::Empty,
                    text("P&ID"),
                    text("Civil"),
                    text("2026-09-02 08:00:00.123"),
                    text("True"),
                    at(2026, 9, 20, 9),
                    Cell::Number(6.0),
                    Cell::Number(6.0),
                    Cell::Empty,
                    Cell::Empty,
                ],
            ],
            ..Default::default()
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
    fn hand_built_table_numbers_rows_from_two() {
        let t = RawTable {
            headers: vec!["line_id".into(), "hold_remark".into(), "hold_type".into()],
            rows: vec![
                vec![text("L-1"), text("x"), text("MISC.")],
                vec![Cell::Empty, text("y"), text("MISC.")],
            ],
            ..Default::default()
        };
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        assert_eq!(parsed.skipped.len(), 1);
        assert_eq!(parsed.skipped[0].row_number, 3);
    }

    #[test]
    fn missing_required_columns_are_named() {
        let t = RawTable {
            headers: vec!["line_id".to_string(), "hold_type".to_string()],
            rows: vec![vec![text("L-1"), text("MISC.")]],
            ..Default::default()
        };
        let err = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap_err();
        assert_eq!(
            err,
            ImportError::MissingColumns {
                missing: vec![Field::Remark]
            }
        );
    }

    #[test]
    fn header_only_table_is_empty() {
        let t = RawTable {
            headers: vec!["line_id".into(), "hold_remark".into(), "hold_type".into()],
            rows: vec![],
            ..Default::default()
        };
        let err = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap_err();
        assert_eq!(err, ImportError::Empty);
    }

    #[test]
    fn file_without_id_is_limited() {
        let t = RawTable {
            headers: vec!["line_id".into(), "hold_remark".into(), "hold_type".into()],
            rows: vec![vec![text("L-1"), text("x"), text("MISC.")]],
            ..Default::default()
        };
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        assert!(parsed.limited);
        assert_eq!(parsed.holds[0].source_id, None);
    }

    fn dated_table(dates: &[Cell]) -> RawTable {
        RawTable {
            headers: vec![
                "line_id".into(),
                "hold_remark".into(),
                "hold_type".into(),
                "date".into(),
            ],
            rows: dates
                .iter()
                .enumerate()
                .map(|(i, d)| vec![text(&format!("L-{i}")), text("x"), text("MISC."), d.clone()])
                .collect(),
            ..Default::default()
        }
    }

    #[test]
    fn column_order_is_inferred_from_the_cells() {
        let cells = |texts: &[&str]| -> Vec<Cell> { texts.iter().map(|t| text(t)).collect() };
        assert_eq!(
            infer_date_order(&cells(&["02/09/2026", "25/09/2026"])),
            DateOrder::DayFirst
        );
        assert_eq!(
            infer_date_order(&cells(&["02/09/2026", "09/25/2026"])),
            DateOrder::MonthFirst
        );
        assert_eq!(
            infer_date_order(&cells(&["02/09/2026"])),
            DateOrder::DayFirst
        );
        assert_eq!(
            infer_date_order(&cells(&["09/25/2026 01:16 PM", "2026-09-02"])),
            DateOrder::MonthFirst
        );
    }

    #[test]
    fn month_first_text_column_loads_with_the_right_dates() {
        let t = dated_table(&[text("9/25/2026 13:16"), text("9/2/2026 8:05")]);
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        let dates: Vec<_> = parsed.holds.iter().map(|h| h.created).collect();
        let expect = |m, d, h, mi| {
            NaiveDate::from_ymd_opt(2026, m, d)
                .unwrap()
                .and_hms_opt(h, mi, 0)
        };
        assert_eq!(dates, vec![expect(9, 25, 13, 16), expect(9, 2, 8, 5)]);
    }

    #[test]
    fn impossible_date_skips_the_row() {
        let t = dated_table(&[text("13/13/2026"), text("2026-09-02")]);
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        assert_eq!(parsed.holds.len(), 1);
        assert_eq!(parsed.skipped[0].reason, "unparseable date \"13/13/2026\"");
    }

    #[test]
    fn excel_serial_in_a_date_column_is_a_date() {
        let t = dated_table(&[Cell::Number(46294.5)]);
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        assert_eq!(
            parsed.holds[0].created,
            NaiveDate::from_ymd_opt(2026, 9, 29)
                .unwrap()
                .and_hms_opt(12, 0, 0)
        );
    }

    fn three_column_table(rows: Vec<Vec<Cell>>) -> RawTable {
        RawTable {
            headers: vec!["line_id".into(), "hold_remark".into(), "hold_type".into()],
            rows,
            ..Default::default()
        }
    }

    #[test]
    fn only_blank_rows_is_an_empty_file() {
        let t = three_column_table(vec![vec![Cell::Empty; 3]; 4]);
        let err = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap_err();
        assert_eq!(err, ImportError::Empty);
        assert!(err.to_string().contains("no data rows"));
    }

    #[test]
    fn rows_that_are_all_skipped_report_the_count_and_an_example() {
        let row = || vec![Cell::Empty, text("x"), text("MISC.")];
        let t = three_column_table(vec![row(), row(), row(), row()]);
        let err = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap_err();
        assert_eq!(
            err,
            ImportError::NoHolds {
                skipped_rows: 4,
                example: "row 2: blank line_id".to_string()
            }
        );
        let message = err.to_string();
        assert!(message.contains("4 rows"), "{message}");
        assert!(message.contains("row 2: blank line_id"), "{message}");
    }

    #[test]
    fn odd_ids_and_sizes_are_dropped_not_coerced() {
        let mut t = RawTable {
            headers: vec![
                "id".into(),
                "line_id".into(),
                "hold_remark".into(),
                "hold_type".into(),
                "model_size".into(),
            ],
            rows: Vec::new(),
            ..Default::default()
        };
        for (id, size) in [("NaN", "inf"), ("1.9", "NaN"), ("9007199254740993", "6")] {
            t.rows.push(vec![
                text(id),
                text("L-1"),
                text("x"),
                text("MISC."),
                text(size),
            ]);
        }
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        let ids: Vec<_> = parsed.holds.iter().map(|h| h.source_id).collect();
        assert_eq!(ids, vec![None, None, None]);
        let sizes: Vec<_> = parsed.holds.iter().map(|h| h.model_size).collect();
        assert_eq!(sizes, vec![None, None, Some(6.0)]);
    }

    fn created_and_release_table(rows: &[(&str, &str)]) -> RawTable {
        RawTable {
            headers: vec![
                "line_id".into(),
                "hold_remark".into(),
                "hold_type".into(),
                "created".into(),
                "release_date".into(),
            ],
            rows: rows
                .iter()
                .enumerate()
                .map(|(i, (created, release))| {
                    vec![
                        text(&format!("L-{i}")),
                        text("x"),
                        text("MISC."),
                        text(created),
                        text(release),
                    ]
                })
                .collect(),
            ..Default::default()
        }
    }

    #[test]
    fn undecided_release_column_follows_the_decided_creation_column() {
        let t =
            created_and_release_table(&[("9/2/2026 13:16", "9/3/2026"), ("9/25/2026 8:01", "")]);
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        let day = |m, d| {
            NaiveDate::from_ymd_opt(2026, m, d)
                .unwrap()
                .and_hms_opt(0, 0, 0)
        };
        assert_eq!(parsed.holds[0].release_date, day(9, 3));
        assert_eq!(
            parsed.holds[0].created,
            NaiveDate::from_ymd_opt(2026, 9, 2)
                .unwrap()
                .and_hms_opt(13, 16, 0)
        );
    }

    #[test]
    fn undecided_creation_column_follows_the_decided_release_column() {
        let t = created_and_release_table(&[("9/3/2026", "9/25/2026"), ("1/2/2026", "")]);
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        let day = |m, d| {
            NaiveDate::from_ymd_opt(2026, m, d)
                .unwrap()
                .and_hms_opt(0, 0, 0)
        };
        assert_eq!(parsed.holds[0].created, day(9, 3));
        assert_eq!(parsed.holds[1].created, day(1, 2));
    }

    #[test]
    fn two_undecided_date_columns_are_both_day_first() {
        let t = created_and_release_table(&[("9/2/2026", "9/3/2026")]);
        let parsed = parse_table(&t, &ColumnMap::auto(&t.headers)).unwrap();
        let day = |m, d| {
            NaiveDate::from_ymd_opt(2026, m, d)
                .unwrap()
                .and_hms_opt(0, 0, 0)
        };
        assert_eq!(parsed.holds[0].created, day(2, 9));
        assert_eq!(parsed.holds[0].release_date, day(3, 9));
    }

    /// Columns: line_id, hold_remark, hold_type, date, released, release_date.
    fn warn_table(rows: Vec<[Cell; 3]>, with_release: bool) -> RawTable {
        let mut headers: Vec<String> = ["line_id", "hold_remark", "hold_type", "date"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        if with_release {
            headers.push("released".into());
            headers.push("release_date".into());
        }
        let rows = rows
            .into_iter()
            .map(|[date, released, release_date]| {
                let mut row = vec![text("L-1"), text("x"), text("MISC."), date];
                if with_release {
                    row.push(released);
                    row.push(release_date);
                }
                row
            })
            .collect();
        RawTable {
            headers,
            rows,
            ..Default::default()
        }
    }

    fn parse(t: &RawTable) -> Parsed {
        parse_table(t, &ColumnMap::auto(&t.headers)).unwrap()
    }

    fn kinds(parsed: &Parsed, kind: WarningKind) -> Vec<&ImportWarning> {
        parsed.warnings.iter().filter(|w| w.kind == kind).collect()
    }

    #[test]
    fn unreadable_release_date_is_kept_open_ended_and_warned() {
        let mut t = warn_table(
            vec![
                [at(2026, 9, 1, 9), Cell::Bool(true), Cell::Empty],
                [at(2026, 9, 1, 9), Cell::Bool(true), text("soon")],
            ],
            true,
        );
        t.row_numbers = vec![5, 7];
        let parsed = parse(&t);
        assert_eq!(parsed.holds.len(), 2);
        assert_eq!(parsed.holds[1].release_date, None);
        assert_eq!(parsed.warnings.len(), 1);
        let w = &parsed.warnings[0];
        assert_eq!(w.kind, WarningKind::UnreadableReleaseDate);
        assert_eq!(w.row_number, Some(7));
        assert!(w.detail.contains("soon"));
    }

    #[test]
    fn unrecognized_released_value_is_open_and_warned() {
        let t = warn_table(
            vec![
                [at(2026, 9, 1, 9), text("maybe"), Cell::Empty],
                [at(2026, 9, 1, 9), Cell::Empty, Cell::Empty],
            ],
            true,
        );
        let parsed = parse(&t);
        assert!(!parsed.holds[0].released);
        assert!(!parsed.holds[1].released);
        assert_eq!(parsed.warnings.len(), 1, "a blank released cell is silent");
        let w = &parsed.warnings[0];
        assert_eq!(w.kind, WarningKind::UnrecognizedReleased);
        assert_eq!(w.row_number, Some(2));
        assert!(w.detail.contains("maybe"));
    }

    fn created_only(dates: &[Cell]) -> RawTable {
        warn_table(
            dates
                .iter()
                .map(|d| [d.clone(), Cell::Empty, Cell::Empty])
                .collect(),
            false,
        )
    }

    #[test]
    fn undecided_date_column_with_ambiguous_dates_is_warned() {
        let parsed = parse(&created_only(&[text("02/09/2026"), text("03/09/2026")]));
        let found = kinds(&parsed, WarningKind::AssumedDateOrder);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].row_number, None);
        assert!(found[0].detail.contains("\"date\""));
        assert!(found[0].detail.contains("day-first"));
    }

    #[test]
    fn decided_or_real_date_columns_are_not_warned() {
        let decided = parse(&created_only(&[text("02/09/2026"), text("25/09/2026")]));
        assert!(kinds(&decided, WarningKind::AssumedDateOrder).is_empty());
        let real = parse(&created_only(&[at(2026, 9, 2, 9), at(2026, 9, 3, 9)]));
        assert!(kinds(&real, WarningKind::AssumedDateOrder).is_empty());
    }

    #[test]
    fn column_adopting_the_other_columns_order_is_not_warned() {
        let t = warn_table(
            vec![
                [text("02/09/2026"), Cell::Bool(true), text("09/25/2026")],
                [text("03/09/2026"), Cell::Bool(true), text("09/26/2026")],
            ],
            true,
        );
        let parsed = parse(&t);
        assert!(kinds(&parsed, WarningKind::AssumedDateOrder).is_empty());
    }

    #[test]
    fn parsed_survives_a_serde_json_round_trip() {
        let mut t = created_only(&[text("02/09/2026")]);
        t.rows
            .push(vec![Cell::Empty, text("x"), text("MISC."), Cell::Empty]);
        let mut parsed = parse(&t);
        assert_eq!(parsed.holds.len(), 1);
        parsed.skipped.push(SkippedRow {
            row_number: 3,
            kind: SkipKind::BlankLineId,
            value: None,
            reason: "blank line_id".into(),
        });
        assert_eq!(parsed.warnings.len(), 1);
        let json = serde_json::to_string(&parsed).unwrap();
        let back: Parsed = serde_json::from_str(&json).unwrap();
        assert_eq!(back, parsed);
    }

    fn area_table(map_extras: Option<Vec<ExtraColumn>>) -> (RawTable, ColumnMap) {
        let headers = [
            "line_id",
            "hold_remark",
            "hold_type",
            "Area",
            "Area",
            "Area",
        ];
        let table = RawTable {
            headers: headers.iter().map(|s| s.to_string()).collect(),
            rows: vec![vec![
                text("L-1"),
                text("x"),
                text("MISC."),
                text("N"),
                text("S"),
                text("E"),
            ]],
            ..Default::default()
        };
        let mut map = ColumnMap::auto(&table.headers);
        if let Some(extras) = map_extras {
            map.extras = extras;
        }
        (table, map)
    }

    #[test]
    fn repeated_unrecognized_headers_are_numbered_and_warned() {
        let (table, map) = area_table(None);
        let parsed = parse_table(&table, &map).unwrap();
        let extra = &parsed.holds[0].extra;
        assert_eq!(extra.get("Area").map(String::as_str), Some("N"));
        assert_eq!(extra.get("Area (2)").map(String::as_str), Some("S"));
        assert_eq!(extra.get("Area (3)").map(String::as_str), Some("E"));
        let found: Vec<_> = parsed
            .warnings
            .iter()
            .filter(|w| w.kind == WarningKind::DuplicateHeader)
            .collect();
        assert_eq!(found.len(), 2);
        assert!(found.iter().all(|w| w.detail.contains("Area")));
    }

    #[test]
    fn hand_edited_map_with_a_repeated_extra_name_is_renamed_too() {
        let (table, map) = area_table(Some(vec![
            ExtraColumn {
                column: 3,
                name: "Zone".to_string(),
            },
            ExtraColumn {
                column: 4,
                name: "Zone".to_string(),
            },
        ]));
        let parsed = parse_table(&table, &map).unwrap();
        let extra = &parsed.holds[0].extra;
        assert_eq!(extra.get("Zone").map(String::as_str), Some("N"));
        assert_eq!(extra.get("Zone (2)").map(String::as_str), Some("S"));
        assert_eq!(
            parsed
                .warnings
                .iter()
                .filter(|w| w.kind == WarningKind::DuplicateHeader)
                .count(),
            1
        );
    }

    #[test]
    fn a_recognized_field_repeated_is_not_a_duplicate_header() {
        let table = RawTable {
            headers: ["line_id", "hold_remark", "hold_type", "date", "created"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
            rows: vec![vec![
                text("L-1"),
                text("x"),
                text("MISC."),
                text("2026-09-01"),
                text("2026-09-02"),
            ]],
            ..Default::default()
        };
        let map = ColumnMap::auto(&table.headers);
        let parsed = parse_table(&table, &map).unwrap();
        assert!(parsed
            .warnings
            .iter()
            .all(|w| w.kind != WarningKind::DuplicateHeader));
        assert_eq!(
            parsed.holds[0].extra.get("created").map(String::as_str),
            Some("2026-09-02")
        );
    }

    #[test]
    fn extra_names_decide_the_hold_extra_keys() {
        let headers: Vec<String> = [
            "line_id",
            "hold_remark",
            "hold_type",
            "Area",
            "Area",
            "Area (2)",
            "Area",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let table = RawTable {
            headers: headers.clone(),
            rows: vec![vec![
                text("L-1"),
                text("x"),
                text("MISC."),
                text("v1"),
                text("v2"),
                text("v3"),
                text("v4"),
            ]],
            ..Default::default()
        };
        let map = ColumnMap::auto(&headers);
        let names = map.extra_names();
        let distinct: std::collections::HashSet<_> = names.iter().collect();
        assert_eq!(distinct.len(), 4);
        let parsed = parse_table(&table, &map).unwrap();
        let extra = &parsed.holds[0].extra;
        assert_eq!(extra.len(), 4);
        for (name, value) in names.iter().zip(["v1", "v2", "v3", "v4"]) {
            assert_eq!(extra.get(name).map(String::as_str), Some(value), "{name}");
        }
    }

    #[test]
    fn many_identical_extra_headers_are_fast() {
        let mut headers: Vec<String> = ["line_id", "hold_remark", "hold_type"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        headers.extend(std::iter::repeat_n("Area".to_string(), 2000));
        let mut row = vec![text("L-1"), text("x"), text("MISC.")];
        row.extend(std::iter::repeat_n(text("v"), 2000));
        let table = RawTable {
            headers: headers.clone(),
            rows: vec![row],
            ..Default::default()
        };
        let started = std::time::Instant::now();
        let parsed = parse_table(&table, &ColumnMap::auto(&headers)).unwrap();
        // The bound is loose so a busy machine does not fail the test; the old cubic code needed
        // about 10 s for this input, so a regression is still caught.
        assert!(started.elapsed() < std::time::Duration::from_secs(3));
        assert_eq!(parsed.holds[0].extra.len(), 2000);
    }

    fn semicolon_table() -> RawTable {
        let headers = [
            "line_id",
            "hold_remark",
            "hold_type",
            "model_size",
            "ldt_size",
            "id",
            "released",
        ];
        let row = |line: &str, model: &str, ldt: &str, id: &str, released: &str| -> Vec<Cell> {
            vec![
                text(line),
                text("x"),
                text("MISC."),
                text(model),
                text(ldt),
                text(id),
                text(released),
            ]
        };
        RawTable {
            headers: headers.iter().map(|s| s.to_string()).collect(),
            rows: vec![
                row("L-1", "1.5", "1,5", "7", "WAHR"),
                row("L-2", "2", "0,75", "7", "FALSCH"),
                row("L-3", "abc", "3", "abc", "Y"),
            ],
            row_numbers: vec![2, 3, 4],
        }
    }

    #[test]
    fn decimal_commas_and_unreadable_values_are_read_and_warned() {
        let t = semicolon_table();
        let parsed = parse(&t);
        let ldt: Vec<_> = parsed.holds.iter().map(|h| h.ldt_size).collect();
        assert_eq!(ldt, vec![Some(1.5), Some(0.75), Some(3.0)]);
        assert_eq!(parsed.holds[2].model_size, None);

        let sizes = kinds(&parsed, WarningKind::UnreadableSize);
        assert_eq!(sizes.len(), 1);
        assert_eq!(sizes[0].row_number, Some(4));
        assert_eq!(sizes[0].column.as_deref(), Some("model_size"));
        assert_eq!(sizes[0].value.as_deref(), Some("abc"));

        let ids = kinds(&parsed, WarningKind::UnreadableId);
        assert_eq!(ids.len(), 1);
        assert_eq!(ids[0].value.as_deref(), Some("abc"));
        assert_eq!(ids[0].column.as_deref(), Some("id"));
        assert_eq!(parsed.holds[2].source_id, None);

        let duplicates = kinds(&parsed, WarningKind::DuplicateId);
        assert_eq!(duplicates.len(), 1);
        assert_eq!(duplicates[0].row_number, Some(3));
        assert_eq!(duplicates[0].value.as_deref(), Some("7"));
        assert_eq!(parsed.holds[1].source_id, Some(7));

        let released = kinds(&parsed, WarningKind::UnrecognizedReleased);
        assert_eq!(released.len(), 2, "Y is a flag; WAHR and FALSCH are not");
        assert!(released
            .iter()
            .all(|w| w.column.as_deref() == Some("released")));
        assert!(parsed.holds[2].released);
    }

    fn size_table(model: Cell) -> RawTable {
        RawTable {
            headers: ["line_id", "hold_remark", "hold_type", "model_size"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
            rows: vec![vec![text("L-1"), text("x"), text("MISC."), model]],
            ..Default::default()
        }
    }

    #[test]
    fn negative_size_warns_and_zero_or_blank_does_not() {
        let negative = parse(&size_table(Cell::Number(-2.0)));
        assert_eq!(negative.holds[0].model_size, None);
        assert_eq!(kinds(&negative, WarningKind::UnreadableSize).len(), 1);
        for quiet in [Cell::Number(0.0), text("0"), Cell::Empty, text("  ")] {
            let parsed = parse(&size_table(quiet));
            assert_eq!(parsed.holds[0].model_size, None);
            assert!(parsed.warnings.is_empty());
        }
    }

    #[test]
    fn a_thousands_separator_size_warns_and_is_absent() {
        let parsed = parse(&size_table(text("1,000")));
        assert_eq!(parsed.holds[0].model_size, None);
        let sizes = kinds(&parsed, WarningKind::UnreadableSize);
        assert_eq!(sizes.len(), 1);
        assert_eq!(sizes[0].value.as_deref(), Some("1,000"));
    }

    fn id_table(id: Cell) -> RawTable {
        RawTable {
            headers: ["id", "line_id", "hold_remark", "hold_type"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
            rows: vec![vec![id, text("L-1"), text("x"), text("MISC.")]],
            ..Default::default()
        }
    }

    #[test]
    fn text_id_above_two_to_the_fifty_third_warns_and_is_absent() {
        let parsed = parse(&id_table(text("9007199254740993")));
        assert_eq!(parsed.holds[0].source_id, None);
        assert_eq!(kinds(&parsed, WarningKind::UnreadableId).len(), 1);
        let blank = parse(&id_table(Cell::Empty));
        assert!(blank.warnings.is_empty());
    }

    #[test]
    fn date_order_warning_needs_a_pair_whose_parts_differ() {
        let same = parse(&created_only(&[text("05/05/2026")]));
        assert!(kinds(&same, WarningKind::AssumedDateOrder).is_empty());
        let differ = parse(&created_only(&[text("05/06/2026")]));
        let found = kinds(&differ, WarningKind::AssumedDateOrder);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].column.as_deref(), Some("date"));
    }

    #[test]
    fn skipped_rows_carry_a_kind_and_the_value() {
        let t = table();
        let parsed = parse(&t);
        assert_eq!(parsed.skipped[0].kind, SkipKind::BlankLineId);
        assert_eq!(parsed.skipped[0].value, None);
        assert_eq!(parsed.skipped[1].kind, SkipKind::UnreadableDate);
        assert_eq!(parsed.skipped[1].value.as_deref(), Some("not a date"));
    }

    #[test]
    fn warnings_and_skips_survive_a_json_round_trip() {
        let t = semicolon_table();
        let parsed = parse(&t);
        for warning in &parsed.warnings {
            let json = serde_json::to_string(warning).unwrap();
            assert_eq!(
                &serde_json::from_str::<ImportWarning>(&json).unwrap(),
                warning
            );
        }
        let skipped = SkippedRow {
            row_number: 4,
            kind: SkipKind::UnreadableDate,
            value: Some("soon".into()),
            reason: "unparseable date \"soon\"".into(),
        };
        let json = serde_json::to_string(&skipped).unwrap();
        assert_eq!(serde_json::from_str::<SkippedRow>(&json).unwrap(), skipped);
    }
}
