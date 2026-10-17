use std::path::PathBuf;

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::mapping::Field;
use hx_core::query::{self, HoldQuery, HoldSort, LineQuery, LineSort};
use hx_synth::{generate, write_workbook, SynthConfig};

use super::data::FilterOptions;
use super::snapshot_tests::{import, open_holds, view_of, Fixture};
use super::{
    AppState, ViewRef, GROUP_LINES, MATRIX_SIDE, PAGE_ROWS, PICKER_VALUES, STALE_DAYS, TOP_ITEMS,
};

/// The view the interface shows when it shows what the state holds.
fn shown(state: &AppState) -> ViewRef {
    view_of(&state.open_id(), state.selected_snapshot())
}

/// A file with more open holds and lines than two pages hold.
fn big_file(fx: &Fixture) -> PathBuf {
    let cfg = SynthConfig::new(7, 1500, 2500);
    let dir = fx.dir.path().join("input");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("big.xlsx");
    write_workbook(&generate(&cfg), &cfg, &path).unwrap();
    path
}

fn csv(fx: &Fixture, name: &str, content: &str) -> PathBuf {
    let dir = fx.dir.path().join("input");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, content).unwrap();
    path
}

/// A state with one workspace holding the small synthetic file.
fn small(fx: &Fixture) -> AppState {
    let mut state = fx.state();
    import(
        &mut state,
        &fx.synth("a.xlsx", 1),
        "2026-09-29 00:00:00",
        true,
    );
    state
}

/// A state with one workspace holding the big synthetic file.
fn big(fx: &Fixture) -> AppState {
    let mut state = fx.state();
    import(&mut state, &big_file(fx), "2026-09-29 00:00:00", true);
    state
}

/// Calls every data command with `view` and returns the kind of the error of each, or "Ok".
fn outcomes(state: &mut AppState, view: &ViewRef) -> Vec<String> {
    let spec = open_holds();
    let kind = |error: Result<(), super::CommandError>| match error {
        Ok(()) => "Ok".to_string(),
        Err(error) => error.kind,
    };
    vec![
        kind(state.filter_options(&spec, view).map(drop)),
        kind(
            state
                .filter_values(&spec, &Dim::Discipline, "", view)
                .map(drop),
        ),
        kind(state.lines(&spec, &LineQuery::default(), 0, view).map(drop)),
        kind(state.holds(&spec, &HoldQuery::default(), view).map(drop)),
        kind(state.line_detail("L-1", view).map(drop)),
        kind(state.hold_detail(0, view).map(drop)),
        kind(state.breakdown(&spec, &Dim::Role, view).map(drop)),
        kind(
            state
                .matrix(&spec, &Dim::Discipline, &Dim::HoldType, view)
                .map(drop),
        ),
        kind(state.solve_order(&spec, view).map(drop)),
        kind(state.blocker_detail(&spec, "A|b", view).map(drop)),
        kind(
            state
                .group_detail(&spec, &Dim::Discipline, "A", view)
                .map(drop),
        ),
    ]
}

#[test]
fn every_data_command_refuses_a_view_that_is_not_in_the_state() {
    let fx = Fixture::new();
    let mut state = fx.state();
    // Nothing is open.
    let none = view_of("0123456789abcdef", None);
    assert_eq!(outcomes(&mut state, &none), ["NoWorkspace"; 11]);

    let mut state = small(&fx);
    let (workspace, snapshot) = (state.open_id(), state.selected_snapshot().unwrap());
    for stale in [
        view_of("0123456789abcdef", Some(snapshot)),
        view_of(&workspace, Some(snapshot + 100)),
        view_of(&workspace, None),
    ] {
        assert_eq!(
            outcomes(&mut state, &stale),
            ["ViewChanged"; 11],
            "{stale:?}"
        );
    }
    let view = shown(&state);
    assert_eq!(outcomes(&mut state, &view), ["Ok"; 11]);
}

