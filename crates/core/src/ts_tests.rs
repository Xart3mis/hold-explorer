//! The generated TypeScript declarations agree with the JSON the types serialize to.

use std::collections::BTreeSet;
use std::path::PathBuf;

use serde::Serialize;
use ts_rs::{Config, TS};

use crate::dataset::Dataset;
use crate::detail::{blocker_detail, line_detail};
use crate::filter::default_age_bands;
use crate::filter::{AgeBand, DateRange, Dim, FieldFilter, FilterSpec, Status};
use crate::load::{load_file, open_file, OpenedView};
use crate::mapping::{ColumnMap, Field};
use crate::query::{
    facet_counts, group_by, holds, line_page, lines, matrix_top, summary, value_page, HoldQuery,
    LineQuery,
};
use crate::rules::RuleSet;
use crate::snapshot_date::{SnapshotDate, SnapshotSource};
use crate::solve::{solve_plan, solve_view};

fn export_dir() -> PathBuf {
    PathBuf::from(std::env::var("TS_RS_EXPORT_DIR").expect("cargo sets TS_RS_EXPORT_DIR"))
}

/// The declaration of `T` as the export writes it.
fn declaration<T: TS + 'static>() -> String {
    T::export_to_string(&Config::from_env()).expect("the type can be exported")
}

/// Whether `text` declares a field called `key`: the name, at the start of a word, then `:` or `?:`.
fn declares_field(text: &str, key: &str) -> bool {
    [format!("{key}: "), format!("{key}?: ")]
        .iter()
        .any(|needle| {
            text.match_indices(needle.as_str()).any(|(at, _)| {
                text[..at]
                    .chars()
                    .next_back()
                    .is_none_or(|c| !(c.is_alphanumeric() || c == '_'))
            })
        })
}

/// Fails unless the declaration of `T` names every key of the JSON `value` serializes to.
fn names_the_keys_of<T: TS + Serialize + 'static>(value: &T) {
    let json = serde_json::to_value(value).unwrap();
    let object = json.as_object().expect("a struct serializes to an object");
    let text = declaration::<T>();
    for key in object.keys() {
        assert!(
            declares_field(&text, key),
            "the declaration of {} has no field \"{key}\":\n{text}",
            std::any::type_name::<T>()
        );
    }
}

fn csv_dataset() -> (tempfile::TempDir, crate::load::Loaded, Dataset) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("holds_07-Oct.csv");
    std::fs::write(
        &path,
        "line_id,hold_remark,hold_type,date\nL-1,x,MISC.,2026-10-01 09:00:00\n",
    )
    .unwrap();
    let loaded = load_file(&path).unwrap();
    let at = loaded.snapshot.unwrap().at;
    let ds = Dataset::build(loaded.parsed.holds.clone(), RuleSet::builtin(), at);
    (dir, loaded, ds)
}

#[test]
fn every_exported_type_has_a_file_in_the_export_directory() {
    let cfg = Config::from_env();
    macro_rules! export_all {
        ($($t:ty),* $(,)?) => {{
            $(<$t as TS>::export_all(&cfg).unwrap();)*
        }};
    }
    export_all!(
        crate::error::ImportError,
        crate::dataset::Row,
        crate::model::Hold,
        crate::import::SkipKind,
        crate::import::SkippedRow,
        crate::import::Parsed,
        crate::filter::Dim,
        crate::filter::Status,
        crate::filter::FieldFilter,
        crate::filter::AgeBand,
        crate::filter::DateRange,
        crate::filter::FilterSpec,
        crate::rules::Blocker,
        crate::mapping::Field,
        crate::mapping::ExtraColumn,
        crate::mapping::SavedColumn,
        crate::mapping::SavedMapping,
        crate::mapping::ColumnMap,
        crate::load::Opened,
        crate::load::OpenedView,
        crate::load::Loaded,
        crate::query::Summary,
        crate::query::Group,
        crate::query::Matrix,
        crate::query::FoldedMatrix,
        crate::query::LineRow,
        crate::query::LineSort,
        crate::query::LineQuery,
        crate::query::HoldSort,
        crate::query::HoldQuery,
        crate::query::HoldPage,
        crate::query::LinePage,
        crate::query::FacetCounts,
        crate::query::ValuePage,
        crate::detail::HoldRef,
        crate::detail::ChainLink,
        crate::detail::LineDetail,
        crate::detail::LinkedBlocker,
        crate::detail::BlockerDetail,
        crate::snapshot_date::SnapshotSource,
        crate::snapshot_date::SnapshotDate,
        crate::warning::WarningKind,
        crate::warning::ImportWarning,
        crate::solve::BlockerNode,
        crate::solve::Step,
        crate::solve::SolvePlan,
        crate::solve::SolveRow,
        crate::solve::SolveView,
        crate::table::Cell,
        crate::table::RawTable,
        crate::table::DateOrder,
    );
    let expected: BTreeSet<&str> = [
        "AgeBand",
        "Blocker",
        "BlockerDetail",
        "BlockerNode",
        "Cell",
        "ChainLink",
        "ColumnMap",
        "DateOrder",
        "DateRange",
        "Dim",
        "ExtraColumn",
        "FacetCounts",
        "Field",
        "FieldFilter",
        "FoldedMatrix",
        "FilterSpec",
        "Group",
        "Hold",
        "HoldPage",
        "HoldRef",
        "HoldQuery",
        "HoldSort",
        "ImportError",
        "ImportWarning",
        "LineDetail",
        "LinePage",
        "LinkedBlocker",
        "LineQuery",
        "LineRow",
        "LineSort",
        "Loaded",
        "Matrix",
        "Opened",
        "OpenedView",
        "Parsed",
        "RawTable",
        "Row",
        "SavedColumn",
        "SavedMapping",
        "SkipKind",
        "SkippedRow",
        "SnapshotDate",
        "SnapshotSource",
        "SolvePlan",
        "SolveRow",
        "SolveView",
        "Status",
        "Step",
        "Summary",
        "ValuePage",
        "WarningKind",
    ]
    .into_iter()
    .collect();
    let found: BTreeSet<String> = std::fs::read_dir(export_dir())
        .unwrap()
        .filter_map(|e| e.unwrap().file_name().into_string().ok())
        .filter_map(|n| n.strip_suffix(".ts").map(str::to_string))
        .collect();
    let missing: Vec<_> = expected.iter().filter(|n| !found.contains(**n)).collect();
    assert!(missing.is_empty(), "no file was written for {missing:?}");
}

