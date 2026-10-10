//! Storing one import as a snapshot and reading its holds back.

use std::collections::{BTreeMap, HashMap};

use chrono::{Local, NaiveDateTime};
use hx_core::dataset::Dataset;
use hx_core::fingerprint::state_hash;
use hx_core::import::SkippedRow;
use hx_core::load::Loaded;
use hx_core::mapping::ColumnMap;
use hx_core::model::Hold;
use hx_core::rules::RuleSet;
use hx_core::snapshot_date::{SnapshotDate, SnapshotSource};
use hx_core::warning::ImportWarning;
use rusqlite::{Connection, OptionalExtension, Row, TransactionBehavior};
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

/// A snapshot with everything the import review showed, apart from its holds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotDetail {
    /// The snapshot's summary.
    pub info: SnapshotInfo,
    /// The date the app detected, when the user replaced it.
    pub detected: Option<SnapshotDate>,
    /// The key/value pairs of the file's information sheet.
    pub info_sheet: BTreeMap<String, String>,
    /// The headers of the table that was imported, in column order.
    pub headers: Vec<String>,
    /// The column mapping that was used.
    pub mapping: ColumnMap,
    /// The rows that were left out of the import.
    pub skipped: Vec<SkippedRow>,
    /// The warnings the import gave.
    pub warnings: Vec<ImportWarning>,
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

const INFO_COLUMNS: &str =
    "id, taken_at, date_source, file_name, content_hash, imported_at, limited, row_count, open_count";

const INFO_ORDER: &str = "ORDER BY taken_at, imported_at, id";

fn info_from_row(row: &Row<'_>) -> Result<SnapshotInfo, StoreError> {
    let taken_at: String = row.get(1).map_err(database)?;
    let date_source: String = row.get(2).map_err(database)?;
    let imported_at: String = row.get(5).map_err(database)?;
    let row_count: i64 = row.get(7).map_err(database)?;
    let open_count: i64 = row.get(8).map_err(database)?;
    Ok(SnapshotInfo {
        id: row.get(0).map_err(database)?,
        taken_at: decode_time(&taken_at)?,
        date_source: source_from_text(&date_source)?,
        file_name: row.get(3).map_err(database)?,
        content_hash: row.get(4).map_err(database)?,
        imported_at: decode_time(&imported_at)?,
        limited: row.get::<_, i64>(6).map_err(database)? != 0,
        row_count: count_usize(row_count)?,
        open_count: count_usize(open_count)?,
    })
}

fn count_usize(n: i64) -> Result<usize, StoreError> {
    usize::try_from(n).map_err(|_| StoreError::Corrupt {
        detail: format!("a stored count ({n}) is negative"),
    })
}

fn from_json<T: serde::de::DeserializeOwned>(text: &str, what: &str) -> Result<T, StoreError> {
    serde_json::from_str(text).map_err(|e| StoreError::Corrupt {
        detail: format!("the {what} of a snapshot could not be read ({e})"),
    })
}