#[test]
fn a_workspace_without_snapshots_answers_as_for_an_empty_snapshot() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state.create_workspace("Empty").unwrap();
    let view = shown(&state);
    assert_eq!(view.snapshot_id, None);
    let spec = open_holds();

    let options = state.filter_options(&spec, &view).unwrap();
    assert_eq!(options.total, 0);
    assert_eq!(options.facets.open, 0);
    assert_eq!(options.facets.released, 0);
    assert!(options.facets.age_bands.iter().all(|n| *n == 0));
    assert_eq!(options.age_bands.len(), options.facets.age_bands.len());
    assert!(options.custom_dims.is_empty());
    assert!(options.absent.is_empty(), "{:?}", options.absent);

    let values = state
        .filter_values(&spec, &Dim::Discipline, "", &view)
        .unwrap();
    assert_eq!((values.total, values.values.len()), (0, 0));
    let lines = state.lines(&spec, &LineQuery::default(), 0, &view).unwrap();
    assert_eq!((lines.total, lines.rows.len()), (0, 0));
    let holds = state.holds(&spec, &HoldQuery::default(), &view).unwrap();
    assert_eq!(
        (holds.total, holds.rows.len(), holds.widest_line_id),
        (0, 0, 0)
    );
    assert_eq!(state.line_detail("L-1", &view).unwrap(), None);
    assert_eq!(state.hold_detail(0, &view).unwrap(), None);
    assert!(state
        .breakdown(&spec, &Dim::Role, &view)
        .unwrap()
        .is_empty());
    let matrix = state
        .matrix(&spec, &Dim::Discipline, &Dim::HoldType, &view)
        .unwrap();
    assert_eq!(
        (matrix.rows.len(), matrix.cols.len(), matrix.max_cell),
        (0, 0, 0)
    );
    assert!(matrix.cells.is_empty() && matrix.other_row.is_none());
    let solve = state.solve_order(&spec, &view).unwrap();
    assert_eq!((solve.rows.len(), solve.lines_on_hold), (0, 0));
    assert_eq!(state.blocker_detail(&spec, "A|b", &view).unwrap(), None);
    assert_eq!(
        state
            .group_detail(&spec, &Dim::Discipline, "A", &view)
            .unwrap(),
        None
    );
    assert_eq!(state.dataset_builds(), 0);
}

#[test]
fn filter_options_count_the_kept_holds_and_name_extra_columns_and_absent_fields() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let spec = open_holds();
    let FilterOptions {
        total,
        facets,
        age_bands,
        ..
    } = state.filter_options(&spec, &view).unwrap();
    let overview = state.overview(&spec, &view).unwrap().unwrap();
    assert_eq!(total, overview.summary.holds);
    assert_eq!(facets.open, total);
    assert_eq!(age_bands, hx_core::filter::default_age_bands());
    assert_eq!(facets.age_bands.len(), age_bands.len());

    // Two extra columns.
    let mut state = fx.state();
    let path = csv(
        &fx,
        "extra.csv",
        "id,line_id,hold_remark,hold_type,Zone,Area\n1,L-1,a,MISC.,Z1,A1\n2,L-2,b,MISC.,Z2,A2\n",
    );
    import(&mut state, &path, "2026-09-29 00:00:00", true);
    let view = shown(&state);
    let options = state.filter_options(&spec, &view).unwrap();
    assert_eq!(options.custom_dims, ["Area", "Zone"]);

    // No released and no size columns.
    let mut state = fx.state();
    let path = csv(
        &fx,
        "limited.csv",
        "line_id,hold_remark,hold_type\nL-1,a,MISC.\nL-2,b,MISC.\n",
    );
    import(&mut state, &path, "2026-09-29 00:00:00", true);
    let view = shown(&state);
    let absent = state.filter_options(&spec, &view).unwrap().absent;
    for field in [
        Field::Released,
        Field::ReleaseRemark,
        Field::ReleaseDate,
        Field::ModelSize,
        Field::LdtSize,
    ] {
        assert!(absent.contains(&field), "{field:?} in {absent:?}");
    }
}

#[test]
fn filter_values_never_return_more_than_the_picker_shows_and_report_the_true_total() {
    let fx = Fixture::new();
    let mut state = big(&fx);
    let view = shown(&state);
    let spec = FilterSpec::default();
    let page = state.filter_values(&spec, &Dim::LineId, "", &view).unwrap();
    assert!(page.total > PICKER_VALUES, "{}", page.total);
    assert_eq!(page.values.len(), PICKER_VALUES);

    let narrow = state
        .filter_values(&spec, &Dim::LineId, "no such line anywhere", &view)
        .unwrap();
    assert_eq!((narrow.total, narrow.values.len()), (0, 0));
}

