//! The quiet check for a newer release: one request to GitHub at start, at most once in 24
//! hours, and the one page the app opens, the release page of a version that check offered.

use std::cmp::Ordering;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::{CommandError, ErrorKind};
use super::settings::Settings;
use super::AppState;

/// The one address the check asks: the latest release of the project.
pub const RELEASES_URL: &str =
    "https://api.github.com/repos/Xart3mis/hold-explorer/releases/latest";

/// The release page of a version is this address followed by the version.
const RELEASE_PAGE: &str = "https://github.com/Xart3mis/hold-explorer/releases/tag/v";

/// How long the request may take, from the connection to the last byte of the answer.
const TIMEOUT: Duration = Duration::from_secs(8);

/// The longest tag that is read as a version.
const TAG_LIMIT: usize = 64;

/// How long after an attempt the next one is due.
const INTERVAL_HOURS: i64 = 24;

/// A newer version to tell the user about.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct UpdateNotice {
    /// The version, without a leading `v`: "0.2.0".
    pub version: String,
}

/// Why the latest release could not be read. The check is silent, so the interface never sees
/// it; the tests do.
#[derive(Debug)]
pub enum UpdateError {
    /// The request could not be made or answered in time.
    Request(ureq::Error),
    /// The server answered with a status other than 200, a redirect included.
    Status(u16),
    /// The answer was not a release with a `tag_name`.
    Body,
}

impl std::fmt::Display for UpdateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UpdateError::Request(error) => write!(f, "the request failed: {error}"),
            UpdateError::Status(status) => write!(f, "the server answered with status {status}"),
            UpdateError::Body => f.write_str("the answer was not a release"),
        }
    }
}

impl std::error::Error for UpdateError {}

/// A version as a release tag names it: three numbers and an optional pre-release suffix.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Version {
    major: u64,
    minor: u64,
    patch: u64,
    /// The identifiers after `-`, or none for a release.
    pre: Option<Vec<Identifier>>,
}

/// One dot-separated part of a pre-release suffix. A number sorts before a word.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum Identifier {
    Number(u64),
    Word(String),
}

impl Ord for Version {
    fn cmp(&self, other: &Version) -> Ordering {
        (self.major, self.minor, self.patch)
            .cmp(&(other.major, other.minor, other.patch))
            .then_with(|| match (&self.pre, &other.pre) {
                (None, None) => Ordering::Equal,
                // A pre-release comes before the version it leads to.
                (None, Some(_)) => Ordering::Greater,
                (Some(_), None) => Ordering::Less,
                (Some(mine), Some(theirs)) => mine.cmp(theirs),
            })
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Version) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// A number made of ASCII digits only.
fn number(text: &str) -> Option<u64> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

/// Parses "v1.2.3" or "1.2.3" (pre-release suffixes count as older than the bare version).
/// "1.2" reads as "1.2.0". Anything else, spaces included, is no version, and so is a tag longer
/// than 64 characters.
pub fn parse_version(tag: &str) -> Option<Version> {
    if tag.len() > TAG_LIMIT {
        return None;
    }
    let text = tag.strip_prefix('v').unwrap_or(tag);
    let (core, pre) = match text.split_once('-') {
        Some((core, pre)) => (core, Some(pre)),
        None => (text, None),
    };
    let numbers = core.split('.').map(number).collect::<Option<Vec<u64>>>()?;
    let (major, minor, patch) = match numbers[..] {
        [major, minor] => (major, minor, 0),
        [major, minor, patch] => (major, minor, patch),
        _ => return None,
    };
    let pre = match pre {
        None => None,
        Some(pre) => Some(
            pre.split('.')
                .map(|part| {
                    let allowed = !part.is_empty()
                        && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
                    allowed.then(|| {
                        number(part)
                            .map_or_else(|| Identifier::Word(part.into()), Identifier::Number)
                    })
                })
                .collect::<Option<Vec<Identifier>>>()?,
        ),
    };
    Some(Version {
        major,
        minor,
        patch,
        pre,
    })
}

/// Whether a check is due: enabled, and no attempt in the last 24 hours. An attempt time that
/// cannot be read, or that lies after `now` because the clock was set back, is no such attempt.
pub fn is_due(settings: &Settings, now: DateTime<Utc>) -> bool {
    if !settings.update_check {
        return false;
    }
    let last = settings
        .update_checked_at
        .as_deref()
        .and_then(|at| DateTime::parse_from_rfc3339(at).ok());
    match last {
        None => true,
        Some(at) => {
            let since = now.signed_duration_since(at);
            since < chrono::Duration::zero() || since >= chrono::Duration::hours(INTERVAL_HOURS)
        }
    }
}

/// The notice to show for a latest tag, or none: newer than this build and not skipped. A
/// skipped version hides itself and anything older; a newer one shows again.
pub fn notice_for(latest_tag: &str, current: &str, skipped: Option<&str>) -> Option<UpdateNotice> {
    let latest = parse_version(latest_tag)?;
    if latest <= parse_version(current)? {
        return None;
    }
    if skipped
        .and_then(parse_version)
        .is_some_and(|skipped| latest <= skipped)
    {
        return None;
    }
    Some(UpdateNotice {
        version: latest_tag
            .strip_prefix('v')
            .unwrap_or(latest_tag)
            .to_string(),
    })
}

/// The one field of a release the check reads.
#[derive(Deserialize)]
struct Release {
    tag_name: String,
}

/// One request to `url`, 8 s timeout, User-Agent and Accept of decision 1; the `tag_name` field.
pub fn fetch_latest_tag(url: &str, version: &str) -> Result<String, UpdateError> {
    fetch_latest_tag_within(url, version, TIMEOUT, !cfg!(test))
}

/// [`fetch_latest_tag`] with the time it may take, and whether only https is asked (always,
/// outside the tests, whose servers speak plain HTTP). No redirect is followed, so no other
/// address is ever asked, and no cookie is sent: the crate is built without cookies.
pub(super) fn fetch_latest_tag_within(
    url: &str,
    version: &str,
    timeout: Duration,
    https_only: bool,
) -> Result<String, UpdateError> {
    let config = ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .https_only(https_only)
        .http_status_as_error(false)
        .max_redirects(0)
        .user_agent(format!("HoldExplorer/{version}"))
        .accept("application/vnd.github+json")
        .build();
    let agent = ureq::Agent::new_with_config(config);
    let mut response = agent.get(url).call().map_err(UpdateError::Request)?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(UpdateError::Status(status));
    }
    let text = response
        .body_mut()
        .read_to_string()
        .map_err(UpdateError::Request)?;
    serde_json::from_str::<Release>(&text)
        .map(|release| release.tag_name)
        .map_err(|_| UpdateError::Body)
}

