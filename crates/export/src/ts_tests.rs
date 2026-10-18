//! The generated TypeScript declarations agree with the JSON the interface sends.

use std::path::PathBuf;

use ts_rs::{Config, TS};

use crate::text::ExportText;

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
