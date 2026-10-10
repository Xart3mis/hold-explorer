//! The history store of Hold Explorer: one SQLite file per workspace that keeps each import as a
//! snapshot.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod error;
pub mod schema;

pub use error::StoreError;
pub use schema::SCHEMA_VERSION;
