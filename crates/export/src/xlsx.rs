//! Excel workbooks: the sheets of a view or of every screen, with an About sheet first.
//!
//! Every sheet is an Excel table (named from the sheet, banded rows, filter buttons in its
//! header row) with the header frozen. Columns are as wide as their heading and their longest
//! value, up to 60 characters; long text wraps. Dates are Excel dates, counts and days whole
//! numbers, sizes rounded to two decimals, flags the catalog's words. Ages, hold counts, and the
//! cells of a cross-tab are colored by conditional formats, so the colors follow a reader's own
//! sorting. The colors are those of the light theme, from `palette.json`.

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use chrono::{DateTime, Datelike, FixedOffset, NaiveDate, NaiveDateTime, Timelike};
use hx_core::filter::default_age_bands;
use rust_xlsxwriter::{
    utility, ConditionalFormat2ColorScale, ConditionalFormatCell, ConditionalFormatCellRule,
    ConditionalFormatDataBar, DocProperties, ExcelDateTime, Format, Table, TableColumn, Workbook,
    Worksheet, XlsxError,
};

use crate::chart::fill;
use crate::sheet::{Cell, Column, ColumnKind, ColumnRole, Sheet, SheetKind};
use crate::text::{ExportText, KEY_NO, KEY_YES};
use crate::views::name_sheets;
use crate::ExportError;

/// What the About sheet states.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct About {
    /// The name of the workspace.
    pub workspace: String,
    /// The day of the snapshot; `None` for a workspace without a snapshot, which the sheet states
    /// with the catalog's "No snapshot".
    pub snapshot: Option<NaiveDate>,
    /// The name of the file the snapshot was imported from.
    pub file_name: String,
    /// The active filters as the filter bar writes them, one per entry; empty when none is set.
    pub filters: Vec<String>,
    /// The version of Hold Explorer.
    pub app_version: String,
    /// When the file was made, with the offset from UTC of the machine's time zone. The sheet
    /// states its local date and time as a date cell, and the offset as text under it.
    pub made_at: DateTime<FixedOffset>,
    /// How many rows the file holds.
    pub rows: usize,
}

/// The widest a column is made, in characters.
const MAX_WIDTH: usize = 60;
/// The room a heading leaves for its filter button, in characters.
const FILTER_BUTTON: usize = 3;
/// The characters a date takes in the format `d mmm yyyy`, at most.
const DATE_CHARS: usize = 11;
/// The most characters a cell of Excel holds.
const MAX_CELL_CHARS: usize = 32_767;
/// The most characters the heading of a column of an Excel table holds.
const MAX_HEADER_CHARS: usize = 255;
/// The most rows a sheet of Excel holds, its header among them.
const MAX_ROWS: usize = 1_048_576;
/// The format of a date.
const DATE_FORMAT: &str = "d mmm yyyy";
/// The format of a moment, on the About sheet.
const DATETIME_FORMAT: &str = "d mmm yyyy hh:mm";

/// The light-theme colors, by token, as `#rrggbb`.
const PALETTE: &str = include_str!("../palette.json");

/// The colors of the light theme, by token, read once from `palette.json`.
pub(crate) fn palette() -> &'static HashMap<String, String> {
    static COLORS: OnceLock<HashMap<String, String>> = OnceLock::new();
    COLORS.get_or_init(|| {
        serde_json::from_str(PALETTE)
            .expect("palette.json is compiled into the crate, and a test reads every token used")
    })
}

/// The color of `token` as `0xRRGGBB`.
pub(crate) fn color(token: &str) -> u32 {
    palette()
        .get(token)
        .and_then(|hex| u32::from_str_radix(hex.trim_start_matches('#'), 16).ok())
        .expect("palette.json holds every token used as #rrggbb, as a test checks")
}

