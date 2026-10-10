//! The stored forms of the two values that are not plain columns: the ordered list of row-state
//! ids of a snapshot and a timestamp.

use chrono::NaiveDateTime;

use crate::error::StoreError;

/// The text format of every stored timestamp: nine fractional digits, so text order is time order.
const TIMESTAMP_FORMAT: &str = "%Y-%m-%dT%H:%M:%S%.9f";

/// Encodes row-state ids as unsigned LEB128 values, one after another, in the order given.
/// Ids are positive row ids, so none is negative.
pub(crate) fn encode_ids(ids: &[i64]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(ids.len() * 2);
    for &id in ids {
        let mut value = id as u64;
        loop {
            let low = (value & 0x7f) as u8;
            value >>= 7;
            if value == 0 {
                bytes.push(low);
                break;
            }
            bytes.push(low | 0x80);
        }
    }
    bytes
}

fn corrupt_ids(detail: &str) -> StoreError {
    StoreError::Corrupt {
        detail: format!("the list of rows of a snapshot {detail}"),
    }
}

/// Decodes what `encode_ids` wrote. Truncated input and values that do not fit an `i64` are
/// `Corrupt`.
pub(crate) fn decode_ids(bytes: &[u8]) -> Result<Vec<i64>, StoreError> {
    let mut ids = Vec::with_capacity(bytes.len());
    let mut value: u64 = 0;
    let mut shift: u32 = 0;
    for &byte in bytes {
        let part = u64::from(byte & 0x7f);
        if shift >= 64 || (shift == 63 && part > 1) {
            return Err(corrupt_ids("holds a number that is too large"));
        }
        value |= part << shift;
        if byte & 0x80 == 0 {
            let id = i64::try_from(value)
                .map_err(|_| corrupt_ids("holds a number that is too large"))?;
            ids.push(id);
            value = 0;
            shift = 0;
        } else {
            shift += 7;
        }
    }
    if shift != 0 {
        return Err(corrupt_ids("ends in the middle of a number"));
    }
    Ok(ids)
}

/// The stored text of a timestamp.
pub(crate) fn encode_time(t: NaiveDateTime) -> String {
    t.format(TIMESTAMP_FORMAT).to_string()
}

/// Reads what `encode_time` wrote. Anything else is `Corrupt`.
pub(crate) fn decode_time(s: &str) -> Result<NaiveDateTime, StoreError> {
    NaiveDateTime::parse_from_str(s, TIMESTAMP_FORMAT).map_err(|e| StoreError::Corrupt {
        detail: format!("the stored time \"{s}\" is not a valid time ({e})"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn corrupt(result: Result<Vec<i64>, StoreError>) -> bool {
        matches!(result, Err(StoreError::Corrupt { .. }))
    }

    #[test]
    fn ids_round_trip() {
        let cases: Vec<Vec<i64>> = vec![
            vec![],
            vec![5],
            vec![0, 1, 127, 128, 16383, 16384, i64::MAX],
            (1..=10_000).collect(),
        ];
        for ids in cases {
            assert_eq!(decode_ids(&encode_ids(&ids)).unwrap(), ids);
        }
    }

    #[test]
    fn ten_thousand_small_ids_take_at_most_twenty_thousand_bytes() {
        let ids: Vec<i64> = (1..=10_000).collect();
        assert!(encode_ids(&ids).len() <= 20_000);
    }

    #[test]
    fn truncated_ids_are_corrupt() {
        assert!(corrupt(decode_ids(&[0x80])));
        assert!(corrupt(decode_ids(&[1, 0xff, 0xff])));
    }

    #[test]
    fn a_value_that_overflows_is_corrupt() {
        let mut ten_bytes = vec![0xff; 9];
        ten_bytes.push(0x02);
        assert!(corrupt(decode_ids(&ten_bytes)));
        let mut u64_max = vec![0xff; 9];
        u64_max.push(0x01);
        assert!(corrupt(decode_ids(&u64_max)), "u64::MAX does not fit i64");
        assert!(corrupt(decode_ids(&[0xff; 11])));
    }

    fn at(year: i32, nanos: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(year, 10, 1)
            .and_then(|d| d.and_hms_nano_opt(9, 0, 0, nanos))
            .unwrap()
    }

    #[test]
    fn time_round_trips_and_sorts_as_text() {
        let times = [
            at(2000, 0),
            at(2026, 0),
            at(2026, 123_456_789),
            NaiveDate::from_ymd_opt(2100, 12, 31)
                .and_then(|d| d.and_hms_nano_opt(23, 59, 59, 999_999_999))
                .unwrap(),
        ];
        let mut texts = Vec::new();
        for t in times {
            let text = encode_time(t);
            assert_eq!(decode_time(&text).unwrap(), t, "{text}");
            texts.push(text);
        }
        assert_eq!(texts[2], "2026-10-01T09:00:00.123456789");
        let mut sorted = texts.clone();
        sorted.sort();
        assert_eq!(sorted, texts);
    }

    #[test]
    fn bad_time_text_is_corrupt() {
        assert!(matches!(
            decode_time("yesterday"),
            Err(StoreError::Corrupt { .. })
        ));
    }
}
