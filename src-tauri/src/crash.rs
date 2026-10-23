//! The crash log: a panic hook that writes what happened into a file under the local data folder,
//! and the same file for a start that failed.
//!
//! A log holds the time, the version, the system, the WebView, the thread, the panic message and
//! its location in the source, and a backtrace. It holds no workspace data and no file content.

use std::cmp::Reverse;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use chrono::{DateTime, FixedOffset, Local, SecondsFormat, Utc};

/// How many crash logs are kept: writing one more deletes the oldest.
pub const KEEP: usize = 10;

/// How many crash logs one run of the app writes at most: the panics after them go to standard
/// error only, so a storm of panics does not push out the logs of the first ones.
pub const PER_RUN: usize = 5;

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
    /// The backtrace of the thread, captured whatever `RUST_BACKTRACE` says, with the address of
    /// every frame. Its first line is the address of `hx_desktop::run`, which matches the
    /// addresses to the symbols of the build whatever address the system loaded it at.
    pub backtrace: String,
}

impl CrashReport {
    /// A report of now, on the current thread, with a backtrace captured here. The local time
    /// uses the current offset of the local time zone.
    pub fn now(
        version: &str,
        webview: Option<String>,
        message: String,
        location: Option<String>,
    ) -> Self {
        Self::capture(*Local::now().offset(), version, webview, message, location)
    }

    /// A report of now, with the local time at `offset`: the panic hook reads the offset once,
    /// when it is installed, and asks the time zone nothing while the app is panicking.
    pub fn capture(
        offset: FixedOffset,
        version: &str,
        webview: Option<String>,
        message: String,
        location: Option<String>,
    ) -> Self {
        let at = Utc::now();
        Self {
            at,
            local: at.with_timezone(&offset),
            version: version.to_string(),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            webview,
            // Accepted limit: a thread that is being torn down (while its thread-locals are
            // destroyed) can panic again here, and a second panic aborts the process.
            thread: std::thread::current()
                .name()
                .unwrap_or("unnamed")
                .to_string(),
            message,
            location,
            backtrace: format!(
                "Anchor: hx_desktop::run at {:#x}\n{:#}",
                crate::run as fn() as usize,
                std::backtrace::Backtrace::force_capture()
            ),
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

/// The local data folder of the app, before the app exists: what Tauri's `app_local_data_dir`
/// gives, `dirs::data_local_dir()` joined with `identifier`. Without a local data folder, the
/// system's temporary folder takes its place.
pub fn local_data_folder(identifier: &str) -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(identifier)
}

/// Installs the hook that writes a crash log into `logs` under `local_data`, then calls the
/// previous hook. Safe to call once; a failure to write the log never panics again.
///
/// A run writes at most `PER_RUN` logs. The home folder and the local data folder in a panic
/// message or a backtrace are written as `~` and `<local data>`.
pub fn install(local_data: PathBuf, version: &'static str) {
    let dir = logs_dir(&local_data);
    // Read once here: the hook asks the WebView and the time zone nothing while the app is
    // panicking.
    let webview = tauri::webview_version().ok();
    let offset = *Local::now().offset();
    let home = std::env::home_dir();
    let written = AtomicUsize::new(0);
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if written.fetch_add(1, Ordering::SeqCst) < PER_RUN {
            let message = info
                .payload_as_str()
                .unwrap_or("a panic without a text message");
            let mut report = CrashReport::capture(
                offset,
                version,
                webview.clone(),
                redact(message, home.as_deref(), &local_data),
                info.location().map(ToString::to_string),
            );
            report.backtrace = redact(&report.backtrace, home.as_deref(), &local_data);
            // A log that cannot be written leaves the panic as it was: the previous hook runs.
            let _ = write_log(&dir, &report);
        }
        previous(info);
    }));
}

