//! Format-independent view of a sheet: a header row and rows of typed cells.

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
