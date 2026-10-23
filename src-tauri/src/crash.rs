//! The crash log: a panic hook that writes what happened into a file under the local data folder,
//! and the same file for a start that failed.
//!
//! A log holds the time, the version, the system, the WebView, the thread, the panic message and
//! its location in the source, and a backtrace. It holds no workspace data and no file content.

use std::cmp::Reverse;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, FixedOffset, Local, SecondsFormat, Utc};

/// How many crash logs are kept: writing one more deletes the oldest.
pub const KEEP: usize = 10;

/// The folder of the crash logs, under the local data folder.
const LOGS: &str = "logs";
/// The start of the name of every crash log.
const PREFIX: &str = "crash-";
/// The end of the name of every crash log.
const SUFFIX: &str = ".log";
/// The UTC time in the name of a log: `yyyymmdd-hhmmss`.
const STAMP: &str = "%Y%m%d-%H%M%S";
/// How many logs of the same second get a name before writing gives up.
const SAME_SECOND: u32 = 1000;

/// What a crash log holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrashReport {
    /// When it happened, in UTC.
    pub at: DateTime<Utc>,
    /// The same time on the local clock, with its offset from UTC.
    pub local: DateTime<FixedOffset>,
    /// The version of Hold Explorer.
    pub version: String,
    /// The operating system, as Rust names it (`windows`, `linux`, `macos`).
    pub os: String,
    /// The processor architecture, as Rust names it (`x86_64`, `aarch64`).
    pub arch: String,
    /// The version of the WebView, or `None` when none was found.
    pub webview: Option<String>,
    /// The name of the thread, or `unnamed`.
    pub thread: String,
    /// The panic message, or the error a failed start returned.
    pub message: String,
    /// The place in the source as `file:line:column`, when known.
    pub location: Option<String>,
    /// The backtrace of the thread, captured whatever `RUST_BACKTRACE` says.
    pub backtrace: String,
}

impl CrashReport {
    /// A report of now, on the current thread, with a backtrace captured here.
    pub fn now(
        version: &str,
        webview: Option<String>,
        message: String,
        location: Option<String>,
    ) -> Self {
        let at = Utc::now();
        Self {
            at,
            local: at.with_timezone(&Local).fixed_offset(),
            version: version.to_string(),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            webview,
            thread: std::thread::current()
                .name()
                .unwrap_or("unnamed")
                .to_string(),
            message,
            location,
            backtrace: std::backtrace::Backtrace::force_capture().to_string(),
        }
    }

    /// The text of the log.
    fn text(&self) -> String {
        format!(
            "Hold Explorer crash log\n\
             Time (UTC): {}\n\
             Time (local): {}\n\
             Version: {}\n\
             OS: {}\n\
             Architecture: {}\n\
             WebView: {}\n\
             Thread: {}\n\
             Message: {}\n\
             Location: {}\n\
             Backtrace:\n{}\n",
            self.at.to_rfc3339_opts(SecondsFormat::Secs, true),
            self.local.to_rfc3339_opts(SecondsFormat::Secs, false),
            self.version,
            self.os,
            self.arch,
            self.webview.as_deref().unwrap_or("not found"),
            self.thread,
            self.message,
            self.location.as_deref().unwrap_or("unknown"),
            self.backtrace,
        )
    }
}

/// The local data folder of the app, found the way Tauri's `app_local_data_dir` finds it, before
/// the app exists: the user's local data folder joined with `identifier`. `LOCALAPPDATA` on
/// Windows, `XDG_DATA_HOME` or `~/.local/share` on Linux, `~/Library/Application Support` on
/// macOS. Without any of them, the system's temporary folder takes its place.
pub fn local_data_folder(identifier: &str) -> PathBuf {
    local_data_base()
        .unwrap_or_else(std::env::temp_dir)
        .join(identifier)
}

