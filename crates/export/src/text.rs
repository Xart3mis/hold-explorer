//! Words and text formats: the catalog's labels, CSV, clipboard text, and lists of line IDs.

use std::collections::{BTreeMap, HashSet};

use chrono::{Datelike, NaiveDate};
use serde::Deserialize;

use crate::sheet::{Cell, Sheet};
use crate::ExportError;

/// Every key this crate asks [`ExportText::get`] for, sorted. `ui/src/api/file-text-keys.json`
/// lists the same keys; a test on each side keeps the file, this list, and the catalog equal.
pub const FILE_TEXT_KEYS: &[&str] = &[KEY_NO, KEY_YES];

/// The key of the word a file writes for a [`Cell::Flag`] that is true.
pub const KEY_YES: &str = "file.yes";
/// The key of the word a file writes for a [`Cell::Flag`] that is false.
pub const KEY_NO: &str = "file.no";

/// Every word a file contains, from the interface's catalog.
#[derive(Debug, Clone, PartialEq, Eq, Default, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ExportText {
    /// By key; the keys are those of `ui/src/api/file-text-keys.json`.
    pub labels: BTreeMap<String, String>,
    /// The twelve short month names, January first, as the interface writes dates.
    pub months: Vec<String>,
}

impl ExportText {
    /// The label of `key`; `Err(ExportError::Text)` naming the key when it is missing.
    pub fn get(&self, key: &str) -> Result<&str, ExportError> {
        self.labels
            .get(key)
            .map(String::as_str)
            .ok_or_else(|| ExportError::Text { key: key.into() })
    }

    /// `30 Sept 2026`, as the interface's `formatDate` writes it: the day without a leading zero,
    /// the short month name of the catalog, and the year. When the catalog lacks the month, the
    /// day is written `2026-09-30`, as a CSV file writes it.
    pub fn date(&self, day: NaiveDate) -> String {
        match self.months.get(day.month0() as usize) {
            Some(month) => format!("{} {} {}", day.day(), month, day.year()),
            None => day.format("%Y-%m-%d").to_string(),
        }
    }
}

/// The first characters that make a spreadsheet read a text as a formula (or, for a tab and a
/// carriage return, that some spreadsheets skip before reading one).
const FORMULA_STARTS: [char; 6] = ['=', '+', '-', '@', '\t', '\r'];

/// A text a spreadsheet reads as text: one that starts as a formula would gets a leading `'`,
/// the mitigation OWASP gives for CSV injection.
fn as_text(text: &str) -> String {
    if text.starts_with(FORMULA_STARTS) {
        format!("'{text}")
    } else {
        text.to_string()
    }
}

/// The words a text format writes for a flag, read once from the catalog.
struct Flags<'a> {
    yes: &'a str,
    no: &'a str,
}

impl<'a> Flags<'a> {
    fn of(text: &'a ExportText) -> Result<Self, ExportError> {
        Ok(Self {
            yes: text.get(KEY_YES)?,
            no: text.get(KEY_NO)?,
        })
    }

    /// A cell as plain text: a text guarded against formulas, numbers as plain digits, a flag as
    /// the catalog's word, an empty cell as nothing. `date` writes a date.
    fn plain(&self, cell: &Cell, date: impl Fn(NaiveDate) -> String) -> String {
        match cell {
            Cell::Text(text) => as_text(text),
            Cell::Count(count) => count.to_string(),
            Cell::Days(days) => days.to_string(),
            // A non-finite size is no size. `Display` of a finite `f64` never uses an exponent.
            Cell::Size(size) if size.is_finite() => size.to_string(),
            Cell::Size(_) => String::new(),
            Cell::Date(day) => date(*day),
            Cell::Flag(true) => self.yes.to_string(),
            Cell::Flag(false) => self.no.to_string(),
            Cell::Empty => String::new(),
        }
    }
}

