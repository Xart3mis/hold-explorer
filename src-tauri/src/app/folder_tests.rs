use std::cell::RefCell;
use std::fs;
use std::path::{Path, PathBuf};

use super::error::{CommandError, ErrorKind};
use super::settings::load_settings;
use super::test_support::Fixture;
use super::AppState;

/// Creates a workspace of each name in the folder in use and returns their files. The last one
/// stays open.
fn create(state: &mut AppState, names: &[&str]) -> Vec<PathBuf> {
    names
        .iter()
        .map(|name| {
            state.create_workspace(name).unwrap();
            open_path(state).unwrap()
        })
        .collect()
}

/// The file of the open workspace.
fn open_path(state: &AppState) -> Option<PathBuf> {
    state.open.as_ref().map(|open| open.path().to_path_buf())
}

/// The names of the entries of a folder, sorted.
fn names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

fn name_of(path: &Path) -> String {
    path.file_name().unwrap().to_string_lossy().into_owned()
}

fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// A folder of the fixture outside the default one.
fn elsewhere(fx: &Fixture, name: &str) -> PathBuf {
    fx.dir.path().join(name)
}

#[test]
fn a_relative_folder_is_refused_and_nothing_changes() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A"]);

    let error = state.check_workspace_folder("moved/here").unwrap_err();
    assert_eq!(error.kind, ErrorKind::FolderNotAbsolute);
    assert!(error.message.contains("moved/here"), "{}", error.message);
    let error = state
        .set_workspace_folder(Some("moved/here"), true)
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::FolderNotAbsolute);

    assert_eq!(load_settings(&fx.config()).workspace_dir, None);
    assert_eq!(names(&fx.workspaces()), vec![name_of(&files[0])]);
    assert_eq!(open_path(&state), Some(files[0].clone()));
}

#[test]
fn the_folder_in_use_is_refused() {
    let fx = Fixture::new();
    let mut state = fx.state();
    create(&mut state, &["A"]);

    let error = state
        .check_workspace_folder(&text(&fx.workspaces()))
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::SameFolder);
    // The default folder is the one in use.
    let error = state.set_workspace_folder(None, true).unwrap_err();
    assert_eq!(error.kind, ErrorKind::SameFolder);

    let other = elsewhere(&fx, "other");
    state
        .set_workspace_folder(Some(&text(&other)), true)
        .unwrap();
    // The same folder, written another way.
    let error = state
        .check_workspace_folder(&text(&other.join(".")))
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::SameFolder);
    assert!(error.message.contains(&text(&other)), "{}", error.message);
}

#[test]
fn a_folder_that_cannot_be_created_is_refused_and_nothing_changes() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A"]);
    let blocker = fx.text("not-a-folder", "text");

    let inside = text(&blocker.join("workspaces"));
    let error = state.check_workspace_folder(&inside).unwrap_err();
    assert_eq!(error.kind, ErrorKind::FolderUnusable);
    let error = state.set_workspace_folder(Some(&inside), true).unwrap_err();
    assert_eq!(error.kind, ErrorKind::FolderUnusable);
    assert!(error.message.contains(&inside), "{}", error.message);

    assert_eq!(load_settings(&fx.config()).workspace_dir, None);
    assert_eq!(names(&fx.workspaces()), vec![name_of(&files[0])]);
    assert_eq!(open_path(&state), Some(files[0].clone()));
}

#[cfg(unix)]
#[test]
fn a_folder_that_cannot_be_written_is_refused() {
    use std::os::unix::fs::PermissionsExt;
    let fx = Fixture::new();
    let mut state = fx.state();
    create(&mut state, &["A"]);
    let locked = elsewhere(&fx, "locked");
    fs::create_dir_all(&locked).unwrap();
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o555)).unwrap();
    if fs::write(locked.join("probe"), "x").is_ok() {
        // Running as a user whom permissions do not stop (root); nothing to test.
        return;
    }

    let error = state
        .set_workspace_folder(Some(&text(&locked)), true)
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::FolderUnusable);
    assert!(names(&locked).is_empty());
    assert_eq!(load_settings(&fx.config()).workspace_dir, None);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
}

