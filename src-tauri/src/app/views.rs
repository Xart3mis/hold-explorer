//! The saved views of the open workspace: the five operations behind the commands, and the rules
//! they keep. The store keeps the list; the names, the address, and the limit are decided here.

use hx_core::filter::FilterSpec;
use hx_store::{SavedView, StoreError, Workspace};

use super::error::{CommandError, ErrorKind};
use super::AppState;

/// The longest name of a saved view, in characters, after trimming.
const NAME_LIMIT: usize = 80;

/// The most saved views a workspace holds.
const VIEW_LIMIT: usize = 100;

/// The paths of the screens that read the data in view, which a saved view may address.
const DATA_PATHS: [&str; 4] = ["/overview", "/breakdown", "/lines", "/blockers"];

/// The query parameters that name a selection, which a saved view never carries.
const SELECTION_PARAMS: [&str; 3] = ["line", "hold", "blocker"];

#[cfg(test)]
thread_local! {
    /// How many times this thread read the saved views of a workspace.
    pub(super) static VIEW_READS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

/// The saved views of `workspace`, and the warning to show when they could not be read: a stored
/// value that cannot be parsed reads as no views, and is left in the file until a save replaces it.
pub(super) fn read_views(
    workspace: &Workspace,
) -> Result<(Vec<SavedView>, Option<CommandError>), CommandError> {
    #[cfg(test)]
    VIEW_READS.with(|reads| reads.set(reads.get() + 1));
    match workspace.saved_views() {
        Ok(views) => Ok((views, None)),
        Err(StoreError::Corrupt { detail }) => Ok((
            Vec::new(),
            Some(CommandError::new(
                ErrorKind::Corrupt,
                format!(
                    "The saved views of this workspace could not be read ({}), so none are listed. The damaged list stays in the file until you save a view, which replaces it. Save your views again.",
                    detail.trim_end_matches('.')
                ),
            )),
        )),
        Err(error) => Err(error.into()),
    }
}

/// The name trimmed, or `ViewName` when it is empty or too long.
fn clean_name(name: &str) -> Result<String, CommandError> {
    let name = name.trim();
    let length = name.chars().count();
    if length == 0 {
        return Err(CommandError::new(
            ErrorKind::ViewName,
            "A saved view needs a name of at least one character. Type a name, then save again.",
        ));
    }
    if length > NAME_LIMIT {
        return Err(CommandError::new(
            ErrorKind::ViewName,
            format!(
                "A saved view's name has at most {NAME_LIMIT} characters, and this one has {length}. Shorten the name, then save again."
            ),
        ));
    }
    Ok(name.to_string())
}

/// `ViewNameTaken` when a view other than `except` has this name, without regard to case.
fn check_name_free(
    views: &[SavedView],
    name: &str,
    except: Option<i64>,
) -> Result<(), CommandError> {
    let lower = name.to_lowercase();
    match views
        .iter()
        .find(|view| Some(view.id) != except && view.name.to_lowercase() == lower)
    {
        Some(taken) => Err(CommandError::new(
            ErrorKind::ViewNameTaken,
            format!(
                "A saved view named \"{}\" already exists, and names are compared without regard to case. Choose another name, or delete that view first.",
                taken.name
            ),
        )),
        None => Ok(()),
    }
}

/// `ViewAddress` unless `address` is one of the four data paths, with a query that carries no
/// selection. Breakdown's `open` names a selected group, so it counts as a selection there.
fn check_address(address: &str) -> Result<(), CommandError> {
    let (path, query) = address.split_once('?').unwrap_or((address, ""));
    if address.contains('#') {
        return Err(CommandError::new(
            ErrorKind::ViewAddress,
            format!(
                "The address \"{address}\" cannot be saved as a view: it has a fragment. This is a fault of Hold Explorer; report it, and save the view again from the screen."
            ),
        ));
    }
    let refused = |why: &str| {
        CommandError::new(
            ErrorKind::ViewAddress,
            format!(
                "The address \"{address}\" cannot be saved as a view: {why}. This is a fault of Hold Explorer; report it, and save the view again from the screen."
            ),
        )
    };
    if !DATA_PATHS.contains(&path) {
        return Err(refused(
            "it is not the address of Overview, Breakdown, Lines, or Blockers",
        ));
    }
    for pair in query.split('&') {
        let key = pair.split_once('=').map_or(pair, |(key, _)| key);
        // An escaped key could spell a selection; the interface writes none.
        if key.contains('%') {
            return Err(refused("a name in its query is escaped"));
        }
        if SELECTION_PARAMS.contains(&key) || (path == "/breakdown" && key == "open") {
            return Err(refused(&format!("it carries the selection \"{key}\"")));
        }
    }
    Ok(())
}

impl AppState {
    /// The open workspace when `workspace` is its id: `NoWorkspace` when none is open,
    /// `ViewChanged` for another id (the page holds a workspace that is no longer the one in
    /// view).
    fn views_workspace(&mut self, workspace: &str) -> Result<&mut Workspace, CommandError> {
        let open_id = self
            .open_id
            .as_deref()
            .ok_or_else(CommandError::no_workspace)?;
        if open_id != workspace {
            return Err(CommandError::new(
                ErrorKind::ViewChanged,
                "That workspace is not the one that is open, so its saved views were not changed. Open the workspace, then try again.",
            ));
        }
        self.open.as_mut().ok_or_else(CommandError::no_workspace)
    }

    /// Saves a view at the end of the list. Returns the list.
    pub fn save_view(
        &mut self,
        workspace: &str,
        name: &str,
        address: &str,
        filters: FilterSpec,
    ) -> Result<Vec<SavedView>, CommandError> {
        let workspace = self.views_workspace(workspace)?;
        let name = clean_name(name)?;
        check_address(address)?;
        let mut views = list_for_write(workspace)?;
        check_name_free(&views, &name, None)?;
        check_room(&views)?;
        views.push(SavedView {
            id: workspace.next_view_id()?,
            name,
            address: address.to_string(),
            filters,
        });
        workspace.set_saved_views(&views)?;
        Ok(views)
    }

    /// Renames a view; it keeps its id and its place. Returns the list.
    pub fn rename_view(
        &mut self,
        workspace: &str,
        id: i64,
        name: &str,
    ) -> Result<Vec<SavedView>, CommandError> {
        let workspace = self.views_workspace(workspace)?;
        let name = clean_name(name)?;
        let mut views = list_for_write(workspace)?;
        let at = position(&views, id)?;
        check_name_free(&views, &name, Some(id))?;
        views[at].name = name;
        workspace.set_saved_views(&views)?;
        Ok(views)
    }

    /// Deletes a view; its id is not given again. Returns the list.
    pub fn delete_view(
        &mut self,
        workspace: &str,
        id: i64,
    ) -> Result<Vec<SavedView>, CommandError> {
        let workspace = self.views_workspace(workspace)?;
        let mut views = list_for_write(workspace)?;
        views.remove(position(&views, id)?);
        workspace.set_saved_views(&views)?;
        Ok(views)
    }

    /// Puts a deleted view back with its id at `index`, or last when `index` is past the end.
    /// Refused when its name was taken meanwhile. Returns the list.
    pub fn restore_view(
        &mut self,
        workspace: &str,
        view: SavedView,
        index: usize,
    ) -> Result<Vec<SavedView>, CommandError> {
        let workspace = self.views_workspace(workspace)?;
        let name = clean_name(&view.name)?;
        check_address(&view.address)?;
        let mut views = list_for_write(workspace)?;
        // Only an id that was issued can come back.
        if view.id < 1 || view.id >= workspace.next_view_id()? {
            return Err(view_not_found());
        }
        if views.iter().any(|other| other.id == view.id) {
            return Err(CommandError::internal(
                "That saved view is in the list already, so it was not restored. Reload the list; if it keeps happening, report it.",
            ));
        }
        check_name_free(&views, &name, None)?;
        check_room(&views)?;
        views.insert(index.min(views.len()), SavedView { name, ..view });
        workspace.set_saved_views(&views)?;
        Ok(views)
    }

    /// Moves a view to `index` of the list as it is after the view is taken out (so moving to
    /// the end is the length of the list less one, and any larger index is the end too). Returns
    /// the list.
    pub fn move_view(
        &mut self,
        workspace: &str,
        id: i64,
        index: usize,
    ) -> Result<Vec<SavedView>, CommandError> {
        let workspace = self.views_workspace(workspace)?;
        let mut views = list_for_write(workspace)?;
        let view = views.remove(position(&views, id)?);
        views.insert(index.min(views.len()), view);
        workspace.set_saved_views(&views)?;
        Ok(views)
    }
}

/// The list a write starts from: a damaged stored value reads as no views, so the write replaces it.
fn list_for_write(workspace: &Workspace) -> Result<Vec<SavedView>, CommandError> {
    match workspace.saved_views() {
        Ok(views) => Ok(views),
        Err(StoreError::Corrupt { .. }) => Ok(Vec::new()),
        Err(error) => Err(error.into()),
    }
}

/// `TooManyViews` when the list is full.
fn check_room(views: &[SavedView]) -> Result<(), CommandError> {
    if views.len() >= VIEW_LIMIT {
        return Err(CommandError::new(
            ErrorKind::TooManyViews,
            format!(
                "A workspace holds at most {VIEW_LIMIT} saved views, and this one holds {}. Delete a view you no longer use, then save again.",
                views.len()
            ),
        ));
    }
    Ok(())
}

/// Where the view with this id is, or `ViewNotFound`.
fn position(views: &[SavedView], id: i64) -> Result<usize, CommandError> {
    views
        .iter()
        .position(|view| view.id == id)
        .ok_or_else(view_not_found)
}

fn view_not_found() -> CommandError {
    CommandError::new(
        ErrorKind::ViewNotFound,
        "That saved view is not in the list. It may have been deleted already; the list shows the views there are.",
    )
}