/// Appends one CSV field to `out`, quoted when it holds a comma, a quote, or a line break.
fn push_csv_field(out: &mut String, field: &str) {
    if field.contains([',', '"', '\n', '\r']) {
        out.push('"');
        out.push_str(&field.replace('"', "\"\""));
        out.push('"');
    } else {
        out.push_str(field);
    }
}

/// Appends one CSV record and its CRLF line end to `out`.
fn push_csv_record<'a>(out: &mut String, fields: impl IntoIterator<Item = &'a str>) {
    for (at, field) in fields.into_iter().enumerate() {
        if at > 0 {
            out.push(',');
        }
        push_csv_field(out, field);
    }
    out.push_str("\r\n");
}

/// CSV in UTF-8 with a byte-order mark, comma-separated, CRLF line ends, fields quoted when they
/// hold a comma, a quote, or a line break. Dates `YYYY-MM-DD`; numbers as plain digits; a flag as
/// the catalog's word for yes or no.
///
/// A text cell that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return is written with a
/// leading `'`, so that a spreadsheet opening the file reads it as text and never runs it as a
/// formula. Numbers, counts, days, sizes, and dates are not text and are never prefixed.
///
/// `Err(ExportError::Text)` when the catalog lacks the word for yes or no.
pub fn csv(sheet: &Sheet, text: &ExportText) -> Result<Vec<u8>, ExportError> {
    let flags = Flags::of(text)?;
    let mut out = String::from('\u{FEFF}');
    push_csv_record(&mut out, sheet.columns.iter().map(|c| c.header.as_str()));
    for row in &sheet.rows {
        let fields: Vec<String> = row
            .iter()
            .map(|cell| flags.plain(cell, |day| day.format("%Y-%m-%d").to_string()))
            .collect();
        push_csv_record(&mut out, fields.iter().map(String::as_str));
    }
    Ok(out.into_bytes())
}

/// A value on one line of tab-separated text: a tab or a line break becomes a space.
fn one_line(value: &str) -> String {
    value.replace("\r\n", " ").replace(['\t', '\n', '\r'], " ")
}

/// Tab-separated text for the clipboard: a header row, then the rows; a tab or line break
/// inside a value becomes a space. Dates as [`ExportText::date`] writes them; a flag as the
/// catalog's word for yes or no. Every row ends with a line break.
///
/// A text cell that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return is written with a
/// leading `'`, so that a spreadsheet it is pasted into reads it as text and never runs it as a
/// formula. Numbers, counts, days, sizes, and dates are not text and are never prefixed.
///
/// `Err(ExportError::Text)` when the catalog lacks the word for yes or no.
pub fn tab_separated(sheet: &Sheet, text: &ExportText) -> Result<String, ExportError> {
    let flags = Flags::of(text)?;
    let mut out = String::new();
    let mut push_row = |fields: Vec<String>| {
        out.push_str(&fields.join("\t"));
        out.push('\n');
    };
    push_row(sheet.columns.iter().map(|c| one_line(&c.header)).collect());
    for row in &sheet.rows {
        push_row(
            row.iter()
                .map(|cell| one_line(&flags.plain(cell, |day| text.date(day))))
                .collect(),
        );
    }
    Ok(out)
}