/// A workbook of `sheets` with the About sheet first.
///
/// The sheets keep their names, made valid and unique with About's by
/// [`name_sheets`]; their headings are made unique, as an Excel table needs them. The document's
/// title is the catalog's, with no author or company.
///
/// `Err(ExportError::TooManyRows)` when a sheet has more rows than a sheet of Excel holds;
/// `Err(ExportError::Text)` when `text` lacks a label; `Err(ExportError::Workbook)` when the
/// workbook writer fails, a fault of the application.
pub fn workbook(
    sheets: &[Sheet],
    about: &About,
    text: &ExportText,
) -> Result<Vec<u8>, ExportError> {
    // Excel holds a limited number of rows: a sheet past it is refused before anything is written.
    if let Some(sheet) = sheets.iter().find(|sheet| sheet.rows.len() >= MAX_ROWS) {
        return Err(ExportError::TooManyRows {
            sheet: sheet.name.clone(),
            rows: sheet.rows.len(),
        });
    }
    let title = text.get("file.title")?;
    let about_sheet = about_sheet(about, text)?;
    let names = sheet_names(&about_sheet, sheets);
    let words = Words {
        yes: text.get(KEY_YES)?,
        no: text.get(KEY_NO)?,
        text,
    };

    let mut book = Workbook::new();
    book.set_properties(&DocProperties::new().set_title(title));
    let formats = Formats::new();
    let mut tables = HashSet::new();

    let (about_name, names) = names
        .split_first()
        .expect("the names are About's and then one per sheet");
    let page = write_sheet(
        &mut book,
        &about_sheet,
        about_name,
        &mut tables,
        &formats,
        &words,
    )
    .map_err(fault)?;
    // The moment is written as a date and time in local time, on the row before the last, which
    // states its offset; the sheet gave its column the room of the text. Under the header, the
    // data row `i` is the sheet's row `i + 1`.
    let made_at = moment(about.made_at.naive_local()).map_err(fault)?;
    let made_row = (about_sheet.rows.len() - 1) as u32;
    page.write_datetime_with_format(made_row, 1, made_at, &formats.moment)
        .map_err(fault)?;
    for (sheet, name) in sheets.iter().zip(names) {
        write_sheet(&mut book, sheet, name, &mut tables, &formats, &words).map_err(fault)?;
    }
    book.save_to_buffer().map_err(fault)
}

/// A fault of the workbook writer.
fn fault(error: XlsxError) -> ExportError {
    ExportError::Workbook {
        reason: error.to_string(),
    }
}

/// The names of the sheets: About's first, then one per sheet, valid and unique together.
fn sheet_names(about: &Sheet, sheets: &[Sheet]) -> Vec<String> {
    let mut named: Vec<Sheet> = std::iter::once(&about.name)
        .chain(sheets.iter().map(|sheet| &sheet.name))
        .map(|name| Sheet {
            name: name.clone(),
            kind: SheetKind::Table,
            columns: Vec::new(),
            rows: Vec::new(),
        })
        .collect();
    name_sheets(&mut named);
    named.into_iter().map(|sheet| sheet.name).collect()
}

