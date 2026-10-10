//! Turns a raw table into normalized holds.

use crate::error::ImportError;
use crate::mapping::{ColumnMap, Field};
use crate::model::Hold;
use crate::normalize::{clean_text, discipline_or_default, or_dash};
use crate::table::{ambiguous_parts, Cell, DateOrder, RawTable};

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

/// Day/month order of one date column, from its text cells of the shape `a/b/yyyy`
/// (also `a-b-yyyy`, `a.b.yyyy`). A first part above 12 means day-first; otherwise a second
/// part above 12 means month-first; otherwise day-first, because the original tool reads
/// `d/m/yyyy`.
pub fn infer_date_order<'a>(cells: impl IntoIterator<Item = &'a Cell>) -> DateOrder {
    let mut month_first = false;
    for cell in cells {
        let Cell::Text(text) = cell else { continue };
        let Some((first, second)) = ambiguous_parts(text) else {
            continue;
        };
        if first > 12 {
            return DateOrder::DayFirst;
        }
        if second > 12 {
            month_first = true;
        }
    }
    if month_first {
        DateOrder::MonthFirst
    } else {
        DateOrder::DayFirst
    }
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

    let order_of = |field: Field| {
        let column = map.fields.get(&field).copied();
        infer_date_order(
            table
                .rows
                .iter()
                .filter_map(|row| column.and_then(|index| row.get(index))),
        )
    };
    let created_order = order_of(Field::Created);
    let release_order = order_of(Field::ReleaseDate);

    let mut holds = Vec::with_capacity(table.rows.len());
    let mut skipped = Vec::new();

    for (index, row) in table.rows.iter().enumerate() {
        if row.iter().all(|c| matches!(c, Cell::Empty)) {
            continue;
        }
        let row_number = index + 2;

        let line_id = clean_text(&cell(row, Field::LineId).as_text());
        if line_id.is_empty() {
            skipped.push(SkippedRow {
                row_number,
                reason: "blank line_id".to_string(),
            });
            continue;
        }
        let created = match cell(row, Field::Created).as_datetime(created_order) {
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
            release_date: cell(row, Field::ReleaseDate)
                .as_datetime(release_order)
                .unwrap_or(None),
            model_size: size(&cell(row, Field::ModelSize)),
            ldt_size: size(&cell(row, Field::LdtSize)),
            stress_calc: clean_text(&cell(row, Field::StressCalc).as_text()),
            extra,
        });
    }

    Ok(Parsed {
        holds,
        skipped,
        limited: map.is_limited(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
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
        assert_eq!(
            err,
            ImportError::MissingColumns(vec!["hold_remark".to_string()])
        );
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
}
