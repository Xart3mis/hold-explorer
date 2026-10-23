//! A description of what a workspace stores that does not depend on the order of imports.

use std::fmt::Write;

use rusqlite::OptionalExtension;

use crate::codec::{decode_ids, encode_time};
use crate::error::{database, StoreError};
use crate::snapshot::source_text;
use crate::workspace::Workspace;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// A description of everything stored that does not depend on row ids or import times.
///
/// Plain text, one item per line: per snapshot (ordered by date, then content hash) its date,
/// date source, file name, content hash, counts, and the state hashes of its rows in order; then
/// the sorted set of all stored state hashes, in lower-case hex. Two workspaces that were given
/// the same snapshots, in whatever order, have equal dumps.
pub fn logical_dump(workspace: &Workspace) -> Result<String, StoreError> {
    let mut snapshots = workspace.snapshots()?;
    snapshots.sort_by(|a, b| (a.taken_at, &a.content_hash).cmp(&(b.taken_at, &b.content_hash)));
    let mut hash_of = workspace
        .conn
        .prepare("SELECT hash FROM row_state WHERE id = ?1")
        .map_err(database)?;
    let mut out = String::new();
    for info in &snapshots {
        let rows: Vec<u8> = workspace
            .conn
            .query_row("SELECT rows FROM snapshot WHERE id = ?1", [info.id], |r| {
                r.get(0)
            })
            .map_err(database)?;
        let _ = writeln!(
            out,
            "snapshot {} {} {:?} {} limited={} rows={} open={}",
            encode_time(info.taken_at),
            source_text(info.date_source)?,
            info.file_name,
            info.content_hash,
            info.limited,
            info.row_count,
            info.open_count,
        );
        for id in decode_ids(&rows)? {
            let hash: Option<Vec<u8>> = hash_of
                .query_row([id], |r| r.get(0))
                .optional()
                .map_err(database)?;
            let hash = hash.ok_or_else(|| StoreError::Corrupt {
                detail: format!("a snapshot refers to the hold state {id}, which is not stored"),
            })?;
            let _ = writeln!(out, "  {}", hex(&hash));
        }
    }
    let mut all = workspace
        .conn
        .prepare("SELECT hash FROM row_state ORDER BY hash")
        .map_err(database)?;
    let hashes = all
        .query_map([], |r| r.get::<_, Vec<u8>>(0))
        .map_err(database)?;
    out.push_str("states\n");
    for hash in hashes {
        let _ = writeln!(out, "  {}", hex(&hash.map_err(database)?));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use hx_core::load::Loaded;

    use crate::test_support::{chain_of, distinct_states, import_plain, workspace};
    use crate::{logical_dump, Workspace};

    /// Orders of the four snapshots 0 (oldest) to 3 (newest); between them they start with each.
    const ORDERS: [[usize; 4]; 6] = [
        [0, 1, 2, 3],
        [3, 2, 1, 0],
        [1, 3, 0, 2],
        [2, 0, 3, 1],
        [1, 0, 3, 2],
        [3, 0, 2, 1],
    ];

    fn four(dir: &std::path::Path) -> Vec<Loaded> {
        let files = chain_of(dir, 4, 150, 1500);
        assert!(files.iter().map(|f| f.parsed.holds.len()).max().unwrap() >= 1500);
        files
    }

    fn imported(dir: &std::path::Path, name: &str, files: &[Loaded], order: &[usize]) -> Workspace {
        let mut ws = Workspace::create(&dir.join(name), "Test").unwrap();
        for &i in order {
            import_plain(&mut ws, &files[i]);
        }
        ws
    }

    #[test]
    fn six_import_orders_give_the_same_dump_and_the_same_holds() {
        let dir = tempfile::tempdir().unwrap();
        let files = four(dir.path());
        let mut dumps = Vec::new();
        for (n, order) in ORDERS.iter().enumerate() {
            let ws = imported(dir.path(), &format!("order{n}"), &files, order);
            for file in &files {
                let info = ws
                    .snapshots()
                    .unwrap()
                    .into_iter()
                    .find(|s| s.content_hash == file.content_hash)
                    .unwrap();
                assert_eq!(
                    ws.holds(info.id).unwrap(),
                    file.parsed.holds,
                    "order {order:?}"
                );
            }
            dumps.push(logical_dump(&ws).unwrap());
        }
        assert!(dumps.iter().all(|d| d == &dumps[0]));
        assert!(!dumps[0].is_empty());
    }

    #[test]
    fn row_states_are_the_distinct_holds_and_stay_few() {
        let dir = tempfile::tempdir().unwrap();
        let files = four(dir.path());
        let ws = imported(dir.path(), "ws", &files, &[0, 1, 2, 3]);
        let stored: i64 = ws
            .conn
            .query_row("SELECT count(*) FROM row_state", [], |r| r.get(0))
            .unwrap();
        let all: Vec<&Loaded> = files.iter().collect();
        assert_eq!(stored, distinct_states(&all));
        let largest = files.iter().map(|f| f.parsed.holds.len()).max().unwrap();
        assert!(
            (stored as f64) < 1.25 * largest as f64,
            "{stored} vs {largest}"
        );
    }

    #[test]
    fn delete_and_reimport_gives_the_dump_of_never_deleting() {
        let dir = tempfile::tempdir().unwrap();
        let files = four(dir.path());
        let untouched = imported(dir.path(), "plain", &files, &[0, 1, 2, 3]);
        let mut ws = imported(dir.path(), "churn", &files, &[0, 1, 2, 3]);
        let victim = ws.snapshots().unwrap()[1].id;
        ws.delete_snapshot(victim).unwrap();
        assert_ne!(
            logical_dump(&ws).unwrap(),
            logical_dump(&untouched).unwrap()
        );
        import_plain(&mut ws, &files[1]);
        assert_eq!(
            logical_dump(&ws).unwrap(),
            logical_dump(&untouched).unwrap()
        );
    }

    #[test]
    fn four_snapshots_take_less_than_four_times_the_first() {
        let dir = tempfile::tempdir().unwrap();
        let files = four(dir.path());
        let mut ws = workspace(dir.path());
        import_plain(&mut ws, &files[0]);
        let path = ws.info().unwrap().path;
        let one = std::fs::metadata(&path).unwrap().len();
        for file in &files[1..] {
            import_plain(&mut ws, file);
        }
        let four = std::fs::metadata(&path).unwrap().len();
        assert!(four < 4 * one, "{four} vs {one}");
    }

    #[test]
    fn the_dump_leaves_out_ids_and_import_times() {
        let dir = tempfile::tempdir().unwrap();
        let files = four(dir.path());
        let ws = imported(dir.path(), "ws", &files, &[0, 1]);
        let dump = logical_dump(&ws).unwrap();
        let info = ws.snapshots().unwrap().remove(0);
        assert!(dump.contains(&info.content_hash));
        assert!(dump.contains(&info.file_name));
        assert!(!dump.contains(&info.imported_at.format("%Y-%m-%dT%H:%M:%S").to_string()));
    }

    #[test]
    fn saved_views_are_not_part_of_the_dump() {
        let dir = tempfile::tempdir().unwrap();
        let files = four(dir.path());
        let mut ws = imported(dir.path(), "views", &files, &[0, 1]);
        let before = logical_dump(&ws).unwrap();
        ws.set_saved_views(&[crate::SavedView {
            id: 1,
            name: "A".into(),
            address: "/lines".into(),
            filters: hx_core::filter::FilterSpec::default(),
        }])
        .unwrap();
        assert_eq!(logical_dump(&ws).unwrap(), before);
    }
}
