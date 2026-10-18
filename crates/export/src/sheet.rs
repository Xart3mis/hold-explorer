//! The table model every file shares.

use chrono::NaiveDate;

/// What a cell of a sheet holds. Dates are calendar days; numbers keep their kind.
#[derive(Debug, Clone, PartialEq)]
pub enum Cell {
    /// Text, written as it is.
    Text(String),
    /// A whole number of things: holds, lines.
    Count(usize),
    /// A number of days.
    Days(i64),
    /// A pipe size in inches.
    Size(f64),
    /// A calendar day.
    Date(NaiveDate),
    /// Yes or no.
    Flag(bool),
    /// No value.
    Empty,
}

/// What a column holds; it decides formats in Excel and nothing in text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColumnKind {
    /// Short text: a name, a type.
    Text,
    /// An identifier, such as a line ID, kept as text.
    Identifier,
    /// Whole numbers.
    Count,
    /// Numbers of days.
    Days,
    /// Pipe sizes in inches.
    Size,
    /// Calendar days.
    Date,
    /// Yes or no.
    Flag,
    /// Long text that wraps, such as a remark.
    LongText,
}

/// What a column means to a reader, beyond its kind; it decides the colors of a workbook and
/// nothing in text.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ColumnRole {
    /// Nothing more than its kind.
    #[default]
    Plain,
    /// The age in days of open holds: a hold's age, or a line's oldest. A workbook colors it
    /// with the age-band ramp.
    Age,
    /// A number of holds. A workbook draws it as a neutral data bar.
    HoldCount,
}

/// One column of a sheet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Column {
    /// A stable name of the column, not shown.
    pub id: String,
    /// The heading of the column, from the interface's catalog.
    pub header: String,
    /// What the column holds.
    pub kind: ColumnKind,
    /// What the column means to a reader.
    pub role: ColumnRole,
}

/// The shape of a sheet.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum SheetKind {
    /// A table: a row per item.
    #[default]
    Table,
    /// A cross-tab: the first column names the rows, every other column but the last is a
    /// column value, the last column is the row's total, and the last row is the column totals.
    /// A workbook colors the cells between them with the sequential blue ramp.
    CrossTab,
}

/// One table of a file: a sheet of a workbook, a CSV file, or the text on the clipboard.
#[derive(Debug, Clone, PartialEq)]
pub struct Sheet {
    /// The name of the sheet, from the interface's catalog.
    pub name: String,
    /// The shape of the sheet.
    pub kind: SheetKind,
    /// The columns, in order.
    pub columns: Vec<Column>,
    /// The rows, each with one cell per column.
    pub rows: Vec<Vec<Cell>>,
}
