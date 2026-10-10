//! The engine of Hold Explorer. It reads a spreadsheet export of piping holds (reasons a piping
//! line cannot proceed), derives the blocker each hold waits for from its remark, and answers
//! questions about the holds: how many, how old, which lines, and which blockers to solve first.
//!
//! The pipeline, in order:
//!
//! 1. Open: [`load::open_file`] reads a `.xlsx`, `.xlsm`, `.xlsb`, `.xls`, `.ods`, or delimited
//!    text (`.csv`, `.tsv`, `.txt`) file into an [`load::Opened`] (the raw table, a content hash,
//!    and a proposed column mapping); [`load::open_sheet`] opens a named sheet instead.
//! 2. Map: [`mapping::ColumnMap::auto`] proposes which column supplies which field;
//!    [`mapping::ColumnMap::auto_with`] does so with a [`mapping::SavedMapping`] remembered from
//!    an earlier file taking precedence; [`mapping::ColumnMap::from_fields`] builds a map from
//!    the user's own choices.
//! 3. Parse: [`load::parse_opened`] (or [`import::parse_table`] on a bare table) turns the rows
//!    into [`model::Hold`] values, skipped rows, and warnings, and finds the snapshot date with
//!    [`snapshot_date::snapshot_date`]. [`load::load_file`] runs steps 1 to 3 with the
//!    automatic mapping.
//! 4. Build a dataset: [`dataset::Dataset::build`] derives each hold's blocker (with
//!    [`rules::RuleSet::builtin`]), age, and duration as of the snapshot.
//! 5. Filter: a [`filter::FilterSpec`] selects rows with [`filter::FilterSpec::matches`].
//! 6. Query: [`query::summary`], [`query::group_by`], [`query::matrix`], [`query::lines`], and
//!    [`query::holds`] aggregate the selected holds.
//! 7. Solve: [`solve::solve_plan`] orders the blockers to solve to free the most lines.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod dataset;
pub mod error;
pub mod filter;
pub mod import;
pub mod load;
pub mod mapping;
pub mod model;
pub mod normalize;
pub mod query;
mod reader;
pub mod rules;
pub mod snapshot_date;
pub mod solve;
pub mod table;
pub mod warning;

#[cfg(test)]
pub(crate) mod testkit;
