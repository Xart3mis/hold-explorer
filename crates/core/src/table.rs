//! Format-independent view of a sheet: a header row and rows of typed cells.

use std::sync::OnceLock;

use chrono::{Duration, NaiveDate, NaiveDateTime, NaiveTime};
use regex::Regex;

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
    /// One-based row (sheet row or CSV line) of each entry of `rows`. May be empty for tables built by hand.
    pub row_numbers: Vec<usize>,
}

impl RawTable {
    /// The recorded row number of `rows[index]`, or `index + 2` when none was recorded.
    pub fn row_number(&self, index: usize) -> usize {
        self.row_numbers.get(index).copied().unwrap_or(index + 2)
    }
}

/// Prints whole numbers without a fractional part: `4`, not `4.0`.
pub fn format_number(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

/// How `a/b/yyyy` is read when both parts are 12 or less.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateOrder {
    DayFirst,
    MonthFirst,
}

const TIME: &str =
    r"(?:[ T]+([0-9]{1,2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]+))?)?\s*([AaPp][Mm])?)?";

struct DateShapes {
    year_first: Regex,
    month_name: Regex,
    ambiguous: Regex,
}

fn shapes() -> &'static DateShapes {
    static SHAPES: OnceLock<DateShapes> = OnceLock::new();
    SHAPES.get_or_init(|| {
        let literal = "pattern is a valid literal";
        let build = |head: &str| Regex::new(&format!("^{head}{TIME}$")).expect(literal);
        DateShapes {
            year_first: build(r"([0-9]{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})"),
            month_name: build(
                r"(?i)([0-9]{1,2})[- ](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[- ]([0-9]{4})",
            ),
            ambiguous: build(r"([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{4})"),
        }
    })
}

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// The two leading numbers of an ambiguous `a/b/yyyy` text (separator `/`, `-`, or `.`,
/// optional time), or `None` for any other text.
pub(crate) fn ambiguous_parts(text: &str) -> Option<(u32, u32)> {
    let c = shapes().ambiguous.captures(text.trim())?;
    Some((c[1].parse().ok()?, c[2].parse().ok()?))
}

fn group<T: std::str::FromStr>(c: &regex::Captures, index: usize) -> Option<T> {
    c.get(index)?.as_str().parse().ok()
}

/// Reads the optional time groups that start at `first` (hour, minute, second, fraction,
/// AM/PM). No time part means midnight.
fn time_of(c: &regex::Captures, first: usize) -> Option<NaiveTime> {
    let Some(hour) = group::<u32>(c, first) else {
        return NaiveTime::from_hms_opt(0, 0, 0);
    };
    let minute = group(c, first + 1)?;
    let second = group(c, first + 2).unwrap_or(0);
    let nanos = match c.get(first + 3) {
        Some(fraction) => {
            let digits: String = fraction.as_str().chars().take(9).collect();
            format!("{digits:0<9}").parse().ok()?
        }
        None => 0,
    };
    let hour = match c.get(first + 4).map(|m| m.as_str().to_ascii_lowercase()) {
        Some(meridiem) => {
            if !(1..=12).contains(&hour) {
                return None;
            }
            hour % 12 + if meridiem == "pm" { 12 } else { 0 }
        }
        None => hour,
    };
    NaiveTime::from_hms_nano_opt(hour, minute, second, nanos)
}

