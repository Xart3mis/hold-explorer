//! Storing one import as a snapshot and reading its holds back.

use std::collections::{BTreeMap, HashMap};

use chrono::{Local, NaiveDateTime};
use hx_core::dataset::Dataset;
use hx_core::fingerprint::state_hash;
use hx_core::load::Loaded;
use hx_core::model::Hold;
use hx_core::rules::RuleSet;
use hx_core::snapshot_date::{SnapshotDate, SnapshotSource};
use rusqlite::{OptionalExtension, Row, TransactionBehavior};
use serde::{Deserialize, Serialize};

use crate::codec::{decode_ids, decode_time, encode_ids, encode_time};
use crate::error::{database, StoreError};
use crate::workspace::Workspace;

/// What the workspace knows about one snapshot, apart from its holds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotInfo {
    /// The snapshot's id in this workspace.
    pub id: i64,
    /// When the snapshot was taken.
    pub taken_at: NaiveDateTime,
    /// Where `taken_at` came from.
    pub date_source: SnapshotSource,
    /// The name the imported file had.
    pub file_name: String,
    /// Lower-case hex SHA-256 of the imported file's bytes.
    pub content_hash: String,
    /// When the file was imported, in local time.
    pub imported_at: NaiveDateTime,
    /// Whether the file lacked the `id` or `released` column.
    pub limited: bool,
    /// How many holds the snapshot has.
    pub row_count: usize,
    /// How many of them are not released.
    pub open_count: usize,
}

/// How an import treats an existing snapshot.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ImportOptions {
    /// Delete this snapshot in the same transaction, replacing it with the new one.
    pub replace: Option<i64>,
}

/// The stored text of a snapshot date source.
fn source_text(source: SnapshotSource) -> Result<String, StoreError> {
    match serde_json::to_value(source) {
        Ok(serde_json::Value::String(text)) => Ok(text),
        _ => Err(StoreError::Corrupt {
            detail: "a date source could not be saved".into(),
        }),
    }
}

fn source_from_text(text: &str) -> Result<SnapshotSource, StoreError> {
    serde_json::from_value(serde_json::Value::String(text.to_string())).map_err(|_| {
        StoreError::Corrupt {
            detail: format!("the stored date source \"{text}\" is not one this version knows"),
        }
    })
}

fn to_json<T: Serialize>(value: &T, what: &str) -> Result<String, StoreError> {
    serde_json::to_string(value).map_err(|e| StoreError::Corrupt {
        detail: format!("the {what} could not be saved ({e})"),
    })
}

fn count_i64(n: usize) -> i64 {
    i64::try_from(n).unwrap_or(i64::MAX)
}

fn optional_time(text: Option<String>) -> Result<Option<NaiveDateTime>, StoreError> {
    text.as_deref().map(decode_time).transpose()
}

const HOLD_COLUMNS: &str = "source_id, line_id, name, role, remark, hold_type, discipline, \
    created, released, release_remark, release_date, model_size, ldt_size, stress_calc, extra_json";

fn hold_from_row(row: &Row<'_>) -> Result<Hold, StoreError> {
    let extra_json: String = row.get(14).map_err(database)?;
    let extra: BTreeMap<String, String> =
        serde_json::from_str(&extra_json).map_err(|e| StoreError::Corrupt {
            detail: format!("the extra columns of a hold could not be read ({e})"),
        })?;
    Ok(Hold {
        source_id: row.get(0).map_err(database)?,
        line_id: row.get(1).map_err(database)?,
        name: row.get(2).map_err(database)?,
        role: row.get(3).map_err(database)?,
        remark: row.get(4).map_err(database)?,
        hold_type: row.get(5).map_err(database)?,
        discipline: row.get(6).map_err(database)?,
        created: optional_time(row.get(7).map_err(database)?)?,
        released: row.get::<_, i64>(8).map_err(database)? != 0,
        release_remark: row.get(9).map_err(database)?,
        release_date: optional_time(row.get(10).map_err(database)?)?,
        model_size: row.get(11).map_err(database)?,
        ldt_size: row.get(12).map_err(database)?,
        stress_calc: row.get(13).map_err(database)?,
        extra,
    })
}

