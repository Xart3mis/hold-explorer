# M1d: Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold Explorer can be released and kept up to date safely. The goal has five parts:
- **Releases:** a version tag builds a portable Windows executable and a Linux AppImage with checksums, and publishes them; v0.1.0 is published at the end.
- **Update check:** a quiet check tells the user when a newer release exists.
- **Crashes:** a crash leaves a log, and About copies diagnostics.
- **Startup:** a missing WebView2 runtime or a failed start says so in a native message.
- **Tests:** end-to-end tests drive the built app, and CI is pinned and starts the Windows executable.

**Architecture:** Everything that touches the network or the system lives in Rust, so the window's permissions and content security policy stay as they are.
- **Update check:** one desktop command makes a single HTTPS request to GitHub's release API with a small client.
- **Opening the release page:** a second command opens only that release page, through the opener plugin's Rust API.
- **Crashes and startup failures:** a panic hook writes a log under the local data folder. A failed start and a missing WebView2 runtime are reported with `rfd`'s native message box before any window opens.
- **Release builds:** a release workflow builds on a tag.
- **End-to-end tests:** they run through `tauri-driver` and WebdriverIO against a build with an `e2e` feature, which replaces the system's file dialogs with paths from the environment.

**Tech Stack:**
- As M1c-3.
- New Rust dependencies, all in `hx-desktop` only:
  - `ureq` 3 with rustls and its default certificate roots: the update check.
  - `rfd`, already in the lock through `tauri-plugin-dialog`: native message boxes.
- New dev tooling:
  - `tauri-driver`, installed in CI at a pinned version.
  - `webkit2gtk-driver`, the Ubuntu package.
  - `@wdio/cli` and its local runner, mocha framework and spec reporter, under the repository's npm release-age policy.

## Where this plan sits

