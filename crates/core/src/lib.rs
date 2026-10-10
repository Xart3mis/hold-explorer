#![forbid(unsafe_code)]

pub mod dataset;
pub mod error;
pub mod filter;
pub mod import;
pub mod load;
pub mod mapping;
pub mod model;
pub mod normalize;
pub mod query;
pub mod reader;
pub mod rules;
pub mod snapshot_date;
pub mod solve;
pub mod table;
pub mod warning;

#[cfg(test)]
pub(crate) mod testkit;