fn parse_text(text: &str, order: DateOrder) -> Option<NaiveDateTime> {
    let shapes = shapes();
    let (date, time) = if let Some(c) = shapes.year_first.captures(text) {
        let date = NaiveDate::from_ymd_opt(group(&c, 1)?, group(&c, 2)?, group(&c, 3)?)?;
        (date, time_of(&c, 4)?)
    } else if let Some(c) = shapes.month_name.captures(text) {
        let name = c[2].to_ascii_lowercase();
        let month = MONTHS.iter().position(|m| *m == name)? as u32 + 1;
        let date = NaiveDate::from_ymd_opt(group(&c, 3)?, month, group(&c, 1)?)?;
        (date, time_of(&c, 4)?)
    } else {
        let c = shapes.ambiguous.captures(text)?;
        let (a, b) = (group(&c, 1)?, group(&c, 2)?);
        let (day, month) = match order {
            DateOrder::DayFirst => (a, b),
            DateOrder::MonthFirst => (b, a),
        };
        (
            NaiveDate::from_ymd_opt(group(&c, 3)?, month, day)?,
            time_of(&c, 4)?,
        )
    };
    Some(date.and_time(time))
}

/// Excel counts days from 1899-12-30. Serials from 20000 to 80000 are the years 1954 to 2119.
fn from_excel_serial(serial: f64) -> Option<NaiveDateTime> {
    if !(20000.0..=80000.0).contains(&serial) {
        return None;
    }
    let days = serial.floor();
    let seconds = ((serial - days) * 86400.0).round() as i64;
    NaiveDate::from_ymd_opt(1899, 12, 30)?
        .and_hms_opt(0, 0, 0)?
        .checked_add_signed(Duration::days(days as i64) + Duration::seconds(seconds))
}

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
        .filter(|n| n.is_finite())
    }

    /// A whole-number id. Text counts only as an optional sign and digits, optionally followed
    /// by a decimal point and zeros, and is parsed exactly as `i64`. A number
    /// counts only if it is finite, whole, and within +-2^53, so it is exact as an `f64`.
    pub fn as_id(&self) -> Option<i64> {
        const LIMIT: f64 = 9_007_199_254_740_992.0;
        let whole =
            |n: f64| (n.is_finite() && n.fract() == 0.0 && n.abs() <= LIMIT).then_some(n as i64);
        match self {
            Cell::Text(s) => {
                let text = s.trim();
                let whole_part = match text.split_once('.') {
                    Some((int, zeros)) if !zeros.is_empty() && zeros.bytes().all(|b| b == b'0') => {
                        int
                    }
                    Some(_) => return None,
                    None => text,
                };
                let digits = whole_part.strip_prefix(['+', '-']).unwrap_or(whole_part);
                if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
                    return None;
                }
                whole_part.parse().ok()
            }
            Cell::Number(n) => whole(*n),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Cell::Bool(b) => Some(*b),
            Cell::Number(n) if n.is_finite() => Some(*n != 0.0),
            Cell::Text(s) => match s.trim().to_ascii_lowercase().as_str() {
                "true" | "1" | "yes" => Some(true),
                "false" | "0" | "no" => Some(false),
                _ => None,
            },
            _ => None,
        }
    }

    /// `Ok(None)` for a blank cell, `Err(original text)` for a value that is
    /// present but is not a date. `order` decides `a/b/yyyy`; a number in a
    /// date column is an Excel serial.
    pub fn as_datetime(&self, order: DateOrder) -> Result<Option<NaiveDateTime>, String> {
        match self {
            Cell::Empty => Ok(None),
            Cell::DateTime(d) => Ok(Some(*d)),
            Cell::Text(s) => {
                let s = s.trim();
                if s.is_empty() {
                    return Ok(None);
                }
                parse_text(s, order).map(Some).ok_or_else(|| s.to_string())
            }
            Cell::Number(n) => from_excel_serial(*n)
                .map(Some)
                .ok_or_else(|| self.as_text()),
            other => Err(other.as_text()),
        }
    }
}

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
            text("2026-09-02 08:00:00.123")
                .as_datetime(DateOrder::DayFirst)
                .unwrap()
                .unwrap()
                .date(),
            expected
        );
        assert_eq!(
            text("2026-09-02")
                .as_datetime(DateOrder::DayFirst)
                .unwrap()
                .unwrap()
                .date(),
            expected
        );
        assert_eq!(
            text("02/09/2026")
                .as_datetime(DateOrder::DayFirst)
                .unwrap()
                .unwrap()
                .date(),
            expected
        );
        assert_eq!(
            text("09/02/2026 01:16 PM")
                .as_datetime(DateOrder::MonthFirst)
                .unwrap()
                .unwrap()
                .date(),
            expected
        );
    }

    #[test]
    fn blank_datetime_is_none_and_garbage_is_error() {
        assert_eq!(Cell::Empty.as_datetime(DateOrder::DayFirst), Ok(None));
        assert_eq!(text("  ").as_datetime(DateOrder::DayFirst), Ok(None));
        assert_eq!(
            text("not a date").as_datetime(DateOrder::DayFirst),
            Err("not a date".to_string())
        );
    }

    fn parse(s: &str, order: DateOrder) -> Result<Option<NaiveDateTime>, String> {
        text(s).as_datetime(order)
    }

    fn dt(y: i32, mo: u32, d: u32, h: u32, mi: u32, sec: u32) -> Option<NaiveDateTime> {
        NaiveDate::from_ymd_opt(y, mo, d).and_then(|date| date.and_hms_opt(h, mi, sec))
    }

    #[test]
    fn unambiguous_shapes_parse_under_both_orders() {
        for order in [DateOrder::DayFirst, DateOrder::MonthFirst] {
            assert_eq!(
                parse("2026-09-02 08:00", order),
                Ok(dt(2026, 9, 2, 8, 0, 0))
            );
            assert_eq!(parse("2026/09/02", order), Ok(dt(2026, 9, 2, 0, 0, 0)));
            assert_eq!(
                parse("2026-9-2T08:00:05", order),
                Ok(dt(2026, 9, 2, 8, 0, 5))
            );
            assert_eq!(parse("02-Sep-2026", order), Ok(dt(2026, 9, 2, 0, 0, 0)));
            assert_eq!(
                parse("2 sep 2026 13:16", order),
                Ok(dt(2026, 9, 2, 13, 16, 0))
            );
            assert_eq!(parse("02-SEP-2026", order), Ok(dt(2026, 9, 2, 0, 0, 0)));
        }
    }

    #[test]
    fn ambiguous_shapes_follow_the_order_with_or_without_time() {
        let day_first = DateOrder::DayFirst;
        let month_first = DateOrder::MonthFirst;
        assert_eq!(parse("02/09/2026", day_first), Ok(dt(2026, 9, 2, 0, 0, 0)));
        assert_eq!(
            parse("02/09/2026 01:16 PM", day_first),
            Ok(dt(2026, 9, 2, 13, 16, 0))
        );
        assert_eq!(
            parse("02/09/2026", month_first),
            Ok(dt(2026, 2, 9, 0, 0, 0))
        );
        assert_eq!(
            parse("02/09/2026 01:16 PM", month_first),
            Ok(dt(2026, 2, 9, 13, 16, 0))
        );
        assert_eq!(parse("2-9-2026", day_first), Ok(dt(2026, 9, 2, 0, 0, 0)));
        assert_eq!(parse("2.9.2026", month_first), Ok(dt(2026, 2, 9, 0, 0, 0)));
    }

    #[test]
    fn day_above_twelve_parses_only_in_the_matching_order() {
        assert_eq!(
            parse("25/09/2026", DateOrder::DayFirst),
            Ok(dt(2026, 9, 25, 0, 0, 0))
        );
        assert_eq!(
            parse("25/09/2026", DateOrder::MonthFirst),
            Err("25/09/2026".to_string())
        );
        assert_eq!(
            parse("02/13/2026", DateOrder::MonthFirst),
            Ok(dt(2026, 2, 13, 0, 0, 0))
        );
        assert_eq!(
            parse("13/13/2026", DateOrder::DayFirst),
            Err("13/13/2026".to_string())
        );
        assert_eq!(
            parse("13/13/2026", DateOrder::MonthFirst),
            Err("13/13/2026".to_string())
        );
    }

    #[test]
    fn time_parts_are_read() {
        let o = DateOrder::MonthFirst;
        assert_eq!(parse("9/2/2026 13:16", o), Ok(dt(2026, 9, 2, 13, 16, 0)));
        assert_eq!(
            parse("09/02/2026 13:16:00", o),
            Ok(dt(2026, 9, 2, 13, 16, 0))
        );
        assert_eq!(
            parse("09/02/2026 01:16:22 PM", o),
            Ok(dt(2026, 9, 2, 13, 16, 22))
        );
        assert_eq!(parse("9/2/2026 8:05", o), Ok(dt(2026, 9, 2, 8, 5, 0)));
        assert_eq!(parse("9/2/2026 12:05 AM", o), Ok(dt(2026, 9, 2, 0, 5, 0)));
        assert_eq!(parse("9/2/2026 12:05pm", o), Ok(dt(2026, 9, 2, 12, 5, 0)));
        assert_eq!(
            parse("9/2/2026 13:16 PM", o),
            Err("9/2/2026 13:16 PM".to_string())
        );
        let with_fraction = parse("2026-09-02 08:00:00.123", o).unwrap().unwrap();
        assert_eq!(with_fraction.and_utc().timestamp_subsec_millis(), 123);
    }

    #[test]
    fn excel_serial_numbers_are_dates_in_range() {
        let o = DateOrder::DayFirst;
        assert_eq!(
            Cell::Number(46294.5).as_datetime(o),
            Ok(dt(2026, 9, 29, 12, 0, 0))
        );
        assert_eq!(
            Cell::Number(46294.0).as_datetime(o),
            Ok(dt(2026, 9, 29, 0, 0, 0))
        );
        assert!(Cell::Number(19999.0).as_datetime(o).is_err());
        assert!(Cell::Number(80001.0).as_datetime(o).is_err());
        assert!(Cell::Number(f64::NAN).as_datetime(o).is_err());
    }

    #[test]
    fn non_finite_numbers_are_not_numbers() {
        assert_eq!(text("NaN").as_number(), None);
        assert_eq!(text("inf").as_number(), None);
        assert_eq!(text("-infinity").as_number(), None);
        assert_eq!(Cell::Number(f64::INFINITY).as_number(), None);
        assert_eq!(Cell::Number(f64::NAN).as_bool(), None);
    }

    #[test]
    fn ids_must_be_exact_whole_numbers() {
        assert_eq!(text("NaN").as_id(), None);
        assert_eq!(text("1.9").as_id(), None);
        assert_eq!(text("9007199254740993").as_id(), Some(9007199254740993));
        assert_eq!(text(" 42 ").as_id(), Some(42));
        assert_eq!(text("87763.0").as_id(), Some(87763));
        assert_eq!(text(" 87763 ").as_id(), Some(87763));
        assert_eq!(text("inf").as_id(), None);
        assert_eq!(text("87763").as_id(), Some(87763));
        assert_eq!(text("87763.000").as_id(), Some(87763));
        assert_eq!(text("9007199254740993.0").as_id(), Some(9007199254740993));
        assert_eq!(text("87763.00000000000000001").as_id(), None);
        assert_eq!(text("1e3").as_id(), None);
        assert_eq!(text(".").as_id(), None);
        assert_eq!(text("").as_id(), None);
        assert_eq!(text("abc").as_id(), None);
        assert_eq!(Cell::Number(42.0).as_id(), Some(42));
        assert_eq!(Cell::Number(1.9).as_id(), None);
        assert_eq!(Cell::Number(f64::NAN).as_id(), None);
        assert_eq!(Cell::Number(1e300).as_id(), None);
        assert_eq!(
            Cell::Number(9007199254740992.0).as_id(),
            Some(9007199254740992)
        );
        assert_eq!(Cell::Number(9007199254740994.0).as_id(), None);
    }
}