/// The user's local data folder, as the `dirs` crate behind Tauri's path resolver reads it.
fn local_data_base() -> Option<PathBuf> {
    let absolute = |path: PathBuf| path.is_absolute().then_some(path);
    if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .and_then(absolute)
    } else if cfg!(target_os = "macos") {
        std::env::home_dir().map(|home| home.join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .and_then(absolute)
            .or_else(|| std::env::home_dir().map(|home| home.join(".local/share")))
    }
}

/// Installs the hook that writes a crash log into `logs` under `local_data`, then calls the
/// previous hook. Safe to call once; a failure to write the log never panics again.
pub fn install(local_data: PathBuf, version: &'static str) {
    let dir = logs_dir(&local_data);
    // Read once here: the hook asks the WebView nothing while the app is panicking.
    let webview = tauri::webview_version().ok();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let report = CrashReport::now(
            version,
            webview.clone(),
            info.payload_as_str()
                .unwrap_or("a panic without a text message")
                .to_string(),
            info.location().map(ToString::to_string),
        );
        // A log that cannot be written leaves the panic as it was: the previous hook still runs.
        let _ = write_log(&dir, &report);
        previous(info);
    }));
}

/// Writes one crash log and returns its path; keeps the newest `KEEP` logs. Used by the hook and
/// by a failed start.
pub fn write_log(dir: &Path, report: &CrashReport) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let stamp = report.at.format(STAMP).to_string();
    for counter in 0..SAME_SECOND {
        let path = dir.join(log_name(&stamp, counter));
        let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        };
        if let Err(error) = file
            .write_all(report.text().as_bytes())
            .and_then(|()| file.flush())
        {
            // A log is written whole or not at all.
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(error);
        }
        // A log that was written stays written when the old ones cannot be deleted.
        let _ = prune(dir);
        return Ok(path);
    }
    Err(std::io::Error::new(
        ErrorKind::AlreadyExists,
        "every crash log name of this second is taken",
    ))
}

/// The logs folder and the newest log, for diagnostics.
pub fn logs_dir(local_data: &Path) -> PathBuf {
    local_data.join(LOGS)
}

/// The newest crash log under `local_data`, or `None` when there is none.
pub fn newest_log(local_data: &Path) -> Option<PathBuf> {
    logs(&logs_dir(local_data))
        .ok()?
        .into_iter()
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(_, path)| path)
}

/// The name of a log: `crash-<stamp>.log` for the first of a second, `crash-<stamp>-<n>.log`
/// for the next ones.
fn log_name(stamp: &str, counter: u32) -> String {
    if counter == 0 {
        format!("{PREFIX}{stamp}{SUFFIX}")
    } else {
        format!("{PREFIX}{stamp}-{counter}{SUFFIX}")
    }
}

/// The time and counter of a log's name, which order the logs; `None` for any other name.
fn log_key(name: &str) -> Option<(String, u32)> {
    let rest = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;
    let stamp = rest.get(..15)?;
    let counter = match rest.get(15..)? {
        "" => 0,
        tail => {
            let digits = tail.strip_prefix('-')?;
            if digits.is_empty()
                || digits.starts_with('0')
                || !digits.bytes().all(|b| b.is_ascii_digit())
            {
                return None;
            }
            digits.parse().ok()?
        }
    };
    let shape = stamp.bytes().enumerate().all(|(index, byte)| {
        if index == 8 {
            byte == b'-'
        } else {
            byte.is_ascii_digit()
        }
    });
    shape.then(|| (stamp.to_string(), counter))
}

/// The crash logs of `dir`, each with its order key. Other files are not listed.
fn logs(dir: &Path) -> std::io::Result<Vec<((String, u32), PathBuf)>> {
    let mut logs = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        if let Some(key) = entry.file_name().to_str().and_then(log_key) {
            logs.push((key, entry.path()));
        }
    }
    Ok(logs)
}

