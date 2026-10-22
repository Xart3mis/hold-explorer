//! The history store of Hold Explorer: one SQLite file per workspace that keeps each import as a
//! snapshot.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

mod codec;
mod directory;
mod dump;
mod error;
mod schema;
mod snapshot;
#[cfg(test)]
mod test_support;
mod workspace;

pub use error::StoreError;
pub use schema::SCHEMA_VERSION;

pub use directory::{
    check_workspace, delete_workspace, find_by_project, list_workspaces, UnreadableWorkspace,
    WorkspaceList,
};
pub use dump::logical_dump;
pub use snapshot::{ImportOptions, SnapshotDetail, SnapshotInfo};
pub use workspace::{Workspace, WorkspaceInfo};

#[cfg(all(test, feature = "ts"))]
mod ts_tests;
