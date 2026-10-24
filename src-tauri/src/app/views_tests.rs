//! The saved views: the rules of the five operations, and how a workspace opens with them.

use hx_core::filter::{FilterSpec, Status};
use hx_store::SavedView;

use super::error::{CommandError, ErrorKind};
use super::test_support::{small, Fixture};
use super::AppState;

const ADDRESS: &str = "/lines?mode=holds&sort=age";

fn text_filter(text: &str) -> FilterSpec {
    FilterSpec {
        text: text.into(),
        ..FilterSpec::default()
    }
}

fn names(views: &[SavedView]) -> Vec<&str> {
    views.iter().map(|view| view.name.as_str()).collect()
}

fn save(state: &mut AppState, name: &str) -> Result<Vec<SavedView>, CommandError> {
    let id = state.open_id();
    state.save_view(&id, name, ADDRESS, text_filter("valve"))
}

fn listed(state: &AppState) -> Vec<SavedView> {
    state.open.as_ref().unwrap().saved_views().unwrap()
}

fn kind<T: std::fmt::Debug>(result: Result<T, CommandError>) -> ErrorKind {
    result.unwrap_err().kind
}

/// Replaces the stored value of the views in the open workspace's file.
fn store_raw(state: &AppState, json: &str) {
    let path = state.open.as_ref().unwrap().path().to_path_buf();
    rusqlite::Connection::open(path)
        .unwrap()
        .execute(
            "INSERT OR REPLACE INTO setting (key, value_json) VALUES ('saved_views', ?1)",
            [json],
        )
        .unwrap();
}

#[test]
fn a_saved_view_keeps_its_name_address_and_filters_and_goes_last() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    save(&mut state, "First").unwrap();
    let views = save(&mut state, "  Second  ").unwrap();
    assert_eq!(names(&views), ["First", "Second"]);
    assert_eq!(views[1].address, ADDRESS);
    assert_eq!(views[1].filters, text_filter("valve"));
    assert_eq!((views[0].id, views[1].id), (1, 2));
}

#[test]
fn a_reopened_workspace_comes_with_its_views() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let views = save(&mut state, "First").unwrap();
    let id = state.open_id();
    let mut again = fx.state();
    let open = again.open_workspace(&id).unwrap();
    assert_eq!(open.views, views);
    assert!(open.warning.is_none());
    let started = fx.state().start();
    assert_eq!(started.open.unwrap().views, views);
}

#[test]
fn an_id_is_never_given_twice_after_a_delete() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    save(&mut state, "A").unwrap();
    let views = save(&mut state, "B").unwrap();
    let id = state.open_id();
    state.delete_view(&id, views[1].id).unwrap();
    let views = save(&mut state, "C").unwrap();
    assert_eq!(views.iter().map(|v| v.id).collect::<Vec<_>>(), [1, 3]);
}

#[test]
fn a_name_is_trimmed_and_one_to_eighty_characters() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    assert_eq!(kind(save(&mut state, "")), ErrorKind::ViewName);
    assert_eq!(kind(save(&mut state, "  \t ")), ErrorKind::ViewName);
    assert_eq!(kind(save(&mut state, &"x".repeat(81))), ErrorKind::ViewName);
    let views = save(&mut state, &format!(" {} ", "é".repeat(80))).unwrap();
    assert_eq!(views[0].name.chars().count(), 80);
    let id = state.open_id();
    assert_eq!(
        kind(state.rename_view(&id, views[0].id, " ")),
        ErrorKind::ViewName
    );
    assert_eq!(
        kind(state.rename_view(&id, views[0].id, &"x".repeat(81))),
        ErrorKind::ViewName
    );
}