/// Deletes the oldest crash logs of `dir` until `KEEP` are left.
fn prune(dir: &Path) -> std::io::Result<()> {
    let mut logs = logs(dir)?;
    logs.sort_by_key(|(key, _)| Reverse(key.clone()));
    for (_, path) in logs.into_iter().skip(KEEP) {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use chrono::{DateTime, FixedOffset, TimeZone, Utc};
    use tempfile::TempDir;

    use super::{install, logs_dir, newest_log, write_log, CrashReport, KEEP};

    fn report_at(at: DateTime<Utc>) -> CrashReport {
        let offset = FixedOffset::east_opt(2 * 3600).expect("two hours is a valid offset");
        CrashReport {
            at,
            local: at.with_timezone(&offset),
            version: "9.8.7".to_string(),
            os: "testos".to_string(),
            arch: "testarch".to_string(),
            webview: Some("123.0.4567.89".to_string()),
            thread: "worker-7".to_string(),
            message: "the marker message".to_string(),
            location: Some("src-tauri/src/somewhere.rs:12:5".to_string()),
            backtrace: "   0: frame_one\n   1: frame_two".to_string(),
        }
    }

    fn at(seconds: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 23, 9, 15, seconds)
            .single()
            .expect("a valid UTC time")
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .expect("the folder is readable")
            .map(|entry| {
                entry
                    .expect("the entry is readable")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_written_report_holds_every_field_and_no_path() {
        let temp = TempDir::new().expect("a temporary folder");
        let dir = logs_dir(temp.path());
        let path = write_log(&dir, &report_at(at(0))).expect("the log is written");
        assert_eq!(path.parent(), Some(dir.as_path()));
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("crash-20261023-091500.log")
        );
        let text = std::fs::read_to_string(&path).expect("the log is readable");
        for field in [
            "2026-10-23T09:15:00Z",
            "2026-10-23T11:15:00+02:00",
            "9.8.7",
            "testos",
            "testarch",
            "123.0.4567.89",
            "worker-7",
            "the marker message",
            "src-tauri/src/somewhere.rs:12:5",
            "frame_one",
            "frame_two",
        ] {
            assert!(text.contains(field), "{field} is missing from:\n{text}");
        }
        // The log names no folder: neither the one it is in nor the local data folder.
        let temp_path = temp.path().to_string_lossy();
        assert!(!text.contains(temp_path.as_ref()), "{text}");
    }

    #[test]
    fn a_report_without_a_webview_or_a_location_says_so() {
        let temp = TempDir::new().expect("a temporary folder");
        let mut report = report_at(at(0));
        report.webview = None;
        report.location = None;
        let path = write_log(&logs_dir(temp.path()), &report).expect("the log is written");
        let text = std::fs::read_to_string(&path).expect("the log is readable");
        assert!(text.contains("WebView: not found"), "{text}");
        assert!(text.contains("Location: unknown"), "{text}");
    }

    #[test]
    fn retention_keeps_the_newest_logs_and_leaves_other_files_alone() {
        let temp = TempDir::new().expect("a temporary folder");
        let dir = logs_dir(temp.path());
        std::fs::create_dir_all(&dir).expect("the logs folder is created");
        for other in ["notes.txt", "crash-latest.log", "crash-20261023-091500.txt"] {
            std::fs::write(dir.join(other), "kept").expect("another file is written");
        }
        for second in 0..(KEEP as u32 + 5) {
            write_log(&dir, &report_at(at(second))).expect("the log is written");
        }
        let logs: Vec<String> = names(&dir)
            .into_iter()
            .filter(|name| name.starts_with("crash-2026"))
            .filter(|name| name.ends_with(".log"))
            .collect();
        let expected: Vec<String> = (5..(KEEP as u32 + 5))
            .map(|second| format!("crash-20261023-0915{second:02}.log"))
            .collect();
        assert_eq!(logs, expected);
        for other in ["notes.txt", "crash-latest.log", "crash-20261023-091500.txt"] {
            assert!(dir.join(other).exists(), "{other} was removed");
        }
        assert_eq!(
            newest_log(temp.path()),
            Some(dir.join(format!("crash-20261023-0915{:02}.log", KEEP + 4)))
        );
    }

    #[test]
    fn two_logs_in_the_same_second_get_two_names() {
        let temp = TempDir::new().expect("a temporary folder");
        let dir = logs_dir(temp.path());
        let first = write_log(&dir, &report_at(at(0))).expect("the first log is written");
        let second = write_log(&dir, &report_at(at(0))).expect("the second log is written");
        let third = write_log(&dir, &report_at(at(0))).expect("the third log is written");
        assert_ne!(first, second);
        assert_ne!(second, third);
        assert_eq!(names(&dir).len(), 3);
        // The newest is the one written last, though all three share the second.
        assert_eq!(newest_log(temp.path()), Some(third.clone()));
        // Retention orders them the same way: with one log too many, the first of the second goes.
        for later in 1..(KEEP - 1) {
            write_log(&dir, &report_at(at(later as u32))).expect("the log is written");
        }
        assert!(!first.exists());
        assert!(second.exists());
        assert!(third.exists());
    }

    #[test]
    fn there_is_no_newest_log_before_the_first() {
        let temp = TempDir::new().expect("a temporary folder");
        assert_eq!(newest_log(temp.path()), None);
    }

    /// Set in the child process of the panic test: the folder its hook writes into.
    const CHILD_DIR: &str = "HX_CRASH_TEST_CHILD_DIR";
    /// The message the child panics with.
    const CHILD_MESSAGE: &str = "the child thread panics on purpose";

    /// Run as the parent, this test starts the test executable again for itself alone, with
    /// `CHILD_DIR` set. Run as that child, it installs the hook, which stays for the rest of the
    /// process, and panics in a spawned thread. The hook so never sees another test's panic.
    #[test]
    fn a_panic_in_a_spawned_thread_with_the_hook_writes_a_log() {
        if let Some(dir) = std::env::var_os(CHILD_DIR) {
            install(PathBuf::from(dir), "1.2.3");
            let joined = std::thread::Builder::new()
                .name("crash-test-worker".to_string())
                .spawn(|| {
                    let line = line!() + 1;
                    panic!("{CHILD_MESSAGE}: {line}");
                })
                .expect("the thread starts")
                .join();
            assert!(joined.is_err(), "the thread panicked");
            return;
        }
        let temp = TempDir::new().expect("a temporary folder");
        let output = Command::new(std::env::current_exe().expect("the test executable"))
            .args([
                "--exact",
                "crash::tests::a_panic_in_a_spawned_thread_with_the_hook_writes_a_log",
                "--nocapture",
                "--test-threads=1",
            ])
            .env(CHILD_DIR, temp.path())
            .output()
            .expect("the child process runs");
        assert!(
            output.status.success(),
            "the child failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        // The previous hook ran too: the default one prints the panic on standard error.
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.contains(CHILD_MESSAGE), "{stderr}");
        let log = newest_log(temp.path()).expect("the hook wrote a log");
        let text = std::fs::read_to_string(&log).expect("the log is readable");
        assert!(text.contains(CHILD_MESSAGE), "{text}");
        assert!(text.contains("crash-test-worker"), "{text}");
        assert!(text.contains("1.2.3"), "{text}");
        // The location is the line of the `panic!` in this file.
        let line: u32 = text
            .split(&format!("{CHILD_MESSAGE}: "))
            .nth(1)
            .and_then(|rest| rest.lines().next())
            .and_then(|number| number.trim().parse().ok())
            .expect("the message carries the line of the panic");
        let location = format!("{}:{line}:", file!());
        assert!(
            text.contains(&location),
            "{location} is missing from:\n{text}"
        );
        assert!(text.contains("Backtrace:"), "{text}");
    }
}
