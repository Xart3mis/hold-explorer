use std::cell::RefCell;
use std::fs;
use std::path::{Path, PathBuf};

use super::error::{CommandError, ErrorKind};
use super::folder::{move_file, same_bytes};
use super::settings::load_settings;
use super::test_support::{import, small, Fixture};
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

    let error = state
        .check_workspace_folder(Some("moved/here"))
        .unwrap_err();
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
        .check_workspace_folder(Some(&text(&fx.workspaces())))
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
        .check_workspace_folder(Some(&text(&other.join("."))))
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
    let error = state.check_workspace_folder(Some(&inside)).unwrap_err();
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
    // A missing folder inside it is refused by a check as well, which probes the folder above.
    let error = state
        .check_workspace_folder(Some(&text(&locked.join("missing"))))
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::FolderUnusable);
    assert!(names(&locked).is_empty());
    assert_eq!(load_settings(&fx.config()).workspace_dir, None);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
}

#[test]
fn a_check_names_every_listed_workspace_file_and_writes_nothing() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A", "B"]);
    // A damaged workspace file is listed, and so a move takes it; a file of another kind is not.
    let damaged = fx.workspaces().join("damaged.holdx-ws");
    fs::write(&damaged, "not a database\n".repeat(20)).unwrap();
    fs::write(fx.workspaces().join("notes.txt"), "notes").unwrap();
    // A missing folder, two levels below the nearest one that exists.
    let parent = elsewhere(&fx, "new");
    let new = parent.join("deeper");
    let before = names(fx.dir.path());

    let check = state.check_workspace_folder(Some(&text(&new))).unwrap();

    assert_eq!(check.path, text(&new));
    let mut expected = vec![
        name_of(&files[0]),
        name_of(&files[1]),
        "damaged.holdx-ws".to_string(),
    ];
    expected.sort();
    assert_eq!(check.movable, expected);
    // No folder was made, and the file that proved the folder above writable is gone.
    assert!(!parent.exists());
    assert_eq!(names(fx.dir.path()), before);
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
    assert_eq!(
        result.start.settings_file,
        text(&fx.config().join("settings.json"))
    );
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

#[test]
fn a_check_of_the_default_folder_names_the_files_a_move_back_would_take() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let new = elsewhere(&fx, "new");
    state
        .set_workspace_folder(Some(&text(&new)), false)
        .unwrap();
    let files = create(&mut state, &["A"]);

    let check = state.check_workspace_folder(None).unwrap();

    assert_eq!(check.path, text(&fx.workspaces()));
    assert_eq!(check.movable, vec![name_of(&files[0])]);
    // The default folder is in use by default, so a check of it then is refused.
    let fresh = Fixture::new();
    let error = fresh.state().check_workspace_folder(None).unwrap_err();
    assert_eq!(error.kind, ErrorKind::SameFolder);
}

#[test]
fn damaged_and_newer_files_move_whole() {
    let fx = Fixture::new();
    let mut state = fx.state();
    // The newer one is created first, so the readable one is open when the folder changes.
    let files = create(&mut state, &["Newer", "Readable"]);
    rusqlite::Connection::open(&files[0])
        .unwrap()
        .execute_batch("PRAGMA user_version = 99")
        .unwrap();
    let damaged = fx.workspaces().join("damaged.holdx-ws");
    fs::write(&damaged, "not a database\n".repeat(20)).unwrap();
    let originals = [files[0].clone(), files[1].clone(), damaged];
    let before: Vec<Vec<u8>> = originals
        .iter()
        .map(|file| fs::read(file).unwrap())
        .collect();
    let new = elsewhere(&fx, "new");

    let check = state.check_workspace_folder(Some(&text(&new))).unwrap();
    assert_eq!(check.movable.len(), 3);
    assert_eq!(check.count, 3);
    let result = state.set_workspace_folder(Some(&text(&new)), true).unwrap();

    assert!(result.left.is_empty(), "{:?}", result.left);
    let mut moved = result.moved.clone();
    moved.sort();
    assert_eq!(moved, check.movable);
    assert!(names(&fx.workspaces()).is_empty());
    for (original, bytes) in originals.iter().zip(&before) {
        assert_eq!(&fs::read(new.join(name_of(original))).unwrap(), bytes);
    }
    // The newer and the damaged one are listed in the new folder as they were in the old.
    assert_eq!(result.start.list.unreadable.len(), 2);
    assert_eq!(open_path(&state), Some(new.join(name_of(&files[1]))));
}