/// Deletes every row state that no snapshot lists. Set-based: the ids still in use go into a
/// temporary table, and one statement removes the rest.
fn remove_unused_row_states(conn: &Connection) -> Result<(), StoreError> {
    let mut used = std::collections::HashSet::new();
    {
        let mut lists = conn
            .prepare("SELECT rows FROM snapshot")
            .map_err(database)?;
        let mut rows = lists.query([]).map_err(database)?;
        while let Some(row) = rows.next().map_err(database)? {
            let blob: Vec<u8> = row.get(0).map_err(database)?;
            used.extend(decode_ids(&blob)?);
        }
    }
    conn.execute_batch(
        "DROP TABLE IF EXISTS temp.used_row_state; \
         CREATE TEMP TABLE used_row_state (id INTEGER PRIMARY KEY);",
    )
    .map_err(database)?;
    {
        let mut add = conn
            .prepare("INSERT INTO temp.used_row_state (id) VALUES (?1)")
            .map_err(database)?;
        for id in used {
            add.execute([id]).map_err(database)?;
        }
    }
    conn.execute_batch(
        "DELETE FROM row_state WHERE id NOT IN (SELECT id FROM temp.used_row_state); \
         DROP TABLE temp.used_row_state;",
    )
    .map_err(database)
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
        if options.replace.is_some() {
            remove_unused_row_states(&tx)?;
        }
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

    fn infos(
        &self,
        filter: &str,
        params: &[&dyn rusqlite::ToSql],
    ) -> Result<Vec<SnapshotInfo>, StoreError> {
        let mut query = self
            .conn
            .prepare_cached(&format!(
                "SELECT {INFO_COLUMNS} FROM snapshot {filter} {INFO_ORDER}"
            ))
            .map_err(database)?;
        let mut rows = query.query(params).map_err(database)?;
        let mut infos = Vec::new();
        while let Some(row) = rows.next().map_err(database)? {
            infos.push(info_from_row(row)?);
        }
        Ok(infos)
    }

    /// Every snapshot, oldest first: by date, then by time of import, then by id.
    pub fn snapshots(&self) -> Result<Vec<SnapshotInfo>, StoreError> {
        self.infos("", &[])
    }

    /// The newest snapshot by the same order, or `None` when there is none.
    pub fn latest(&self) -> Result<Option<SnapshotInfo>, StoreError> {
        Ok(self.snapshots()?.pop())
    }

    /// One snapshot, or `SnapshotNotFound`.
    pub fn snapshot(&self, snapshot_id: i64) -> Result<SnapshotInfo, StoreError> {
        self.infos("WHERE id = ?1", &[&snapshot_id])?
            .pop()
            .ok_or(StoreError::SnapshotNotFound { snapshot_id })
    }

    /// Snapshots dated on the same calendar day as `at`, oldest first.
    pub fn snapshots_on(&self, at: NaiveDateTime) -> Result<Vec<SnapshotInfo>, StoreError> {
        let day = encode_time(at).chars().take(10).collect::<String>();
        self.infos("WHERE substr(taken_at, 1, 10) = ?1", &[&day])
    }

    /// A snapshot with its information sheet, headers, mapping, skipped rows, and warnings.
    pub fn snapshot_detail(&self, snapshot_id: i64) -> Result<SnapshotDetail, StoreError> {
        let info = self.snapshot(snapshot_id)?;
        let (detected_at, detected_source, info_json, headers, mapping, skipped, warnings): (
            Option<String>,
            Option<String>,
            String,
            String,
            String,
            String,
            String,
        ) = self
            .conn
            .query_row(
                "SELECT detected_at, detected_source, info_json, headers_json, mapping_json, \
                 skipped_json, warnings_json FROM snapshot WHERE id = ?1",
                [snapshot_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                    ))
                },
            )
            .optional()
            .map_err(database)?
            .ok_or(StoreError::SnapshotNotFound { snapshot_id })?;
        let detected = match (optional_time(detected_at)?, detected_source) {
            (Some(at), Some(source)) => Some(SnapshotDate {
                at,
                source: source_from_text(&source)?,
            }),
            _ => None,
        };
        Ok(SnapshotDetail {
            info,
            detected,
            info_sheet: from_json(&info_json, "information sheet")?,
            headers: from_json(&headers, "headers")?,
            mapping: from_json(&mapping, "column mapping")?,
            skipped: from_json(&skipped, "skipped rows")?,
            warnings: from_json(&warnings, "warnings")?,
        })
    }

    /// Deletes a snapshot and the row states no other snapshot uses.
    pub fn delete_snapshot(&mut self, snapshot_id: i64) -> Result<(), StoreError> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database)?;
        let deleted = tx
            .execute("DELETE FROM snapshot WHERE id = ?1", [snapshot_id])
            .map_err(database)?;
        if deleted == 0 {
            return Err(StoreError::SnapshotNotFound { snapshot_id });
        }
        remove_unused_row_states(&tx)?;
        tx.commit().map_err(database)
    }

    /// Sets a date entered by the user. The first detected date is kept: when the snapshot had
    /// none and its date did not come from the user, the previous date becomes the detected one.
    pub fn set_snapshot_date(
        &mut self,
        snapshot_id: i64,
        at: NaiveDateTime,
    ) -> Result<SnapshotInfo, StoreError> {
        let user = source_text(SnapshotSource::User)?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database)?;
        let (taken_at, date_source, detected_at): (String, String, Option<String>) = tx
            .query_row(
                "SELECT taken_at, date_source, detected_at FROM snapshot WHERE id = ?1",
                [snapshot_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(database)?
            .ok_or(StoreError::SnapshotNotFound { snapshot_id })?;
        source_from_text(&date_source)?;
        if detected_at.is_none() && date_source != user {
            tx.execute(
                "UPDATE snapshot SET detected_at = ?2, detected_source = ?3 WHERE id = ?1",
                rusqlite::params![snapshot_id, taken_at, date_source],
            )
            .map_err(database)?;
        }
        tx.execute(
            "UPDATE snapshot SET taken_at = ?2, date_source = ?3 WHERE id = ?1",
            rusqlite::params![snapshot_id, encode_time(at), user],
        )
        .map_err(database)?;
        tx.commit().map_err(database)?;
        self.snapshot(snapshot_id)
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

    fn chain(dir: &Path, n: usize) -> Vec<Loaded> {
        let cfg = SynthConfig::new(3, 60, 600);
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

    fn distinct_states(files: &[&Loaded]) -> i64 {
        files
            .iter()
            .flat_map(|l| l.parsed.holds.iter().map(state_hash))
            .collect::<std::collections::HashSet<_>>()
            .len() as i64
    }

    fn import_plain(ws: &mut Workspace, loaded: &Loaded) -> SnapshotInfo {
        ws.import(loaded, taken_of(loaded), &ImportOptions::default())
            .unwrap()
    }

    #[test]
    fn snapshots_list_oldest_first_whatever_the_import_order() {
        let dir = tempfile::tempdir().unwrap();
        let files = chain(dir.path(), 3);
        let mut ws = workspace(dir.path());
        let second = import_plain(&mut ws, &files[1]);
        let first = import_plain(&mut ws, &files[0]);
        let third = import_plain(&mut ws, &files[2]);
        assert!(first.taken_at < second.taken_at && second.taken_at < third.taken_at);
        let listed = ws.snapshots().unwrap();
        assert_eq!(listed, vec![first.clone(), second.clone(), third.clone()]);
        assert_eq!(ws.latest().unwrap(), Some(third.clone()));
        assert_eq!(ws.snapshot(second.id).unwrap(), second);
    }

    #[test]
    fn latest_of_an_empty_workspace_is_none() {
        let dir = tempfile::tempdir().unwrap();
        let ws = workspace(dir.path());
        assert_eq!(ws.latest().unwrap(), None);
        assert!(ws.snapshots().unwrap().is_empty());
    }

    #[test]
    fn snapshots_of_the_same_date_list_by_import_time() {
        let dir = tempfile::tempdir().unwrap();
        let base = small(dir.path());
        let day = SnapshotDate {
            at: at(0),
            source: SnapshotSource::User,
        };
        let mut ws = workspace(dir.path());
        let mut ids = Vec::new();
        for n in 0..3 {
            let mut next = base.clone();
            next.content_hash = format!("bytes {n}");
            ids.push(ws.import(&next, day, &ImportOptions::default()).unwrap().id);
        }
        let listed: Vec<i64> = ws.snapshots().unwrap().iter().map(|s| s.id).collect();
        assert_eq!(listed, ids);
        assert_eq!(ws.latest().unwrap().unwrap().id, ids[2]);
    }

    #[test]
    fn snapshots_on_finds_every_snapshot_of_the_calendar_day() {
        let dir = tempfile::tempdir().unwrap();
        let base = small(dir.path());
        let day = |h, m, s, n| {
            NaiveDate::from_ymd_opt(2026, 9, 1)
                .and_then(|d| d.and_hms_nano_opt(h, m, s, n))
                .unwrap()
        };
        let mut ws = workspace(dir.path());
        let mut stored = Vec::new();
        for (n, when) in [day(0, 0, 0, 0), day(23, 59, 59, 999_999_999)]
            .into_iter()
            .enumerate()
        {
            let mut next = base.clone();
            next.content_hash = format!("bytes {n}");
            let taken = SnapshotDate {
                at: when,
                source: SnapshotSource::User,
            };
            stored.push(ws.import(&next, taken, &ImportOptions::default()).unwrap());
        }
        let mut other = base.clone();
        other.content_hash = "other day".into();
        let later = SnapshotDate {
            at: day(0, 0, 0, 0) + chrono::Duration::days(1),
            source: SnapshotSource::User,
        };
        ws.import(&other, later, &ImportOptions::default()).unwrap();

        assert_eq!(ws.snapshots_on(day(12, 0, 0, 0)).unwrap(), stored);
        assert_eq!(ws.snapshots_on(day(0, 0, 0, 1)).unwrap(), stored);
        assert_eq!(ws.snapshots_on(day(23, 0, 0, 0)).unwrap(), stored);
        let next_day = day(12, 0, 0, 0) + chrono::Duration::days(2);
        assert!(ws.snapshots_on(next_day).unwrap().is_empty());
    }

    #[test]
    fn snapshot_detail_returns_what_was_imported() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("messy.csv");
        std::fs::write(
            &path,
            "id,line_id,hold_remark,hold_type,date,released,release_date\n\
             1,L-1,fine,MISC.,2026-10-01 09:00:00,FALSE,\n\
             2,,no line,MISC.,2026-10-01 09:00:00,FALSE,\n\
             3,L-3,odd flag,MISC.,2026-10-01 09:00:00,maybe,\n\
             4,L-4,odd date,MISC.,2026-10-01 09:00:00,TRUE,soon\n",
        )
        .unwrap();
        let loaded = load_file(&path).unwrap();
        assert!(!loaded.parsed.skipped.is_empty());
        let kinds: Vec<_> = loaded.parsed.warnings.iter().map(|w| w.kind).collect();
        assert!(kinds.contains(&hx_core::warning::WarningKind::UnrecognizedReleased));
        assert!(kinds.contains(&hx_core::warning::WarningKind::UnreadableReleaseDate));
        assert!(!loaded.headers.is_empty());

        let mut ws = workspace(dir.path());
        let taken = loaded.snapshot.unwrap();
        let info = ws
            .import(&loaded, taken, &ImportOptions::default())
            .unwrap();
        let detail = ws.snapshot_detail(info.id).unwrap();
        assert_eq!(detail.info, info);
        assert_eq!(detail.detected, None);
        assert_eq!(detail.info_sheet, loaded.info);
        assert_eq!(detail.headers, loaded.headers);
        assert_eq!(detail.mapping, loaded.map);
        assert_eq!(detail.skipped, loaded.parsed.skipped);
        assert_eq!(detail.warnings, loaded.parsed.warnings);

        let user = SnapshotDate {
            at: at(0),
            source: SnapshotSource::User,
        };
        let mut again = loaded.clone();
        again.content_hash = "again".into();
        let info = ws.import(&again, user, &ImportOptions::default()).unwrap();
        assert_eq!(ws.snapshot_detail(info.id).unwrap().detected, Some(taken));
    }

    #[test]
    fn deleting_the_middle_snapshot_keeps_the_others_and_their_row_states() {
        let dir = tempfile::tempdir().unwrap();
        let files = chain(dir.path(), 3);
        let mut ws = workspace(dir.path());
        let a = import_plain(&mut ws, &files[0]);
        let b = import_plain(&mut ws, &files[1]);
        let c = import_plain(&mut ws, &files[2]);
        ws.delete_snapshot(b.id).unwrap();
        assert_eq!(ws.snapshots().unwrap(), vec![a.clone(), c.clone()]);
        assert_eq!(ws.holds(a.id).unwrap(), files[0].parsed.holds);
        assert_eq!(ws.holds(c.id).unwrap(), files[2].parsed.holds);
        assert_eq!(
            count(&ws, "row_state"),
            distinct_states(&[&files[0], &files[2]])
        );
        assert!(matches!(
            ws.snapshot(b.id),
            Err(StoreError::SnapshotNotFound { .. })
        ));
    }

    #[test]
    fn deleting_every_snapshot_empties_both_tables() {
        let dir = tempfile::tempdir().unwrap();
        let files = chain(dir.path(), 2);
        let mut ws = workspace(dir.path());
        let ids: Vec<i64> = files.iter().map(|f| import_plain(&mut ws, f).id).collect();
        for id in ids {
            ws.delete_snapshot(id).unwrap();
        }
        assert_eq!(count(&ws, "snapshot"), 0);
        assert_eq!(count(&ws, "row_state"), 0);
    }

    #[test]
    fn replacing_the_only_snapshot_drops_the_states_only_it_used() {
        let dir = tempfile::tempdir().unwrap();
        let files = chain(dir.path(), 2);
        let mut ws = workspace(dir.path());
        let old = import_plain(&mut ws, &files[0]);
        let new = ws
            .import(
                &files[1],
                taken_of(&files[1]),
                &ImportOptions {
                    replace: Some(old.id),
                },
            )
            .unwrap();
        assert_eq!(count(&ws, "row_state"), distinct_states(&[&files[1]]));
        assert_eq!(ws.holds(new.id).unwrap(), files[1].parsed.holds);
    }

    #[test]
    fn set_snapshot_date_keeps_the_first_detected_date_and_reorders() {
        let dir = tempfile::tempdir().unwrap();
        let files = chain(dir.path(), 2);
        let mut ws = workspace(dir.path());
        let first = import_plain(&mut ws, &files[0]);
        let second = import_plain(&mut ws, &files[1]);
        let original = taken_of(&files[0]);
        assert_eq!(original.source, SnapshotSource::InfoSheet);

        let moved = second.taken_at + chrono::Duration::days(3);
        let info = ws.set_snapshot_date(first.id, moved).unwrap();
        assert_eq!(info.taken_at, moved);
        assert_eq!(info.date_source, SnapshotSource::User);
        assert_eq!(ws.snapshot(first.id).unwrap(), info);
        assert_eq!(
            ws.snapshot_detail(first.id).unwrap().detected,
            Some(original)
        );
        let order: Vec<i64> = ws.snapshots().unwrap().iter().map(|s| s.id).collect();
        assert_eq!(order, vec![second.id, first.id]);
        assert_eq!(ws.latest().unwrap().unwrap().id, first.id);

        let again = ws.set_snapshot_date(first.id, at(5)).unwrap();
        assert_eq!(again.taken_at, at(5));
        assert_eq!(
            ws.snapshot_detail(first.id).unwrap().detected,
            Some(original)
        );
    }

    #[test]
    fn unknown_ids_are_not_found_by_every_method() {
        let dir = tempfile::tempdir().unwrap();
        let mut ws = workspace(dir.path());
        let missing = StoreError::SnapshotNotFound { snapshot_id: 9 };
        assert_eq!(ws.snapshot(9).unwrap_err(), missing);
        assert_eq!(ws.snapshot_detail(9).unwrap_err(), missing);
        assert_eq!(ws.delete_snapshot(9).unwrap_err(), missing);
        assert_eq!(ws.set_snapshot_date(9, at(0)).unwrap_err(), missing);
    }
}
