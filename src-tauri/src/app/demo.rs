//! The demo workspace: synthetic exports imported as four weekly snapshots.

use std::path::Path;

use hx_core::load::load_file;
use hx_store::{delete_workspace, ImportOptions, StoreError, Workspace};
use hx_synth::{evolve, generate, write_workbook, SynthConfig};

use super::error::CommandError;
use super::import::remove_created;
use super::workspaces::WorkspaceOpen;
use super::{describe_with_warning, AppState};

/// The name of the demo workspace.
const DEMO_NAME: &str = "Demo";
/// The seed of the first export; each evolution adds its number to it.
const DEMO_SEED: u64 = 20_260_929;
/// Lines in the first export.
const DEMO_LINES: usize = 3_600;
/// Holds in the first export.
const DEMO_HOLDS: usize = 9_300;
/// Snapshots in the demo workspace.
const DEMO_SNAPSHOTS: u64 = 4;
/// Days between two snapshots.
const DEMO_DAYS_APART: i64 = 7;

/// Says first that the demo could not be built, then what the engine reported.
fn demo_failed(mut error: CommandError) -> CommandError {
    error.message = format!("The demo workspace could not be built. {}", error.message);
    error
}

fn internal(what: &str, detail: impl std::fmt::Display) -> CommandError {
    CommandError::internal(format!(
        "The demo workspace could not be built: {what} ({detail}). Try again; if it keeps happening, report it."
    ))
}

impl AppState {
    /// Makes a new workspace named `Demo` with four snapshots of synthetic holds, 7 days apart, and
    /// opens it with the newest selected. An existing workspace is never changed.
    pub fn create_demo(&mut self) -> Result<WorkspaceOpen, CommandError> {
        self.create_demo_with(&std::env::temp_dir(), &delete_workspace, &|_| Ok(()))
    }

    /// [`AppState::create_demo`] with the folder for the temporary files and the function that
    /// removes the workspace file again when the build fails. `after_file` is called with the
    /// step number once that step's snapshot is imported; an error from it fails the build.
    pub(super) fn create_demo_with(
        &mut self,
        scratch_root: &Path,
        remove: &dyn Fn(&Path) -> Result<(), StoreError>,
        after_file: &dyn Fn(u64) -> Result<(), CommandError>,
    ) -> Result<WorkspaceOpen, CommandError> {
        let writes = self.writes();
        let _write = writes.begin();
        let mut workspace =
            Workspace::create(&self.folder(), DEMO_NAME).map_err(|e| demo_failed(e.into()))?;
        let path = workspace.path().to_path_buf();
        match build_demo(&mut workspace, scratch_root, after_file)
            .and_then(|()| describe_with_warning(&workspace).map_err(demo_failed))
        {
            Ok(open) => Ok(self.install_and_remember(workspace, open)),
            Err(mut error) => {
                // Close the file first: Windows refuses to delete an open file.
                drop(workspace);
                if let Some(note) =
                    remove_created(DEMO_NAME, &path, "for the demo workspace", remove)
                {
                    error.message = format!("{} {note}", error.message);
                }
                Err(error)
            }
        }
    }
}

/// Writes each export to a temporary file, loads it, and imports it. The files are removed when
/// this returns.
fn build_demo(
    workspace: &mut Workspace,
    scratch_root: &Path,
    after_file: &dyn Fn(u64) -> Result<(), CommandError>,
) -> Result<(), CommandError> {
    let scratch = tempfile::tempdir_in(scratch_root)
        .map_err(|error| internal("no temporary folder could be made", error))?;
    let mut cfg = SynthConfig::new(DEMO_SEED, DEMO_LINES, DEMO_HOLDS);
    let mut rows = generate(&cfg);
    for step in 0..DEMO_SNAPSHOTS {
        if step > 0 {
            (rows, cfg, _) = evolve(&rows, &cfg, DEMO_SEED + step, DEMO_DAYS_APART);
        }
        let file = scratch.path().join(format!("demo-{step}.xlsx"));
        write_workbook(&rows, &cfg, &file)
            .map_err(|error| internal("a file was not written", error))?;
        let loaded = load_file(&file).map_err(|e| demo_failed(e.into()))?;
        let taken = loaded
            .snapshot
            .ok_or_else(|| internal("a file carries no date", "the report date is missing"))?;
        let options = ImportOptions {
            replace: None,
            save_mapping: Some(loaded.map.to_saved(&loaded.headers)),
            add_project_number: loaded.project_no().map(str::to_string),
        };
        workspace
            .import(&loaded, taken, &options)
            .map_err(|e| demo_failed(e.into()))?;
        after_file(step)?;
    }
    Ok(())
}