#[test]
fn a_check_makes_the_folder_and_names_every_listed_workspace_file() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A", "B"]);
    // A damaged workspace file is listed, and so a move takes it; a file of another kind is not.
    let damaged = fx.workspaces().join("damaged.holdx-ws");
    fs::write(&damaged, "not a database\n".repeat(20)).unwrap();
    fs::write(fx.workspaces().join("notes.txt"), "notes").unwrap();
    let new = elsewhere(&fx, "new");

    let check = state.check_workspace_folder(&text(&new)).unwrap();

    assert_eq!(check.path, text(&new));
    let mut expected = vec![
        name_of(&files[0]),
        name_of(&files[1]),
        "damaged.holdx-ws".to_string(),
    ];
    expected.sort();
    assert_eq!(check.movable, expected);
    // The folder was made, and the file that proved it writable is gone.
    assert!(new.is_dir());
    assert!(names(&new).is_empty());
    // A check changes nothing else.
    assert_eq!(load_settings(&fx.config()).workspace_dir, None);
    assert_eq!(open_path(&state), Some(files[1].clone()));
}

/// Holds the file so that it cannot be copied, until the value is dropped: without sharing on
/// Windows, without any permission on Unix. `None` when nothing can hold it (Unix as root).
#[cfg(unix)]
struct Held(PathBuf);

#[cfg(unix)]
fn hold(path: &Path) -> Option<Held> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o000)).unwrap();
    if fs::File::open(path).is_ok() {
        fs::set_permissions(path, fs::Permissions::from_mode(0o644)).unwrap();
        return None;
    }
    Some(Held(path.to_path_buf()))
}

#[cfg(unix)]
impl Drop for Held {
    fn drop(&mut self) {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&self.0, fs::Permissions::from_mode(0o644));
    }
}

#[cfg(windows)]
struct Held {
    _file: fs::File,
}

#[cfg(windows)]
fn hold(path: &Path) -> Option<Held> {
    use std::os::windows::fs::OpenOptionsExt;
    let file = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(path)
        .unwrap();
    Some(Held { _file: file })
}

#[test]
fn a_move_leaves_a_taken_name_and_a_held_file_whole_and_moves_the_rest() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["Taken", "Held", "Free"]);
    let (taken, held, free) = (&files[0], &files[1], &files[2]);
    fs::write(fx.workspaces().join("notes.txt"), "notes").unwrap();
    let new = elsewhere(&fx, "new");
    fs::create_dir_all(&new).unwrap();
    let other = new.join(name_of(taken));
    fs::write(&other, "another file of the same name").unwrap();
    let taken_bytes = fs::read(taken).unwrap();
    let held_bytes = fs::read(held).unwrap();
    // The open workspace is closed first, so its file can be moved.
    assert_eq!(open_path(&state), Some(free.clone()));

    let Some(holding) = hold(held) else {
        return;
    };
    let result = state.set_workspace_folder(Some(&text(&new)), true);
    drop(holding);
    let result = result.unwrap();

    assert_eq!(result.moved, vec![name_of(free)]);
    let mut left: Vec<(String, ErrorKind, String)> = result
        .left
        .iter()
        .map(|file| (file.file_name.clone(), file.kind, file.path.clone()))
        .collect();
    left.sort_by(|a, b| a.0.cmp(&b.0));
    let mut expected = vec![
        (name_of(taken), ErrorKind::NameTaken, text(taken)),
        (name_of(held), ErrorKind::MoveCopy, text(held)),
    ];
    expected.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(left, expected);
    assert!(result.left.iter().all(|file| !file.message.is_empty()));

    // The two left are whole in the old folder, beside the file that is no workspace.
    let mut old = vec![name_of(taken), name_of(held), "notes.txt".to_string()];
    old.sort();
    assert_eq!(names(&fx.workspaces()), old);
    assert_eq!(fs::read(taken).unwrap(), taken_bytes);
    assert_eq!(fs::read(held).unwrap(), held_bytes);
    // The new folder holds the moved file and the other file of the taken name, untouched, and
    // no copy that was given up.
    let mut now = vec![name_of(taken), name_of(free)];
    now.sort();
    assert_eq!(names(&new), now);
    assert_eq!(
        fs::read_to_string(&other).unwrap(),
        "another file of the same name"
    );
    // The open workspace moved, and is open from its new place.
    assert_eq!(open_path(&state), Some(new.join(name_of(free))));
    assert_eq!(load_settings(&fx.config()).workspace_dir, Some(text(&new)));
}