/// The About sheet: what the workbook comes from, a label and a value per row, the filters one
/// per row. Its last row is the moment the file was made, written as text for its width and then
/// as a date and time by [`workbook`].
fn about_sheet(about: &About, text: &ExportText) -> Result<Sheet, ExportError> {
    let label = |key: &str| text.get(key).map(|label| Cell::Text(label.to_string()));
    let mut rows = vec![
        vec![
            label("file.about.workspace")?,
            Cell::Text(about.workspace.clone()),
        ],
        vec![
            label("file.about.snapshot")?,
            match about.snapshot {
                Some(day) => Cell::Date(day),
                None => label("file.about.noSnapshot")?,
            },
        ],
        vec![
            label("file.about.file")?,
            Cell::Text(about.file_name.clone()),
        ],
    ];
    if about.filters.is_empty() {
        rows.push(vec![
            label("file.about.filters")?,
            label("file.about.noFilters")?,
        ]);
    }
    for (at, filter) in about.filters.iter().enumerate() {
        let head = if at == 0 {
            label("file.about.filters")?
        } else {
            Cell::Empty
        };
        rows.push(vec![head, Cell::Text(filter.clone())]);
    }
    rows.push(vec![label("file.about.rows")?, Cell::Count(about.rows)]);
    rows.push(vec![
        label("file.about.appVersion")?,
        Cell::Text(about.app_version.clone()),
    ]);
    let local = about.made_at.naive_local();
    let made_at = format!(
        "{} {:02}:{:02}",
        text.date(local.date()),
        local.hour(),
        local.minute()
    );
    rows.push(vec![label("file.about.madeAt")?, Cell::Text(made_at)]);
    // A date cell of Excel has no time zone: the offset of the local time is stated under it.
    let offset = fill(
        text.get("file.about.offset")?,
        &[("offset", &about.made_at.offset().to_string())],
    );
    rows.push(vec![Cell::Empty, Cell::Text(offset)]);
    let column = |id: &str, key: &str| -> Result<Column, ExportError> {
        Ok(Column {
            id: id.into(),
            header: text.get(key)?.to_string(),
            kind: ColumnKind::Text,
            role: ColumnRole::Plain,
        })
    };
    Ok(Sheet {
        name: text.get("file.sheet.about")?.to_string(),
        kind: SheetKind::Table,
        columns: vec![
            column("item", "file.column.about.item")?,
            column("value", "file.column.about.value")?,
        ],
        rows,
    })
}

/// The words a workbook writes for flags and dates Excel cannot hold.
struct Words<'a> {
    yes: &'a str,
    no: &'a str,
    text: &'a ExportText,
}

/// The cell formats of a workbook, made once.
struct Formats {
    date: Format,
    moment: Format,
    whole: Format,
    wrap: Format,
}

impl Formats {
    fn new() -> Self {
        Self {
            date: Format::new().set_num_format(DATE_FORMAT),
            moment: Format::new().set_num_format(DATETIME_FORMAT),
            whole: Format::new().set_num_format("0"),
            wrap: Format::new().set_text_wrap(),
        }
    }
}

/// Writes `sheet` as the worksheet `name`: its table, its cells, its frozen header, its widths,
/// and its colors. `tables` holds the table names taken, in lower case.
fn write_sheet<'b>(
    book: &'b mut Workbook,
    sheet: &Sheet,
    name: &str,
    tables: &mut HashSet<String>,
    formats: &Formats,
    words: &Words,
) -> Result<&'b mut Worksheet, XlsxError> {
    let page = book.add_worksheet();
    page.set_name(name)?;
    if sheet.columns.is_empty() {
        return Ok(page);
    }
    let last_col = (sheet.columns.len() - 1) as u16;
    let rows = sheet.rows.len() as u32;
    let headers = unique_headers(&sheet.columns);

    let mut widths: Vec<usize> = headers
        .iter()
        .map(|header| header.chars().count() + FILTER_BUTTON)
        .collect();
    for (at, row) in sheet.rows.iter().enumerate() {
        let r = at as u32 + 1;
        for (col, (cell, column)) in row.iter().zip(&sheet.columns).enumerate() {
            let c = col as u16;
            widths[col] =
                widths[col].max(write_cell(page, r, c, cell, column.kind, formats, words)?);
        }
    }

    let table = Table::new().set_name(table_name(name, tables)).set_columns(
        &headers
            .iter()
            .map(|header| TableColumn::new().set_header(header))
            .collect::<Vec<_>>(),
    );
    // A table has at least one row under its header; a sheet without rows keeps one empty.
    page.add_table(0, 0, rows.max(1), last_col, &table)?;
    page.set_freeze_panes(1, 0)?;
    for (col, width) in widths.iter().enumerate() {
        page.set_column_width(col as u16, ((*width + 1).min(MAX_WIDTH)) as f64)?;
    }
    paint(page, sheet, rows)?;
    Ok(page)
}

