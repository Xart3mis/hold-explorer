//! The substitutes of the system's file dialogs in the build the end-to-end tests drive (the
//! cargo feature `e2e`): a test cannot press the buttons of a native dialog, so the page asks
//! these commands instead, and they answer with paths the test put in the environment. A build
//! without the feature compiles none of this.

use std::ffi::OsString;
use std::path::Path;

/// The file the open dialog answers with.
pub const OPEN_VAR: &str = "HX_E2E_OPEN";

/// The folder the save dialog saves in, under the name the page proposes.
pub const SAVE_DIR_VAR: &str = "HX_E2E_SAVE_DIR";

/// What the open dialog answers, in the environment `var` reads: the path in `HX_E2E_OPEN`, or
/// `None`, as a cancelled dialog answers, when it is not set or empty.
fn open_path(var: impl Fn(&str) -> Option<OsString>) -> Option<String> {
    var(OPEN_VAR)
        .filter(|path| !path.is_empty())
        .map(|path| path.to_string_lossy().into_owned())
}

/// What the save dialog answers for the name `suggested`, in the environment `var` reads: the
/// folder in `HX_E2E_SAVE_DIR` with the last part of `suggested` in it. `None`, as a cancelled
/// dialog answers, when the folder is not set or empty, or when `suggested` names no file.
fn save_path(var: impl Fn(&str) -> Option<OsString>, suggested: &str) -> Option<String> {
    let dir = var(SAVE_DIR_VAR).filter(|dir| !dir.is_empty())?;
    let name = Path::new(suggested).file_name()?;
    Some(Path::new(&dir).join(name).to_string_lossy().into_owned())
}

/// Answers the open dialog with HX_E2E_OPEN.
#[tauri::command]
pub async fn e2e_open_path() -> Option<String> {
    open_path(|name| std::env::var_os(name))
}

/// Answers the save dialog with HX_E2E_SAVE_DIR/<suggested name>.
#[tauri::command]
pub async fn e2e_save_path(suggested: String) -> Option<String> {
    save_path(|name| std::env::var_os(name), &suggested)
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use std::path::Path;

    use super::{open_path, save_path};

    /// An environment that holds `vars` and nothing else.
    fn env(vars: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
        let vars: Vec<(String, OsString)> = vars
            .iter()
            .map(|(name, value)| ((*name).to_string(), OsString::from(value)))
            .collect();
        move |name| {
            vars.iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
        }
    }

    #[test]
    fn the_open_dialog_answers_with_hx_e2e_open() {
        assert_eq!(
            open_path(env(&[("HX_E2E_OPEN", "/tmp/run/Holds.xlsx")])),
            Some("/tmp/run/Holds.xlsx".to_string())
        );
        // As a cancelled dialog.
        assert_eq!(open_path(env(&[])), None);
        assert_eq!(open_path(env(&[("HX_E2E_OPEN", "")])), None);
    }

    #[test]
    fn the_save_dialog_answers_with_the_suggested_name_in_hx_e2e_save_dir() {
        let saved = save_path(
            env(&[("HX_E2E_SAVE_DIR", "/tmp/run/out")]),
            "HoldExplorer_Unit 573_Lines_2026-10-07.xlsx",
        );
        assert_eq!(
            saved.as_deref().map(Path::new),
            Some(Path::new(
                "/tmp/run/out/HoldExplorer_Unit 573_Lines_2026-10-07.xlsx"
            ))
        );
        // As a cancelled dialog.
        assert_eq!(save_path(env(&[]), "Lines.xlsx"), None);
        assert_eq!(
            save_path(env(&[("HX_E2E_SAVE_DIR", "")]), "Lines.xlsx"),
            None
        );
    }

    #[test]
    fn the_save_dialog_keeps_the_file_in_its_folder() {
        let dir = env(&[("HX_E2E_SAVE_DIR", "/tmp/run/out")]);
        assert_eq!(
            save_path(&dir, "../elsewhere/Lines.xlsx")
                .as_deref()
                .map(Path::new),
            Some(Path::new("/tmp/run/out/Lines.xlsx"))
        );
        assert_eq!(save_path(&dir, ".."), None);
        assert_eq!(save_path(&dir, ""), None);
    }
}