/// What a check does at start: ask the address, or answer at once.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdateStep {
    /// The check is due: ask this address.
    Ask(String),
    /// The check is not due: this is the answer.
    Answer(Option<UpdateNotice>),
}

impl AppState {
    /// The first step of a check at `now`, for this build's version `current`. When a check is
    /// due, the address to ask ([`AppState::update_due`]). Otherwise, while the check is on, the
    /// newest version this session offered that is still newer than `current` and not skipped,
    /// so a window that is loaded again shows the notice again. While the check is turned off
    /// ([`AppState::turn_off_update_check`]), `None` at once. When the settings file could not be
    /// read or was set aside at start, the user's choice is unknown, so nothing is asked either.
    pub fn update_step(&mut self, now: DateTime<Utc>, current: &str) -> UpdateStep {
        if self.update_check_off || self.settings_problem_at_start.is_some() {
            return UpdateStep::Answer(None);
        }
        if let Some(url) = self.update_due(now) {
            return UpdateStep::Ask(url);
        }
        if !self.settings.update_check {
            return UpdateStep::Answer(None);
        }
        let skipped = self.settings.skipped_version.as_deref();
        let again = self
            .offered
            .iter()
            .filter_map(|version| notice_for(version, current, skipped))
            .max_by(|a, b| parse_version(&a.version).cmp(&parse_version(&b.version)));
        UpdateStep::Answer(again)
    }

    /// When a check is due at `now`, saves `now` as the time of the attempt (before the request,
    /// so a failed one counts too) and returns the address to ask; `None` otherwise. A time that
    /// cannot be saved is kept for this session, and the check still runs.
    pub fn update_due(&mut self, now: DateTime<Utc>) -> Option<String> {
        if !is_due(&self.settings, now) {
            return None;
        }
        self.settings.update_checked_at = Some(now.to_rfc3339());
        // The check is silent: a settings file that cannot be written only means the next
        // start may check again.
        let _ = self.save(&self.settings);
        Some(self.update_url.clone())
    }

    /// The notice for the latest tag the check read, against this build's version `current`;
    /// a version it offers may then have its release page opened.
    pub fn update_offer(&mut self, latest_tag: &str, current: &str) -> Option<UpdateNotice> {
        let notice = notice_for(
            latest_tag,
            current,
            self.settings.skipped_version.as_deref(),
        )?;
        self.offered.insert(notice.version.clone());
        Some(notice)
    }

    /// Saves `version` as the one to skip; `NotOffered` unless a check offered it this session.
    pub fn skip_version(&mut self, version: &str) -> Result<Settings, CommandError> {
        if !self.offered.contains(version) {
            return Err(not_offered(
                "Hold Explorer skips only the version its update check found in this session, so nothing was skipped. Use the Skip this version button of the update notice.",
            ));
        }
        let next = Settings {
            skipped_version: Some(version.to_string()),
            ..self.settings.clone()
        };
        self.save(&next)?;
        self.settings = next;
        Ok(self.settings.clone())
    }

    /// The release page of `version` when a check offered that version this session;
    /// `NotOffered` otherwise.
    pub fn release_page(&self, version: &str) -> Result<String, CommandError> {
        if self.offered.contains(version) {
            Ok(format!("{RELEASE_PAGE}{version}"))
        } else {
            Err(not_offered(
                "Hold Explorer opens only the release page of the version its update check found in this session, so this page was not opened. Use the Release page button of the update notice.",
            ))
        }
    }

    /// Turns the update check off for this session, whatever the settings say: every check
    /// answers `None` at once, asks nothing, and records no attempt. The settings are left as
    /// they are.
    pub fn turn_off_update_check(&mut self) {
        self.update_check_off = true;
    }

    /// Points the check at a server of the tests.
    #[cfg(test)]
    pub(crate) fn set_update_url(&mut self, url: String) {
        self.update_url = url;
    }
}

/// A refusal of a version no check offered this session.
fn not_offered(message: &str) -> CommandError {
    CommandError::new(ErrorKind::NotOffered, message)
}