/// Writes one cell and gives the characters it shows. Text longer than a cell holds is cut.
fn write_cell(
    page: &mut Worksheet,
    row: u32,
    col: u16,
    cell: &Cell,
    kind: ColumnKind,
    formats: &Formats,
    words: &Words,
) -> Result<usize, XlsxError> {
    let shown = match cell {
        Cell::Text(text) => {
            let text = cut_cell(text);
            let shown = text
                .lines()
                .map(|line| line.chars().count())
                .max()
                .unwrap_or(0);
            if kind == ColumnKind::LongText {
                page.write_string_with_format(row, col, text, &formats.wrap)?;
            } else {
                page.write_string(row, col, text)?;
            }
            shown
        }
        Cell::Count(count) => {
            page.write_number_with_format(row, col, *count as f64, &formats.whole)?;
            count.to_string().len()
        }
        Cell::Days(days) => {
            page.write_number_with_format(row, col, *days as f64, &formats.whole)?;
            days.to_string().len()
        }
        Cell::Size(size) if size.is_finite() => {
            let size = (size * 100.0).round() / 100.0;
            page.write_number(row, col, size)?;
            size.to_string().len()
        }
        Cell::Size(_) | Cell::Empty => 0,
        Cell::Date(day) => match excel_date(*day) {
            Some(date) => {
                page.write_datetime_with_format(row, col, date, &formats.date)?;
                DATE_CHARS
            }
            None => {
                let text = words.text.date(*day);
                page.write_string(row, col, &text)?;
                text.chars().count()
            }
        },
        Cell::Flag(flag) => {
            let word = if *flag { words.yes } else { words.no };
            page.write_string(row, col, word)?;
            word.chars().count()
        }
    };
    Ok(shown)
}

/// `text` cut to the characters a cell of Excel holds.
fn cut_cell(text: &str) -> &str {
    match text.char_indices().nth(MAX_CELL_CHARS) {
        Some((end, _)) => &text[..end],
        None => text,
    }
}

/// The Excel date of `day`, or `None` for a day Excel's calendar does not hold (before 1900).
fn excel_date(day: NaiveDate) -> Option<ExcelDateTime> {
    let year = u16::try_from(day.year()).ok()?;
    ExcelDateTime::from_ymd(year, day.month() as u8, day.day() as u8).ok()
}

/// The Excel date and time of `at`, to the second.
fn moment(at: NaiveDateTime) -> Result<ExcelDateTime, XlsxError> {
    let year = u16::try_from(at.year()).unwrap_or(0);
    ExcelDateTime::from_ymd(year, at.month() as u8, at.day() as u8)?.and_hms(
        at.hour() as u16,
        at.minute() as u8,
        at.second(),
    )
}

/// The headings of `columns`, unique without regard to case and at most 255 characters, as an
/// Excel table needs them: a heading taken already gets ` (2)`, ` (3)`, and so on, cut to leave
/// room for it; an empty heading is the column's place, from 1.
pub(crate) fn unique_headers(columns: &[Column]) -> Vec<String> {
    let mut taken = HashSet::new();
    columns
        .iter()
        .enumerate()
        .map(|(at, column)| {
            let base = if column.header.is_empty() {
                (at + 1).to_string()
            } else {
                column.header.chars().take(MAX_HEADER_CHARS).collect()
            };
            let mut header = base.clone();
            let mut number = 2;
            while taken.contains(&header.to_lowercase()) {
                let suffix = format!(" ({number})");
                let room = MAX_HEADER_CHARS - suffix.chars().count();
                let kept: String = base.chars().take(room).collect();
                header = format!("{kept}{suffix}");
                number += 1;
            }
            taken.insert(header.to_lowercase());
            header
        })
        .collect()
}

/// The name of the table of the sheet `sheet`: its letters and digits, every other character
/// `_`, with a leading `_` when Excel would not take it as a name (a cell reference, a digit
/// first, `TRUE`), and `_2`, `_3`, and so on when `taken` holds it already, without regard to
/// case.
fn table_name(sheet: &str, taken: &mut HashSet<String>) -> String {
    let mut base: String = sheet
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    if base.is_empty() || utility::check_name(&base).is_err() {
        base.insert(0, '_');
    }
    let mut name = base.clone();
    let mut number = 2;
    while taken.contains(&name.to_lowercase()) {
        name = format!("{base}_{number}");
        number += 1;
    }
    taken.insert(name.to_lowercase());
    name
}

