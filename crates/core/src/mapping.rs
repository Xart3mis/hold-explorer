//! Maps header names to known fields.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Field {
    SourceId,
    LineId,
    Name,
    Role,
    Remark,
    HoldType,
    Discipline,
    Created,
    Released,
    ReleaseRemark,
    ReleaseDate,
    ModelSize,
    LdtSize,
    StressCalc,
}

impl Field {
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

fn header_key(header: &str) -> String {
    header.trim().to_lowercase().replace(&[' ', '-'][..], "_")
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ColumnMap {
    /// Field to zero-based column index.
    pub fields: BTreeMap<Field, usize>,
    /// Unrecognized columns: index and header as written.
    pub extras: Vec<(usize, String)>,
}

impl ColumnMap {
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
            "id", "line_id", "name", "role", "hold_remark", "hold_type", "discipline", "date",
            "released", "release_remark", "release_date", "model_size", "ldt_size", "stress_calc",
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
            "line_id", "name", "role", "hold_remark", "hold_type", "discipline",
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
}