#[test]
fn a_copy_of_an_unreadable_file_is_compared_byte_for_byte_and_not_opened() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let damaged = fx.workspaces().join("damaged.holdx-ws");
    fs::create_dir_all(fx.workspaces()).unwrap();
    fs::write(&damaged, "not a database\n".repeat(20)).unwrap();
    let new = elsewhere(&fx, "new");
    let checked = RefCell::new(0);
    let check = |_: &Path| {
        *checked.borrow_mut() += 1;
        Err(CommandError::new(ErrorKind::NotAWorkspace, "opened"))
    };

    let result = state
        .set_workspace_folder_with(Some(&text(&new)), true, &check)
        .unwrap();

    assert_eq!(checked.into_inner(), 0);
    assert_eq!(result.moved, vec!["damaged.holdx-ws".to_string()]);
    assert!(!damaged.exists());
}

/// A file `name` with `content` in the folder `dir`, made when missing.
fn file_in(dir: &Path, name: &str, content: &str) -> PathBuf {
    fs::create_dir_all(dir).unwrap();
    let path = dir.join(name);
    fs::write(&path, content).unwrap();
    path
}

fn verified(_: &Path) -> Result<(), String> {
    Ok(())
}

#[test]
fn a_removal_that_took_the_original_and_then_failed_keeps_the_copy_as_moved() {
    let fx = Fixture::new();
    let file = file_in(&elsewhere(&fx, "old"), "a.holdx-ws", "content");
    let to = elsewhere(&fx, "new");
    fs::create_dir_all(&to).unwrap();

    let result = move_file(&file, &to, &verified, &|path: &Path| {
        fs::remove_file(path)?;
        Err(std::io::Error::other("reported after the file was gone"))
    });

    result.unwrap();
    assert!(!file.exists());
    assert_eq!(
        fs::read_to_string(to.join("a.holdx-ws")).unwrap(),
        "content"
    );
    assert_eq!(names(&to), vec!["a.holdx-ws".to_string()]);
}

#[test]
fn a_removal_that_finds_the_original_gone_counts_the_file_as_moved() {
    let fx = Fixture::new();
    let file = file_in(&elsewhere(&fx, "old"), "a.holdx-ws", "content");
    let to = elsewhere(&fx, "new");
    fs::create_dir_all(&to).unwrap();

    let result = move_file(&file, &to, &verified, &|path: &Path| {
        fs::remove_file(path)?;
        Err(std::io::Error::from(std::io::ErrorKind::NotFound))
    });

    result.unwrap();
    assert_eq!(
        fs::read_to_string(to.join("a.holdx-ws")).unwrap(),
        "content"
    );
}

#[test]
fn a_removal_that_failed_with_the_original_in_place_removes_the_copy() {
    let fx = Fixture::new();
    let file = file_in(&elsewhere(&fx, "old"), "a.holdx-ws", "content");
    let to = elsewhere(&fx, "new");
    fs::create_dir_all(&to).unwrap();

    let error = move_file(&file, &to, &verified, &|_: &Path| {
        Err(std::io::Error::other("held by another program"))
    })
    .unwrap_err();

    assert_eq!(error.kind, ErrorKind::MoveRemove);
    assert!(
        error.message.contains("held by another program"),
        "{}",
        error.message
    );
    assert_eq!(fs::read_to_string(&file).unwrap(), "content");
    assert!(names(&to).is_empty());
}

