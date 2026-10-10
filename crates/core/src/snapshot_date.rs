//! Works out when a snapshot was taken.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use regex::Regex;

use crate::model::Hold;

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// PlantIM writes the report date month-first as `09/29/2026 01:16 PM`. A typed date cell
/// reaches here as `2026-09-29 13:16:00`. The day-first default of the data columns does
/// not apply to the report date.
pub fn parse_report_date(text: &str) -> Option<NaiveDateTime> {
    let text = text.trim();
    NaiveDateTime::parse_from_str(text, "%m/%d/%Y %I:%M %p")
        .or_else(|_| NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S"))
        .ok()
}

fn newest_timestamp(holds: &[Hold]) -> Option<NaiveDateTime> {
    holds
        .iter()
        .flat_map(|h| [h.created, h.release_date])
        .flatten()
        .max()
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
    RE.get_or_init(|| Regex::new(r"(\d{1,2})[-_.](\d{1,2})").expect("pattern is a valid literal"))
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
    } else {
        let c = day_month_regex().captures(file_name)?;
        (number(&c[1])?, number(&c[2])?)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Hold;

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").unwrap()
    }

    fn holds_with_newest(s: &str) -> Vec<Hold> {
        vec![
            Hold {
                created: Some(at("2026-02-01 00:00:00")),
                ..Default::default()
            },
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
    fn report_date_accepts_a_typed_date_cell_text() {
        assert_eq!(
            parse_report_date("2026-09-29 13:16:00"),
            Some(at("2026-09-29 13:16:00"))
        );
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
        assert_eq!(
            snapshot_date(&BTreeMap::new(), "export.xlsx", &[], None),
            None
        );
    }
}
