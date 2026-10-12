//! The generated TypeScript declarations agree with the JSON the types serialize to.

use std::collections::BTreeSet;
use std::path::PathBuf;

use hx_core::mapping::{Field, SavedColumn, SavedMapping};
use serde::Serialize;
use ts_rs::{Config, TS};

use crate::test_support::{import_plain, synth, workspace};
use crate::{list_workspaces, ImportOptions, StoreError, UnreadableWorkspace, WorkspaceList};
use hx_synth::{generate, SynthConfig};

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

#[test]
fn every_exported_type_has_a_file_in_the_export_directory() {
    let cfg = Config::from_env();
    StoreError::export_all(&cfg).unwrap();
    WorkspaceList::export_all(&cfg).unwrap();
    UnreadableWorkspace::export_all(&cfg).unwrap();
    crate::WorkspaceInfo::export_all(&cfg).unwrap();
    crate::SnapshotInfo::export_all(&cfg).unwrap();
    crate::SnapshotDetail::export_all(&cfg).unwrap();
    ImportOptions::export_all(&cfg).unwrap();
    let expected = [
        "ImportOptions",
        "SnapshotDetail",
        "SnapshotInfo",
        "StoreError",
        "UnreadableWorkspace",
        "WorkspaceInfo",
        "WorkspaceList",
    ];
    let found: BTreeSet<String> = std::fs::read_dir(export_dir())
        .unwrap()
        .filter_map(|e| e.unwrap().file_name().into_string().ok())
        .filter_map(|n| n.strip_suffix(".ts").map(str::to_string))
        .collect();
    let missing: Vec<_> = expected.iter().filter(|n| !found.contains(**n)).collect();
    assert!(missing.is_empty(), "no file was written for {missing:?}");
}

#[test]
fn counts_and_ids_are_numbers_and_times_are_strings() {
    let text = declaration::<crate::SnapshotInfo>();
    assert!(text.contains("id: number"), "{text}");
    assert!(text.contains("row_count: number"), "{text}");
    assert!(text.contains("open_count: number"), "{text}");
    assert!(text.contains("taken_at: string"), "{text}");
    assert!(text.contains("imported_at: string"), "{text}");
    assert!(!text.contains("bigint"), "{text}");
    let text = declaration::<crate::WorkspaceInfo>();
    assert!(text.contains("path: string"), "{text}");
    assert!(text.contains("latest_taken_at: string | null"), "{text}");
}

#[test]
fn the_import_options_are_optional_values() {
    let text = declaration::<ImportOptions>();
    assert!(text.contains("replace: number | null"), "{text}");
    assert!(text.contains("save_mapping: SavedMapping | null"), "{text}");
    assert!(text.contains("add_project_number: string | null"), "{text}");
}

#[test]
fn the_detail_names_its_snapshot_snapshot() {
    let text = declaration::<crate::SnapshotDetail>();
    assert!(text.contains("snapshot: SnapshotInfo"), "{text}");
    assert!(
        text.contains("info_sheet: { [key in string]: string }"),
        "{text}"
    );
}

#[test]
fn errors_are_tagged_with_kind() {
    let text = declaration::<StoreError>();
    assert!(text.contains("\"kind\": \"AlreadyImported\""), "{text}");
    assert!(text.contains("\"kind\": \"NotAWorkspace\""), "{text}");
    let json = serde_json::to_value(StoreError::SnapshotNotFound { snapshot_id: 3 }).unwrap();
    assert_eq!(json["kind"], "SnapshotNotFound");
}

#[test]
fn declarations_name_the_keys_of_the_json() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = SynthConfig::new(5, 20, 50);
    let loaded = synth(dir.path(), "a.xlsx", &generate(&cfg), &cfg);
    let mut ws = workspace(dir.path());
    let snapshot = import_plain(&mut ws, &loaded);
    names_the_keys_of(&snapshot);
    names_the_keys_of(&ws.snapshot_detail(snapshot.id).unwrap());
    names_the_keys_of(&ws.info().unwrap());
    names_the_keys_of(&ImportOptions {
        replace: Some(1),
        save_mapping: Some(SavedMapping {
            columns: vec![SavedColumn {
                key: "line_id".into(),
                occurrence: 0,
                field: Some(Field::LineId),
            }],
        }),
        add_project_number: Some("P-1".into()),
    });
    let list = list_workspaces(&dir.path().join("ws")).unwrap();
    names_the_keys_of(&list);
    names_the_keys_of(&UnreadableWorkspace {
        path: dir.path().join("x.holdx-ws"),
        error: StoreError::NotAWorkspace { path: "x".into() },
    });
}