impl Workspace {
    /// Stores `loaded` as a snapshot dated `taken`. Nothing is stored when it fails.
    ///
    /// The import is refused with `AlreadyImported` when a snapshot of the same file exists,
    /// unless that snapshot is the one `options.replace` names. A date the user typed keeps the
    /// date the file gave as the detected date.
    pub fn import(
        &mut self,
        loaded: &Loaded,
        taken: SnapshotDate,
        options: &ImportOptions,
    ) -> Result<SnapshotInfo, StoreError> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database)?;

        let existing: Option<(i64, String, String)> = tx
            .query_row(
                "SELECT id, taken_at, file_name FROM snapshot WHERE content_hash = ?1",
                [&loaded.content_hash],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(database)?;
        if let Some((snapshot_id, taken_at, file_name)) = existing {
            if options.replace != Some(snapshot_id) {
                return Err(StoreError::AlreadyImported {
                    snapshot_id,
                    taken_at: decode_time(&taken_at)?,
                    file_name,
                });
            }
        }
        if let Some(snapshot_id) = options.replace {
            let deleted = tx
                .execute("DELETE FROM snapshot WHERE id = ?1", [snapshot_id])
                .map_err(database)?;
            if deleted == 0 {
                return Err(StoreError::SnapshotNotFound { snapshot_id });
            }
        }

        let holds = &loaded.parsed.holds;
        let mut ids = Vec::with_capacity(holds.len());
        {
            let mut find = tx
                .prepare("SELECT id FROM row_state WHERE hash = ?1")
                .map_err(database)?;
            let mut insert = tx
                .prepare(&format!(
                    "INSERT INTO row_state (hash, {HOLD_COLUMNS}) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)"
                ))
                .map_err(database)?;
            let mut seen: HashMap<[u8; 32], i64> = HashMap::new();
            for hold in holds {
                let hash = state_hash(hold);
                if let Some(&id) = seen.get(&hash) {
                    ids.push(id);
                    continue;
                }
                let stored: Option<i64> = find
                    .query_row([hash.as_slice()], |r| r.get(0))
                    .optional()
                    .map_err(database)?;
                let id = match stored {
                    Some(id) => id,
                    None => {
                        insert
                            .execute(rusqlite::params![
                                hash.as_slice(),
                                hold.source_id,
                                hold.line_id,
                                hold.name,
                                hold.role,
                                hold.remark,
                                hold.hold_type,
                                hold.discipline,
                                hold.created.map(encode_time),
                                hold.released,
                                hold.release_remark,
                                hold.release_date.map(encode_time),
                                hold.model_size,
                                hold.ldt_size,
                                hold.stress_calc,
                                to_json(&hold.extra, "extra columns of a hold")?,
                            ])
                            .map_err(database)?;
                        tx.last_insert_rowid()
                    }
                };
                seen.insert(hash, id);
                ids.push(id);
            }
        }

        let detected = match (taken.source, loaded.snapshot) {
            (SnapshotSource::User, Some(detected)) => Some(detected),
            _ => None,
        };
        let open_count = holds.iter().filter(|h| !h.released).count();
        let imported_at = Local::now().naive_local();
        tx.execute(
            "INSERT INTO snapshot (taken_at, date_source, detected_at, detected_source, file_name, \
             content_hash, imported_at, limited, row_count, open_count, info_json, headers_json, \
             mapping_json, skipped_json, warnings_json, rows) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            rusqlite::params![
                encode_time(taken.at),
                source_text(taken.source)?,
                detected.map(|d| encode_time(d.at)),
                detected.map(|d| source_text(d.source)).transpose()?,
                loaded.file_name,
                loaded.content_hash,
                encode_time(imported_at),
                loaded.parsed.limited,
                count_i64(holds.len()),
                count_i64(open_count),
                to_json(&loaded.info, "information sheet")?,
                to_json(&loaded.headers, "headers")?,
                to_json(&loaded.map, "column mapping")?,
                to_json(&loaded.parsed.skipped, "skipped rows")?,
                to_json(&loaded.parsed.warnings, "warnings")?,
                encode_ids(&ids),
            ],
        )
        .map_err(database)?;
        let id = tx.last_insert_rowid();
        tx.commit().map_err(database)?;

        Ok(SnapshotInfo {
            id,
            taken_at: taken.at,
            date_source: taken.source,
            file_name: loaded.file_name.clone(),
            content_hash: loaded.content_hash.clone(),
            imported_at,
            limited: loaded.parsed.limited,
            row_count: holds.len(),
            open_count,
        })
    }

    /// The snapshot's id list, or `SnapshotNotFound`.
    fn row_ids(&self, snapshot_id: i64) -> Result<Vec<i64>, StoreError> {
        let rows: Option<Vec<u8>> = self
            .conn
            .query_row(
                "SELECT rows FROM snapshot WHERE id = ?1",
                [snapshot_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(database)?;
        decode_ids(&rows.ok_or(StoreError::SnapshotNotFound { snapshot_id })?)
    }

    /// The holds of a snapshot, in file order.
    pub fn holds(&self, snapshot_id: i64) -> Result<Vec<Hold>, StoreError> {
        let ids = self.row_ids(snapshot_id)?;
        let mut find = self
            .conn
            .prepare_cached(&format!(
                "SELECT {HOLD_COLUMNS} FROM row_state WHERE id = ?1"
            ))
            .map_err(database)?;
        let mut by_id: HashMap<i64, Hold> = HashMap::new();
        let mut holds = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(hold) = by_id.get(&id) {
                holds.push(hold.clone());
                continue;
            }
            let mut rows = find.query([id]).map_err(database)?;
            let row = rows
                .next()
                .map_err(database)?
                .ok_or_else(|| StoreError::Corrupt {
                    detail: format!(
                        "a snapshot refers to the hold state {id}, which is not stored"
                    ),
                })?;
            let hold = hold_from_row(row)?;
            by_id.insert(id, hold.clone());
            holds.push(hold);
        }
        Ok(holds)
    }

    /// The snapshot's holds as a dataset dated by the snapshot.
    pub fn dataset(&self, snapshot_id: i64, rules: &RuleSet) -> Result<Dataset, StoreError> {
        let (taken_at, date_source): (String, String) = self
            .conn
            .query_row(
                "SELECT taken_at, date_source FROM snapshot WHERE id = ?1",
                [snapshot_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(database)?
            .ok_or(StoreError::SnapshotNotFound { snapshot_id })?;
        source_from_text(&date_source)?;
        let holds = self.holds(snapshot_id)?;
        Ok(Dataset::build(holds, rules, decode_time(&taken_at)?))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::Path;

    use chrono::{NaiveDate, NaiveDateTime};
    use hx_core::dataset::Dataset;
    use hx_core::load::{load_file, Loaded};
    use hx_core::model::Hold;
    use hx_core::rules::RuleSet;
    use hx_core::snapshot_date::{SnapshotDate, SnapshotSource};
    use hx_synth::{evolve, generate, write_workbook, SynthConfig, SynthRow};

    use super::*;
    use crate::{StoreError, Workspace};

    fn synth(dir: &Path, name: &str, rows: &[SynthRow], cfg: &SynthConfig) -> Loaded {
        let path = dir.join(name);
        write_workbook(rows, cfg, &path).unwrap();
        load_file(&path).unwrap()
    }

    fn taken_of(loaded: &Loaded) -> SnapshotDate {
        loaded.snapshot.expect("the synthetic file carries a date")
    }

    fn workspace(dir: &Path) -> Workspace {
        Workspace::create(&dir.join("ws"), "Test").unwrap()
    }

    fn count(ws: &Workspace, table: &str) -> i64 {
        ws.conn
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    fn at(nanos: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 9, 1)
            .and_then(|d| d.and_hms_nano_opt(8, 30, 15, nanos))
            .unwrap()
    }

    fn small(dir: &Path) -> Loaded {
        let cfg = SynthConfig::new(7, 5, 20);
        synth(dir, "small.xlsx", &generate(&cfg), &cfg)
    }

    fn hand_built(base: &Loaded, hash: &str, holds: Vec<Hold>) -> Loaded {
        let mut loaded = base.clone();
        loaded.content_hash = hash.to_string();
        loaded.parsed.holds = holds;
        loaded
    }

    #[test]
    fn imports_two_thousand_rows_and_reads_them_back() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = SynthConfig::new(1, 200, 2000);
        let loaded = synth(dir.path(), "big.xlsx", &generate(&cfg), &cfg);
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        assert_eq!(info.row_count, 2000);
        let open = loaded.parsed.holds.iter().filter(|h| !h.released).count();
        assert_eq!(info.open_count, open);
        assert_eq!(info.file_name, loaded.file_name);
        assert_eq!(info.content_hash, loaded.content_hash);
        assert_eq!(info.limited, loaded.parsed.limited);
        assert_eq!(info.taken_at, taken_of(&loaded).at);
        assert_eq!(ws.holds(info.id).unwrap(), loaded.parsed.holds);
    }

    #[test]
    fn a_hold_with_every_field_comes_back_equal() {
        let dir = tempfile::tempdir().unwrap();
        let base = small(dir.path());
        let mut extra = BTreeMap::new();
        extra.insert("Zone".to_string(), "North \"A\"\nline 2".to_string());
        extra.insert("Ünï".to_string(), String::new());
        let holds = vec![
            Hold {
                source_id: Some(42),
                line_id: "L-1".into(),
                name: "Ann".into(),
                role: "Lead".into(),
                remark: "Waiting for stress".into(),
                hold_type: "Design".into(),
                discipline: "Stress".into(),
                created: Some(at(123_456_789)),
                released: false,
                release_remark: String::new(),
                release_date: None,
                model_size: Some(0.75),
                ldt_size: None,
                stress_calc: "SC-1".into(),
                extra,
            },
            Hold {
                source_id: None,
                line_id: "L-2".into(),
                remark: String::new(),
                released: true,
                release_remark: "Done".into(),
                release_date: Some(at(1)),
                created: None,
                ..Hold::default()
            },
        ];
        let loaded = hand_built(&base, "every-field", holds.clone());
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        assert_eq!(ws.holds(info.id).unwrap(), holds);
    }

    #[test]
    fn sizes_come_back_bit_for_bit() {
        let dir = tempfile::tempdir().unwrap();
        let base = small(dir.path());
        let sizes = [
            0.1 + 0.2,
            f64::MIN_POSITIVE,
            1e308,
            -3.5,
            0.75,
            f64::MAX,
            5e-324,
        ];
        let holds: Vec<Hold> = sizes
            .iter()
            .enumerate()
            .map(|(i, &size)| Hold {
                line_id: format!("L{i}"),
                model_size: Some(size),
                ldt_size: Some(-size),
                ..Hold::default()
            })
            .collect();
        let loaded = hand_built(&base, "sizes", holds.clone());
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        let back = ws.holds(info.id).unwrap();
        for (want, got) in holds.iter().zip(&back) {
            assert_eq!(
                want.model_size.unwrap().to_bits(),
                got.model_size.unwrap().to_bits(),
                "model_size {:?}",
                want.model_size
            );
            assert_eq!(
                want.ldt_size.unwrap().to_bits(),
                got.ldt_size.unwrap().to_bits(),
                "ldt_size {:?}",
                want.ldt_size
            );
        }
    }

    #[test]
    fn negative_zero_reads_back_equal_as_positive_zero() {
        let dir = tempfile::tempdir().unwrap();
        let base = small(dir.path());
        let holds = vec![Hold {
            line_id: "L".into(),
            model_size: Some(-0.0),
            ldt_size: Some(-0.0),
            ..Hold::default()
        }];
        let loaded = hand_built(&base, "neg-zero", holds.clone());
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        let back = ws.holds(info.id).unwrap();
        assert_eq!(back, holds);
        assert_eq!(back[0].model_size.unwrap().to_bits(), 0.0f64.to_bits());
        assert_eq!(back[0].ldt_size.unwrap().to_bits(), 0.0f64.to_bits());
    }

    #[test]
    fn holds_that_differ_only_in_the_sign_of_a_zero_size_share_a_row_state() {
        let dir = tempfile::tempdir().unwrap();
        let base = small(dir.path());
        let hold = |size: f64| Hold {
            line_id: "L".into(),
            model_size: Some(size),
            ldt_size: Some(size),
            ..Hold::default()
        };
        let loaded = hand_built(&base, "two-zeros", vec![hold(0.0), hold(-0.0)]);
        let mut ws = workspace(dir.path());
        ws.import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        assert_eq!(count(&ws, "row_state"), 1);
    }

    #[test]
    fn importing_the_same_file_twice_is_refused_and_changes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = small(dir.path());
        let mut ws = workspace(dir.path());
        let first = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        let states = count(&ws, "row_state");
        let error = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap_err();
        match error {
            StoreError::AlreadyImported {
                snapshot_id,
                taken_at,
                file_name,
            } => {
                assert_eq!(snapshot_id, first.id);
                assert_eq!(taken_at, first.taken_at);
                assert_eq!(file_name, first.file_name);
            }
            other => panic!("{other}"),
        }
        assert_eq!(count(&ws, "snapshot"), 1);
        assert_eq!(count(&ws, "row_state"), states);
    }

    #[test]
    fn five_hundred_identical_rows_store_one_row_state() {
        let dir = tempfile::tempdir().unwrap();
        let base = small(dir.path());
        let hold = Hold {
            source_id: Some(1),
            line_id: "L".into(),
            remark: "same".into(),
            ..Hold::default()
        };
        let holds = vec![hold; 500];
        let loaded = hand_built(&base, "identical", holds.clone());
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        assert_eq!(info.row_count, 500);
        assert_eq!(ws.holds(info.id).unwrap(), holds);
        assert_eq!(count(&ws, "row_state"), 1);
    }

    #[test]
    fn the_next_snapshot_adds_only_new_and_changed_row_states() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = SynthConfig::new(3, 100, 1500);
        let rows = generate(&cfg);
        let first = synth(dir.path(), "a.xlsx", &rows, &cfg);
        let (rows2, cfg2, evolution) = evolve(&rows, &cfg, 99, 14);
        let second = synth(dir.path(), "b.xlsx", &rows2, &cfg2);
        let mut ws = workspace(dir.path());
        ws.import(&first, taken_of(&first), &ImportOptions::default())
            .unwrap();
        let before = count(&ws, "row_state");
        let info = ws
            .import(&second, taken_of(&second), &ImportOptions::default())
            .unwrap();
        let grown = count(&ws, "row_state") - before;
        let changed = (evolution.added + evolution.edited + evolution.released) as i64;
        assert!(changed > 0);
        assert!(grown <= changed, "grew by {grown}, changed {changed}");
        assert_eq!(ws.holds(info.id).unwrap(), second.parsed.holds);
    }

    #[test]
    fn replace_swaps_the_old_snapshot_for_the_new_one() {
        let dir = tempfile::tempdir().unwrap();
        let first = small(dir.path());
        let mut other = first.clone();
        other.content_hash = "different bytes".into();
        let mut ws = workspace(dir.path());
        let old = ws
            .import(&first, taken_of(&first), &ImportOptions::default())
            .unwrap();
        let new = ws
            .import(
                &other,
                taken_of(&other),
                &ImportOptions {
                    replace: Some(old.id),
                },
            )
            .unwrap();
        assert_eq!(count(&ws, "snapshot"), 1);
        assert_ne!(new.id, old.id);
        assert!(matches!(
            ws.holds(old.id),
            Err(StoreError::SnapshotNotFound { .. })
        ));
        assert!(matches!(
            ws.dataset(old.id, RuleSet::builtin()),
            Err(StoreError::SnapshotNotFound { .. })
        ));
        let hashes: Vec<String> = ws
            .conn
            .prepare("SELECT content_hash FROM snapshot")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(hashes, vec!["different bytes".to_string()]);
        assert_eq!(ws.holds(new.id).unwrap(), other.parsed.holds);
    }

    #[test]
    fn ids_of_deleted_snapshots_are_never_reused() {
        let dir = tempfile::tempdir().unwrap();
        let first = small(dir.path());
        let mut ws = workspace(dir.path());
        let mut used = vec![
            ws.import(&first, taken_of(&first), &ImportOptions::default())
                .unwrap()
                .id,
        ];
        for n in 0..3 {
            let mut next = first.clone();
            next.content_hash = format!("bytes {n}");
            let newest = *used.last().unwrap();
            let id = ws
                .import(
                    &next,
                    taken_of(&next),
                    &ImportOptions {
                        replace: Some(newest),
                    },
                )
                .unwrap()
                .id;
            assert!(used.iter().all(|&earlier| id > earlier), "{id} in {used:?}");
            used.push(id);
        }
    }

    #[test]
    fn replacing_a_snapshot_with_the_same_file_is_allowed() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = small(dir.path());
        let mut ws = workspace(dir.path());
        let old = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        let new = ws
            .import(
                &loaded,
                taken_of(&loaded),
                &ImportOptions {
                    replace: Some(old.id),
                },
            )
            .unwrap();
        assert_eq!(count(&ws, "snapshot"), 1);
        assert_eq!(ws.holds(new.id).unwrap(), loaded.parsed.holds);
    }

    #[test]
    fn every_date_source_round_trips_through_its_text() {
        for source in [
            SnapshotSource::InfoSheet,
            SnapshotSource::FileName,
            SnapshotSource::FileTime,
            SnapshotSource::User,
        ] {
            assert_eq!(
                source_from_text(&source_text(source).unwrap()).unwrap(),
                source
            );
        }
        assert!(matches!(
            source_from_text("Telepathy"),
            Err(StoreError::Corrupt { .. })
        ));
    }

    #[test]
    fn a_failure_after_the_writes_changes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = SynthConfig::new(5, 50, 600);
        let rows = generate(&cfg);
        let first = synth(dir.path(), "a.xlsx", &rows, &cfg);
        let (rows2, cfg2, _) = evolve(&rows, &cfg, 11, 14);
        let second = synth(dir.path(), "b.xlsx", &rows2, &cfg2);
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&first, taken_of(&first), &ImportOptions::default())
            .unwrap();
        let (snapshots, states) = (count(&ws, "snapshot"), count(&ws, "row_state"));
        ws.conn
            .execute_batch(
                "CREATE TRIGGER refuse BEFORE INSERT ON snapshot \
                 BEGIN SELECT RAISE(ABORT, 'refused'); END;",
            )
            .unwrap();
        let result = ws.import(
            &second,
            taken_of(&second),
            &ImportOptions {
                replace: Some(info.id),
            },
        );
        assert!(
            matches!(result, Err(StoreError::Database { .. })),
            "{result:?}"
        );
        assert_eq!(count(&ws, "snapshot"), snapshots);
        assert_eq!(count(&ws, "row_state"), states);
        assert_eq!(ws.holds(info.id).unwrap(), first.parsed.holds);
    }

    #[test]
    fn replace_of_an_unknown_id_stores_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let first = small(dir.path());
        let mut other = first.clone();
        other.content_hash = "different bytes".into();
        let mut ws = workspace(dir.path());
        ws.import(&first, taken_of(&first), &ImportOptions::default())
            .unwrap();
        let (snapshots, states) = (count(&ws, "snapshot"), count(&ws, "row_state"));
        let error = ws
            .import(
                &other,
                taken_of(&other),
                &ImportOptions { replace: Some(999) },
            )
            .unwrap_err();
        assert_eq!(error, StoreError::SnapshotNotFound { snapshot_id: 999 });
        assert_eq!(count(&ws, "snapshot"), snapshots);
        assert_eq!(count(&ws, "row_state"), states);
    }

    #[test]
    fn a_date_from_the_user_keeps_the_detected_date() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = small(dir.path());
        let detected = taken_of(&loaded);
        let user = SnapshotDate {
            at: at(0),
            source: SnapshotSource::User,
        };
        let mut ws = workspace(dir.path());
        let info = ws.import(&loaded, user, &ImportOptions::default()).unwrap();
        assert_eq!(info.taken_at, user.at);
        assert_eq!(info.date_source, SnapshotSource::User);
        let (detected_at, detected_source): (Option<String>, Option<String>) = ws
            .conn
            .query_row(
                "SELECT detected_at, detected_source FROM snapshot WHERE id = ?1",
                [info.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            crate::codec::decode_time(&detected_at.unwrap()).unwrap(),
            detected.at
        );
        assert_eq!(
            detected_source.unwrap(),
            source_text(detected.source).unwrap()
        );
    }

    #[test]
    fn a_detected_date_is_not_stored_twice() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = small(dir.path());
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        let detected: Option<String> = ws
            .conn
            .query_row(
                "SELECT detected_at FROM snapshot WHERE id = ?1",
                [info.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(detected, None);
    }

    #[test]
    fn the_dataset_equals_a_dataset_built_from_the_imported_holds() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = small(dir.path());
        let taken = taken_of(&loaded);
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken, &ImportOptions::default())
            .unwrap();
        let built = Dataset::build(loaded.parsed.holds.clone(), RuleSet::builtin(), taken.at);
        assert_eq!(ws.dataset(info.id, RuleSet::builtin()).unwrap(), built);
    }

    #[test]
    fn an_unknown_snapshot_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let ws = workspace(dir.path());
        assert_eq!(
            ws.holds(5).unwrap_err(),
            StoreError::SnapshotNotFound { snapshot_id: 5 }
        );
        assert_eq!(
            ws.dataset(5, RuleSet::builtin()).unwrap_err(),
            StoreError::SnapshotNotFound { snapshot_id: 5 }
        );
    }

    #[test]
    fn a_missing_row_state_is_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = small(dir.path());
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        ws.conn.execute("DELETE FROM row_state", []).unwrap();
        assert!(matches!(ws.holds(info.id), Err(StoreError::Corrupt { .. })));
    }

    #[test]
    fn an_unknown_stored_date_source_is_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = small(dir.path());
        let mut ws = workspace(dir.path());
        let info = ws
            .import(&loaded, taken_of(&loaded), &ImportOptions::default())
            .unwrap();
        ws.conn
            .execute("UPDATE snapshot SET date_source = 'Telepathy'", [])
            .unwrap();
        assert!(matches!(
            ws.dataset(info.id, RuleSet::builtin()),
            Err(StoreError::Corrupt { .. })
        ));
    }
}