#[test]
fn a_copy_that_fails_its_check_is_removed_and_the_original_stays() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A"]);
    let before = fs::read(&files[0]).unwrap();
    let new = elsewhere(&fx, "new");
    let checked = RefCell::new(Vec::new());
    let check = |path: &Path| {
        checked.borrow_mut().push(path.to_path_buf());
        // The copy is in place, flushed, when it is checked.
        assert_eq!(fs::read(path).unwrap(), before);
        Err(CommandError::new(
            ErrorKind::NotAWorkspace,
            "the check refused it",
        ))
    };

    let result = state
        .set_workspace_folder_with(Some(&text(&new)), true, &check)
        .unwrap();

    let checked = checked.into_inner();
    assert_eq!(checked.len(), 1);
    assert_eq!(checked[0].parent(), Some(new.as_path()));
    assert!(result.moved.is_empty());
    assert_eq!(result.left.len(), 1);
    assert_eq!(result.left[0].kind, ErrorKind::MoveCheck);
    assert!(
        result.left[0].message.contains("the check refused it"),
        "{}",
        result.left[0].message
    );
    assert!(names(&new).is_empty());
    assert_eq!(fs::read(&files[0]).unwrap(), before);
    // The workspace did not move, so it is open from its old place.
    assert_eq!(open_path(&state), Some(files[0].clone()));
    assert!(result.start.open.is_some());
    // The folder passed its checks, so it is the folder in use, though no file moved.
    assert_eq!(load_settings(&fx.config()).workspace_dir, Some(text(&new)));
}

#[cfg(unix)]
#[test]
fn a_file_that_cannot_be_removed_from_the_old_folder_leaves_no_copy_in_the_new_one() {
    use std::os::unix::fs::PermissionsExt;
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A"]);
    let before = fs::read(&files[0]).unwrap();
    let new = elsewhere(&fx, "new");
    fs::set_permissions(fx.workspaces(), fs::Permissions::from_mode(0o555)).unwrap();
    if fs::write(fx.workspaces().join("probe"), "x").is_ok() {
        // Running as a user whom permissions do not stop (root); nothing to test.
        return;
    }

    let result = state.set_workspace_folder(Some(&text(&new)), true);
    fs::set_permissions(fx.workspaces(), fs::Permissions::from_mode(0o755)).unwrap();
    let result = result.unwrap();

    assert!(result.moved.is_empty());
    assert_eq!(result.left.len(), 1);
    assert_eq!(result.left[0].kind, ErrorKind::MoveRemove);
    assert!(names(&new).is_empty());
    assert_eq!(fs::read(&files[0]).unwrap(), before);
    assert_eq!(open_path(&state), Some(files[0].clone()));
}

