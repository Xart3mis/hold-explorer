//! Works out when a snapshot was taken.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use chrono::{Datelike, Days, NaiveDate, NaiveDateTime};
use regex::Regex;
use serde::{Deserialize, Serialize};

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

const YEARS: std::ops::RangeInclusive<i32> = 2000..=2100;

/// Where the snapshot date came from, in order of trust.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SnapshotSource {
    /// The `Report Date` entry of the workbook's information sheet.
    InfoSheet,
    /// A date written in the file name; midnight of that day.
    FileName,
    /// The file's last-modified time.
    FileTime,
    /// A date the user entered. Nothing in this crate produces it; a caller uses it when the
    /// user types the snapshot date because the file gave none or a wrong one.
    User,
}

/// The moment a report was taken and how that was found out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotDate {
    /// When the snapshot was taken.
    pub at: NaiveDateTime,
    /// Where `at` came from.
    pub source: SnapshotSource,
}

/// The newest creation or release time in the data. Years outside 2000 to 2100 are
/// typing mistakes and are ignored.
fn newest_timestamp(holds: &[Hold]) -> Option<NaiveDateTime> {
    holds
        .iter()
        .flat_map(|h| [h.created, h.release_date])
        .flatten()
        .filter(|t| YEARS.contains(&t.year()))
        .max()
}

struct NamePatterns {
    year_first: Regex,
    year_last: Regex,
    month_year: Regex,
    month_name: Regex,
    day_month: Regex,
}

fn patterns() -> &'static NamePatterns {
    static PATTERNS: OnceLock<NamePatterns> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        let build = |p: &str| Regex::new(p).expect("pattern is a valid literal");
        NamePatterns {
            year_first: build(r"([0-9]{4})[-_.]([0-9]{1,2})[-_.]([0-9]{1,2})"),
            year_last: build(r"([0-9]{1,2})[-_.]([0-9]{1,2})[-_.]([0-9]{4})"),
            month_year: build(
                r"(?i)([0-9]{1,2})[-_ .]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-_ .]?([0-9]{4})",
            ),
            month_name: build(
                r"(?i)([0-9]{1,2})[-_ .]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)",
            ),
            day_month: build(r"([0-9]{1,2})[-_.]([0-9]{1,2})"),
        }
    })
}

/// Every match of `re` in `name`, overlapping ones included, from left to right, except those
/// whose first or last component touches another digit.
fn matches<'h>(re: &Regex, name: &'h str) -> Vec<regex::Captures<'h>> {
    let bytes = name.as_bytes();
    let mut found = Vec::new();
    let mut position = 0;
    while let Some(captures) = re.captures_at(name, position) {
        let Some(whole) = captures.get(0) else { break };
        position = whole.start() + 1;
        while !name.is_char_boundary(position) {
            position += 1;
        }
        let touches = |index: Option<usize>| {
            index
                .and_then(|i| bytes.get(i))
                .is_some_and(u8::is_ascii_digit)
        };
        if !touches(whole.start().checked_sub(1)) && !touches(Some(whole.end())) {
            found.push(captures);
        }
    }
    found
}

fn number<T: std::str::FromStr>(captures: &regex::Captures, index: usize) -> Option<T> {
    captures.get(index)?.as_str().parse().ok()
}

/// A date with a written year: a real date, in range, not before the newest timestamp in the
/// data, and not more than a day after the file was last modified.
fn with_year(
    date: Option<NaiveDate>,
    newest: Option<NaiveDateTime>,
    modified: Option<NaiveDateTime>,
) -> Option<NaiveDate> {
    let date = date.filter(|d| YEARS.contains(&d.year()))?;
    if newest.is_some_and(|n| date < n.date()) || after_modified(date, modified) {
        return None;
    }
    Some(date)
}

fn after_modified(date: NaiveDate, modified: Option<NaiveDateTime>) -> bool {
    modified.is_some_and(|m| {
        m.date()
            .checked_add_days(Days::new(1))
            .is_some_and(|l| date > l)
    })
}