M1 plans merged so far:
- M1a, M1b-1, M1b-2, M1b-3
- M1c-1, M1c-2, M1c-export
- M1c-3 (PR #8, main f3b5505)

**M1d (this plan)** completes M1 ("update check; release pipeline" in spec 18). Then M2 History.

## How this plan is written

This plan is written the same way as M1c-1 to M1c-3:
- Each task gives its files, the exact interface that later tasks rely on, the rules, and the test cases; it does not give the implementation.
- Test cases are the requirements, and they are written to fail first.
- Where a library behaves otherwise than this plan assumes, the implementer reads the installed source, adapts, and reports it.
- Every task runs the CI checks its change touches and reports their output.

## Decisions this plan rests on

1. **Update check, from Rust** (owner, 2026-10-23).
   - **The request.** One `GET https://api.github.com/repos/Xart3mis/hold-explorer/releases/latest`, made with `ureq` and rustls. It sends a `User-Agent` of `HoldExplorer/<version>` and `Accept: application/vnd.github+json`, and times out after 8 s.
   - **No other host, no cookies.** No address other than this one is ever requested, and no cookie is sent.
   - **Timing.** The check runs at startup, at most once per 24 hours. The time of the last attempt is saved whether or not the attempt succeeded.
   - **Failure is silent.** The interface never sees an error from it.
   - **On by default** (owner). The Settings switch "Check for updates at start" turns it off.
2. **The notice and its link.**
   - **Shell notice.** A newer version is shown as a quiet shell notice: "Hold Explorer <version> is available", with two actions, "Release page" and "Skip this version".
   - **Skip this version.** It saves that version and hides the notice. A later, newer version shows again.
   - **Release page.** It calls `open_release_page(version)`. That command opens `https://github.com/Xart3mis/hold-explorer/releases/tag/v<version>` and nothing else. The version must be the one the check returned in this session. The page is opened through the opener plugin's Rust API, so it needs no window permission.
   - **Spec change.** Spec 5.4 and 14 are updated to name this one address as the only one the app opens.
3. **Crash log.**
   - **Where it is written.** A panic hook, installed first in `run()`, writes `logs/crash-<UTC yyyymmdd-hhmmss>.log` under the local data folder.
   - **What it holds:**
     - the time, as UTC and as local time with its offset;
     - the version;
     - the OS and the architecture;
     - the WebView version;
     - the thread name;
     - the panic message and its location;
     - a forced backtrace.
   - **What it never holds.** No workspace data and no file content goes into the log.
   - **Retention.** The 10 newest logs are kept.
   - **Panics inside commands.** They are still caught, as in M1c-3, and they are logged too. The hook then calls the default hook.
4. **Copy diagnostics** (spec 14, About).
   - **Where.** A button in About.
   - **What it copies:**
     - the version;
     - the OS and the architecture;
     - the WebView version;
     - the workspaces folder;
     - the settings file;
     - the logs folder;
     - the number of workspaces and the number of unreadable files, with their kinds;
     - the current settings problem, if any;
     - the newest crash log's first 60 lines.
   - **What it never copies.** It names no workspace, no snapshot, and no hold.
   - **How.** The command builds the text, and it is set on the clipboard through the existing session clipboard.
5. **Startup failure and WebView2.**
   - **Failed start.** When the app cannot start, `run()` writes a crash log. It then shows a native error message with what failed and the log's folder, and exits with code 1. This replaces `eprintln!`, which nobody sees on Windows.
   - **Missing WebView2.** On Windows, before the builder runs, `tauri::webview_version()` is checked. If it fails, a native message says that Hold Explorer needs the Microsoft Edge WebView2 Runtime, that the per-user installer needs no admin rights, and where to get it: `https://developer.microsoft.com/microsoft-edge/webview2/`. The message text can be copied with Ctrl+C. The app opens no address, and it exits.
6. **The local data folder on Windows.**
   - **New default.** The default workspaces folder becomes `app_local_data_dir()/workspaces`, which is `%LOCALAPPDATA%` on Windows. Crash logs also go under `app_local_data_dir()`. On Linux both folders are the same.
   - **Existing users.** When the settings name no folder, the new default holds no workspace file, and the old default (`app_data_dir()/workspaces`) holds at least one, the old folder is saved as the chosen folder. Nothing is moved.
7. **Closing during a write.**
   - **What counts as a write.** An import commit, a folder move, an export save, a saved-view write, and the demo build.
   - **The count.** Rust counts writes in progress in an `AtomicUsize`, held by a guard type that each write takes.
   - **Closing while writing.** A close request while the count is above 0 is prevented. The shell shows the notice "Hold Explorer closes when it has finished saving". The window closes on its own when the count returns to 0.
   - **Closing again.** A second close request while waiting does nothing more.
8. **Release** (owner, 2026-10-23: pipeline, then v0.1.0 now).
   - **Trigger.** `.github/workflows/release.yml` runs on a tag `v*`, and on `workflow_dispatch` as a dry run, which builds without publishing.
   - **Artifacts:**
     - Windows x64: `HoldExplorer-<version>-windows-x64.exe` (portable, the bare binary);
     - Linux x64: `HoldExplorer-<version>-linux-x86_64.AppImage`;
     - `SHA256SUMS.txt`.
   - **Version check.** The workflow refuses a tag that does not equal the version in `Cargo.toml`, `package.json`, and `tauri.conf.json`.
   - **The release itself.** It is created with `gh release create` and the notes come from the tag message. Its permissions are `contents: write` for that job only.
   - **v0.1.0.** At the end of M1d, after the PR is merged on green, tag `v0.1.0` is pushed from main and the published assets are checked.
9. **End-to-end tests** (owner: WebDriver on Linux, smoke on Windows).
   - **Driver.** `tauri-driver` with `WebKitWebDriver` drives a build made with `--features e2e` on Linux CI, under `xvfb-run`.
   - **Isolation.** Each test run has its own config, data, and home folders.
   - **The `e2e` feature.** It exists only in that build. It replaces the open and save dialogs with paths read from `HX_E2E_OPEN` and `HX_E2E_SAVE_DIR`. A normal build compiles no trace of it, and a test checks this.
   - **Windows smoke.**
     - **Start.** CI starts the release executable with `HX_SMOKE=1`.
     - **Success.** The page calls `smoke_ready(sample)` once the first screen has rendered. `sample` is the catalog's date format applied to 30 September 2026. The command prints `ready <sample>` and exits 0. CI checks the line, which settles "Sept" against "Sep" in WebView2.
     - **Failure.** The app exits 1 after 60 s without the call.
   - **Linux.** The Linux run checks the same sample in WebKitGTK.
10. **CI.**
    - Every action is pinned by commit SHA with a version comment, in both workflows.
    - Pull requests get a concurrency group that cancels a run superseded by a newer push.
    - The interface tests run serially in CI only if the parallel run proves flaky. The M1c-3 note's cheap fix comes first: the `findBy` waits of the slow tests get the `SLOW` allowance.
11. **Interface hygiene from the M1b/M1c notes:**
    - drop the component library's locales other than English from the bundle;
    - narrow `check-dist`'s `http://localhost` allowance to the exact strings it needs;
    - give menus a visible outline under forced colors;
    - replace `vitest-axe` 0.1.0 with a small helper over `axe-core`.

## Global Constraints

Every constraint of the M1c-3 plan still holds:

- Real project files never enter the repository. Tests build their inputs with `hx-synth` or small text files in temporary directories.
- `hx-core`, `hx-store`, and `hx-export` do not depend on Tauri. `ts-rs` is used only behind the `ts` feature.
- **Tauri commands.**
  - A Tauri command contains no logic beyond the `blocking` helper (or `unlocked`), the call into `hx_desktop::app`, and the error mapping.
  - Every command has an entry in `ui/src/api/command-args.json`.
  - Generated bindings are committed, and `pnpm bindings` leaves them unchanged in CI.
- **How screens read and change data.**
  - The interface computes nothing from snapshot data.
  - A screen reads snapshot data only through `useSnapshotQuery` or `useSnapshotPages`.
  - A screen changes the view only through `workspaceAction()`.
  - The pending rule holds.
- **Rust rules.**
  - Edition 2021, toolchain 1.97.0.
  - `rust-version` is `"1.92"` for `hx-desktop`, `hx-cli`, and `hx-export`, and `1.88` for the other crates.
  - `#![forbid(unsafe_code)]`.
  - No `unwrap()` or `expect()` outside tests, except on values that cannot fail, with the reason given.
  - No `#[allow]`.
  - Every public item is documented.
  - Error kinds come from `ErrorKind`.
- TypeScript is strict. No `any`, no `@ts-ignore`, and no non-null assertion on a value that can be absent. A react-aria field's `onKeyDown` calls `continuePropagation()` for every key it does not use.
- Every user-facing string is in `ui/src/locales/en.json`. Use the glossary terms. Every error says what happened, why, and how to fix it.
- Spec 13.1 and 13.2 bind every screen.
- Use tokens only. A new token goes into `DESIGN.md` first. Focus is always visible.
- **Security policy.**
  - Never relax a supply-chain or security policy. No `minimumReleaseAgeExclude`, no disabled audit, no widened CSP, and no new window capability.
  - The window's permissions stay exactly four: `core:default`, `dialog:allow-open`, `dialog:allow-save`, and `opener:allow-reveal-item-in-dir`.
  - The app makes exactly one kind of network request, the update check of decision 1. It opens exactly one kind of address, the release page of decision 2.
- Parity tests and `tools/parity/reference.mjs` are unchanged. Existing performance limits stay.
- Conventional Commits. No em dashes in documents, interface text, or file text.
- Leave the uncommitted `.gitattributes` line and the untracked `.claude/` alone, and never stage them.

New for this plan:

- **Dependencies.** The new runtime dependencies are `ureq` (rustls, no native TLS) and `rfd`, which is already in the lock. Anything else is reported and not added.
- **Binary size.** The binary stays under 25 MB. Each task that adds code to the binary reports the size; at the start of this plan it is 18.43 MB.
- **Tests never use the network.** The update check is tested against a local `TcpListener`, never against GitHub.
- **The `e2e` feature never ships.** The release workflow builds without it, and a test checks that a default build has no `e2e` symbol.

## File Structure

```
src-tauri/Cargo.toml                         ureq, rfd; feature e2e
src-tauri/src/lib.rs                         panic hook first, WebView2 check, startup failure message, close guard
src-tauri/src/crash.rs                       panic hook, log files, retention
src-tauri/src/native.rs                      native messages (rfd), startup failure, WebView2 problem text
src-tauri/src/app/update.rs                  release check: request, parse, compare, due, skip
src-tauri/src/app/diagnostics.rs             diagnostics text
src-tauri/src/app/writes.rs                  WriteGuard, writes in progress
src-tauri/src/app/settings.rs                update_check, update_checked_at, skipped_version
src-tauri/src/app/mod.rs                     default folder (local data, old-folder carry-over)
src-tauri/src/e2e.rs                         dialog substitutes (cfg(feature = "e2e"))
src-tauri/src/smoke.rs                       HX_SMOKE: ready command and timeout
ui/src/features/shell/                       update notice, closing notice, smoke ready call
ui/src/features/settings/                    update switch, Copy diagnostics
ui/src/test/axe.ts                           axe helper replacing vitest-axe
e2e/                                         WebdriverIO config and specs
.github/workflows/ci.yml                     pins, concurrency, e2e on Linux, smoke on Windows
.github/workflows/release.yml                tag and dry-run release
tools/check-dist.mjs                         narrowed localhost allowance
README.md                                    download, SmartScreen, checksums, update check
docs/superpowers/specs/...design.md          5.4, 12, 14, 15, 16, 18 as built
```

---

### Task 1: Crash log, panic hook, and native startup messages

**Files:**
- `src-tauri/src/crash.rs` (new)
- `src-tauri/src/native.rs` (new)
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml` (`rfd`, with the version and features already in the lock, so that no new crate is pulled)
- tests in both new modules

**Interface:**

```rust
// crash.rs
/// Installs the hook that writes a crash log into `logs` under `local_data`, then calls the
/// previous hook. Safe to call once; a failure to write the log never panics again.
pub fn install(local_data: PathBuf, version: &'static str);
/// Writes one crash log and returns its path; keeps the newest `KEEP` logs. Used by the hook and
/// by a failed start.
pub fn write_log(dir: &Path, report: &CrashReport) -> std::io::Result<PathBuf>;
pub struct CrashReport { pub at: DateTime<Utc>, pub local: DateTime<FixedOffset>, pub version: String,
    pub os: String, pub arch: String, pub webview: Option<String>, pub thread: String,
    pub message: String, pub location: Option<String>, pub backtrace: String }
pub const KEEP: usize = 10;
/// The logs folder and the newest log, for diagnostics.
pub fn logs_dir(local_data: &Path) -> PathBuf;
pub fn newest_log(local_data: &Path) -> Option<PathBuf>;

// native.rs
/// Shows a native error message and returns when it is closed. Never panics.
pub fn error_message(title: &str, text: &str);
/// The text for a failed start: what failed, and the folder of the log written for it.
pub fn startup_failure_text(error: &str, log: Option<&Path>) -> String;
/// The text when WebView2 is missing: what is needed, that the per-user installer needs no admin
/// rights, and the download address of decision 5.
pub fn webview2_missing_text() -> String;
```

**Rules:**
- Decisions 3 and 5 govern this task.
- `install` runs first in `run()`. It needs the local data folder before Tauri's path resolver exists, so read it the way Tauri's `app_local_data_dir` would for this identifier, or install the hook again in `setup`. Pick one, report which, and say why. The hook must also log a panic that happens during setup.
- Log names sort by time, and two logs written in the same second do not overwrite each other: add a counter suffix.
- Retention deletes the oldest logs only, and only files that match the log name pattern.
- The texts of native messages come from Rust constants. They are not in the catalog, because the interface is not running. Each one says what happened, why, and how to fix it.
- On Windows, `run()` checks the WebView2 runtime before the builder and shows `webview2_missing_text`.

**Tests:**
- A report written has every field, and has no workspace path beyond the folders.
- Retention keeps the 10 newest logs and leaves other files alone.
- Two logs written in the same second get two names.
- A panic in a spawned thread with the hook installed writes a log that holds the message and the location. Run it in its own process with a test binary or `std::process::Command` on the test executable, or with a hook installed for that test only; report which.
- `startup_failure_text` names the log folder.
- `webview2_missing_text` contains the address and the words "no admin rights".
- `error_message` cannot be unit-tested; it is covered by Task 9's smoke run.

**Commit:** `feat(desktop): a crash leaves a log, and a failed start says so in a native message`

---

### Task 2: Copy diagnostics and the About rows

**Files:**
- `src-tauri/src/app/diagnostics.rs` (new)
- `src-tauri/src/app/mod.rs`
- `src-tauri/src/commands.rs`
- `ui/src/api/command-args.json`, `commands.ts`, the dev mock, and the test helpers
- `ui/src/features/settings/` (About)
- `DESIGN.md` (the About rows)
- tests

**Interface:**

```rust
/// The diagnostics text of decision 4, plain lines `Name: value`, then the newest crash log.
pub fn diagnostics(state: &AppState, local_data: &Path, webview: Option<&str>) -> String;
// command, writes the text to the session clipboard (unlocked) and returns it
pub async fn diagnostics_copy(app) -> Result<String, CommandError>;
```

**Rules:**
- Decision 4 governs this task.
- The text is built under the state lock, and the clipboard is set after the lock is released, as `export_copy` does.
- About gains:
  - a "Logs folder" row with "Show in folder";
  - a "Copy diagnostics" button that shows "Copied" in a toast, or the clipboard error in place.

**Tests:**
- The text has every line of decision 4.
- With no crash log, the text says "No crash log".
- With a crash log, it holds the newest log's first 60 lines.
- The text holds no workspace name or snapshot. Use a workspace named "SECRET-NAME" and assert that the name is absent.
- Interface:
  - the button copies and shows the toast;
  - a failure is shown in place;
  - the "Show in folder" row works;
  - axe passes.

**Commit:** `feat: Copy diagnostics and the logs folder in About`

---

### Task 3: The local data folder on Windows

**Files:**
- `src-tauri/src/lib.rs`
- `src-tauri/src/app/mod.rs` (where the default folder is chosen)
- tests

**Rules:**
- Decision 6 governs this task.
- `AppState::new` takes both folders, `data_dir` and `local_data_dir`.
- The carry-over to the old folder happens once, at start, and is saved in the settings. It happens only when the settings name no folder. When the settings file is blocked, nothing is saved and the old folder is used for this session.
- A workspace file means a file the store would list, readable or not.

**Tests:**
- With no settings and no files anywhere, the default is the local folder.
- When only the old folder has workspace files, the old folder is used and saved.
- When both folders have files, the local folder is used.
- When the settings name a folder, that folder is used and nothing changes.
- When the settings are blocked, the old folder is used and nothing is written.

**Commit:** `fix(desktop): workspaces live in local application data by default`

---

### Task 4: Closing the window during a write

**Files:**
- `src-tauri/src/app/writes.rs` (new)
- every write path named in decision 7
- `src-tauri/src/lib.rs` (the `on_window_event` handler)
- `ui/src/features/shell/` (the closing notice)
- `ui/src/locales/en.json`
- tests

**Interface:**

```rust
/// Counts writes in progress; dropping the guard ends the write.
pub struct Writes(AtomicUsize);
pub struct WriteGuard<'a>;
impl Writes { pub fn begin(&self) -> WriteGuard<'_>; pub fn busy(&self) -> bool; }
// event to the interface when a close is held back: "closing-held"; Rust closes the window itself
// when the count returns to 0 after a held close.
```

**Rules:**
- Decision 7 governs this task.
- The guard is taken around the whole write, including the file work done outside the lock.
- A held close is remembered. When the last guard drops, the window is closed from the main thread through the app handle.
- The notice is a shell notice of tone `info`. It is not dismissible.

**Tests:**
- Rust: `busy` follows the guards.
- Rust: a close request while busy is prevented and recorded. Test the decision function, not the window.
- Rust: when the count reaches 0 after a held close, a close is asked for. Use a seam that records it.
- Rust: each write path takes a guard. Assert it inside one test per path with a double, or by a guard counter seen while a held step runs.
- Interface: the event shows the notice.

**Commit:** `feat(desktop): the window waits for a write to finish before it closes`

---

### Task 5: The update check

**Files:**
- `src-tauri/src/app/update.rs` (new)
- `settings.rs`
- `commands.rs`
- `src-tauri/Cargo.toml` (`ureq` 3: `default-features = false`, features `rustls` and the default certificate roots; read the crate's features and report them)
- `ui/src/api/*`
- `ui/src/features/shell/` (the update notice)
- `ui/src/features/settings/` (the switch)
- `en.json`
- `DESIGN.md` (Shell notice: update)
- tests

**Interface:**

```rust
pub struct Settings { /* ...as today, plus: */ pub update_check: bool /* default true */,
    pub update_checked_at: Option<String> /* RFC 3339 UTC */, pub skipped_version: Option<String> }
#[derive(Serialize, TS)] pub struct UpdateNotice { pub version: String }
/// Parses "v1.2.3" or "1.2.3" (pre-release suffixes count as older than the bare version).
pub fn parse_version(tag: &str) -> Option<Version>;
/// Whether a check is due: enabled, and no attempt in the last 24 hours.
pub fn is_due(settings: &Settings, now: DateTime<Utc>) -> bool;
/// The notice to show for a latest tag, or none: newer than this build and not skipped.
pub fn notice_for(latest_tag: &str, current: &str, skipped: Option<&str>) -> Option<UpdateNotice>;
/// One request to `url`, 8 s timeout, User-Agent and Accept of decision 1; the `tag_name` field.
pub fn fetch_latest_tag(url: &str, version: &str) -> Result<String, UpdateError>;
// commands
pub async fn update_check(app) -> Result<Option<UpdateNotice>, CommandError>; // never errs to the UI on network failure: Ok(None)
pub async fn update_skip(app, version: String) -> Result<Settings, CommandError>;
pub async fn open_release_page(app, version: String) -> Result<(), CommandError>; // only a version this session's check returned
pub async fn settings_set_update_check(app, enabled: bool) -> Result<Settings, CommandError>;
```

**Rules:**
- Decisions 1 and 2 govern this task.
- The request runs outside the state lock (`unlocked`). The attempt time is saved before the request, under the lock.
- The release address is a constant. The URL of a test server is injected only in tests.
- `open_release_page` refuses any version other than the one returned in this session, with kind `NotWritten`-like refusal semantics. Add a kind `NotOffered`.
- The interface calls `update_check` once after start, never on a timer. It shows the notice only when it gets `Some`.
- Settings gets the switch, saved at once, using the optimistic setting hook.

**Tests (Rust):**
- `parse_version` handles "v1.2.3", "1.2.3", "1.2", and "v1.2.3-rc.1", and refuses garbage.
- Ordering: 0.1.0 is less than 0.1.1, which is less than 0.2.0, and 1.0.0-rc.1 is less than 1.0.0.
- `is_due`: never checked, checked 23 h ago, checked 25 h ago, and disabled.
- `notice_for`: older, equal, newer, and newer but skipped. A skipped version followed by a newer one shows the newer one.
- `fetch_latest_tag` against a local `TcpListener` server:
  - the success path, with the asserted request line and headers;
  - a 404;
  - malformed JSON;
  - a timeout, using a server that never answers, a short test timeout, and the timeout made a parameter in tests.
- The `update_check` command answers `Ok(None)` when the check is disabled, not due, or fails.
- `open_release_page` refuses an unknown version.
- Settings round trip for the new fields, with an older file defaulting to true.

**Tests (interface):**
- the notice shows only for `Some`;
- Skip hides the notice and calls `update_skip`;
- "Release page" calls `open_release_page`;
- the switch persists;
- axe passes.

**Commit:** `feat: a quiet check for a newer release, with a switch to turn it off`

---

### Task 6: Interface hygiene

**Files:**
- `vite.config.ts` or wherever the component library's locales are pulled in (strip the locales other than English; follow react-aria's documented optimization for Vite)
- `tools/check-dist.mjs` and its tests
- Menu CSS (forced colors)
- `ui/src/test/axe.ts` (new), plus every `vitest-axe` use
- `package.json` (remove `vitest-axe`, add `axe-core` as a direct dev dependency at the version already in the lock)
- the slow tests' `findBy` calls (the `SLOW` allowance)

**Rules:**
- Decision 11 and the M1c-3 note on slow tests govern this task.
- The bundle must still format English dates and numbers exactly as before. A test pins the output of the format module.
- `check-dist` allows only the exact localhost strings it needs, each listed with a reason. Any other `localhost` reference fails the check.
- Under `forced-colors: active`, a menu and a popover have a visible `CanvasText` outline.
- The axe helper is `expectNoAxeViolations(container, options?)`. It wraps `axe-core` the way `vitest-axe` did, and its rules are unchanged.

**Tests:**
- the bundle size before and after, reported;
- `check-dist`: a new `localhost` reference fails, and the listed ones pass;
- the forced-colors rule exists (CSS test);
- every axe test passes with the new helper;
- the parallel `pnpm test` is reported. The aim is no timeout from a `findBy` wait.

**Commit:** `chore(ui): English-only component locales, a narrower dist check, forced-colors menus, and an axe helper`

---

### Task 7: The `e2e` build and the smoke mode

**Files:**
- `src-tauri/Cargo.toml` (feature `e2e`)
- `src-tauri/src/e2e.rs` (new)
- `src-tauri/src/smoke.rs` (new)
- `src-tauri/src/commands.rs`
- `ui/src/api/` (the dialog calls go through one module that the `e2e` build can answer)
- `ui/src/app/` (the smoke ready call after the first render)
- tests

**Interface:**

```rust
// e2e.rs, only with feature "e2e"
/// Answers the open dialog with HX_E2E_OPEN and the save dialog with HX_E2E_SAVE_DIR/<suggested name>.
pub async fn e2e_open_path() -> Option<String>; pub async fn e2e_save_path(suggested: String) -> Option<String>;
// smoke.rs, always compiled, inert unless HX_SMOKE=1
pub async fn smoke_ready(app, sample: String) -> Result<(), CommandError>; // prints "ready <sample>", exits 0
pub fn arm_timeout(app: &AppHandle); // exits 1 after 60 s without smoke_ready, only when HX_SMOKE=1
```

**Rules:**
- Decision 9 governs this task.
- **Dialogs.**
  - The interface opens the system dialogs through one module, `ui/src/api/dialogs.ts`. It is the only file allowed to import the dialog plugin; add the lint rule that enforces this.
  - Under the `e2e` build, that module calls the substitute commands instead.
  - The interface learns which build it is in from a command answer in `AppStart` (`e2e: bool`), never from a URL or the environment in JavaScript.
- **Smoke mode.**
  - `smoke_ready` is a command in every build. It does nothing unless `HX_SMOKE=1`; then it prints the line and exits.
  - The page calls it once after the first render, with `formatDate` of 2026-09-30 from the format module.
- A test asserts that a default build's command list has no `e2e_*` command. Read `lib.rs` `handler()` under `cfg`.

**Tests:**
- Rust: the substitutes read the environment.
- Rust: `smoke_ready` is inert without `HX_SMOKE`.
- Rust: the default build has no e2e command.
- Interface:
  - `dialogs.ts` chooses the substitute when `start.e2e` is true;
  - the smoke call is made once with the formatted sample;
  - the lint rule refuses a dialog plugin import elsewhere.

**Commit:** `feat(desktop): an e2e build with dialog substitutes, and a smoke mode`

---

### Task 8: End-to-end tests on Linux

**Files:**
- `e2e/` (new): `wdio.conf.ts`, `specs/*.e2e.ts`, `README.md`
- `package.json` scripts `e2e:build` and `e2e`
- the dev dependencies of the Tech Stack
- `.github/workflows/ci.yml` (a Linux job `e2e`)

**Rules:**
- Decision 9 governs this task.
- The WebdriverIO config starts `tauri-driver`. It points at `target/debug/hx-desktop` built with `--features e2e`. Each spec gets fresh temporary config, data, and home folders through `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, and `HOME`.
- Inputs come from `hx-synth`: a CLI call in a `before` hook writes a synthetic workbook into the temp folder.
- The specs:
  1. Start, open the demo workspace, and see the Overview tiles.
  2. Import the synthetic workbook through the open-dialog substitute, review it, commit it, and see the Overview.
  3. Add a Discipline filter and see the count change.
  4. Search for a line ID and open its panel.
  5. Save a view, clear the filters, apply the view, and see the chip label.
  6. Export Excel this view through the save substitute. The file exists, starts with the zip signature, and is larger than 1 KB.
  7. Run Ctrl+K and `?` once each.
  8. Check that the date sample matches `formatDate` in the page. Print the WebKitGTK result, so "Sept" against "Sep" is recorded.
- CI installs `webkit2gtk-driver` and `xvfb`, plus `tauri-driver` with `cargo install tauri-driver --version <pinned> --locked`. The job uploads WebdriverIO's logs on failure.
- `pnpm e2e` runs locally on Linux with the same setup. The README in `e2e/` gives the steps.

**Tests:** the specs above. Report a local run with its output and the CI run.

**Commit:** `test: end-to-end tests of the built app on Linux`

---

### Task 9: CI pins, concurrency, and the Windows smoke test

**Files:**
- `.github/workflows/ci.yml`

**Rules:**
- Decision 10 governs this task.
- Replace every `uses:` with its full commit SHA, followed by `# vX.Y.Z`. Read each SHA from the action's own release tag with `gh api`, and report the list.
- Add the following, so a superseded pull request run is cancelled while main runs are never cancelled:

  ```yaml
  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: ${{ github.event_name == 'pull_request' }}
  ```
- After `Build the app` on Windows, start `target/release/hx-desktop.exe` with `HX_SMOKE=1` (the runner is a fresh machine, so its own application data folders are used; Tauri reads the known folders, not the `APPDATA`/`LOCALAPPDATA` variables). Wait at most 120 s. Require exit code 0 and a line `ready <sample>`, and print the sample. The same step runs on Linux under `xvfb-run`.
- Document where the dates are recorded: the WebView2 sample is printed in the log, and the Linux sample is printed by both e2e and smoke.

**Tests:** the CI run on the branch, reported with the smoke output from both systems.

**Commit:** `ci: pin actions, cancel superseded runs, and start the built app on both systems`

---

### Task 10: The release workflow

**Files:**
- `.github/workflows/release.yml` (new)
- `tauri.conf.json` (the `version` comes from Cargo; check this)
- `README.md` (Download, checksums, SmartScreen, update check)
- `tools/` (a small script `release-check.mjs` that compares the tag with the three versions)

**Rules:**
- Decision 8 governs this task.
- **Jobs.**
  - `check`: runs `release-check.mjs` against the tag.
  - `build` (a matrix of windows-latest and ubuntu-22.04 for the AppImage's glibc floor): installs as CI does, then runs `pnpm tauri build`. On Windows, `--no-bundle` is enough because the bare exe is the portable artifact. On Linux it uses `--bundles appimage`.
  - **Artifacts:** both build jobs rename their output to the decision 8 names and upload it.
  - `publish` (tags only): downloads both artifacts, writes `SHA256SUMS.txt` with `sha256sum`, and runs `gh release create "$TAG" --title "Hold Explorer $VERSION" --notes-from-tag <files>`.
- A `workflow_dispatch` run builds and uploads the artifacts as workflow artifacts but publishes nothing. This is the dry run.
- Every action is pinned by SHA, as in Task 9.
- Permissions are `contents: read` at the top. Only `publish` gets `contents: write`.
- The build never uses `--features e2e`. A step greps the Windows exe and refuses any `e2e_open_path` string.
- README:
  - where to download the release, and how to check the checksums on each system;
  - SmartScreen on the first run (spec 16);
  - that the app checks GitHub for a newer release once a day and how to turn that off;
  - that it sends nothing else.

**Tests:**
- `release-check.mjs` has `node --test` cases: a matching tag, a mismatching tag, and a tag without `v`.
- A dry run of the workflow on the branch with `workflow_dispatch`. Report the artifacts' names and sizes, and the AppImage's start under `xvfb-run` with `HX_SMOKE=1`.

**Commit:** `ci: build and publish a release from a version tag`

---

### Task 11: Spec, acceptance, and v0.1.0

**Files:**
- the spec: 5.4 (the one request and the one address), 12 (as built), 14 (crash log, diagnostics, WebView2, closing during a write), 15 (the end-to-end tests as built), 16 (as built), 17 (the e2e flows), 18 (M1 done)
- `README.md`
- `.superpowers` notes are written by the controller, not here

**Checks, reported with output:**
- the whole CI list;
- the release binary size, which must stay under 25 MB, with the change from 18.43 MB;
- the window permissions, still four;
- `pnpm check:dist`;
- a manual start of the release build on Linux with the update check pointed at a local fake. This is a test-only path: use the Rust test.

**Then (controller, after the PR is merged on green, owner-approved 2026-10-23):**
1. Tag `v0.1.0` on main with the message "Hold Explorer 0.1.0", and push it.
2. Watch `release.yml` until every job is completed.
3. Check the published release:
   - three files with the decision 8 names;
   - `SHA256SUMS.txt` matches the downloaded files;
   - the AppImage starts in smoke mode under `xvfb-run`.
4. If the workflow fails, fix it on a branch and merge on green. Delete the failed release and tag (owner-approved for this purpose only), then push the tag again.

**Commit:** `docs: M1 complete in the spec, with releases and the update check`

---

## Self-review against the scope

- Spec 12, the update check: Task 5, with decisions 1 and 2. The setting is in Task 5.
- Spec 14:
  - crash log: Task 1;
  - Copy diagnostics: Task 2;
  - WebView2: Task 1;
  - closing during a write: Task 4.
- Spec 15: end-to-end tests are Task 8, and the CI smoke test on Windows is Task 9.
- Spec 16: packaging and release are Task 10, and v0.1.0 is Task 11.
- Spec 18: M1's "update check; release pipeline" is covered by Tasks 5 and 10.
- The M1d list in the notes:
  - crash log and panic hook: Task 1;
  - native message on startup failure: Task 1;
  - WebView2: Task 1;
  - local data folder: Task 3;
  - `dialog:allow-save`: already done in M1c-export;
  - locales and check-dist: Task 6;
  - CI pins and concurrency: Task 9;
  - best of three: already done;
  - Windows smoke: Task 9;
  - measure the demo in release: Task 11, through the perf output;
  - guard the window close: Task 4;
  - forced-colors outline: Task 6;
  - "Sept" against "Sep": Tasks 7 to 9;
  - the old accessibility package: Task 6;
  - WebDriver: Task 8.
- The M1c-3 follow-ups that fit here: the slow `findBy` waits (Task 6) and "Copy diagnostics" (Task 2). A panic during a folder move is reported now that the crash log exists (Task 1); the move's own report stays later.

## Corrections during the build (2026-10-23)

- Task 1 (review): crash logs record the full backtrace format with instruction addresses and an anchor address; the release profile keeps symbols (function names) where the size limit allows, and a Windows PDB, when produced, is kept as a release-workflow artifact (Task 10), never shipped. The local data folder is found with `dirs::data_local_dir()`, as Tauri does. A panic while the app is built takes the startup failure path. Native dialogs are skipped with `HX_NO_NATIVE_DIALOG=1` or `HX_SMOKE=1`. At most 5 crash logs per run; paths under home and local data are shortened in a logged message.
- Task 9: the smoke run does not redirect `APPDATA`/`LOCALAPPDATA`; Tauri's folders come from the system's known folders.