/// The fill of each default age band of the engine, youngest first; the youngest has none.
const AGE_BAND_FILLS: [Option<&str>; 5] = [
    None,
    Some("--color-chart-seq-1"),
    Some("--color-chart-seq-2"),
    Some("--color-chart-seq-3"),
    Some("--color-chart-seq-4"),
];
/// The ends of the scale of a cross-tab's cells, lightest first.
const CROSS_TAB_FILLS: [&str; 2] = ["--color-chart-seq-1", "--color-chart-seq-4"];
/// The data bar of a hold count.
const HOLD_COUNT_FILL: &str = "--color-chart-neutral";

/// Every fill a workbook puts under text: those [`paint`] uses, which a test checks against
/// `palette.json` and against black text.
#[cfg(test)]
fn fills() -> impl Iterator<Item = &'static str> {
    AGE_BAND_FILLS
        .into_iter()
        .flatten()
        .chain(CROSS_TAB_FILLS)
        .chain([HOLD_COUNT_FILL])
}

/// Colors the `rows` rows under the header of `sheet`: an age column by the default age band of
/// each cell, a hold-count column with a neutral data bar, and the cells of a cross-tab between
/// its totals with a light blue scale. Every fill keeps Excel's black text at 4.5:1 or more.
fn paint(page: &mut Worksheet, sheet: &Sheet, rows: u32) -> Result<(), XlsxError> {
    if rows == 0 {
        return Ok(());
    }
    for (at, column) in sheet.columns.iter().enumerate() {
        let col = at as u16;
        match column.role {
            ColumnRole::Plain => {}
            ColumnRole::Age => {
                for (band, fill) in default_age_bands().iter().zip(AGE_BAND_FILLS) {
                    let Some(fill) = fill else { continue };
                    // Days are whole numbers far inside the range an `f64` holds exactly.
                    let days = |days: Option<i64>| days.map(|days| days as f64);
                    let rule = match (days(band.min_days), days(band.max_days)) {
                        (Some(min), Some(max)) => ConditionalFormatCellRule::Between(min, max),
                        (Some(min), None) => ConditionalFormatCellRule::GreaterThanOrEqualTo(min),
                        (None, Some(max)) => ConditionalFormatCellRule::LessThanOrEqualTo(max),
                        (None, None) => continue,
                    };
                    let format = Format::new().set_background_color(color_of(fill));
                    let rule = ConditionalFormatCell::new()
                        .set_rule(rule)
                        .set_format(format);
                    page.add_conditional_format(1, col, rows, col, &rule)?;
                }
            }
            ColumnRole::HoldCount => {
                let neutral = color_of(HOLD_COUNT_FILL);
                let bar = ConditionalFormatDataBar::new()
                    .set_fill_color(neutral)
                    .set_border_color(neutral)
                    .set_solid_fill(true);
                page.add_conditional_format(1, col, rows, col, &bar)?;
            }
        }
    }
    // A cross-tab's cells lie between its label column and its total column, and above its
    // total row.
    let cols = sheet.columns.len();
    if sheet.kind == SheetKind::CrossTab && rows > 1 && cols > 2 {
        let [light, dark] = CROSS_TAB_FILLS;
        let scale = ConditionalFormat2ColorScale::new()
            .set_minimum_color(color_of(light))
            .set_maximum_color(color_of(dark));
        page.add_conditional_format(1, 1, rows - 1, (cols - 2) as u16, &scale)?;
    }
    Ok(())
}

/// The color of `token` for the workbook writer.
fn color_of(token: &str) -> rust_xlsxwriter::Color {
    rust_xlsxwriter::Color::RGB(color(token))
}

#[cfg(test)]
#[path = "xlsx_tests.rs"]
mod tests;
