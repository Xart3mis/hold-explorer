//! Fixtures shared by unit tests. Compiled for tests only.

use chrono::{Duration, NaiveDateTime};

use crate::dataset::Dataset;
use crate::model::Hold;
use crate::rules::RuleSet;

pub fn at(text: &str) -> NaiveDateTime {
    NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S").unwrap()
}

pub fn snapshot() -> NaiveDateTime {
    at("2026-10-01 00:00:00")
}

pub fn hold(line: &str, discipline: &str, hold_type: &str, remark: &str, days_ago: i64) -> Hold {
    Hold {
        line_id: line.to_string(),
        name: "Engineer 01".to_string(),
        role: "Designer".to_string(),
        remark: remark.to_string(),
        hold_type: hold_type.to_string(),
        discipline: discipline.to_string(),
        created: Some(snapshot() - Duration::days(days_ago)),
        ..Default::default()
    }
}

/// Five holds on four lines. One hold (on L3) is released.
///
/// | line | discipline  | type  | remark             | state               | age |
/// |------|-------------|-------|--------------------|---------------------|-----|
/// | L1   | Civil       | MISC. | Pending 538-PR-100 | open                | 10  |
/// | L1   | Piping      | P&ID  | P&ID update        | open                | 40  |
/// | L2   | Civil       | MISC. | Pending 538-PR-100 | open                | 5   |
/// | L3   | Process     | P&ID  | P&ID update        | released after 30 d | 30  |
/// | L4   | Unspecified | MISC. | Vendor Catalogue   | open, sizes 4 and 6 | 1   |
pub fn sample() -> Dataset {
    let mut released = hold("L3", "Process", "P&ID", "P&ID update", 50);
    released.released = true;
    released.release_date = Some(snapshot() - Duration::days(20));

    let mut mismatched = hold("L4", "Unspecified", "MISC.", "Vendor Catalogue", 1);
    mismatched.model_size = Some(4.0);
    mismatched.ldt_size = Some(6.0);
    mismatched.stress_calc = "NR".to_string();

    Dataset::build(
        vec![
            hold("L1", "Civil", "MISC.", "Pending 538-PR-100", 10),
            hold("L1", "Piping", "P&ID", "P&ID update", 40),
            hold("L2", "Civil", "MISC.", "Pending 538-PR-100", 5),
            released,
            mismatched,
        ],
        &RuleSet::builtin(),
        snapshot(),
    )
}
