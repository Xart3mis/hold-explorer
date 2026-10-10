//! The history store of Hold Explorer: one SQLite file per workspace that keeps each import as a
//! snapshot.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

mod codec;
mod directory;
mod error;
mod schema;
mod snapshot;
mod workspace;

pub use error::StoreError;
pub use schema::SCHEMA_VERSION;

pub use directory::{delete_workspace, find_by_project, list_workspaces};
pub use snapshot::{ImportOptions, SnapshotDetail, SnapshotInfo};
pub use workspace::{Workspace, WorkspaceInfo};
