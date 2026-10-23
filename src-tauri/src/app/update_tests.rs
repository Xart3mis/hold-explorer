//! The update check: versions, when a check is due, the notice, the request, and the release page.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use chrono::{DateTime, TimeZone, Utc};

use super::error::ErrorKind;
use super::settings::{load_settings, save_settings, Settings};
use super::test_support::Fixture;
use super::update::{
    fetch_latest_tag, fetch_latest_tag_within, is_due, notice_for, parse_version, UpdateError,
    UpdateNotice,
};

/// The path the check asks for on a server of the tests.
const PATH: &str = "/repos/Xart3mis/hold-explorer/releases/latest";

/// 12:00 UTC on 23 October 2026.
fn noon() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 23, 12, 0, 0).unwrap()
}

/// An HTTP answer with this status line and body.
fn answer(status: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

/// A server on 127.0.0.1 that reads one request and answers it with `answer`. Returns the address
/// to ask, and the thread that hands back the request line and the headers it read, one a line.
fn serve_once(answer: String) -> (String, JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}{PATH}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut lines = Vec::new();
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            let line = line.trim_end().to_string();
            if line.is_empty() {
                break;
            }
            lines.push(line);
        }
        stream.write_all(answer.as_bytes()).unwrap();
        lines
    });
    (url, server)
}

/// The value of each header of a request, by its name in lower case.
fn headers(lines: &[String]) -> Vec<(String, String)> {
    lines[1..]
        .iter()
        .map(|line| {
            let (name, value) = line.split_once(':').unwrap();
            (name.to_ascii_lowercase(), value.trim().to_string())
        })
        .collect()
}

#[test]
fn parse_version_reads_tags_with_and_without_the_v_and_refuses_garbage() {
    let plain = parse_version("1.2.3").unwrap();
    assert_eq!(parse_version("v1.2.3"), Some(plain.clone()));
    assert_eq!(parse_version("1.2"), parse_version("1.2.0"));
    assert!(parse_version("1.2").is_some());
    let candidate = parse_version("v1.2.3-rc.1").unwrap();
    assert!(candidate < plain);
    for garbage in [
        "",
        "v",
        "1",
        "v1",
        "1.2.3.4",
        "a.b.c",
        "1.2.x",
        "v1..3",
        "1.2.3-",
        "1.2.3-rc..1",
        "latest",
        " 1.2.3",
        "1.2.3 ",
        "+1.2.3",
        "1.+2.3",
        "1.-2.3",
        "V1.2.3",
        "vv1.2.3",
        "1.2.3-rc!",
        "99999999999999999999.0.0",
    ] {
        assert_eq!(parse_version(garbage), None, "{garbage:?}");
    }
}

#[test]
fn versions_are_ordered_and_a_pre_release_is_older_than_its_version() {
    let v = |text: &str| parse_version(text).unwrap();
    assert!(v("0.1.0") < v("0.1.1"));
    assert!(v("0.1.1") < v("0.2.0"));
    assert!(v("0.2.0") < v("1.0.0"));
    assert!(v("1.0.0-rc.1") < v("1.0.0"));
    assert!(v("0.9.9") < v("1.0.0-rc.1"));
    // Pre-releases among themselves: numbers by value, and a number before a word.
    assert!(v("1.0.0-rc.2") < v("1.0.0-rc.10"));
    assert!(v("1.0.0-alpha") < v("1.0.0-beta"));
    assert!(v("1.0.0-rc.1") < v("1.0.0-rc.1.1"));
    assert!(v("1.0.0-1") < v("1.0.0-rc"));
    assert!(v("0.10.0") > v("0.9.0"));
}

#[test]
fn a_check_is_due_when_on_and_not_tried_in_the_last_24_hours() {
    let at = |hours: i64| Some((noon() - chrono::Duration::hours(hours)).to_rfc3339());
    let never = Settings::default();
    assert!(never.update_check);
    assert!(is_due(&never, noon()));
    let recent = Settings {
        update_checked_at: at(23),
        ..Settings::default()
    };
    assert!(!is_due(&recent, noon()));
    let old = Settings {
        update_checked_at: at(25),
        ..Settings::default()
    };
    assert!(is_due(&old, noon()));
    let off = Settings {
        update_check: false,
        ..Settings::default()
    };
    assert!(!is_due(&off, noon()));
    let off_and_old = Settings {
        update_check: false,
        update_checked_at: at(25),
        ..Settings::default()
    };
    assert!(!is_due(&off_and_old, noon()));
    // A time that cannot be read, or one after now (the clock was set back), is no attempt in
    // the last 24 hours.
    let unreadable = Settings {
        update_checked_at: Some("yesterday".into()),
        ..Settings::default()
    };
    assert!(is_due(&unreadable, noon()));
    let ahead = Settings {
        update_checked_at: at(-2),
        ..Settings::default()
    };
    assert!(is_due(&ahead, noon()));
}

