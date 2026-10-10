//! Helpers the tests of several modules share.

use std::path::Path;

use hx_core::fingerprint::state_hash;
use hx_core::load::{load_file, Loaded};
use hx_core::snapshot_date::SnapshotDate;
use hx_synth::{evolve, generate, write_workbook, SynthConfig, SynthRow};

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