#[cfg(unix)]
#[test]
fn a_moved_file_keeps_its_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A"]);
    fs::set_permissions(&files[0], fs::Permissions::from_mode(0o644)).unwrap();
    let new = elsewhere(&fx, "new");

    let result = state.set_workspace_folder(Some(&text(&new)), true).unwrap();

    assert_eq!(result.moved, vec![name_of(&files[0])]);
    let mode = fs::metadata(new.join(name_of(&files[0])))
        .unwrap()
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o644);
}

#[test]
fn a_name_taken_while_the_copy_was_checked_leaves_the_file_and_the_other_file_whole() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["A"]);
    let before = fs::read(&files[0]).unwrap();
    let new = elsewhere(&fx, "new");
    let other = new.join(name_of(&files[0]));
    // Another program writes a file of the name while the copy is checked.
    let check = |_: &Path| {
        fs::write(&other, "another file").unwrap();
        Ok(())
    };

    let result = state
        .set_workspace_folder_with(Some(&text(&new)), true, &check)
        .unwrap();

    assert!(result.moved.is_empty());
    assert_eq!(result.left.len(), 1);
    assert_eq!(result.left[0].kind, ErrorKind::NameTaken);
    assert_eq!(fs::read_to_string(&other).unwrap(), "another file");
    assert_eq!(names(&new), vec![name_of(&files[0])]);
    assert_eq!(fs::read(&files[0]).unwrap(), before);
}

#[test]
fn same_bytes_finds_a_copy_of_another_length_and_one_of_other_content() {
    let fx = Fixture::new();
    let original = fx.text("original", "abcdef");
    let shorter = fx.text("shorter", "abcde");
    let other = fx.text("other", "abcdeX");
    let equal = fx.text("equal", "abcdef");

    assert_eq!(same_bytes(&original, &equal), Ok(()));
    let length = same_bytes(&original, &shorter).unwrap_err();
    assert!(length.contains('5') && length.contains('6'), "{length}");
    assert_eq!(
        same_bytes(&original, &other).unwrap_err(),
        "differs from the file"
    );
}

#[test]
fn the_selected_snapshot_is_selected_again_after_the_move() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    import(
        &mut state,
        &fx.synth("b.xlsx", 2),
        "2026-10-06 00:00:00",
        false,
    );
    let snapshots = state.current().unwrap().unwrap().snapshots;
    let older = snapshots[0].id;
    state.select_snapshot(older).unwrap();
    let new = elsewhere(&fx, "new");

    let result = state.set_workspace_folder(Some(&text(&new)), true).unwrap();

    assert_eq!(state.selected_snapshot(), Some(older));
    assert_eq!(result.start.open.unwrap().selected, Some(older));
}

#[test]
fn the_default_folder_written_another_way_is_saved_as_the_default() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state
        .set_workspace_folder(Some(&text(&elsewhere(&fx, "new"))), false)
        .unwrap();
    fs::create_dir_all(fx.workspaces()).unwrap();
    // A link to the default folder on Unix, which a comparison of the paths as written misses.
    #[cfg(unix)]
    let other_way = {
        let link = elsewhere(&fx, "link");
        std::os::unix::fs::symlink(fx.workspaces(), &link).unwrap();
        link
    };
    #[cfg(not(unix))]
    let other_way = fx.workspaces().join(".");

    let result = state
        .set_workspace_folder(Some(&text(&other_way)), false)
        .unwrap();

    assert_eq!(result.start.settings.workspace_dir, None);
    assert_eq!(load_settings(&fx.config()).workspace_dir, None);
}