#[test]
fn the_notice_names_a_newer_version_that_was_not_skipped() {
    let notice = |version: &str| {
        Some(UpdateNotice {
            version: version.into(),
        })
    };
    // Older and equal: nothing.
    assert_eq!(notice_for("v0.0.9", "0.1.0", None), None);
    assert_eq!(notice_for("v0.1.0", "0.1.0", None), None);
    assert_eq!(notice_for("0.1.0", "0.1.0", None), None);
    // Newer: its version, without the v.
    assert_eq!(notice_for("v0.2.0", "0.1.0", None), notice("0.2.0"));
    assert_eq!(notice_for("0.1.1", "0.1.0", None), notice("0.1.1"));
    // Newer but skipped, whichever way the skipped version is written.
    assert_eq!(notice_for("v0.2.0", "0.1.0", Some("0.2.0")), None);
    assert_eq!(notice_for("v0.2.0", "0.1.0", Some("v0.2.0")), None);
    // A version newer than the skipped one shows again.
    assert_eq!(
        notice_for("v0.3.0", "0.1.0", Some("0.2.0")),
        notice("0.3.0")
    );
    // A pre-release of this version is older; the version after a pre-release is newer.
    assert_eq!(notice_for("v0.1.0-rc.1", "0.1.0", None), None);
    assert_eq!(notice_for("v1.0.0", "1.0.0-rc.1", None), notice("1.0.0"));
    // A tag that is no version: nothing.
    assert_eq!(notice_for("nightly", "0.1.0", None), None);
}

#[test]
fn fetch_asks_once_with_the_user_agent_and_accept_and_reads_the_tag() {
    let (url, server) = serve_once(answer(
        "200 OK",
        r#"{"tag_name":"v0.2.0","name":"Hold Explorer 0.2.0","assets":[]}"#,
    ));
    assert_eq!(fetch_latest_tag(&url, "0.1.0").unwrap(), "v0.2.0");
    let lines = server.join().unwrap();
    assert_eq!(lines[0], format!("GET {PATH} HTTP/1.1"));
    let headers = headers(&lines);
    let values = |name: &str| -> Vec<&str> {
        headers
            .iter()
            .filter(|(n, _)| n == name)
            .map(|(_, v)| v.as_str())
            .collect()
    };
    assert_eq!(values("user-agent"), ["HoldExplorer/0.1.0"]);
    assert_eq!(values("accept"), ["application/vnd.github+json"]);
    assert!(values("cookie").is_empty(), "{lines:?}");
}