#[test]
fn the_open_workspace_is_reopened_from_its_new_place() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A", "B"]);
    let id = state.open_id();
    let new = elsewhere(&fx, "new");

    let result = state.set_workspace_folder(Some(&text(&new)), true).unwrap();

    let mut moved = vec![name_of(&files[0]), name_of(&files[1])];
    moved.sort();
    let mut answered = result.moved.clone();
    answered.sort();
    assert_eq!(answered, moved);
    assert!(result.left.is_empty());
    assert_eq!(open_path(&state), Some(new.join(name_of(&files[1]))));
    assert_eq!(state.open_id(), id);
    let open = result.start.open.unwrap();
    assert_eq!(open.workspace.id, id);
    assert_eq!(state.current().unwrap().unwrap(), open);
    assert_eq!(result.start.list.folder, text(&new));
    assert_eq!(result.start.list.workspaces.len(), 2);
    assert_eq!(result.start.settings.workspace_dir, Some(text(&new)));
    assert!(result.start.settings_problem.is_none());
    assert!(names(&fx.workspaces()).is_empty());
    // The next start lists the new folder.
    assert_eq!(fx.state().list_workspaces().unwrap().folder, text(&new));
}

#[test]
fn leave_them_switches_without_touching_files() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A", "B"]);
    let before: Vec<Vec<u8>> = files.iter().map(|file| fs::read(file).unwrap()).collect();
    let new = elsewhere(&fx, "new");

    let result = state
        .set_workspace_folder(Some(&text(&new)), false)
        .unwrap();

    assert!(result.moved.is_empty());
    assert!(result.left.is_empty());
    let after: Vec<Vec<u8>> = files.iter().map(|file| fs::read(file).unwrap()).collect();
    assert_eq!(after, before);
    assert_eq!(names(&fx.workspaces()).len(), 2);
    assert!(names(&new).is_empty());
    assert!(result.start.list.workspaces.is_empty());
    assert_eq!(result.start.list.folder, text(&new));
    // The open workspace stays open, from where it is.
    assert_eq!(open_path(&state), Some(files[1].clone()));
    assert!(result.start.open.is_some());
    assert_eq!(load_settings(&fx.config()).workspace_dir, Some(text(&new)));
}

#[test]
fn the_default_folder_takes_the_workspaces_back() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let new = elsewhere(&fx, "new");
    state
        .set_workspace_folder(Some(&text(&new)), false)
        .unwrap();
    let files = create(&mut state, &["A"]);
    assert_eq!(files[0].parent(), Some(new.as_path()));

    let result = state.set_workspace_folder(None, true).unwrap();

    assert_eq!(result.moved, vec![name_of(&files[0])]);
    assert_eq!(names(&fx.workspaces()), vec![name_of(&files[0])]);
    assert!(names(&new).is_empty());
    assert_eq!(result.start.settings.workspace_dir, None);
    assert_eq!(load_settings(&fx.config()).workspace_dir, None);
    assert_eq!(result.start.list.folder, text(&fx.workspaces()));
    assert_eq!(
        open_path(&state),
        Some(fx.workspaces().join(name_of(&files[0])))
    );
}

#[test]
fn a_settings_file_that_cannot_be_saved_reverts_nothing_and_is_reported() {
    let fx = Fixture::new();
    // A file where the configuration folder should be: the settings can be neither read nor
    // saved.
    fs::write(fx.config(), "in the way").unwrap();
    let mut state = fx.state();
    let files = create(&mut state, &["A"]);
    let new = elsewhere(&fx, "new");

    let result = state.set_workspace_folder(Some(&text(&new)), true).unwrap();

    assert_eq!(result.moved, vec![name_of(&files[0])]);
    assert_eq!(names(&new), vec![name_of(&files[0])]);
    let problem = result.start.settings_problem.unwrap();
    assert_eq!(problem.kind, ErrorKind::Settings);
    assert!(problem.message.contains(&text(&new)), "{}", problem.message);
    // The folder is in use for this session all the same, where the files now are.
    assert_eq!(state.settings().workspace_dir, Some(text(&new)));
    assert_eq!(result.start.list.workspaces.len(), 1);
    assert_eq!(open_path(&state), Some(new.join(name_of(&files[0]))));
}