/// A date without a year takes the year of the newest timestamp, or the next year if that
/// would be earlier. It must be at most 92 days after the newest timestamp.
fn without_year(
    day: u32,
    month: u32,
    newest: Option<NaiveDateTime>,
    modified: Option<NaiveDateTime>,
) -> Option<NaiveDate> {
    let newest = newest?.date();
    // The year of the newest timestamp, or the next year if the date does not exist this year
    // (29 February) or would be earlier.
    let date = NaiveDate::from_ymd_opt(newest.year(), month, day)
        .filter(|d| *d >= newest)
        .or_else(|| NaiveDate::from_ymd_opt(newest.year().checked_add(1)?, month, day))?;
    let latest = newest.checked_add_days(Days::new(92))?;
    if !YEARS.contains(&date.year()) || date > latest || after_modified(date, modified) {
        return None;
    }
    Some(date)
}

/// A date written in the filename, trying the patterns in order: `yyyy-mm-dd`, `dd-mm-yyyy`,
/// `dd-Mon-yyyy`, `dd-Mon`, `dd-mm`. Within a pattern the first match that passes validation
/// wins. The year-less patterns ignore any match that overlaps a match of a written-year
/// pattern whose year is in range, whether or not that one passed validation, so a rejected
/// `2026-10-11` is not re-read as `10-11`. A written-year match with a year out of range is
/// no date and blocks nothing.
fn date_from_name(
    file_name: &str,
    newest: Option<NaiveDateTime>,
    modified: Option<NaiveDateTime>,
) -> Option<NaiveDate> {
    let p = patterns();
    let plausible = |re: &Regex, year_group: usize| {
        let mut found = matches(re, file_name);
        found.retain(|c| number(c, year_group).is_some_and(|y| YEARS.contains(&y)));
        found
    };
    let year_first = plausible(&p.year_first, 1);
    let year_last = plausible(&p.year_last, 3);
    let month_year = plausible(&p.month_year, 3);
    let spans: Vec<(usize, usize)> = [&year_first, &year_last, &month_year]
        .into_iter()
        .flatten()
        .filter_map(|c| c.get(0).map(|m| (m.start(), m.end())))
        .collect();
    let year_less = |re: &Regex| {
        let mut found = matches(re, file_name);
        found.retain(|c| {
            c.get(0)
                .is_some_and(|m| !spans.iter().any(|&(s, e)| m.start() < e && s < m.end()))
        });
        found
    };
    year_first
        .iter()
        .find_map(|c| {
            let date = NaiveDate::from_ymd_opt(number(c, 1)?, number(c, 2)?, number(c, 3)?);
            with_year(date, newest, modified)
        })
        .or_else(|| {
            year_last.iter().find_map(|c| {
                let date = NaiveDate::from_ymd_opt(number(c, 3)?, number(c, 2)?, number(c, 1)?);
                with_year(date, newest, modified)
            })
        })
        .or_else(|| {
            month_year.iter().find_map(|c| {
                let month = month_number(&c[2])?;
                let date = NaiveDate::from_ymd_opt(number(c, 3)?, month, number(c, 1)?);
                with_year(date, newest, modified)
            })
        })
        .or_else(|| {
            year_less(&p.month_name)
                .iter()
                .find_map(|c| without_year(number(c, 1)?, month_number(&c[2])?, newest, modified))
        })
        .or_else(|| {
            year_less(&p.day_month)
                .iter()
                .find_map(|c| without_year(number(c, 1)?, number(c, 2)?, newest, modified))
        })
}

fn month_number(name: &str) -> Option<u32> {
    let name = name.to_lowercase();
    MONTHS.iter().position(|m| *m == name).map(|i| i as u32 + 1)
}

