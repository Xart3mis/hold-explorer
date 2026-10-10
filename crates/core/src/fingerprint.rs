//! The content hash of a hold row: what "the same row" means to the store.
//!
//! The store keeps each distinct row once, addressed by [`state_hash`]. Two machines and two
//! versions of the app must agree on the hash, so the encoding is versioned
//! ([`STATE_HASH_VERSION`]) and a test pins the hash of a fixed hold.

use chrono::NaiveDateTime;
use sha2::{Digest, Sha256};

use crate::model::Hold;

/// Version of the canonical encoding. Changing the encoding requires a new version.
pub const STATE_HASH_VERSION: u32 = 1;

/// SHA-256 over the canonical encoding of every field of the hold. A size equal to zero, of
/// either sign, is encoded as `0.0`, so holds that compare equal hash equal.
pub fn state_hash(hold: &Hold) -> [u8; 32] {
    Sha256::digest(canonical_bytes(hold)).into()
}

/// The canonical encoding itself, for tests and debugging: the version, then every field of
/// the hold in declaration order. Text is prefixed by its byte length, an optional value by a
/// presence byte, a timestamp is whole seconds since the Unix epoch plus nanoseconds, a size is
/// its `f64` bit pattern (a zero of either sign is encoded as `0.0`), and `extra` is its entry count followed by its entries in key order.
/// Numbers are little-endian.
pub fn canonical_bytes(hold: &Hold) -> Vec<u8> {
    let mut out = Vec::with_capacity(256);
    out.extend_from_slice(&STATE_HASH_VERSION.to_le_bytes());
    put_option(&mut out, hold.source_id, |out, id| {
        out.extend_from_slice(&id.to_le_bytes());
    });
    put_text(&mut out, &hold.line_id);
    put_text(&mut out, &hold.name);
    put_text(&mut out, &hold.role);
    put_text(&mut out, &hold.remark);
    put_text(&mut out, &hold.hold_type);
    put_text(&mut out, &hold.discipline);
    put_option(&mut out, hold.created, put_time);
    out.push(u8::from(hold.released));
    put_text(&mut out, &hold.release_remark);
    put_option(&mut out, hold.release_date, put_time);
    put_option(&mut out, hold.model_size, put_size);
    put_option(&mut out, hold.ldt_size, put_size);
    put_text(&mut out, &hold.stress_calc);
    out.extend_from_slice(&(hold.extra.len() as u64).to_le_bytes());
    for (key, value) in &hold.extra {
        put_text(&mut out, key);
        put_text(&mut out, value);
    }
    out
}

fn put_text(out: &mut Vec<u8>, text: &str) {
    out.extend_from_slice(&(text.len() as u64).to_le_bytes());
    out.extend_from_slice(text.as_bytes());
}

fn put_option<T>(out: &mut Vec<u8>, value: Option<T>, put: impl FnOnce(&mut Vec<u8>, T)) {
    match value {
        None => out.push(0),
        Some(value) => {
            out.push(1);
            put(out, value);
        }
    }
}

fn put_time(out: &mut Vec<u8>, time: NaiveDateTime) {
    let utc = time.and_utc();
    out.extend_from_slice(&utc.timestamp().to_le_bytes());
    out.extend_from_slice(&utc.timestamp_subsec_nanos().to_le_bytes());
}