#[test]
fn integers_are_numbers_and_dates_are_strings() {
    let text = declaration::<crate::model::Hold>();
    assert!(text.contains("source_id: number | null"), "{text}");
    assert!(text.contains("created: string | null"), "{text}");
    assert!(text.contains("model_size: number | null"), "{text}");
    let text = declaration::<SnapshotDate>();
    assert!(text.contains("at: string"), "{text}");
    let text = declaration::<crate::query::Summary>();
    assert!(!text.contains("bigint"), "{text}");
}

#[test]
fn a_map_keyed_by_field_is_a_partial_record() {
    let text = declaration::<ColumnMap>();
    assert!(
        text.contains("fields: { [key in Field]?: number }"),
        "{text}"
    );
}

#[test]
fn unit_enums_are_string_unions() {
    assert!(declaration::<SnapshotSource>().contains("\"User\""));
    assert!(declaration::<Status>().contains("\"Open\""));
    assert!(declaration::<Field>().contains("\"LineId\""));
}

#[test]
fn dim_is_a_name_or_a_custom_column() {
    let text = declaration::<Dim>();
    assert!(text.contains("\"Discipline\""), "{text}");
    assert!(text.contains("{ \"Custom\": string }"), "{text}");
    assert_eq!(
        serde_json::to_string(&Dim::Discipline).unwrap(),
        "\"Discipline\""
    );
    assert_eq!(
        serde_json::to_string(&Dim::Custom("Area".into())).unwrap(),
        "{\"Custom\":\"Area\"}"
    );
}

#[test]
fn errors_are_tagged_with_kind() {
    let text = declaration::<crate::error::ImportError>();
    assert!(text.contains("\"kind\": \"MissingColumns\""), "{text}");
    assert!(text.contains("\"kind\": \"SheetNotFound\""), "{text}");
    let json = serde_json::to_value(crate::error::ImportError::MissingColumns {
        missing: vec![Field::Remark],
    })
    .unwrap();
    assert_eq!(json["kind"], "MissingColumns");
}

#[test]
fn declarations_name_the_keys_of_the_json() {
    let (dir, loaded, ds) = csv_dataset();
    let open = FilterSpec::default();
    names_the_keys_of(&loaded.parsed.holds[0]);
    names_the_keys_of(&loaded);
    names_the_keys_of(&loaded.parsed);
    names_the_keys_of(&loaded.map);
    names_the_keys_of(&loaded.map.to_saved(&loaded.headers));
    names_the_keys_of(&loaded.snapshot.unwrap());
    names_the_keys_of(&open);
    names_the_keys_of(&AgeBand::default());
    names_the_keys_of(&DateRange::default());
    names_the_keys_of(&LineQuery::default());
    names_the_keys_of(&HoldQuery::default());
    names_the_keys_of(&FieldFilter {
        dim: Dim::Discipline,
        values: vec!["PM".into()],
        negate: false,
    });
    names_the_keys_of(&summary(&ds, &open));
    names_the_keys_of(&group_by(&ds, &open, &Dim::HoldType)[0]);
    names_the_keys_of(&lines(&ds, &open, &LineQuery::default())[0]);
    names_the_keys_of(&line_page(&ds, &open, &LineQuery::default(), 0, None));
    names_the_keys_of(&holds(&ds, &open, &HoldQuery::default()));
    names_the_keys_of(&facet_counts(&ds, &open, &default_age_bands()));
    names_the_keys_of(&value_page(&ds, &open, &Dim::HoldType, "", 10));
    let detail = line_detail(&ds, &solve_plan(&ds, &open, None), "L-1").unwrap();
    names_the_keys_of(&detail);
    names_the_keys_of(&detail.open[0]);
    names_the_keys_of(&detail.chain[0]);
    let plan = solve_plan(&ds, &open, None);
    let blocker = blocker_detail(&ds, &open, &plan, &plan.steps[0].key).unwrap();
    names_the_keys_of(&blocker);
    names_the_keys_of(&blocker.oldest.unwrap());
    let folded = matrix_top(&ds, &open, &Dim::HoldType, &Dim::Discipline, 1, 1);
    names_the_keys_of(&folded);
    names_the_keys_of(&solve_view(&ds, &open));
    names_the_keys_of(&solve_view(&ds, &open).rows[0]);
    let opened = open_file(&dir.path().join("holds_07-Oct.csv")).unwrap();
    names_the_keys_of(&opened);
    let view: OpenedView = opened.view(2);
    names_the_keys_of(&view);
    names_the_keys_of(&opened.table);
}
