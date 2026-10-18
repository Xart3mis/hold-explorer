//! The generated TypeScript declarations agree with the JSON the interface sends.

use std::path::PathBuf;

use ts_rs::{Config, TS};

use crate::text::ExportText;
use crate::views::{ExportRequest, RowScope, Screen};

fn export_dir() -> PathBuf {
    PathBuf::from(std::env::var("TS_RS_EXPORT_DIR").expect("cargo sets TS_RS_EXPORT_DIR"))
}

/// The declaration of `T` as the export writes it.
fn declaration<T: TS + 'static>() -> String {
    T::export_to_string(&Config::from_env()).expect("the type can be exported")
}

#[test]
fn export_text_has_a_file_in_the_export_directory() {
    ExportText::export_all(&Config::from_env()).unwrap();
    assert!(export_dir().join("ExportText.ts").is_file());
}

#[test]
fn export_text_declares_the_fields_the_interface_sends() {
    let text = declaration::<ExportText>();
    assert!(text.contains("labels: "), "{text}");
    assert!(text.contains("months: Array<string>"), "{text}");
    let json = r#"{"labels":{"file.title":"Holds"},"months":["Jan"]}"#;
    let parsed: ExportText = serde_json::from_str(json).unwrap();
    assert_eq!(parsed.get("file.title"), Ok("Holds"));
    assert_eq!(parsed.months, vec!["Jan".to_string()]);
}

#[test]
fn the_request_and_its_parts_have_files_in_the_export_directory() {
    ExportRequest::export_all(&Config::from_env()).unwrap();
    for name in ["ExportRequest", "Screen", "RowScope", "ExportText"] {
        assert!(export_dir().join(format!("{name}.ts")).is_file(), "{name}");
    }
}

/// `text` without its doc comments, every run of white space one space.
fn bare(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("/**") {
        out.push_str(&rest[..start]);
        rest = rest[start..]
            .find("*/")
            .map_or("", |end| &rest[start + end + 2..]);
    }
    out.push_str(rest);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[test]
fn the_request_declares_the_fields_the_interface_sends() {
    let request = bare(&declaration::<ExportRequest>());
    for field in [
        "screen: Screen",
        "columns: Array<string>",
        "rows: RowScope",
        "spec: FilterSpec",
        "text: ExportText",
        "filters: Array<string>",
    ] {
        assert!(request.contains(field), "{field} in {request}");
    }
    let screen = bare(&declaration::<Screen>());
    for kind in [
        r#""kind": "Overview""#,
        r#""kind": "Lines", query: LineQuery"#,
        r#""kind": "Holds", sort: HoldSort, reverse: boolean"#,
        r#""kind": "Breakdown", dim: Dim"#,
        r#""kind": "Matrix", rows: Dim, cols: Dim"#,
        r#""kind": "Blockers""#,
    ] {
        assert!(screen.contains(kind), "{kind} in {screen}");
    }
    let scope = bare(&declaration::<RowScope>());
    for kind in [
        r#""kind": "All""#,
        r#""kind": "First", count: number"#,
        r#""kind": "Keys", keys: Array<string>"#,
    ] {
        assert!(scope.contains(kind), "{kind} in {scope}");
    }
}