#[test]
fn a_name_taken_without_regard_to_case_is_refused_and_names_the_view() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    save(&mut state, "Old Holds").unwrap();
    let error = save(&mut state, " old HOLDS ").unwrap_err();
    assert_eq!(error.kind, ErrorKind::ViewNameTaken);
    assert!(error.message.contains("Old Holds"), "{}", error.message);
    let views = save(&mut state, "Other").unwrap();
    let id = state.open_id();
    assert_eq!(
        kind(state.rename_view(&id, views[1].id, "OLD holds")),
        ErrorKind::ViewNameTaken
    );
    // A view may take its own name again with other letters.
    let views = state.rename_view(&id, views[0].id, "OLD HOLDS").unwrap();
    assert_eq!(names(&views), ["OLD HOLDS", "Other"]);
}

#[test]
fn a_workspace_holds_at_most_a_hundred_views() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    for n in 0..100 {
        save(&mut state, &format!("View {n}")).unwrap();
    }
    assert_eq!(kind(save(&mut state, "One more")), ErrorKind::TooManyViews);
    let id = state.open_id();
    let views = state.delete_view(&id, 1).unwrap();
    assert_eq!(views.len(), 99);
    assert_eq!(save(&mut state, "One more").unwrap().len(), 100);
}

#[test]
fn an_address_is_one_of_the_four_data_paths_without_a_selection() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let id = state.open_id();
    for (n, good) in [
        "/overview",
        "/breakdown",
        "/breakdown?by=blocker&other=1",
        "/lines",
        "/lines?mode=holds&sort=age",
        "/blockers?sort=holds",
    ]
    .into_iter()
    .enumerate()
    {
        let views = state
            .save_view(&id, &format!("V{n}"), good, FilterSpec::default())
            .unwrap();
        assert_eq!(views[n].address, good);
    }
    for bad in [
        "",
        "lines",
        "/settings",
        "/linesx",
        "/lines/extra",
        "https://x/lines",
        "/lines?line=L1",
        "/lines?mode=holds&hold=3",
        "/blockers?blocker=Pipe",
        "/breakdown?by=blocker&open=Pipe",
        "/lines?x=1&line=2",
    ] {
        assert_eq!(
            kind(state.save_view(&id, "Bad", bad, FilterSpec::default())),
            ErrorKind::ViewAddress,
            "{bad}"
        );
    }
    // The same rule holds when a view comes back.
    let restored = SavedView {
        id: 99,
        name: "Back".into(),
        address: "/lines?line=L1".into(),
        filters: FilterSpec::default(),
    };
    assert_eq!(
        kind(state.restore_view(&id, restored, 0)),
        ErrorKind::ViewAddress
    );
}

#[test]
fn an_unknown_id_is_not_found_by_every_operation() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    save(&mut state, "A").unwrap();
    let id = state.open_id();
    assert_eq!(
        kind(state.rename_view(&id, 9, "B")),
        ErrorKind::ViewNotFound
    );
    assert_eq!(kind(state.delete_view(&id, 9)), ErrorKind::ViewNotFound);
    assert_eq!(kind(state.move_view(&id, 9, 0)), ErrorKind::ViewNotFound);
}

#[test]
fn a_rename_keeps_the_place_and_the_id() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    save(&mut state, "A").unwrap();
    let views = save(&mut state, "B").unwrap();
    let id = state.open_id();
    let views = state.rename_view(&id, views[0].id, "  Z ").unwrap();
    assert_eq!(names(&views), ["Z", "B"]);
    assert_eq!(views[0].id, 1);
}

#[test]
fn a_view_moves_to_an_index_and_a_far_index_is_the_end() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    for name in ["A", "B", "C"] {
        save(&mut state, name).unwrap();
    }
    let id = state.open_id();
    assert_eq!(names(&state.move_view(&id, 3, 0).unwrap()), ["C", "A", "B"]);
    assert_eq!(names(&state.move_view(&id, 3, 2).unwrap()), ["A", "B", "C"]);
    assert_eq!(
        names(&state.move_view(&id, 1, 99).unwrap()),
        ["B", "C", "A"]
    );
    assert_eq!(names(&listed(&state)), ["B", "C", "A"]);
}

