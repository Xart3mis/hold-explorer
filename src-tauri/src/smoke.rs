//! The smoke mode: a run started with `HX_SMOKE=1` shows that the built app starts and draws its
//! page. Once the first screen has rendered, the page calls [`smoke_ready`] with a date written
//! by the interface's format module; the app prints `ready <sample>` and exits with code 0. Without
//! that call it exits with code 1 after [`SMOKE_TIMEOUT`]. Without `HX_SMOKE=1` all of it is inert.

use std::ffi::OsString;
use std::io::Write;
use std::time::Duration;

use tauri::{AppHandle, Runtime};

use crate::app::CommandError;

/// The variable that turns the smoke mode on, with the value `1`.
pub const SMOKE_VAR: &str = "HX_SMOKE";

/// How long a smoke run waits for the page to call [`smoke_ready`] before it fails.
pub const SMOKE_TIMEOUT: Duration = Duration::from_secs(60);

/// Whether the environment `var` reads asks for the smoke mode: `HX_SMOKE` is exactly `1`.
fn smoke_mode(var: impl Fn(&str) -> Option<OsString>) -> bool {
    var(SMOKE_VAR).is_some_and(|value| value == "1")
}

/// Whether this process runs in the smoke mode.
fn in_smoke_mode() -> bool {
    smoke_mode(|name| std::env::var_os(name))
}

/// Whether the update check stays off for this run, in the environment `var` reads: in the
/// smoke mode and in the `e2e` build, so that neither reaches GitHub.
pub fn update_check_off(var: impl Fn(&str) -> Option<OsString>) -> bool {
    cfg!(feature = "e2e") || smoke_mode(var)
}

/// The line a smoke run prints once the page has rendered. The sample comes from the page, so
/// a control character in it is printed escaped: the line stays one line, and the check that
/// reads it sees what was sent.
fn ready_line(sample: &str) -> String {
    format!("ready {}", sample.escape_debug())
}

/// Whether the environment `var` reads asks for the timeout of a smoke run: in the smoke mode only.
fn timeout_wanted(var: impl Fn(&str) -> Option<OsString>) -> bool {
    smoke_mode(var)
}

/// Called by the page once its first screen has rendered, with `sample`, the format module's
/// date of 30 September 2026. In the smoke mode, prints `ready <sample>` and exits with code 0;
/// otherwise does nothing.
#[tauri::command]
pub async fn smoke_ready<R: Runtime>(
    app: AppHandle<R>,
    sample: String,
) -> Result<(), CommandError> {
    if !in_smoke_mode() {
        return Ok(());
    }
    // A run whose output goes nowhere still ends with the code that says it started.
    let mut out = std::io::stdout();
    let _ = writeln!(out, "{}", ready_line(&sample));
    let _ = out.flush();
    app.exit(0);
    Ok(())
}

/// In the smoke mode, exits the app with code 1 when [`smoke_ready`] has not ended it within
/// [`SMOKE_TIMEOUT`]. Does nothing otherwise.
pub fn arm_timeout<R: Runtime>(app: &AppHandle<R>) {
    arm_timeout_when(app, timeout_wanted(|name| std::env::var_os(name)));
}

/// [`arm_timeout`] with the decision made: starts the timeout only when `wanted`, and says
/// whether it did.
fn arm_timeout_when<R: Runtime>(app: &AppHandle<R>, wanted: bool) -> bool {
    if !wanted {
        return false;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SMOKE_TIMEOUT);
        // Standard error may be closed or its pipe broken: ignored, so the exit still happens.
        let _ = writeln!(
            std::io::stderr(),
            "The page did not report that it rendered within {} s.",
            SMOKE_TIMEOUT.as_secs()
        );
        app.exit(1);
    });
    true
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;

    use super::{
        arm_timeout_when, ready_line, smoke_mode, timeout_wanted, update_check_off, SMOKE_TIMEOUT,
    };

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
    fn the_smoke_mode_is_on_only_with_hx_smoke_1() {
        assert!(smoke_mode(env(&[("HX_SMOKE", "1")])));
        assert!(!smoke_mode(env(&[])));
        assert!(!smoke_mode(env(&[("HX_SMOKE", "0")])));
        assert!(!smoke_mode(env(&[("HX_SMOKE", "")])));
        assert!(!smoke_mode(env(&[("HX_SMOKE", "true")])));
    }

    #[test]
    fn the_ready_line_is_ready_and_the_sample() {
        assert_eq!(ready_line("30 Sept 2026"), "ready 30 Sept 2026");
    }

    #[test]
    fn the_ready_line_prints_a_control_character_of_the_sample_escaped() {
        let line = ready_line("30 Sept 2026\nready 1 Jan 2000\r\u{1b}[2J");
        assert_eq!(line, "ready 30 Sept 2026\\nready 1 Jan 2000\\r\\u{1b}[2J");
        assert!(!line.chars().any(char::is_control), "{line:?}");
        // A sample of letters, digits, spaces, and a full stop is printed as it is.
        assert_eq!(ready_line("30 sept. 2026"), "ready 30 sept. 2026");
    }

    #[test]
    fn the_timeout_is_armed_only_in_the_smoke_mode() {
        assert!(timeout_wanted(env(&[("HX_SMOKE", "1")])));
        assert!(!timeout_wanted(env(&[])));
        assert!(!timeout_wanted(env(&[("HX_SMOKE", "0")])));
        // Without HX_SMOKE nothing is started: no thread waits to end the process.
        let app = tauri::test::mock_app();
        assert!(!arm_timeout_when(app.handle(), timeout_wanted(env(&[]))));
    }

    #[test]
    fn a_smoke_run_fails_after_60_seconds() {
        assert_eq!(SMOKE_TIMEOUT.as_secs(), 60);
    }

    #[test]
    fn the_update_check_is_off_in_the_smoke_mode_and_in_the_e2e_build() {
        assert!(update_check_off(env(&[("HX_SMOKE", "1")])));
        assert_eq!(update_check_off(env(&[])), cfg!(feature = "e2e"));
        assert_eq!(
            update_check_off(env(&[("HX_SMOKE", "0")])),
            cfg!(feature = "e2e")
        );
    }

    #[test]
    fn smoke_ready_is_inert_without_hx_smoke() {
        assert!(
            !super::in_smoke_mode(),
            "run the tests without HX_SMOKE=1: this test would end the process"
        );
        let app = tauri::test::mock_app();
        let answer = tauri::async_runtime::block_on(super::smoke_ready(
            app.handle().clone(),
            "30 Sept 2026".to_string(),
        ));
        // The process is still here, and nothing failed.
        assert!(answer.is_ok());
    }
}
