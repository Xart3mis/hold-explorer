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

/// One remembered column of a saved mapping.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SavedColumn {
    /// The normalized header ([`header_key`]).
    pub key: String,
    /// Which of the columns with this key it is, counting from 0 in column order.
    pub occurrence: usize,
    /// The field the column holds, or `None` when the user left it unmapped on purpose.
    pub field: Option<Field>,
}

/// A mapping independent of column order, to be saved and applied to another file.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct SavedMapping {
    /// The remembered columns. Columns with a blank header are never recorded.
    pub columns: Vec<SavedColumn>,
}

/// The key and occurrence of every column, in column order; `None` for a blank header.
fn column_keys(headers: &[String]) -> Vec<Option<(String, usize)>> {
    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    headers
        .iter()
        .map(|header| {
            if header.trim().is_empty() {
                return None;
            }
            let key = header_key(header);
            let count = seen.entry(key.clone()).or_insert(0);
            let occurrence = *count;
            *count += 1;
            Some((key, occurrence))
        })
        .collect()
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

    /// Like [`ColumnMap::auto`], but a column named in `saved` (by header and occurrence among
    /// columns with that header) takes its saved field first, even when another column would
    /// match that field by alias. A column saved as unmapped is never matched by alias. Saved
    /// entries the file has no column for are ignored. Columns left over are matched by alias,
    /// then become extras.
    pub fn auto_with(headers: &[String], saved: &SavedMapping) -> ColumnMap {
        let keys = column_keys(headers);
        let mut fields: BTreeMap<Field, usize> = BTreeMap::new();
        let mut settled = vec![false; headers.len()];
        for (index, key) in keys.iter().enumerate() {
            let Some((key, occurrence)) = key else {
                continue;
            };
            let entry = saved
                .columns
                .iter()
                .find(|c| c.key == *key && c.occurrence == *occurrence);
            match entry.map(|c| c.field) {
                Some(Some(field)) => {
                    if let std::collections::btree_map::Entry::Vacant(slot) = fields.entry(field) {
                        slot.insert(index);
                        settled[index] = true;
                    }
                }
                Some(None) => settled[index] = true,
                None => {}
            }
        }
        for (index, header) in headers.iter().enumerate() {
            if settled[index] {
                continue;
            }
            let key = header_key(header);
            let field = Field::ALL
                .into_iter()
                .find(|f| !fields.contains_key(f) && f.aliases().contains(&key.as_str()));
            if let Some(field) = field {
                fields.insert(field, index);
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

    /// The mapping by header and occurrence, to save and apply to a file with the same headers
    /// in any order. Has one entry per column assigned to a field, plus an entry with no field
    /// for each non-blank column the user left unassigned although [`ColumnMap::auto`] would
    /// assign it. Blank headers and fields whose column is not in `headers` are left out.
    pub fn to_saved(&self, headers: &[String]) -> SavedMapping {
        let by_column: BTreeMap<usize, Field> = self.fields.iter().map(|(&f, &c)| (c, f)).collect();
        let by_alias: BTreeMap<usize, Field> = ColumnMap::auto(headers)
            .fields
            .into_iter()
            .map(|(f, c)| (c, f))
            .collect();
        let columns = column_keys(headers)
            .into_iter()
            .enumerate()
            .filter_map(|(index, key)| {
                let (key, occurrence) = key?;
                let field = match by_column.get(&index) {
                    Some(&field) => Some(field),
                    None if by_alias.contains_key(&index) => None,
                    None => return None,
                };
                Some(SavedColumn {
                    key,
                    occurrence,
                    field,
                })
            })
            .collect();
        SavedMapping { columns }
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

    fn col(key: &str, occurrence: usize, field: Option<Field>) -> SavedColumn {
        SavedColumn {
            key: key.to_string(),
            occurrence,
            field,
        }
    }

    #[test]
    fn to_saved_keys_by_header() {
        let saved = ColumnMap::from_fields(&file_a(), hand_fields()).to_saved(&file_a());
        let expected = vec![
            col("line", 0, Some(Field::LineId)),
            col("why", 0, Some(Field::Remark)),
            col("kind", 0, Some(Field::HoldType)),
        ];
        assert_eq!(saved.columns, expected);
    }

    #[test]
    fn saved_mapping_applies_to_another_column_order() {
        let saved = ColumnMap::from_fields(&file_a(), hand_fields()).to_saved(&file_a());
        let map = ColumnMap::auto_with(&headers(&["Area", "Kind", "Why", "Line"]), &saved);
        assert_eq!(
            map.fields,
            BTreeMap::from([(Field::LineId, 3), (Field::Remark, 2), (Field::HoldType, 1)])
        );
        assert_eq!(map.extras, vec![extra(0, "Area")]);
        assert!(map.missing_required().is_empty());
    }

    #[test]
    fn saved_entry_wins_over_an_alias() {
        let saved = SavedMapping {
            columns: vec![col("why", 0, Some(Field::Remark))],
        };
        let map = ColumnMap::auto_with(
            &headers(&["line_id", "hold_remark", "Why", "hold_type"]),
            &saved,
        );
        assert_eq!(
            map.fields,
            BTreeMap::from([(Field::LineId, 0), (Field::Remark, 2), (Field::HoldType, 3)])
        );
        assert_eq!(map.extras, vec![extra(1, "hold_remark")]);
    }

    #[test]
    fn saved_header_the_file_lacks_is_ignored() {
        let saved = SavedMapping {
            columns: vec![col("nothing_here", 0, Some(Field::Remark))],
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
        assert!(map.to_saved(&file_a()).columns.len() == 3);
    }

    fn round_trip(h: &[String], fields: BTreeMap<Field, usize>) -> (ColumnMap, ColumnMap) {
        let user = ColumnMap::from_fields(h, fields);
        let again = ColumnMap::auto_with(h, &user.to_saved(h));
        (user, again)
    }

    #[test]
    fn repeated_date_headers_survive_a_round_trip() {
        let h = headers(&["Line", "Why", "Kind", "Date", "Date"]);
        let mut fields = hand_fields();
        fields.insert(Field::Created, 3);
        fields.insert(Field::ReleaseDate, 4);
        let (user, again) = round_trip(&h, fields);
        assert_eq!(again.fields, user.fields);
        assert_eq!(again.extras, user.extras);
    }

    #[test]
    fn repeated_size_headers_survive_a_round_trip() {
        let h = headers(&["Line", "Why", "Kind", "Size", "Size"]);
        let mut fields = hand_fields();
        fields.insert(Field::ModelSize, 3);
        fields.insert(Field::LdtSize, 4);
        let (user, again) = round_trip(&h, fields);
        assert_eq!(again.fields, user.fields);
        assert_eq!(again.extras, user.extras);
    }

    #[test]
    fn repeated_headers_apply_by_occurrence_in_a_reordered_file() {
        let h = headers(&["Line", "Why", "Kind", "Date", "Date"]);
        let mut fields = hand_fields();
        fields.insert(Field::Created, 3);
        fields.insert(Field::ReleaseDate, 4);
        let saved = ColumnMap::from_fields(&h, fields).to_saved(&h);
        let map = ColumnMap::auto_with(&headers(&["Date", "Kind", "Line", "Date", "Why"]), &saved);
        assert_eq!(
            map.fields,
            BTreeMap::from([
                (Field::Created, 0),
                (Field::HoldType, 1),
                (Field::LineId, 2),
                (Field::ReleaseDate, 3),
                (Field::Remark, 4),
            ])
        );
        assert!(map.extras.is_empty());
    }

    #[test]
    fn blank_headers_are_never_saved_or_matched() {
        let h = headers(&["Line", "", "Kind"]);
        let fields = BTreeMap::from([(Field::LineId, 0), (Field::Remark, 1), (Field::HoldType, 2)]);
        let saved = ColumnMap::from_fields(&h, fields).to_saved(&h);
        assert!(saved.columns.iter().all(|c| !c.key.is_empty()));
        let map = ColumnMap::auto_with(
            &headers(&["line_id", "hold_remark", "hold_type", "Area", ""]),
            &saved,
        );
        assert_eq!(
            map.fields,
            BTreeMap::from([(Field::LineId, 0), (Field::Remark, 1), (Field::HoldType, 2)])
        );
        assert_eq!(map.extras, vec![extra(3, "Area")]);
    }

    #[test]
    fn a_column_left_unmapped_on_purpose_is_remembered() {
        let h = headers(&["line_id", "hold_remark", "hold_type", "name"]);
        let fields = BTreeMap::from([(Field::LineId, 0), (Field::Remark, 1), (Field::HoldType, 2)]);
        let saved = ColumnMap::from_fields(&h, fields).to_saved(&h);
        assert!(saved.columns.contains(&col("name", 0, None)));
        let map = ColumnMap::auto_with(
            &headers(&["name", "hold_type", "hold_remark", "line_id"]),
            &saved,
        );
        assert_eq!(
            map.fields,
            BTreeMap::from([(Field::LineId, 3), (Field::Remark, 2), (Field::HoldType, 1)])
        );
        assert_eq!(map.extras, vec![extra(0, "name")]);
    }

    #[test]
    fn saved_mapping_json_shape_and_round_trip() {
        let saved = SavedMapping {
            columns: vec![col("why", 0, Some(Field::Remark)), col("name", 0, None)],
        };
        let json = serde_json::to_string(&saved).unwrap();
        assert_eq!(
            json,
            r#"{"columns":[{"key":"why","occurrence":0,"field":"Remark"},{"key":"name","occurrence":0,"field":null}]}"#
        );
        let back: SavedMapping = serde_json::from_str(&json).unwrap();
        assert_eq!(back, saved);
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