#[test]
fn a_deleted_view_is_restored_with_its_id_at_its_index() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    for name in ["A", "B", "C"] {
        save(&mut state, name).unwrap();
    }
    let id = state.open_id();
    let before = listed(&state);
    let gone = before[1].clone();
    state.delete_view(&id, gone.id).unwrap();
    let views = state.restore_view(&id, gone.clone(), 1).unwrap();
    assert_eq!(views, before);
    // The next id is still new.
    assert_eq!(save(&mut state, "D").unwrap()[3].id, 4);
    // An index past the end puts it last.
    state.delete_view(&id, gone.id).unwrap();
    let views = state.restore_view(&id, gone.clone(), 50).unwrap();
    assert_eq!(names(&views), ["A", "C", "D", "B"]);
    assert_eq!(views[3].id, gone.id);
}

#[test]
fn a_view_cannot_be_restored_under_a_name_taken_meanwhile_or_into_a_full_list() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let views = save(&mut state, "A").unwrap();
    let id = state.open_id();
    let gone = views[0].clone();
    state.delete_view(&id, gone.id).unwrap();
    let views = save(&mut state, "B").unwrap();
    state.rename_view(&id, views[0].id, "a").unwrap();
    assert_eq!(
        kind(state.restore_view(&id, gone.clone(), 0)),
        ErrorKind::ViewNameTaken
    );
    state.rename_view(&id, views[0].id, "B").unwrap();
    for n in 0..99 {
        save(&mut state, &format!("View {n}")).unwrap();
    }
    assert_eq!(
        kind(state.restore_view(&id, gone, 0)),
        ErrorKind::TooManyViews
    );
}

#[test]
fn another_workspace_id_is_refused_and_nothing_changes() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let views = save(&mut state, "A").unwrap();
    let other = "0123456789abcdef";
    let view = views[0].clone();
    for error in [
        state
            .save_view(other, "B", ADDRESS, FilterSpec::default())
            .unwrap_err(),
        state.rename_view(other, view.id, "B").unwrap_err(),
        state.delete_view(other, view.id).unwrap_err(),
        state.restore_view(other, view.clone(), 0).unwrap_err(),
        state.move_view(other, view.id, 0).unwrap_err(),
    ] {
        assert_eq!(error.kind, ErrorKind::ViewChanged);
        assert!(error.message.contains("saved views"), "{}", error.message);
    }
    assert_eq!(listed(&state), views);
}

#[test]
fn with_no_workspace_open_every_operation_says_so() {
    let fx = Fixture::new();
    let mut state = fx.state();
    assert_eq!(
        kind(state.save_view("x", "A", ADDRESS, FilterSpec::default())),
        ErrorKind::NoWorkspace
    );
    assert_eq!(kind(state.delete_view("x", 1)), ErrorKind::NoWorkspace);
}

#[test]
fn a_filter_is_kept_whole() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let id = state.open_id();
    let filters = FilterSpec {
        status: Status::All,
        text: "x".into(),
        size_mismatch: Some(true),
        ..FilterSpec::default()
    };
    state.save_view(&id, "F", ADDRESS, filters.clone()).unwrap();
    assert_eq!(listed(&state)[0].filters, filters);
}