#[test]
fn two_pages_of_lines_hold_no_row_twice_and_equal_the_core_query() {
    let fx = Fixture::new();
    let mut state = big(&fx);
    let view = shown(&state);
    let spec = open_holds();
    let query = LineQuery {
        sort: LineSort::default(),
        ..LineQuery::default()
    };
    let first = state.lines(&spec, &query, 0, &view).unwrap();
    let second = state.lines(&spec, &query, PAGE_ROWS, &view).unwrap();
    assert_eq!(first.rows.len(), PAGE_ROWS);
    assert_eq!(second.rows.len(), PAGE_ROWS);
    assert!(first.total >= 2 * PAGE_ROWS, "{}", first.total);

    let selected = state.selected_snapshot().unwrap();
    let ds = state.dataset(selected).unwrap();
    let core = query::lines(ds, &spec, &query);
    let paged: Vec<_> = first.rows.iter().chain(&second.rows).cloned().collect();
    assert_eq!(paged, core[..2 * PAGE_ROWS]);
    assert_eq!(first.total, core.len());
}

#[test]
fn two_pages_of_holds_hold_no_row_twice_and_equal_the_core_query_and_the_limit_is_capped() {
    let fx = Fixture::new();
    let mut state = big(&fx);
    let view = shown(&state);
    let spec = open_holds();
    let page = |offset, limit| HoldQuery {
        sort: HoldSort::LineId,
        offset,
        limit,
        reverse: false,
    };
    let first = state
        .holds(&spec, &page(0, Some(PAGE_ROWS)), &view)
        .unwrap();
    let second = state
        .holds(&spec, &page(PAGE_ROWS, Some(PAGE_ROWS)), &view)
        .unwrap();
    assert_eq!(first.rows.len(), PAGE_ROWS);
    assert_eq!(second.rows.len(), PAGE_ROWS);
    let positions: Vec<usize> = first
        .rows
        .iter()
        .chain(&second.rows)
        .map(|hold| hold.position)
        .collect();
    let mut distinct = positions.clone();
    distinct.sort_unstable();
    distinct.dedup();
    assert_eq!(distinct.len(), 2 * PAGE_ROWS);

    let selected = state.selected_snapshot().unwrap();
    let ds = state.dataset(selected).unwrap();
    let core = query::holds(ds, &spec, &page(0, Some(2 * PAGE_ROWS)));
    assert_eq!(positions, core.positions);
    let rows: Vec<_> = first
        .rows
        .iter()
        .chain(&second.rows)
        .map(|hold| hold.row.clone())
        .collect();
    assert_eq!(rows, core.rows);
    assert_eq!(first.total, core.total);
    assert_eq!(first.widest_line_id, core.widest_line_id);

    for limit in [Some(5_000), None] {
        let capped = state.holds(&spec, &page(0, limit), &view).unwrap();
        assert_eq!(capped.rows.len(), PAGE_ROWS, "{limit:?}");
    }
}

#[test]
fn line_detail_answers_for_a_line_of_the_snapshot_and_builds_the_plan_once() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let line = state
        .lines(&open_holds(), &LineQuery::default(), 0, &view)
        .unwrap()
        .rows[0]
        .line_id
        .clone();
    assert_eq!(state.plan_builds(), 0);

    let detail = state.line_detail(&line, &view).unwrap().unwrap();
    assert_eq!(detail.line_id, line);
    assert!(!detail.open.is_empty());
    let again = state.line_detail(&line, &view).unwrap().unwrap();
    assert_eq!(again, detail);
    assert_eq!(state.plan_builds(), 1);
    assert_eq!(state.dataset_builds(), 1);

    assert_eq!(state.line_detail("no such line", &view).unwrap(), None);
    assert_eq!(state.plan_builds(), 1);
}

#[test]
fn a_hold_detail_answers_for_a_position_inside_the_snapshot_only() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let selected = state.selected_snapshot().unwrap();
    let ds = state.dataset(selected).unwrap();
    let (count, last) = (ds.rows.len(), ds.rows[ds.rows.len() - 1].clone());

    let first = state.hold_detail(0, &view).unwrap().unwrap();
    assert_eq!(first.position, 0);
    let end = state.hold_detail(count - 1, &view).unwrap().unwrap();
    assert_eq!((end.position, end.row), (count - 1, last));
    assert_eq!(state.hold_detail(count, &view).unwrap(), None);
    assert_eq!(state.hold_detail(usize::MAX, &view).unwrap(), None);
}

