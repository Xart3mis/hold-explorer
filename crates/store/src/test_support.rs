//! Helpers the tests of several modules share.

use std::path::{Path, PathBuf};

use hx_core::fingerprint::state_hash;
use hx_core::load::{load_file, Loaded};
use hx_core::snapshot_date::SnapshotDate;
use hx_synth::{evolve, generate, write_workbook, SynthConfig, SynthRow};
use rusqlite::{Connection, OpenFlags};

use crate::{ImportOptions, SnapshotInfo, Workspace};

pub(crate) fn synth(dir: &Path, name: &str, rows: &[SynthRow], cfg: &SynthConfig) -> Loaded {
    let path = dir.join(name);
    write_workbook(rows, cfg, &path).unwrap();
    load_file(&path).unwrap()
}

pub(crate) fn taken_of(loaded: &Loaded) -> SnapshotDate {
    loaded.snapshot.expect("the synthetic file carries a date")
}

pub(crate) fn workspace(dir: &Path) -> Workspace {
    Workspace::create(&dir.join("ws"), "Test").unwrap()
}

pub(crate) fn chain(dir: &Path, n: usize) -> Vec<Loaded> {
    chain_of(dir, n, 60, 600)
}

pub(crate) fn chain_of(dir: &Path, n: usize, lines: usize, holds: usize) -> Vec<Loaded> {
    let cfg = SynthConfig::new(3, lines, holds);
    let mut rows = generate(&cfg);
    let mut cfg = cfg;
    let mut out = vec![synth(dir, "s0.xlsx", &rows, &cfg)];
    for i in 1..n {
        let (next, next_cfg, _) = evolve(&rows, &cfg, 50 + i as u64, 14);
        out.push(synth(dir, &format!("s{i}.xlsx"), &next, &next_cfg));
        rows = next;
        cfg = next_cfg;
    }
    out
}

pub(crate) fn distinct_states(files: &[&Loaded]) -> i64 {
    files
        .iter()
        .flat_map(|l| l.parsed.holds.iter().map(state_hash))
        .collect::<std::collections::HashSet<_>>()
        .len() as i64
}

pub(crate) fn import_plain(ws: &mut Workspace, loaded: &Loaded) -> SnapshotInfo {
    ws.import(loaded, taken_of(loaded), &ImportOptions::default())
        .unwrap()
}

/// The rollback journal SQLite keeps beside the database file at `path`.
pub(crate) fn journal_of(path: &Path) -> PathBuf {
    let mut journal = path.as_os_str().to_owned();
    journal.push("-journal");
    PathBuf::from(journal)
}

/// Copies the database at `path` to `copy` as a writer that died in the middle of a commit would
/// have left it: the file holds pages of an unfinished transaction and its journal lies beside
/// it. `insert` is a statement with one text parameter; it runs 3,000 times in a transaction
/// that is rolled back once the copy is made, so `path` ends as it started.
pub(crate) fn copy_with_hot_journal(path: &Path, copy: &Path, insert: &str) {
    let conn = Connection::open(path).unwrap();
    conn.execute_batch("PRAGMA cache_size = 5; BEGIN IMMEDIATE;")
        .unwrap();
    {
        let mut insert = conn.prepare(insert).unwrap();
        for n in 0..3000 {
            insert.execute([format!("spilled row {n:0>300}")]).unwrap();
        }
    }
    std::fs::copy(path, copy).unwrap();
    std::fs::copy(journal_of(path), journal_of(copy)).unwrap();
    conn.execute_batch("ROLLBACK;").unwrap();
    drop(conn);

    // The copy is only a fair test when SQLite refuses to read it without rolling it back.
    let reader = Connection::open_with_flags(copy, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    let refusal = reader
        .query_row("SELECT count(*) FROM sqlite_master", [], |r| {
            r.get::<_, i64>(0)
        })
        .unwrap_err();
    assert!(
        matches!(
            &refusal,
            rusqlite::Error::SqliteFailure(e, _)
                if e.extended_code == rusqlite::ffi::SQLITE_READONLY_ROLLBACK
        ),
        "the copy has no hot journal: {refusal}"
    );
}
