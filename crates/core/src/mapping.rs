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
    /// The person named on the hold.
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

/// The normalized form of a header used for matching: trimmed and lower-cased, with every run of
/// whitespace (non-breaking space included), hyphens, and underscores turned into one
/// underscore. `Line - ID` and `line_id` give the same key; `LineID` gives `lineid`.
pub fn header_key(header: &str) -> String {
    let mut key = String::new();
    let mut in_separator = false;
    for ch in header.trim().to_lowercase().chars() {
        if ch.is_whitespace() || ch == '-' || ch == '_' {
            if !in_separator {
                key.push('_');
            }
            in_separator = true;
        } else {
            in_separator = false;
            key.push(ch);
        }
    }
    key
}

/// A column the mapping does not assign to a field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtraColumn {
    /// Zero-based column index.
    pub column: usize,
    /// The header as written, trimmed. It names the column's values in `Hold::extra`.
    pub name: String,
}

/// A mapping independent of column order, to be saved and applied to another file.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct SavedMapping {
    /// Normalized header (see [`header_key`]) to the field it supplies.
    pub headers: BTreeMap<String, Field>,
}

/// Which column of a table supplies which field.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ColumnMap {
    /// Field to zero-based column index.
    pub fields: BTreeMap<Field, usize>,
    /// Columns that supply no field, in column order.
    pub extras: Vec<ExtraColumn>,
}

impl ColumnMap {
    /// Proposes a mapping from header names (matched by `Field::aliases` after [`header_key`]
    /// normalization, so case, spaces, hyphens, and underscores do not matter; `LineID` does
    /// not match `line_id`). The first column that matches a field takes it; columns that match
    /// nothing, or a field already taken, are listed in `extras`. Blank headers are ignored.
    pub fn auto(headers: &[String]) -> ColumnMap {
        ColumnMap::auto_with(headers, &SavedMapping::default())
    }

    /// Like [`ColumnMap::auto`], but a header named in `saved` takes its saved field first, even
    /// when another column would match that field by alias. Saved entries whose header the file
    /// does not have are ignored. Columns left over are matched by alias, then become extras.
    pub fn auto_with(headers: &[String], saved: &SavedMapping) -> ColumnMap {
        let mut fields: BTreeMap<Field, usize> = BTreeMap::new();
        let mut assigned = vec![false; headers.len()];
        for (index, header) in headers.iter().enumerate() {
            if let Some(&field) = saved.headers.get(&header_key(header)) {
                if let std::collections::btree_map::Entry::Vacant(slot) = fields.entry(field) {
                    slot.insert(index);
                    assigned[index] = true;
                }
            }
        }
        for (index, header) in headers.iter().enumerate() {
            if assigned[index] {
                continue;
            }
            let key = header_key(header);
            let field = Field::ALL
                .into_iter()
                .find(|f| !fields.contains_key(f) && f.aliases().contains(&key.as_str()));
            if let Some(field) = field {
                fields.insert(field, index);
                assigned[index] = true;
            }
        }
        ColumnMap::from_fields(headers, fields)
    }

    /// A mapping from the given assignments. Assignments whose column is not in `headers` are
    /// dropped. `extras` is every column with a non-blank header that supplies no field.
    pub fn from_fields(headers: &[String], fields: BTreeMap<Field, usize>) -> ColumnMap {
        let fields: BTreeMap<Field, usize> = fields
            .into_iter()
            .filter(|&(_, column)| column < headers.len())
            .collect();
        let used: std::collections::HashSet<usize> = fields.values().copied().collect();
        let extras = headers
            .iter()
            .enumerate()
            .filter(|(column, header)| !used.contains(column) && !header.trim().is_empty())
            .map(|(column, header)| ExtraColumn {
                column,
                name: header.trim().to_string(),
            })
            .collect();
        ColumnMap { fields, extras }
    }

    /// The mapping by header, to save and apply to a file with the same headers in any order.
    /// Fields whose column is not in `headers` are left out.
    pub fn to_saved(&self, headers: &[String]) -> SavedMapping {
        SavedMapping {
            headers: self
                .fields
                .iter()
                .filter_map(|(&field, &column)| headers.get(column).map(|h| (header_key(h), field)))
                .collect(),
        }
    }