#[test]
fn the_dataset_and_the_plan_are_built_anew_for_another_workspace_or_snapshot() {
    let fx = Fixture::new();
    let (first, second) = (fx.synth("a.xlsx", 1), fx.synth("b.xlsx", 2));
    let mut state = fx.state();
    let older = import(&mut state, &first, "2026-09-01 00:00:00", true);
    import(&mut state, &second, "2026-09-08 00:00:00", false);
    let detail = |state: &mut AppState| {
        let view = shown(state);
        state.line_detail("no such line", &view).unwrap();
    };
    detail(&mut state);
    detail(&mut state);
    assert_eq!((state.dataset_builds(), state.plan_builds()), (1, 1));

    // The selected id again keeps both.
    let newest = state.selected_snapshot().unwrap();
    state.select_snapshot(newest).unwrap();
    detail(&mut state);
    assert_eq!((state.dataset_builds(), state.plan_builds()), (1, 1));

    // Another snapshot builds both anew.
    state.select_snapshot(older).unwrap();
    detail(&mut state);
    assert_eq!((state.dataset_builds(), state.plan_builds()), (2, 2));

    // Another workspace, even one whose snapshot has the same id, builds both anew.
    let other = import(&mut state, &first, "2026-09-01 00:00:00", true);
    assert_eq!(
        other, older,
        "the snapshot ids of two workspaces can be equal"
    );
    detail(&mut state);
    assert_eq!((state.dataset_builds(), state.plan_builds()), (3, 3));
}

#[test]
fn current_names_the_open_workspace_and_the_selected_snapshot_and_changes_nothing() {
    let fx = Fixture::new();
    let (first, second) = (fx.synth("a.xlsx", 1), fx.synth("b.xlsx", 2));
    let mut state = fx.state();
    assert_eq!(state.current().unwrap(), None);

    let older = import(&mut state, &first, "2026-09-01 00:00:00", true);
    let newer = import(&mut state, &second, "2026-09-08 00:00:00", false);
    let now = state.current().unwrap().unwrap();
    assert_eq!(now.workspace.id, state.open_id());
    assert_eq!(now.selected, Some(newer));
    assert_eq!(now.snapshots.len(), 2);

    state.select_snapshot(older).unwrap();
    assert_eq!(state.current().unwrap().unwrap().selected, Some(older));

    // A call leaves the selection, the cache, and a file open for import as they were.
    let view = shown(&state);
    state.filter_options(&open_holds(), &view).unwrap();
    assert_eq!(state.dataset_builds(), 1);
    state.import_open(&second).unwrap();
    state.current().unwrap();
    assert_eq!(state.selected_snapshot(), Some(older));
    assert!(state.import_review(None).is_ok(), "the draft stays");
    state.filter_options(&open_holds(), &view).unwrap();
    assert_eq!(state.dataset_builds(), 1);

    // After a start, the last workspace is open again, with the newest snapshot.
    let id = state.open_id();
    state.open_workspace(&id).unwrap();
    let started = state.start();
    assert_eq!(started.open.map(|open| open.selected), Some(Some(newer)));
    assert_eq!(state.current().unwrap().unwrap().selected, Some(newer));
}

#[test]
fn current_is_none_after_a_start_that_reopens_nothing() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    assert!(state.current().unwrap().is_some());
    state.settings.last_workspace = None;
    state.start();
    assert_eq!(state.current().unwrap(), None);
}

/// The dataset of the snapshot the state shows, built again without the app.
fn dataset_of(state: &mut AppState) -> Dataset {
    let selected = state.selected_snapshot().unwrap();
    state.dataset(selected).unwrap().clone()
}

#[test]
fn breakdown_equals_the_core_grouping() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let ds = dataset_of(&mut state);
    let spec = open_holds();
    for dim in [Dim::Role, Dim::Blocker, Dim::Discipline] {
        let groups = state.breakdown(&spec, &dim, &view).unwrap();
        assert!(!groups.is_empty());
        assert_eq!(groups, query::group_by(&ds, &spec, &dim), "{dim:?}");
    }
}

#[test]
fn matrix_folds_at_the_side_and_keeps_the_totals() {
    let fx = Fixture::new();
    let mut state = big(&fx);
    let view = shown(&state);
    let ds = dataset_of(&mut state);
    let spec = open_holds();
    let kept = query::summary(&ds, &spec).holds;
    let matrix = state
        .matrix(&spec, &Dim::LineId, &Dim::Blocker, &view)
        .unwrap();
    assert_eq!(matrix.rows.len(), MATRIX_SIDE);
    assert_eq!(matrix.cols.len(), MATRIX_SIDE);
    assert!(matrix.other_row.is_some() && matrix.folded_rows > 0);
    assert_eq!(matrix.cells.len(), MATRIX_SIDE + 1);
    assert_eq!(matrix.cells.iter().flatten().sum::<usize>(), kept);
    assert_eq!(
        matrix,
        query::matrix_top(
            &ds,
            &spec,
            &Dim::LineId,
            &Dim::Blocker,
            MATRIX_SIDE,
            MATRIX_SIDE
        )
    );
}