/// One line ID per line, each once, in the order given.
pub fn line_ids(ids: &[String]) -> String {
    let mut seen = HashSet::new();
    ids.iter()
        .filter(|id| seen.insert(id.as_str()))
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sheet::{Column, ColumnKind};

    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
    ];

    fn text() -> ExportText {
        ExportText {
            labels: BTreeMap::from([
                ("file.title".to_string(), "Holds".to_string()),
                (KEY_YES.to_string(), "Yes".to_string()),
                (KEY_NO.to_string(), "No".to_string()),
            ]),
            months: MONTHS.iter().map(|m| m.to_string()).collect(),
        }
    }

    fn day(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    fn column(id: &str, header: &str, kind: ColumnKind) -> Column {
        Column {
            id: id.into(),
            header: header.into(),
            kind,
        }
    }

    /// Lines with a remark over two lines, a quote, a comma, a date, an empty cell, and a
    /// name that is not ASCII.
    fn sheet() -> Sheet {
        Sheet {
            name: "Lines".into(),
            columns: vec![
                column("line", "Line ID", ColumnKind::Identifier),
                column("name", "Name", ColumnKind::Text),
                column("remark", "Remark", ColumnKind::LongText),
                column("holds", "Holds", ColumnKind::Count),
                column("age", "Age", ColumnKind::Days),
                column("size", "Size", ColumnKind::Size),
                column("created", "Created", ColumnKind::Date),
                column("differs", "Sizes differ", ColumnKind::Flag),
            ],
            rows: vec![
                vec![
                    Cell::Text("L-1".into()),
                    Cell::Text("Jürgen Ødegård".into()),
                    Cell::Text("Waiting on \"vendor\" data,\nthen stress".into()),
                    Cell::Count(1042),
                    Cell::Days(-3),
                    Cell::Size(0.75),
                    Cell::Date(day(2026, 9, 30)),
                    Cell::Flag(true),
                ],
                vec![
                    Cell::Text("L-2".into()),
                    Cell::Empty,
                    Cell::Text("tab\there".into()),
                    Cell::Count(0),
                    Cell::Days(71),
                    Cell::Size(6.0),
                    Cell::Empty,
                    Cell::Flag(false),
                ],
            ],
        }
    }

    #[test]
    fn get_gives_the_label_of_a_key() {
        assert_eq!(text().get("file.title"), Ok("Holds"));
    }

    #[test]
    fn get_of_a_missing_key_names_the_key() {
        assert_eq!(
            text().get("file.nothing"),
            Err(ExportError::Text {
                key: "file.nothing".into()
            })
        );
    }

    #[test]
    fn date_writes_the_day_the_short_month_and_the_year_for_each_month() {
        let expected = [
            "1 Jan 2026",
            "2 Feb 2026",
            "3 Mar 2026",
            "4 Apr 2026",
            "5 May 2026",
            "6 Jun 2026",
            "7 Jul 2026",
            "8 Aug 2026",
            "30 Sept 2026",
            "10 Oct 2026",
            "11 Nov 2026",
            "31 Dec 2026",
        ];
        let days = [1, 2, 3, 4, 5, 6, 7, 8, 30, 10, 11, 31];
        for (month, (d, want)) in days.iter().zip(expected).enumerate() {
            assert_eq!(text().date(day(2026, month as u32 + 1, *d)), want);
        }
        assert_eq!(text().date(day(987, 3, 9)), "9 Mar 987");
    }

    #[test]
    fn date_falls_back_to_year_month_day_when_the_catalog_lacks_the_month() {
        let short = ExportText {
            labels: BTreeMap::new(),
            months: MONTHS[..9].iter().map(|m| m.to_string()).collect(),
        };
        assert_eq!(short.date(day(2026, 9, 30)), "30 Sept 2026");
        assert_eq!(short.date(day(2026, 10, 1)), "2026-10-01");
        assert_eq!(ExportText::default().date(day(2026, 1, 5)), "2026-01-05");
    }

    /// One text column and one days column, each row a text and a number of days.
    fn guarded_sheet(values: &[&str]) -> Sheet {
        Sheet {
            name: "x".into(),
            columns: vec![
                column("a", "A", ColumnKind::Text),
                column("d", "Days", ColumnKind::Days),
            ],
            rows: values
                .iter()
                .map(|value| vec![Cell::Text((*value).into()), Cell::Days(-3)])
                .collect(),
        }
    }

    #[test]
    fn csv_writes_a_text_that_starts_as_a_formula_with_a_leading_quote() {
        let csv_of = |value: &str| {
            let bytes = csv(&guarded_sheet(&[value]), &text()).unwrap();
            String::from_utf8(bytes[3..].to_vec()).unwrap()
        };
        assert_eq!(csv_of("=SUM(A1)"), "A,Days\r\n'=SUM(A1),-3\r\n");
        assert_eq!(csv_of("+1"), "A,Days\r\n'+1,-3\r\n");
        assert_eq!(csv_of("-2"), "A,Days\r\n'-2,-3\r\n");
        assert_eq!(csv_of("@cmd"), "A,Days\r\n'@cmd,-3\r\n");
        assert_eq!(csv_of("\tx"), "A,Days\r\n'\tx,-3\r\n");
        assert_eq!(csv_of("\rx"), "A,Days\r\n\"'\rx\",-3\r\n");
        // Unchanged: a formula character that is not the first, and plain text.
        assert_eq!(csv_of("L-1 = 2+3"), "A,Days\r\nL-1 = 2+3,-3\r\n");
        assert_eq!(csv_of("plain"), "A,Days\r\nplain,-3\r\n");
    }

    #[test]
    fn tab_separated_writes_a_text_that_starts_as_a_formula_with_a_leading_quote() {
        let tsv_of = |value: &str| tab_separated(&guarded_sheet(&[value]), &text()).unwrap();
        assert_eq!(tsv_of("=SUM(A1)"), "A\tDays\n'=SUM(A1)\t-3\n");
        assert_eq!(tsv_of("+1"), "A\tDays\n'+1\t-3\n");
        assert_eq!(tsv_of("-2"), "A\tDays\n'-2\t-3\n");
        assert_eq!(tsv_of("@cmd"), "A\tDays\n'@cmd\t-3\n");
        assert_eq!(tsv_of("\tx"), "A\tDays\n' x\t-3\n");
        assert_eq!(tsv_of("\rx"), "A\tDays\n' x\t-3\n");
        assert_eq!(tsv_of("L-1 = 2+3"), "A\tDays\nL-1 = 2+3\t-3\n");
        assert_eq!(tsv_of("plain"), "A\tDays\nplain\t-3\n");
    }

    #[test]
    fn numbers_sizes_and_dates_are_never_prefixed() {
        let sheet = Sheet {
            name: "x".into(),
            columns: vec![
                column("d", "Days", ColumnKind::Days),
                column("s", "Size", ColumnKind::Size),
                column("c", "Created", ColumnKind::Date),
            ],
            rows: vec![vec![
                Cell::Days(-14),
                Cell::Size(-0.5),
                Cell::Date(day(2026, 9, 30)),
            ]],
        };
        let bytes = csv(&sheet, &text()).unwrap();
        assert_eq!(
            std::str::from_utf8(&bytes[3..]).unwrap(),
            "Days,Size,Created\r\n-14,-0.5,2026-09-30\r\n"
        );
        assert_eq!(
            tab_separated(&sheet, &text()).unwrap(),
            "Days\tSize\tCreated\n-14\t-0.5\t30 Sept 2026\n"
        );
    }

    #[test]
    fn a_catalog_without_the_words_for_yes_and_no_is_refused_naming_the_key() {
        let mut lacking = text();
        lacking.labels.remove(KEY_YES);
        assert_eq!(
            csv(&sheet(), &lacking),
            Err(ExportError::Text {
                key: KEY_YES.into()
            })
        );
        assert_eq!(
            tab_separated(&sheet(), &lacking),
            Err(ExportError::Text {
                key: KEY_YES.into()
            })
        );
    }

    #[test]
    fn csv_starts_with_a_byte_order_mark_and_ends_lines_with_crlf() {
        let bytes = csv(&sheet(), &text()).unwrap();
        assert!(bytes.starts_with(b"\xEF\xBB\xBF"));
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.starts_with("Line ID,Name,Remark,Holds,Age,Size,Created,Sizes differ\r\n"));
        assert!(body.ends_with("\r\n"));
        assert_eq!(
            body,
            "Line ID,Name,Remark,Holds,Age,Size,Created,Sizes differ\r\n\
             L-1,Jürgen Ødegård,\"Waiting on \"\"vendor\"\" data,\nthen stress\",1042,-3,0.75,2026-09-30,Yes\r\n\
             L-2,,tab\there,0,71,6,,No\r\n"
        );
    }

    #[test]
    fn csv_quotes_a_field_with_a_comma_a_quote_or_a_line_break_and_no_other() {
        let one = |value: &str| {
            let sheet = Sheet {
                name: "x".into(),
                columns: vec![column("a", "A", ColumnKind::Text)],
                rows: vec![vec![Cell::Text(value.into())]],
            };
            let bytes = csv(&sheet, &text()).unwrap();
            String::from_utf8(bytes[3..].to_vec()).unwrap()
        };
        assert_eq!(one("plain"), "A\r\nplain\r\n");
        assert_eq!(one("a,b"), "A\r\n\"a,b\"\r\n");
        assert_eq!(one("say \"hi\""), "A\r\n\"say \"\"hi\"\"\"\r\n");
        assert_eq!(one("a\nb"), "A\r\n\"a\nb\"\r\n");
        assert_eq!(one("a\rb"), "A\r\n\"a\rb\"\r\n");
    }

    #[test]
    fn csv_reopened_with_the_csv_reader_gives_the_sheet_back() {
        let sheet = sheet();
        let bytes = csv(&sheet, &text()).unwrap();
        let mut reader = ::csv::ReaderBuilder::new()
            .has_headers(true)
            .from_reader(&bytes[3..]);
        let headers: Vec<String> = reader
            .headers()
            .unwrap()
            .iter()
            .map(str::to_string)
            .collect();
        let want: Vec<String> = sheet.columns.iter().map(|c| c.header.clone()).collect();
        assert_eq!(headers, want);
        let rows: Vec<Vec<String>> = reader
            .records()
            .map(|r| r.unwrap().iter().map(str::to_string).collect())
            .collect();
        assert_eq!(
            rows,
            vec![
                vec![
                    "L-1",
                    "Jürgen Ødegård",
                    "Waiting on \"vendor\" data,\nthen stress",
                    "1042",
                    "-3",
                    "0.75",
                    "2026-09-30",
                    "Yes"
                ],
                vec!["L-2", "", "tab\there", "0", "71", "6", "", "No"],
            ]
        );
    }

    #[test]
    fn tab_separated_writes_a_header_then_the_rows_with_dates_as_the_interface_writes_them() {
        assert_eq!(
            tab_separated(&sheet(), &text()).unwrap(),
            "Line ID\tName\tRemark\tHolds\tAge\tSize\tCreated\tSizes differ\n\
             L-1\tJürgen Ødegård\tWaiting on \"vendor\" data, then stress\t1042\t-3\t0.75\t30 Sept 2026\tYes\n\
             L-2\t\ttab here\t0\t71\t6\t\tNo\n"
        );
    }

    #[test]
    fn tab_separated_turns_tabs_and_line_breaks_inside_a_value_into_spaces() {
        let sheet = Sheet {
            name: "x".into(),
            columns: vec![column("a", "A\tB", ColumnKind::Text)],
            rows: vec![vec![Cell::Text("one\ttwo\r\nthree\nfour\rfive".into())]],
        };
        assert_eq!(
            tab_separated(&sheet, &text()).unwrap(),
            "A B\none two three four five\n"
        );
    }

    #[test]
    fn line_ids_writes_each_line_once_in_the_order_given() {
        let ids: Vec<String> = ["L-3", "L-1", "L-3", "L-2", "L-1"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(line_ids(&ids), "L-3\nL-1\nL-2");
        assert_eq!(line_ids(&[]), "");
    }

    #[test]
    fn the_keys_the_crate_asks_for_are_those_of_the_interface_fixture() {
        let json = include_str!("../../../ui/src/api/file-text-keys.json");
        let fixture: Vec<String> = serde_json::from_str(json).unwrap();
        let mut sorted = fixture.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(
            fixture, sorted,
            "file-text-keys.json is sorted, each key once"
        );
        let ours: Vec<String> = FILE_TEXT_KEYS.iter().map(|k| k.to_string()).collect();
        assert_eq!(ours, fixture);
    }
}