/// Works out the snapshot date, trying in order the `Report Date` of the information sheet,
/// a date in the file name (using the newest hold date or the modified time to settle a
/// missing year), and the file's modified time. `None` when none gives a date.
pub fn snapshot_date(
    info: &BTreeMap<String, String>,
    file_name: &str,
    holds: &[Hold],
    file_modified: Option<NaiveDateTime>,
) -> Option<SnapshotDate> {
    if let Some(at) = info.get("Report Date").and_then(|v| parse_report_date(v)) {
        return Some(SnapshotDate {
            at,
            source: SnapshotSource::InfoSheet,
        });
    }
    let named = date_from_name(file_name, newest_timestamp(holds), file_modified)
        .and_then(|date| date.and_hms_opt(0, 0, 0));
    if let Some(at) = named {
        return Some(SnapshotDate {
            at,
            source: SnapshotSource::FileName,
        });
    }
    file_modified.map(|at| SnapshotDate {
        at,
        source: SnapshotSource::FileTime,
    })
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
        assert_eq!(got.map(|g| g.at), Some(at("2026-09-29 13:16:00")));
        assert_eq!(got.map(|g| g.source), Some(SnapshotSource::InfoSheet));
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
        assert_eq!(got.map(|g| g.at), Some(at("2026-10-07 00:00:00")));
    }

    #[test]
    fn filename_with_numeric_day_and_month() {
        let got = snapshot_date(
            &BTreeMap::new(),
            "holds_29-9.xlsx",
            &holds_with_newest("2026-09-29 12:00:00"),
            None,
        );
        assert_eq!(got.map(|g| g.at), Some(at("2026-09-29 00:00:00")));
    }

    #[test]
    fn filename_with_full_date_needs_no_data() {
        let got = snapshot_date(&BTreeMap::new(), "holds_2026-10-07.xlsx", &[], None);
        assert_eq!(got.map(|g| g.at), Some(at("2026-10-07 00:00:00")));
    }

    #[test]
    fn january_file_after_december_data_rolls_into_next_year() {
        let got = snapshot_date(
            &BTreeMap::new(),
            "holds_02-Jan.xlsx",
            &holds_with_newest("2026-12-30 09:00:00"),
            None,
        );
        assert_eq!(got.map(|g| g.at), Some(at("2027-01-02 00:00:00")));
    }

    #[test]
    fn falls_back_to_file_modified_time() {
        let modified = at("2026-10-10 15:00:00");
        let got = snapshot_date(&BTreeMap::new(), "export.xlsx", &[], Some(modified));
        assert_eq!(got.map(|g| g.at), Some(modified));
        assert_eq!(got.map(|g| g.source), Some(SnapshotSource::FileTime));
    }

    #[test]
    fn unparseable_report_date_falls_through() {
        let got = snapshot_date(
            &info("yesterday"),
            "holds_07-Oct.xlsx",
            &holds_with_newest("2026-10-07 08:07:30"),
            None,
        );
        assert_eq!(got.map(|g| g.at), Some(at("2026-10-07 00:00:00")));
    }

    #[test]
    fn nothing_to_go_on_gives_none() {
        assert_eq!(
            snapshot_date(&BTreeMap::new(), "export.xlsx", &[], None),
            None
        );
    }

    fn from_name(name: &str, newest: &str, modified: Option<&str>) -> Option<SnapshotDate> {
        snapshot_date(
            &BTreeMap::new(),
            name,
            &[Hold {
                created: Some(at(newest)),
                ..Default::default()
            }],
            modified.map(at),
        )
    }

    fn named(date: &str) -> Option<SnapshotDate> {
        Some(SnapshotDate {
            at: at(&format!("{date} 00:00:00")),
            source: SnapshotSource::FileName,
        })
    }

    fn file_time(time: &str) -> Option<SnapshotDate> {
        Some(SnapshotDate {
            at: at(time),
            source: SnapshotSource::FileTime,
        })
    }

    #[test]
    fn version_number_is_not_a_date() {
        let modified = "2026-10-10 15:00:00";
        assert_eq!(
            from_name("holds_v1.2.xlsx", "2026-09-29 12:00:00", Some(modified)),
            file_time(modified)
        );
        assert_eq!(
            from_name("holds_v1.2.xlsx", "2026-09-29 12:00:00", None),
            None
        );
    }

    #[test]
    fn implausible_leading_number_is_skipped_for_a_later_match() {
        assert_eq!(
            from_name("4521-10-02_holds_29-9.xlsx", "2026-09-29 12:00:00", None),
            named("2026-09-29")
        );
    }

    #[test]
    fn written_year_is_used() {
        assert_eq!(
            from_name("holds_07.10.2026.xlsx", "2025-10-06 09:00:00", None),
            named("2026-10-07")
        );
    }

    #[test]
    fn date_before_the_newest_data_falls_through() {
        let modified = "2026-10-10 15:00:00";
        assert_eq!(
            from_name("holds_10-May.xlsx", "2025-10-20 09:00:00", Some(modified)),
            file_time(modified)
        );
    }

    #[test]
    fn out_of_range_cell_date_does_not_panic_and_is_ignored() {
        let mut holds = holds_with_newest("2026-09-29 12:00:00");
        holds.push(Hold {
            created: NaiveDate::MIN.and_hms_opt(0, 0, 0),
            release_date: NaiveDate::MAX.and_hms_opt(0, 0, 0),
            ..Default::default()
        });
        let got = snapshot_date(&BTreeMap::new(), "holds_29-9.xlsx", &holds, None);
        assert_eq!(got, named("2026-09-29"));
    }

    #[test]
    fn window_after_the_newest_timestamp_is_92_days() {
        assert_eq!(
            from_name("holds_30-12.xlsx", "2026-09-29 12:00:00", None),
            named("2026-12-30")
        );
        assert_eq!(
            from_name("holds_31-12.xlsx", "2026-09-29 12:00:00", None),
            None
        );
    }

    #[test]
    fn date_more_than_a_day_after_the_file_time_is_rejected() {
        let modified = "2026-10-07 10:00:00";
        assert_eq!(
            from_name(
                "holds_2026-10-09.xlsx",
                "2026-10-01 09:00:00",
                Some(modified)
            ),
            file_time(modified)
        );
        assert_eq!(
            from_name(
                "holds_2026-10-08.xlsx",
                "2026-10-01 09:00:00",
                Some(modified)
            ),
            named("2026-10-08")
        );
    }

    #[test]
    fn a_time_or_counter_after_a_day_and_month_is_not_a_written_year() {
        assert_eq!(
            from_name("holds_08-10_1500.xlsx", "2026-10-05 09:00:00", None),
            named("2026-10-08")
        );
        assert_eq!(
            from_name("holds_07-Oct_1234.xlsx", "2026-10-05 09:00:00", None),
            named("2026-10-07")
        );
    }

    #[test]
    fn rejected_written_year_is_not_re_read_from_its_tail() {
        assert_eq!(
            from_name("holds_2026-10-11.xlsx", "2026-11-05 09:00:00", None),
            None
        );
        let modified = "2026-11-20 10:00:00";
        assert_eq!(
            from_name(
                "holds_2026-12-11.xlsx",
                "2026-11-10 09:00:00",
                Some(modified)
            ),
            file_time(modified)
        );
    }

    #[test]
    fn month_name_glued_to_the_year_is_a_written_year() {
        assert_eq!(
            from_name("holds_07Oct2026.xlsx", "2026-10-06 09:00:00", None),
            named("2026-10-07")
        );
    }

    #[test]
    fn rejected_month_name_year_is_not_re_read_without_the_year() {
        let modified = "2026-10-10 15:00:00";
        assert_eq!(
            from_name(
                "holds_07-Oct-2025.xlsx",
                "2026-10-06 09:00:00",
                Some(modified)
            ),
            file_time(modified)
        );
    }

    #[test]
    fn leap_day_without_a_year_may_fall_in_the_next_year() {
        assert_eq!(
            from_name("holds_29-Feb.xlsx", "2027-12-20 09:00:00", None),
            named("2028-02-29")
        );
    }

    #[test]
    fn user_source_round_trips_through_json() {
        let json = serde_json::to_string(&SnapshotSource::User).unwrap();
        assert_eq!(
            serde_json::from_str::<SnapshotSource>(&json).unwrap(),
            SnapshotSource::User
        );
    }
}