#[test]
fn the_solve_order_equals_the_core_view_and_leaves_the_cached_plan_alone() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let ds = dataset_of(&mut state);
    let spec = open_holds();
    let order = state.solve_order(&spec, &view).unwrap();
    assert!(!order.rows.is_empty());
    assert_eq!(order, hx_core::solve::solve_view(&ds, &spec));
    assert_eq!(state.plan_builds(), 0);
}

#[test]
fn a_blocker_detail_follows_the_filter_and_answers_none_when_the_filter_removes_it() {
    let fx = Fixture::new();
    let mut state = small(&fx);
    let view = shown(&state);
    let ds = dataset_of(&mut state);
    let spec = open_holds();
    let order = state.solve_order(&spec, &view).unwrap();
    let key = order.rows[0].key.clone();
    let detail = state.blocker_detail(&spec, &key, &view).unwrap().unwrap();
    let plan = hx_core::solve::solve_plan(&ds, &spec, None);
    assert_eq!(
        Some(detail.clone()),
        hx_core::detail::blocker_detail(&ds, &spec, &plan, &key)
    );
    assert_eq!(detail.step, Some(1));

    let mut without = spec.clone();
    without.fields.push(hx_core::filter::FieldFilter {
        dim: Dim::Blocker,
        values: vec![key.clone()],
        negate: true,
    });
    assert_eq!(state.blocker_detail(&without, &key, &view).unwrap(), None);
    assert_eq!(state.blocker_detail(&spec, "no|such", &view).unwrap(), None);
}

#[test]
fn a_group_detail_lists_at_most_the_group_lines_with_the_true_total() {
    let fx = Fixture::new();
    let mut state = big(&fx);
    let view = shown(&state);
    let ds = dataset_of(&mut state);
    let spec = open_holds();

    // A group of the big file with more lines than the cap.
    let (dim, largest) = [Dim::Discipline, Dim::Role, Dim::BlockerType, Dim::HoldType]
        .into_iter()
        .filter_map(|dim| {
            let group = query::group_by(&ds, &spec, &dim).into_iter().next()?;
            Some((dim, group))
        })
        .max_by_key(|(_, group)| group.lines)
        .unwrap();
    assert!(largest.lines > GROUP_LINES, "{}", largest.lines);
    let detail = state
        .group_detail(&spec, &dim, &largest.key, &view)
        .unwrap()
        .unwrap();
    assert_eq!(detail.group, largest);
    assert_eq!(detail.lines.total, largest.lines);
    assert_eq!(detail.lines.rows.len(), GROUP_LINES);
    let mut of_group = spec.clone();
    of_group.fields.push(hx_core::filter::FieldFilter {
        dim: dim.clone(),
        values: vec![largest.key.clone()],
        negate: false,
    });
    assert_eq!(
        detail.lines,
        query::line_page(&ds, &of_group, &LineQuery::default(), 0, Some(GROUP_LINES))
    );

    // A key the filter does not keep.
    assert_eq!(
        state
            .group_detail(&spec, &dim, "no such value", &view)
            .unwrap(),
        None
    );
    let mut narrowed = spec.clone();
    narrowed.fields.push(hx_core::filter::FieldFilter {
        dim: dim.clone(),
        values: vec![largest.key.clone()],
        negate: true,
    });
    assert_eq!(
        state
            .group_detail(&narrowed, &dim, &largest.key, &view)
            .unwrap(),
        None
    );
}

#[test]
fn the_overview_parts_equal_the_core_functions() {
    let fx = Fixture::new();
    let mut state = big(&fx);
    let view = shown(&state);
    let ds = dataset_of(&mut state);
    let spec = open_holds();
    let overview = state.overview(&spec, &view).unwrap().unwrap();
    assert_eq!(overview.by_role, query::group_by(&ds, &spec, &Dim::Role));
    let blockers = query::group_by(&ds, &spec, &Dim::Blocker);
    assert!(blockers.len() > TOP_ITEMS);
    assert_eq!(overview.top_blockers, blockers[..TOP_ITEMS]);
    assert_eq!(
        overview.top_lines,
        query::line_page(&ds, &spec, &LineQuery::default(), 0, Some(TOP_ITEMS)).rows
    );
    assert_eq!(overview.top_lines.len(), TOP_ITEMS);
    assert_eq!(overview.stale.days, STALE_DAYS);
    assert_eq!(
        overview.stale.holds,
        query::stale_count(&ds, &spec, STALE_DAYS)
    );
}
