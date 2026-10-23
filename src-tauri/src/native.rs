//! Native messages for when the interface cannot run: a start that failed, and a missing
//! WebView2 runtime. Their texts are Rust constants, not entries of the interface's catalog,
//! because the interface is not running when they are shown.

use std::io::Write;
use std::path::Path;

use rfd::{MessageButtons, MessageDialog, MessageLevel};

/// The title of the message for a start that failed.
pub const STARTUP_FAILURE_TITLE: &str = "Hold Explorer could not start";
/// What happened, before the error itself.
const STARTUP_FAILURE_WHAT: &str = "Hold Explorer could not start because of this error:";
/// Where the details are, before the folder of the log.
const STARTUP_FAILURE_LOG: &str = "The details are saved in a crash log in this folder:";
/// When no log could be written.
const STARTUP_FAILURE_NO_LOG: &str =
    "No crash log could be written, so this message holds all the details there are.";
/// How to fix it.
const STARTUP_FAILURE_FIX: &str = "Start Hold Explorer again. If it fails again, send the newest \
     crash log, or the text of this message, to whoever supports Hold Explorer for you.";

/// The title of the message for a missing WebView2 runtime.
pub const WEBVIEW2_MISSING_TITLE: &str = "Hold Explorer needs WebView2";
/// The address of the WebView2 download page (decision 5 of the M1d plan).
pub const WEBVIEW2_DOWNLOAD: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";
/// What happened and why.
const WEBVIEW2_WHAT: &str = "Hold Explorer needs the Microsoft Edge WebView2 Runtime to show its \
     window, and the runtime is not installed on this computer.";
/// How to fix it, before the address.
const WEBVIEW2_FIX: &str = "Download the Evergreen installer of the WebView2 Runtime from this \
     address and run it. Run as you, it installs for your user only and needs no admin rights:";
/// What to do after the install, and how to keep the text.
const WEBVIEW2_AFTER: &str = "Then start Hold Explorer again. Press Ctrl+C to copy this message.";

/// Shows a native error message and returns when it is closed. Never panics.
///
/// The text goes to standard error as well. On Linux and the BSDs the message is shown only when
/// a display is named in `DISPLAY` or `WAYLAND_DISPLAY`: without one, GTK cannot start, and the
/// dialog would wait for it forever.
pub fn error_message(title: &str, text: &str) {
    // Standard error may be closed, as it is for the release build on Windows: ignored then.
    let _ = writeln!(std::io::stderr(), "{title}\n\n{text}");
    if !display_available() {
        return;
    }
    // A NUL byte would make the dialog panic: GTK takes C strings.
    let title = title.replace('\0', " ");
    let text = text.replace('\0', " ");
    let _ = std::panic::catch_unwind(move || {
        MessageDialog::new()
            .set_level(MessageLevel::Error)
            .set_title(title)
            .set_description(text)
            .set_buttons(MessageButtons::Ok)
            .show()
    });
}

/// Whether a dialog can be shown: always, except on a Unix desktop without a display.
fn display_available() -> bool {
    if cfg!(any(windows, target_os = "macos")) {
        return true;
    }
    ["DISPLAY", "WAYLAND_DISPLAY"]
        .iter()
        .any(|name| std::env::var_os(name).is_some_and(|value| !value.is_empty()))
}

/// The text for a failed start: what failed, and the folder of the log written for it.
pub fn startup_failure_text(error: &str, log: Option<&Path>) -> String {
    let log = match log.and_then(Path::parent) {
        Some(folder) => format!("{STARTUP_FAILURE_LOG}\n{}", folder.display()),
        None => STARTUP_FAILURE_NO_LOG.to_string(),
    };
    format!("{STARTUP_FAILURE_WHAT}\n{error}\n\n{log}\n\n{STARTUP_FAILURE_FIX}")
}

/// The text when WebView2 is missing: what is needed, that the per-user installer needs no admin
/// rights, and the download address of decision 5.
pub fn webview2_missing_text() -> String {
    format!("{WEBVIEW2_WHAT}\n\n{WEBVIEW2_FIX}\n{WEBVIEW2_DOWNLOAD}\n\n{WEBVIEW2_AFTER}")
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{startup_failure_text, webview2_missing_text};

    #[test]
    fn the_startup_failure_text_names_what_failed_and_the_log_folder() {
        let log = Path::new("/home/someone/.local/share/app/logs/crash-20261023-091500.log");
        let text = startup_failure_text("the window could not be created", Some(log));
        assert!(text.contains("the window could not be created"), "{text}");
        assert!(
            text.contains("/home/someone/.local/share/app/logs"),
            "{text}"
        );
        assert!(!text.contains("crash-20261023-091500.log"), "{text}");
    }

    #[test]
    fn the_startup_failure_text_says_when_no_log_was_written() {
        let text = startup_failure_text("the window could not be created", None);
        assert!(text.contains("the window could not be created"), "{text}");
        assert!(text.contains("No crash log could be written"), "{text}");
    }

    #[test]
    fn the_webview2_text_gives_the_address_and_needs_no_admin_rights() {
        let text = webview2_missing_text();
        assert!(text.contains("Microsoft Edge WebView2 Runtime"), "{text}");
        assert!(text.contains("no admin rights"), "{text}");
        assert!(
            text.contains("https://developer.microsoft.com/microsoft-edge/webview2/"),
            "{text}"
        );
        assert!(text.contains("Ctrl+C"), "{text}");
    }

    #[test]
    fn the_native_texts_have_no_em_dash() {
        let texts = [
            webview2_missing_text(),
            startup_failure_text("x", None),
            startup_failure_text("x", Some(Path::new("/a/b.log"))),
        ];
        for text in texts {
            assert!(!text.contains('\u{2014}'), "{text}");
        }
    }
}