fn put_size(out: &mut Vec<u8>, size: f64) {
    let size = if size == 0.0 { 0.0 } else { size };
    out.extend_from_slice(&size.to_bits().to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{NaiveDate, NaiveDateTime};
    use std::collections::{BTreeMap, HashSet};

    fn ts(nanos: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 9, 29)
            .and_then(|d| d.and_hms_nano_opt(13, 16, 5, nanos))
            .expect("constant timestamp is valid")
    }

    fn full() -> Hold {
        Hold {
            source_id: Some(42),
            line_id: "L-100".into(),
            name: "Ann".into(),
            role: "Lead".into(),
            remark: "Waiting for vendor data".into(),
            hold_type: "Design".into(),
            discipline: "Piping".into(),
            created: Some(ts(123_456_789)),
            released: true,
            release_remark: "Done".into(),
            release_date: Some(ts(5)),
            model_size: Some(4.0),
            ldt_size: Some(6.0),
            stress_calc: "SC-1".into(),
            extra: BTreeMap::from([("Area".to_string(), "North".to_string())]),
        }
    }

    #[test]
    fn the_sign_of_a_zero_size_does_not_change_the_hash() {
        let with = |model: f64, ldt: f64| Hold {
            model_size: Some(model),
            ldt_size: Some(ldt),
            ..full()
        };
        assert_eq!(with(0.0, 0.0), with(-0.0, -0.0));
        assert_eq!(state_hash(&with(0.0, 0.0)), state_hash(&with(-0.0, 0.0)));
        assert_eq!(state_hash(&with(0.0, 0.0)), state_hash(&with(0.0, -0.0)));
    }

    #[test]
    fn equal_holds_hash_equal() {
        assert_eq!(state_hash(&full()), state_hash(&full()));
    }

    #[test]
    fn every_single_field_variation_changes_the_hash() {
        type Edit = fn(&mut Hold);
        let edits: [Edit; 16] = [
            |h| h.source_id = None,
            |h| h.source_id = Some(0),
            |h| h.line_id.push('x'),
            |h| h.name.push('x'),
            |h| h.role.push('x'),
            |h| h.remark.push('x'),
            |h| h.hold_type.push('x'),
            |h| h.discipline.push('x'),
            |h| h.created = None,
            |h| h.created = Some(ts(123_456_790)),
            |h| h.released = false,
            |h| h.release_remark.clear(),
            |h| h.release_date = None,
            |h| h.model_size = Some(f64::from_bits(4.0f64.to_bits() + 1)),
            |h| h.ldt_size = None,
            |h| h.stress_calc.clear(),
        ];
        let base = full();
        let mut hashes = HashSet::from([state_hash(&base)]);
        for edit in edits {
            let mut h = base.clone();
            edit(&mut h);
            assert_ne!(h, base);
            assert!(hashes.insert(state_hash(&h)), "a variation collided");
        }
        // Extra: one entry added, one value changed.
        let mut added = base.clone();
        added.extra.insert("Zone".into(), "1".into());
        let mut changed = base.clone();
        changed.extra.insert("Area".into(), "South".into());
        assert!(hashes.insert(state_hash(&added)));
        assert!(hashes.insert(state_hash(&changed)));
        assert_eq!(hashes.len(), 19);
    }

    #[test]
    fn absent_differs_from_present_empty_or_zero() {
        let holds = [
            Hold::default(),
            Hold {
                source_id: Some(0),
                ..Hold::default()
            },
            Hold {
                model_size: Some(0.0),
                ..Hold::default()
            },
            Hold {
                ldt_size: Some(0.0),
                ..Hold::default()
            },
        ];
        let set: HashSet<_> = holds.iter().map(state_hash).collect();
        assert_eq!(set.len(), 4);
    }

    #[test]
    fn field_boundaries_matter() {
        let a = Hold {
            name: "ab".into(),
            role: "c".into(),
            ..Hold::default()
        };
        let b = Hold {
            name: "a".into(),
            role: "bc".into(),
            ..Hold::default()
        };
        assert_ne!(state_hash(&a), state_hash(&b));
        assert_ne!(canonical_bytes(&a), canonical_bytes(&b));
    }

    #[test]
    fn extra_insertion_order_does_not_matter() {
        let mut a = Hold::default();
        a.extra.insert("k1".into(), "v1".into());
        a.extra.insert("k2".into(), "v2".into());
        let mut b = Hold::default();
        b.extra.insert("k2".into(), "v2".into());
        b.extra.insert("k1".into(), "v1".into());
        assert_eq!(state_hash(&a), state_hash(&b));
    }

    #[test]
    fn encoding_starts_with_the_version() {
        assert_eq!(
            canonical_bytes(&full())[..4],
            STATE_HASH_VERSION.to_le_bytes()
        );
    }

    #[test]
    fn pinned_hash_of_a_fixed_hold() {
        let hex: String = state_hash(&full())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(
            hex,
            "de61afd9f2295a0f7db4151db24322aa12e106719afc0fc77996aeebd8890224"
        );
    }

    #[test]
    fn distinct_synthetic_holds_get_distinct_hashes() {
        use hx_synth::{generate, write_workbook, SynthConfig};
        let cfg = SynthConfig::new(7, 300, 2000);
        let rows = generate(&cfg);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.xlsx");
        write_workbook(&rows, &cfg, &path).unwrap();
        let loaded = crate::load::load_file(&path).unwrap();
        let holds = &loaded.parsed.holds;
        assert_eq!(holds.len(), 2000);
        let mut distinct: Vec<&Hold> = Vec::new();
        for h in holds {
            if !distinct.contains(&h) {
                distinct.push(h);
            }
        }
        let hashes: HashSet<_> = holds.iter().map(state_hash).collect();
        assert_eq!(hashes.len(), distinct.len());
    }
}