/// `text` with the local data folder written as `<local data>` and the home folder as `~`.
fn redact(text: &str, home: Option<&Path>, local_data: &Path) -> String {
    let mut text = text.to_string();
    let folders = [(Some(local_data), "<local data>"), (home, "~")];
    for (folder, name) in folders {
        let Some(folder) = folder else { continue };
        let folder = folder.to_string_lossy();
        // A root or an empty folder would replace every separator.
        if folder.trim_matches(['/', '\\']).is_empty() {
            continue;
        }
        text = text.replace(folder.as_ref(), name);
    }
    text
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
        let _ = prune_with(dir, &path, |old| std::fs::remove_file(old));
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

/// Deletes the oldest crash logs of `dir` with `remove` until `KEEP` are left, `new` among them
/// whatever its name says. A failed delete does not stop the others; the first error is returned.
fn prune_with(
    dir: &Path,
    new: &Path,
    mut remove: impl FnMut(&Path) -> std::io::Result<()>,
) -> std::io::Result<()> {
    let mut others: Vec<_> = logs(dir)?
        .into_iter()
        .filter(|(_, path)| path != new)
        .collect();
    others.sort_by_key(|(key, _)| Reverse(key.clone()));
    let mut first_error = None;
    for (_, path) in others.into_iter().skip(KEEP.saturating_sub(1)) {
        if let Err(error) = remove(&path) {
            first_error.get_or_insert(error);
        }
    }
    first_error.map_or(Ok(()), Err)
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use chrono::{DateTime, FixedOffset, TimeZone, Utc};
    use tempfile::TempDir;

    use super::{
        install, logs_dir, newest_log, prune_with, redact, write_log, CrashReport, KEEP, PER_RUN,
    };

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

    #[test]
    fn a_new_log_survives_logs_dated_after_it() {
        // A clock set back leaves logs that look newer than the one written now: the one written
        // now stays, and the oldest of the others go.
        let temp = TempDir::new().expect("a temporary folder");
        let dir = logs_dir(temp.path());
        std::fs::create_dir_all(&dir).expect("the logs folder is created");
        for second in 0..(KEEP as u32 + 2) {
            let name = format!("crash-20990101-0000{second:02}.log");
            std::fs::write(dir.join(name), "later").expect("a later log is written");
        }
        let new = write_log(&dir, &report_at(at(0))).expect("the log is written");
        assert!(new.exists(), "the log just written was deleted");
        let left = names(&dir);
        assert_eq!(left.len(), KEEP, "{left:?}");
        assert!(!left.contains(&"crash-20990101-000000.log".to_string()));
        assert!(!left.contains(&"crash-20990101-000002.log".to_string()));
        assert!(left.contains(&"crash-20990101-000003.log".to_string()));
    }

    #[test]
    fn pruning_goes_on_after_a_delete_fails() {
        let temp = TempDir::new().expect("a temporary folder");
        let dir = logs_dir(temp.path());
        std::fs::create_dir_all(&dir).expect("the logs folder is created");
        for second in 0..(KEEP as u32 + 3) {
            std::fs::write(
                dir.join(format!("crash-20261023-0915{second:02}.log")),
                "old",
            )
            .expect("a log is written");
        }
        let new = dir.join(format!("crash-20261023-0915{:02}.log", KEEP + 2));
        // The newest of the logs to delete: it is tried first.
        let stuck = dir.join("crash-20261023-091502.log");
        let result = prune_with(&dir, &new, |path| {
            if path == stuck {
                Err(std::io::Error::other("held open by another program"))
            } else {
                std::fs::remove_file(path)
            }
        });
        assert!(result.is_err(), "the failed delete is reported");
        assert!(stuck.exists());
        assert!(!dir.join("crash-20261023-091500.log").exists());
        assert!(!dir.join("crash-20261023-091501.log").exists());
        assert!(dir.join("crash-20261023-091503.log").exists());
    }

    #[test]
    fn a_message_names_neither_the_home_nor_the_local_data_folder() {
        let temp = TempDir::new().expect("a temporary folder");
        let home = temp.path().to_path_buf();
        let local_data = home.join("data").join("app");
        let text = format!(
            "could not open {} and {}",
            local_data.join("workspace.db").display(),
            home.join("Documents").join("holds.xlsx").display()
        );
        let redacted = redact(&text, Some(&home), &local_data);
        let separator = std::path::MAIN_SEPARATOR;
        assert_eq!(
            redacted,
            format!(
                "could not open <local data>{separator}workspace.db and \
                 ~{separator}Documents{separator}holds.xlsx"
            )
        );
        assert!(!redacted.contains(temp.path().to_string_lossy().as_ref()));
    }

    #[test]
    fn a_report_captured_with_an_offset_keeps_that_offset() {
        let offset = FixedOffset::west_opt(5 * 3600).expect("five hours is a valid offset");
        let report = CrashReport::capture(offset, "1.0.0", None, "m".to_string(), None);
        assert_eq!(*report.local.offset(), offset);
        assert_eq!(report.local, report.at.with_timezone(&offset));
    }

    /// Set in the child process of the panic tests: the folder its hook writes into.
    const CHILD_DIR: &str = "HX_CRASH_TEST_CHILD_DIR";
    /// Set in the child process of the panic tests: how many threads panic one after another.
    const CHILD_PANICS: &str = "HX_CRASH_TEST_CHILD_PANICS";
    /// The message the child panics with.
    const CHILD_MESSAGE: &str = "the child thread panics on purpose";

    /// Run as a child (when `CHILD_DIR` is set): installs the hook, which stays for the rest of
    /// the process, and panics in `CHILD_PANICS` spawned threads, one after another. Returns
    /// whether this process is the child.
    fn act_as_child() -> bool {
        let Some(dir) = std::env::var_os(CHILD_DIR) else {
            return false;
        };
        let panics: usize = std::env::var(CHILD_PANICS)
            .ok()
            .and_then(|count| count.parse().ok())
            .unwrap_or(1);
        install(PathBuf::from(dir), "1.2.3");
        for _ in 0..panics {
            let joined = std::thread::Builder::new()
                .name("crash-test-worker".to_string())
                .spawn(|| {
                    let line = line!() + 1;
                    panic!("{CHILD_MESSAGE}: {line}");
                })
                .expect("the thread starts")
                .join();
            assert!(joined.is_err(), "the thread panicked");
        }
        true
    }

    /// Run as the parent: starts the test executable again for the test `name` alone, as a child
    /// that panics `panics` times. The hook so never sees another test's panic.
    fn run_child(name: &str, panics: usize) -> (TempDir, String) {
        let temp = TempDir::new().expect("a temporary folder");
        let output = Command::new(std::env::current_exe().expect("the test executable"))
            .args([
                "--exact",
                &format!("crash::tests::{name}"),
                "--nocapture",
                "--test-threads=1",
            ])
            .env(CHILD_DIR, temp.path())
            .env(CHILD_PANICS, panics.to_string())
            .output()
            .expect("the child process runs");
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        assert!(output.status.success(), "the child failed: {stderr}");
        (temp, stderr)
    }

    #[test]
    fn a_panic_in_a_spawned_thread_with_the_hook_writes_a_log() {
        if act_as_child() {
            return;
        }
        let (temp, stderr) = run_child("a_panic_in_a_spawned_thread_with_the_hook_writes_a_log", 1);
        // The previous hook ran too: the default one prints the panic on standard error.
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
        // The backtrace gives the address of every frame, and the address of one known function,
        // so the addresses can be matched to symbols whatever the load address was.
        let backtrace = text
            .split("Backtrace:\n")
            .nth(1)
            .expect("the log has a backtrace");
        assert!(
            backtrace.starts_with("Anchor: hx_desktop::run at 0x"),
            "{backtrace}"
        );
        let addressed = backtrace.lines().any(|line| {
            line.trim_start()
                .split_once(':')
                .is_some_and(|(index, rest)| {
                    index.parse::<u32>().is_ok() && rest.trim_start().starts_with("0x")
                })
        });
        assert!(addressed, "no frame has an address:\n{backtrace}");
    }

    #[test]
    fn a_run_writes_at_most_five_logs_and_later_panics_go_to_standard_error() {
        if act_as_child() {
            return;
        }
        let (temp, stderr) = run_child(
            "a_run_writes_at_most_five_logs_and_later_panics_go_to_standard_error",
            PER_RUN + 2,
        );
        assert_eq!(
            stderr.matches(CHILD_MESSAGE).count(),
            PER_RUN + 2,
            "{stderr}"
        );
        assert_eq!(names(&logs_dir(temp.path())).len(), PER_RUN);
    }
}