#[test]
fn a_damaged_value_opens_as_no_views_with_one_warning_and_is_replaced_by_the_next_save() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    save(&mut state, "A").unwrap();
    store_raw(&state, "{not json");
    let id = state.open_id();
    let open = fx.state().open_workspace(&id).unwrap();
    assert!(open.views.is_empty());
    let warning = open.warning.expect("the damage is reported");
    assert_eq!(warning.kind, ErrorKind::Corrupt);
    assert!(
        warning.message.contains("saved views"),
        "{}",
        warning.message
    );

    // Later descriptions of the same workspace do not repeat it.
    let mut again = fx.state();
    again.open_workspace(&id).unwrap();
    let snapshot = again.selected_snapshot().unwrap();
    let selected = again.select_snapshot(snapshot).unwrap();
    assert!(selected.warning.is_none());
    assert!(again.current().unwrap().unwrap().warning.is_none());

    // The value stays as it was until a save.
    let raw: String = rusqlite::Connection::open(again.open.as_ref().unwrap().path())
        .unwrap()
        .query_row(
            "SELECT value_json FROM setting WHERE key = 'saved_views'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(raw, "{not json");
    assert_eq!(names(&save(&mut again, "B").unwrap()), ["B"]);
    assert!(fx.state().open_workspace(&id).unwrap().warning.is_none());
}

#[test]
fn a_warning_about_the_views_and_one_about_the_settings_are_both_in_the_warning() {
    let fx = Fixture::new();
    let state = small(&fx);
    store_raw(&state, "[1, 2");
    let id = state.open_id();
    let mut again = fx.state();
    again.settings_blocked = Some(CommandError::new(ErrorKind::Settings, "Cannot save."));
    let warning = again.open_workspace(&id).unwrap().warning.unwrap();
    assert_eq!(warning.kind, ErrorKind::Settings);
    assert!(
        warning.message.contains("Cannot save."),
        "{}",
        warning.message
    );
    assert!(
        warning.message.contains("saved views"),
        "{}",
        warning.message
    );
}

#[test]
fn an_escaped_key_or_a_fragment_cannot_hide_a_selection() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let id = state.open_id();
    for bad in [
        "/lines?%6Cine=L1",
        "/lines?mode=holds&bl%6Fcker=P",
        "/lines?mode=holds&%6C%69ne=L1",
        "/lines#top",
        "/lines?mode=holds#line=L1",
    ] {
        assert_eq!(
            kind(state.save_view(&id, "Bad", bad, FilterSpec::default())),
            ErrorKind::ViewAddress,
            "{bad}"
        );
    }
    // A value may be escaped; only a key may not.
    state
        .save_view(&id, "Good", "/lines?mode=a%20b", FilterSpec::default())
        .unwrap();
}

#[test]
fn a_restored_id_must_be_one_that_was_issued() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let views = save(&mut state, "A").unwrap();
    let id = state.open_id();
    for bad in [i64::MAX, 0, -1, 2, 50] {
        let view = SavedView {
            id: bad,
            name: "Back".into(),
            ..views[0].clone()
        };
        assert_eq!(
            kind(state.restore_view(&id, view, 0)),
            ErrorKind::ViewNotFound,
            "{bad}"
        );
    }
    assert_eq!(listed(&state), views);
    // The counter did not move, so the next save still gets 2.
    assert_eq!(save(&mut state, "B").unwrap()[1].id, 2);
}

#[test]
fn an_empty_name_says_a_name_needs_a_character() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let error = save(&mut state, "  ").unwrap_err();
    assert_eq!(error.kind, ErrorKind::ViewName);
    assert!(
        error.message.contains("at least one character"),
        "{}",
        error.message
    );
    assert!(!error.message.contains("has 0"), "{}", error.message);
}

#[test]
fn an_import_does_not_repeat_the_warning_about_damaged_views() {
    let fx = Fixture::new();
    let state = small(&fx);
    store_raw(&state, "{not json");
    let id = state.open_id();
    let mut again = fx.state();
    assert!(again.open_workspace(&id).unwrap().warning.is_some());
    again.import_open(&fx.synth("b.xlsx", 2)).unwrap();
    let done = again
        .import_commit(
            super::ImportCommit {
                target: super::TargetChoice::Existing { id },
                taken_at: super::test_support::at("2026-10-06 00:00:00"),
                date_edited: false,
                replace: None,
            },
            &super::test_support::no_progress,
        )
        .unwrap();
    assert!(done.open.warning.is_none());
    assert!(done.open.views.is_empty());
}

