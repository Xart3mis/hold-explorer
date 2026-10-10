//! Maps header names to known fields.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A hold property that a column of the file can supply.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Field {
    /// The export's own hold id.
    SourceId,
    /// The line the hold is on. Required.
    LineId,
    /// Name of the person on the hold.
    Name,
    /// Role of that person.
    Role,
    /// The hold remark the blocker is derived from. Required.
    Remark,
    /// The kind of hold. Required.
    HoldType,
    /// The discipline that owns the hold.
    Discipline,
    /// When the hold was created.
    Created,
    /// Whether the hold is released.
    Released,
    /// Text recorded at release.
    ReleaseRemark,
    /// When the hold was released.
    ReleaseDate,
    /// Line size in the 3D model.
    ModelSize,
    /// Line size in the line designation table (LDT).
    LdtSize,
    /// Stress calculation reference.
    StressCalc,
}

impl Field {
    /// Every field, in the order automatic mapping tries them.
    pub const ALL: [Field; 14] = [
        Field::SourceId,
        Field::LineId,
        Field::Name,
        Field::Role,
        Field::Remark,
        Field::HoldType,
        Field::Discipline,
        Field::Created,
        Field::Released,
        Field::ReleaseRemark,
        Field::ReleaseDate,
        Field::ModelSize,
        Field::LdtSize,
        Field::StressCalc,
    ];

    /// The fields a file must supply for an import to succeed.
    pub const REQUIRED: [Field; 3] = [Field::LineId, Field::Remark, Field::HoldType];

    /// The column name PlantIM uses. Shown in messages about missing columns.
    pub fn label(self) -> &'static str {
        self.aliases()[0]
    }

    /// Accepted header names, already in normalized form (see `header_key`).
    pub fn aliases(self) -> &'static [&'static str] {
        match self {
            Field::SourceId => &["id", "hold_id"],
            Field::LineId => &["line_id", "line", "line_no", "line_number"],
            Field::Name => &["name", "user", "raised_by"],
            Field::Role => &["role"],
            Field::Remark => &["hold_remark", "remark", "remarks", "hold_remarks"],
            Field::HoldType => &["hold_type", "type"],
            Field::Discipline => &["discipline", "causing_discipline"],
            Field::Created => &["date", "hold_date", "created", "created_at", "تاريخ"],
            Field::Released => &["released"],
            Field::ReleaseRemark => &["release_remark"],
            Field::ReleaseDate => &["release_date", "released_at"],
            Field::ModelSize => &["model_size"],
            Field::LdtSize => &["ldt_size"],
            Field::StressCalc => &["stress_calc", "stress_calculation"],
        }
    }
}

/// Trimmed and lower-cased; each run of whitespace (non-breaking space included) and each
/// hyphen becomes one underscore.
fn header_key(header: &str) -> String {
    let mut key = String::new();
    let mut in_space = false;
    for ch in header.trim().to_lowercase().chars() {
        if ch.is_whitespace() {
            if !in_space {
                key.push('_');
            }
            in_space = true;
        } else {
            in_space = false;
            key.push(if ch == '-' { '_' } else { ch });
        }
    }
    key
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
/// Which column of a table supplies which field.
pub struct ColumnMap {
    /// Field to zero-based column index.
    pub fields: BTreeMap<Field, usize>,
    /// Unrecognized columns: index and header as written.
    pub extras: Vec<(usize, String)>,
}

impl ColumnMap {
    /// Proposes a mapping from header names (matched by `Field::aliases`, ignoring case, spaces,
    /// and hyphens). The first column that matches a field takes it; columns that match nothing,
    /// or a field already taken, are listed in `extras`. Blank headers are ignored.
    pub fn auto(headers: &[String]) -> ColumnMap {
        let mut map = ColumnMap::default();
        for (index, header) in headers.iter().enumerate() {
            let key = header_key(header);
            if key.is_empty() {
                continue;
            }
            let field = Field::ALL
                .into_iter()
                .find(|f| !map.fields.contains_key(f) && f.aliases().contains(&key.as_str()));
            match field {
                Some(field) => {
                    map.fields.insert(field, index);
                }
                None => map.extras.push((index, header.trim().to_string())),
            }
        }
        map
    }

    /// The required fields that have no column, in `Field::REQUIRED` order.
    pub fn missing_required(&self) -> Vec<Field> {
        Field::REQUIRED
            .into_iter()
            .filter(|f| !self.fields.contains_key(f))
            .collect()
    }

    /// A limited file cannot identify holds exactly or tell released from removed.
    pub fn is_limited(&self) -> bool {
        !self.fields.contains_key(&Field::SourceId) || !self.fields.contains_key(&Field::Released)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn raw_export_maps_every_column() {
        let map = ColumnMap::auto(&headers(&[
            "id",
            "line_id",
            "name",
            "role",
            "hold_remark",
            "hold_type",
            "discipline",
            "date",
            "released",
            "release_remark",
            "release_date",
            "model_size",
            "ldt_size",
            "stress_calc",
        ]));
        assert_eq!(map.fields.len(), 14);
        assert_eq!(map.fields[&Field::LineId], 1);
        assert_eq!(map.fields[&Field::Created], 7);
        assert!(map.extras.is_empty());
        assert!(map.missing_required().is_empty());
        assert!(!map.is_limited());
    }

    #[test]
    fn trimmed_export_is_limited() {
        let map = ColumnMap::auto(&headers(&[
            "line_id",
            "name",
            "role",
            "hold_remark",
            "hold_type",
            "discipline",
        ]));
        assert!(map.missing_required().is_empty());
        assert!(map.is_limited());
    }

    #[test]
    fn headers_match_ignoring_case_spaces_and_hyphens() {
        let map = ColumnMap::auto(&headers(&[" Line ID ", "Hold-Remark", "HOLD TYPE"]));
        assert_eq!(map.fields[&Field::LineId], 0);
        assert_eq!(map.fields[&Field::Remark], 1);
        assert_eq!(map.fields[&Field::HoldType], 2);
    }

    #[test]
    fn unknown_headers_become_extras_and_blank_headers_are_ignored() {
        let map = ColumnMap::auto(&headers(&["line_id", "Area", "", "hold_type"]));
        assert_eq!(map.extras, vec![(1, "Area".to_string())]);
        assert_eq!(map.missing_required(), vec![Field::Remark]);
    }

    #[test]
    fn a_field_maps_to_its_first_matching_column() {
        let map = ColumnMap::auto(&headers(&["date", "created"]));
        assert_eq!(map.fields[&Field::Created], 0);
        assert_eq!(map.extras, vec![(1, "created".to_string())]);
    }

    #[test]
    fn whitespace_runs_and_non_breaking_spaces_match() {
        let map = ColumnMap::auto(&headers(&["Line  ID", "Hold\u{a0}Remark", "HOLD-TYPE"]));
        assert_eq!(map.fields[&Field::LineId], 0);
        assert_eq!(map.fields[&Field::Remark], 1);
        assert_eq!(map.fields[&Field::HoldType], 2);
        assert!(map.extras.is_empty());
    }
}
