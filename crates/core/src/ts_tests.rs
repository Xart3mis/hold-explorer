//! The generated TypeScript declarations agree with the JSON the types serialize to.

use std::collections::BTreeSet;
use std::path::PathBuf;

use serde::Serialize;
use ts_rs::{Config, TS};

use crate::dataset::Dataset;
use crate::filter::{AgeBand, DateRange, Dim, FieldFilter, FilterSpec, Status};
use crate::load::{load_file, open_file, OpenedView};
use crate::mapping::{ColumnMap, Field};
use crate::query::{group_by, lines, summary, HoldQuery, LineQuery};
use crate::rules::RuleSet;
use crate::snapshot_date::{SnapshotDate, SnapshotSource};

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
        crate::query::LineRow,
        crate::query::LineSort,
        crate::query::LineQuery,
        crate::query::HoldSort,
        crate::query::HoldQuery,
        crate::query::HoldPage,
        crate::snapshot_date::SnapshotSource,
        crate::snapshot_date::SnapshotDate,
        crate::warning::WarningKind,
        crate::warning::ImportWarning,
        crate::solve::BlockerNode,
        crate::solve::Step,
        crate::solve::SolvePlan,
        crate::table::Cell,
        crate::table::RawTable,
        crate::table::DateOrder,
    );
    let expected: BTreeSet<&str> = [
        "AgeBand",
        "Blocker",
        "BlockerNode",
        "Cell",
        "ColumnMap",
        "DateOrder",
        "DateRange",
        "Dim",
        "ExtraColumn",
        "Field",
        "FieldFilter",
        "FilterSpec",
        "Group",
        "Hold",
        "HoldPage",
        "HoldQuery",
        "HoldSort",
        "ImportError",
        "ImportWarning",
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
        "Status",
        "Step",
        "Summary",
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
    let opened = open_file(&dir.path().join("holds_07-Oct.csv")).unwrap();
    names_the_keys_of(&opened);
    let view: OpenedView = opened.view(2);
    names_the_keys_of(&view);
    names_the_keys_of(&opened.table);
}