#[cfg(unix)]
#[test]
fn a_removal_after_which_the_original_cannot_be_looked_at_keeps_the_copy() {
    use std::os::unix::fs::PermissionsExt;
    let fx = Fixture::new();
    let old = elsewhere(&fx, "old");
    let file = file_in(&old, "a.holdx-ws", "content");
    let to = elsewhere(&fx, "new");
    fs::create_dir_all(&to).unwrap();

    // The removal fails, and then the old folder may not even be looked into: whether the
    // original is still there cannot be known.
    let result = move_file(&file, &to, &verified, &|_: &Path| {
        fs::set_permissions(&old, fs::Permissions::from_mode(0o000)).unwrap();
        Err(std::io::Error::other("held by another program"))
    });
    let unknowable = file.symlink_metadata().is_err();
    fs::set_permissions(&old, fs::Permissions::from_mode(0o755)).unwrap();
    if !unknowable {
        // Running as a user whom permissions do not stop (root); nothing to test.
        return;
    }

    let error = result.unwrap_err();
    assert_eq!(error.kind, ErrorKind::MoveRemove);
    assert!(error.message.contains("both folders"), "{}", error.message);
    assert_eq!(
        fs::read_to_string(to.join("a.holdx-ws")).unwrap(),
        "content"
    );
    assert_eq!(fs::read_to_string(&file).unwrap(), "content");
}

#[test]
fn a_file_with_a_pending_journal_is_left_where_it_is() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let files = create(&mut state, &["Readable"]);
    let damaged = fx.workspaces().join("damaged.holdx-ws");
    fs::write(&damaged, "not a database\n".repeat(20)).unwrap();
    let journal = fx.workspaces().join("damaged.holdx-ws-journal");
    fs::write(&journal, "a rollback journal").unwrap();
    let new = elsewhere(&fx, "new");

    let result = state.set_workspace_folder(Some(&text(&new)), true).unwrap();

    assert_eq!(result.moved, vec![name_of(&files[0])]);
    assert_eq!(result.left.len(), 1, "{:?}", result.left);
    let left = &result.left[0];
    assert_eq!(left.file_name, "damaged.holdx-ws");
    assert_eq!(left.kind, ErrorKind::MoveCheck);
    assert!(
        left.message.contains("an interrupted write is pending"),
        "{}",
        left.message
    );
    assert!(
        left.message
            .contains("open it with the version that wrote it first"),
        "{}",
        left.message
    );
    assert!(damaged.exists() && journal.exists());
    assert_eq!(names(&new), vec![name_of(&files[0])]);
}

#[test]
fn a_refused_set_removes_the_folder_it_created_and_only_an_empty_one() {
    let fx = Fixture::new();
    let mut state = fx.state();
    // A file where the folder in use should be: it cannot be listed, so a move is refused after
    // the new folder was made.
    fs::create_dir_all(fx.local()).unwrap();
    fs::write(fx.workspaces(), "in the way").unwrap();
    let new = elsewhere(&fx, "new");
    let error = state
        .set_workspace_folder(Some(&text(&new)), true)
        .unwrap_err();
    assert_ne!(error.kind, ErrorKind::FolderUnusable);
    assert!(!new.exists());

    // A folder that was there before stays, and so does what is in it.
    let kept = elsewhere(&fx, "kept");
    fs::create_dir_all(&kept).unwrap();
    fs::write(kept.join("note.txt"), "mine").unwrap();
    state
        .set_workspace_folder(Some(&text(&kept)), true)
        .unwrap_err();
    assert_eq!(names(&kept), vec!["note.txt".to_string()]);
    let empty = elsewhere(&fx, "empty");
    fs::create_dir_all(&empty).unwrap();
    state
        .set_workspace_folder(Some(&text(&empty)), true)
        .unwrap_err();
    assert!(empty.is_dir());
}

#[test]
fn a_refused_set_removes_every_empty_level_it_made_and_no_folder_that_was_there() {
    let fx = Fixture::new();
    let mut state = fx.state();
    fs::create_dir_all(fx.local()).unwrap();
    fs::write(fx.workspaces(), "in the way").unwrap();
    // Two levels are made under a folder that was there before.
    let above = elsewhere(&fx, "above");
    fs::create_dir_all(&above).unwrap();
    let deepest = above.join("new").join("inner");
    state
        .set_workspace_folder(Some(&text(&deepest)), true)
        .unwrap_err();
    assert!(!above.join("new").exists());
    assert!(above.is_dir());
}