#[test]
fn fetch_refuses_an_answer_other_than_200() {
    let (url, server) = serve_once(answer("404 Not Found", r#"{"message":"Not Found"}"#));
    assert!(matches!(
        fetch_latest_tag(&url, "0.1.0"),
        Err(UpdateError::Status(404))
    ));
    server.join().unwrap();
    // A redirect is not followed: no other address is ever asked for.
    let (url, server) = serve_once(
        "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/elsewhere\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            .to_string(),
    );
    assert!(matches!(
        fetch_latest_tag(&url, "0.1.0"),
        Err(UpdateError::Status(302))
    ));
    server.join().unwrap();
}

#[test]
fn fetch_refuses_an_answer_that_is_not_a_release() {
    let (url, server) = serve_once(answer("200 OK", "{ not json"));
    assert!(matches!(
        fetch_latest_tag(&url, "0.1.0"),
        Err(UpdateError::Body)
    ));
    server.join().unwrap();
    let (url, server) = serve_once(answer("200 OK", r#"{"name":"no tag"}"#));
    assert!(matches!(
        fetch_latest_tag(&url, "0.1.0"),
        Err(UpdateError::Body)
    ));
    server.join().unwrap();
}

#[test]
fn fetch_gives_up_on_a_server_that_never_answers() {
    // The connection is accepted by the system and the request is sent, but nothing answers.
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}{PATH}", listener.local_addr().unwrap());
    let started = Instant::now();
    let result = fetch_latest_tag_within(&url, "0.1.0", Duration::from_millis(300));
    assert!(
        matches!(result, Err(UpdateError::Request(ureq::Error::Timeout(_)))),
        "{result:?}"
    );
    assert!(started.elapsed() < Duration::from_secs(5));
    drop(listener);
}

#[test]
fn a_check_that_is_due_saves_its_time_before_it_asks() {
    let fx = Fixture::new();
    let mut state = fx.state();
    state.set_update_url("http://127.0.0.1:9/test".into());
    let url = state.update_due(noon());
    assert_eq!(url.as_deref(), Some("http://127.0.0.1:9/test"));
    let saved = load_settings(&fx.config());
    assert_eq!(saved.update_checked_at, Some(noon().to_rfc3339()));
    // Within 24 hours of that attempt, none is due, whether or not it succeeded.
    assert_eq!(state.update_due(noon() + chrono::Duration::hours(1)), None);
    // Turned off: none is due, and the time stays as it was.
    state.set_update_check(false).unwrap();
    assert_eq!(state.update_due(noon() + chrono::Duration::days(3)), None);
    assert_eq!(
        load_settings(&fx.config()).update_checked_at,
        Some(noon().to_rfc3339())
    );
}

#[test]
fn only_a_version_this_session_offered_opens_its_release_page() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let refused = state.release_page("0.2.0").unwrap_err();
    assert_eq!(refused.kind, ErrorKind::NotOffered);
    assert_eq!(
        state.update_offer("v0.2.0", "0.1.0"),
        Some(UpdateNotice {
            version: "0.2.0".into()
        })
    );
    assert_eq!(
        state.release_page("0.2.0").unwrap(),
        "https://github.com/Xart3mis/hold-explorer/releases/tag/v0.2.0"
    );
    for other in ["0.3.0", "v0.2.0", "0.2.0/../../evil", "", "0.1.0"] {
        assert_eq!(
            state.release_page(other).unwrap_err().kind,
            ErrorKind::NotOffered,
            "{other:?}"
        );
    }
    // A tag that is not newer offers nothing.
    assert_eq!(state.update_offer("v0.0.1", "0.1.0"), None);
    assert_eq!(
        state.release_page("0.0.1").unwrap_err().kind,
        ErrorKind::NotOffered
    );
}

#[test]
fn skipping_a_version_saves_it_and_hides_it_until_a_newer_one() {
    let fx = Fixture::new();
    let mut state = fx.state();
    let settings = state.skip_version("0.2.0").unwrap();
    assert_eq!(settings.skipped_version.as_deref(), Some("0.2.0"));
    assert_eq!(
        load_settings(&fx.config()).skipped_version.as_deref(),
        Some("0.2.0")
    );
    assert_eq!(state.update_offer("v0.2.0", "0.1.0"), None);
    assert_eq!(
        state.update_offer("v0.3.0", "0.1.0"),
        Some(UpdateNotice {
            version: "0.3.0".into()
        })
    );
}

#[test]
fn the_update_settings_round_trip_and_an_older_file_checks() {
    let fx = Fixture::new();
    let settings = Settings {
        update_check: false,
        update_checked_at: Some(noon().to_rfc3339()),
        skipped_version: Some("0.2.0".into()),
        ..Settings::default()
    };
    save_settings(&fx.config(), &settings).unwrap();
    assert_eq!(load_settings(&fx.config()), settings);
    // A file written before the check existed has none of its fields: the check is on.
    std::fs::write(
        fx.config().join("settings.json"),
        r#"{ "theme": "Light", "density": "Compact", "author_name": "Ada" }"#,
    )
    .unwrap();
    let older = load_settings(&fx.config());
    assert!(older.update_check);
    assert_eq!(older.update_checked_at, None);
    assert_eq!(older.skipped_version, None);
    assert_eq!(older.author_name, "Ada");
}

#[test]
fn the_switch_is_saved_at_once() {
    let fx = Fixture::new();
    let mut state = fx.state();
    assert!(!state.set_update_check(false).unwrap().update_check);
    assert!(!load_settings(&fx.config()).update_check);
    assert!(state.set_update_check(true).unwrap().update_check);
    assert!(load_settings(&fx.config()).update_check);
}