#[test]
fn an_import_into_a_workspace_that_is_not_open_reports_its_damaged_views() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    store_raw(&state, "{not json");
    let id = state.open_id();
    // Another workspace is open when the file is imported into the damaged one.
    state.create_workspace("Other").unwrap();
    state.import_open(&fx.synth("b.xlsx", 2)).unwrap();
    let done = state
        .import_commit(
            super::ImportCommit {
                target: super::TargetChoice::Existing { id: id.clone() },
                taken_at: super::test_support::at("2026-10-06 00:00:00"),
                date_edited: false,
                replace: None,
            },
            &super::test_support::no_progress,
        )
        .unwrap();
    assert_eq!(done.open.workspace.id, id);
    let warning = done
        .open
        .warning
        .expect("the damage is reported on opening");
    assert_eq!(warning.kind, ErrorKind::Corrupt);
    assert!(
        warning.message.contains("saved views"),
        "{}",
        warning.message
    );
    // Once reported, the state's description of the workspace repeats nothing.
    assert!(state.current().unwrap().unwrap().warning.is_none());
}

#[test]
fn opening_and_starting_report_damaged_views_and_nothing_else_repeats_it() {
    let fx = Fixture::new();
    let state = small(&fx);
    store_raw(&state, "{not json");
    let id = state.open_id();
    let started = fx.state().start();
    let open = started.open.expect("the last workspace is reopened");
    assert_eq!(open.warning.map(|w| w.kind), Some(ErrorKind::Corrupt));
    let mut again = fx.state();
    let open = again.open_workspace(&id).unwrap();
    assert_eq!(open.warning.map(|w| w.kind), Some(ErrorKind::Corrupt));
    let snapshot = open.selected.unwrap();
    assert!(again.select_snapshot(snapshot).unwrap().warning.is_none());
    assert!(again.current().unwrap().unwrap().warning.is_none());
}

/// How many times `run` reads the saved views of a workspace.
fn view_reads(run: impl FnOnce()) -> usize {
    let before = super::views::VIEW_READS.with(std::cell::Cell::get);
    run();
    super::views::VIEW_READS.with(std::cell::Cell::get) - before
}

#[test]
fn each_open_reads_the_saved_views_once() {
    let fx = Fixture::new();
    let state = small(&fx);
    let id = state.open_id();
    drop(state);
    let mut again = fx.state();
    again.create_workspace("Other").unwrap();
    assert_eq!(
        view_reads(|| {
            again.open_workspace(&id).unwrap();
        }),
        1
    );
    assert_eq!(
        view_reads(|| {
            fx.state().start();
        }),
        1
    );
    let other = again.create_workspace("Third").unwrap().workspace.id;
    again.open_workspace(&id).unwrap();
    again.import_open(&fx.synth("b.xlsx", 2)).unwrap();
    assert_eq!(
        view_reads(|| {
            again
                .import_commit(
                    super::ImportCommit {
                        target: super::TargetChoice::Existing { id: other },
                        taken_at: super::test_support::at("2026-10-06 00:00:00"),
                        date_edited: false,
                        replace: None,
                    },
                    &super::test_support::no_progress,
                )
                .unwrap();
        }),
        1
    );
}

#[test]
fn every_change_to_the_saved_views_is_stored_while_a_write_is_counted() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let id = state.open_id();
    super::views::STORED_WHILE_BUSY.with_borrow_mut(Vec::clear);

    let saved = save(&mut state, "Valves").unwrap();
    let view = saved[0].clone();
    save(&mut state, "Spares").unwrap();
    state.rename_view(&id, view.id, "Valves open").unwrap();
    state.move_view(&id, view.id, 1).unwrap();
    let deleted = state.delete_view(&id, view.id).unwrap();
    assert_eq!(deleted.len(), 1);
    let renamed = SavedView {
        name: "Valves open".into(),
        ..view
    };
    state.restore_view(&id, renamed, 0).unwrap();

    let seen = super::views::STORED_WHILE_BUSY.with_borrow(Clone::clone);
    assert_eq!(
        seen, [true; 6],
        "each of the five operations writes while counted"
    );
    assert!(!state.writes().busy(), "every write has ended");
}