    /// The names the extra columns get as keys of `Hold::extra`, in `extras` order. The first
    /// column with a name keeps it; later ones are numbered (`Area`, `Area (2)`, `Area (3)`),
    /// skipping any name already taken, so all names are distinct.
    pub fn extra_names(&self) -> Vec<String> {
        let mut taken: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut next: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        let mut names = Vec::with_capacity(self.extras.len());
        for extra in &self.extras {
            let base = extra.name.as_str();
            let mut name = base.to_string();
            if taken.contains(&name) {
                let n = next.entry(base).or_insert(2);
                loop {
                    name = format!("{base} ({n})");
                    *n += 1;
                    if !taken.contains(&name) {
                        break;
                    }
                }
            }
            taken.insert(name.clone());
            names.push(name);
        }
        names
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

    fn extra(column: usize, name: &str) -> ExtraColumn {
        ExtraColumn {
            column,
            name: name.to_string(),
        }
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
        assert_eq!(map.extras, vec![extra(1, "Area")]);
        assert_eq!(map.missing_required(), vec![Field::Remark]);
    }

    #[test]
    fn a_field_maps_to_its_first_matching_column() {
        let map = ColumnMap::auto(&headers(&["date", "created"]));
        assert_eq!(map.fields[&Field::Created], 0);
        assert_eq!(map.extras, vec![extra(1, "created")]);
    }

    #[test]
    fn whitespace_runs_and_non_breaking_spaces_match() {
        let map = ColumnMap::auto(&headers(&["Line  ID", "Hold\u{a0}Remark", "HOLD-TYPE"]));
        assert_eq!(map.fields[&Field::LineId], 0);
        assert_eq!(map.fields[&Field::Remark], 1);
        assert_eq!(map.fields[&Field::HoldType], 2);
        assert!(map.extras.is_empty());
    }

    #[test]
    fn header_key_unifies_separators() {
        for header in [
            "Line - ID",
            " Line  ID ",
            "Line\u{a0}ID",
            "LINE-ID",
            "line_id",
            "line__id",
        ] {
            assert_eq!(header_key(header), "line_id", "{header:?}");
        }
        assert_eq!(header_key("LineID"), "lineid");
    }

    #[test]
    fn spaced_hyphen_headers_map() {
        let map = ColumnMap::auto(&headers(&["Line - ID", "Hold - Remark", "Hold Type"]));
        assert!(map.missing_required().is_empty());
    }

    fn file_a() -> Vec<String> {
        headers(&["Line", "Why", "Kind", "Area"])
    }

    fn hand_fields() -> BTreeMap<Field, usize> {
        BTreeMap::from([(Field::LineId, 0), (Field::Remark, 1), (Field::HoldType, 2)])
    }

    #[test]
    fn from_fields_derives_extras() {
        let map = ColumnMap::from_fields(&file_a(), hand_fields());
        assert_eq!(map.extras, vec![extra(3, "Area")]);
    }

    #[test]
    fn to_saved_keys_by_header() {
        let saved = ColumnMap::from_fields(&file_a(), hand_fields()).to_saved(&file_a());
        let expected = BTreeMap::from([
            ("line".to_string(), Field::LineId),
            ("why".to_string(), Field::Remark),
            ("kind".to_string(), Field::HoldType),
        ]);
        assert_eq!(saved.headers, expected);
    }

    #[test]
    fn saved_mapping_applies_to_another_column_order() {
        let saved = ColumnMap::from_fields(&file_a(), hand_fields()).to_saved(&file_a());
        let map = ColumnMap::auto_with(&headers(&["Area", "Kind", "Why", "Line"]), &saved);
        assert_eq!(map.fields[&Field::LineId], 3);
        assert_eq!(map.fields[&Field::Remark], 2);
        assert_eq!(map.fields[&Field::HoldType], 1);
        assert_eq!(map.extras, vec![extra(0, "Area")]);
        assert!(map.missing_required().is_empty());
    }

    #[test]
    fn saved_entry_wins_over_an_alias() {
        let saved = SavedMapping {
            headers: BTreeMap::from([("why".to_string(), Field::Remark)]),
        };
        let map = ColumnMap::auto_with(
            &headers(&["line_id", "hold_remark", "Why", "hold_type"]),
            &saved,
        );
        assert_eq!(map.fields[&Field::Remark], 2);
        assert_eq!(map.extras, vec![extra(1, "hold_remark")]);
    }

    #[test]
    fn saved_header_the_file_lacks_is_ignored() {
        let saved = SavedMapping {
            headers: BTreeMap::from([("nothing_here".to_string(), Field::Remark)]),
        };
        let h = headers(&["line_id", "hold_remark", "hold_type"]);
        assert_eq!(ColumnMap::auto_with(&h, &saved), ColumnMap::auto(&h));
        assert!(ColumnMap::auto_with(&h, &saved)
            .missing_required()
            .is_empty());
    }

    #[test]
    fn from_fields_drops_columns_past_the_end() {
        let mut fields = hand_fields();
        fields.insert(Field::Role, 9);
        let map = ColumnMap::from_fields(&file_a(), fields);
        assert!(!map.fields.contains_key(&Field::Role));
        assert_eq!(map.fields.len(), 3);
        assert!(map.to_saved(&file_a()).headers.len() == 3);
    }

    #[test]
    fn from_fields_ignores_blank_headers() {
        let map = ColumnMap::from_fields(&headers(&["Line", " ", "Why"]), hand_fields());
        assert!(map.extras.is_empty());
    }

    #[test]
    fn extra_names_are_distinct_and_start_with_the_first() {
        let map = ColumnMap {
            fields: BTreeMap::new(),
            extras: vec![
                extra(0, "Area"),
                extra(1, "Area"),
                extra(2, "Area (2)"),
                extra(3, "Area"),
            ],
        };
        let names = map.extra_names();
        assert_eq!(names[0], "Area");
        let distinct: std::collections::HashSet<_> = names.iter().collect();
        assert_eq!(distinct.len(), names.len(), "{names:?}");
    }

    #[test]
    fn column_map_json_has_named_extras() {
        let map = ColumnMap {
            fields: BTreeMap::new(),
            extras: vec![extra(3, "Area")],
        };
        let json = serde_json::to_value(&map).unwrap();
        assert_eq!(
            json["extras"].to_string(),
            r#"[{"column":3,"name":"Area"}]"#
        );
        let back: ColumnMap = serde_json::from_value(json).unwrap();
        assert_eq!(back, map);
    }
}
