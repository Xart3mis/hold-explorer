//! Aggregations behind Overview, Breakdown, and Lines.

use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::dataset::{Dataset, Row};
use crate::filter::{Dim, FilterSpec};

fn filtered<'a>(ds: &'a Dataset, spec: &'a FilterSpec) -> impl Iterator<Item = &'a Row> {
    ds.rows.iter().filter(move |row| spec.matches(row))
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Summary {
    pub holds: usize,
    pub lines: usize,
    pub single_hold_lines: usize,
    /// Lower median over open holds in the selection.
    pub median_age_days: Option<i64>,
    /// Lower median over released holds in the selection.
    pub median_duration_days: Option<i64>,
}

fn lower_median(values: &mut [i64]) -> Option<i64> {
    values.sort_unstable();
    if values.is_empty() {
        None
    } else {
        Some(values[(values.len() - 1) / 2])
    }
}

pub fn summary(ds: &Dataset, spec: &FilterSpec) -> Summary {
    let mut per_line: HashMap<&str, usize> = HashMap::new();
    let mut ages: Vec<i64> = Vec::new();
    let mut durations: Vec<i64> = Vec::new();
    let mut holds = 0;
    for row in filtered(ds, spec) {
        holds += 1;
        *per_line.entry(row.hold.line_id.as_str()).or_default() += 1;
        if let Some(age) = row.age_days {
            ages.push(age);
        }
        if let Some(duration) = row.duration_days {
            durations.push(duration);
        }
    }
    Summary {
        holds,
        lines: per_line.len(),
        single_hold_lines: per_line.values().filter(|n| **n == 1).count(),
        median_age_days: lower_median(&mut ages),
        median_duration_days: lower_median(&mut durations),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Group {
    pub key: String,
    /// What to show for this group.
    pub label: String,
    pub holds: usize,
    pub lines: usize,
}

fn label_for(dim: &Dim, key: &str, row: &Row) -> String {
    if key.is_empty() {
        return "(blank)".to_string();
    }
    match dim {
        Dim::Remark => row.hold.remark.clone(),
        Dim::Blocker => format!("{} / {}", row.hold.discipline, row.blocker.item),
        _ => key.to_string(),
    }
}

pub fn group_by(ds: &Dataset, spec: &FilterSpec, dim: &Dim) -> Vec<Group> {
    let mut groups: BTreeMap<String, (String, usize, BTreeSet<&str>)> = BTreeMap::new();
    for row in filtered(ds, spec) {
        let key = dim.value(row);
        let entry = groups
            .entry(key)
            .or_insert_with_key(|key| (label_for(dim, key, row), 0, BTreeSet::new()));
        entry.1 += 1;
        entry.2.insert(row.hold.line_id.as_str());
    }
    let mut out: Vec<Group> = groups
        .into_iter()
        .map(|(key, (label, holds, lines))| Group {
            key,
            label,
            holds,
            lines: lines.len(),
        })
        .collect();
    out.sort_by(|a, b| b.holds.cmp(&a.holds).then_with(|| a.key.cmp(&b.key)));
    out
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Matrix {
    pub rows: Vec<String>,
    pub row_labels: Vec<String>,
    pub cols: Vec<String>,
    pub col_labels: Vec<String>,
    /// `cells[r][c]` is the number of holds with row value `rows[r]` and column value `cols[c]`.
    pub cells: Vec<Vec<usize>>,
}

pub fn matrix(ds: &Dataset, spec: &FilterSpec, row_dim: &Dim, col_dim: &Dim) -> Matrix {
    let row_groups = group_by(ds, spec, row_dim);
    let col_groups = group_by(ds, spec, col_dim);
    let (rows, row_labels): (Vec<String>, Vec<String>) =
        row_groups.into_iter().map(|g| (g.key, g.label)).unzip();
    let (cols, col_labels): (Vec<String>, Vec<String>) =
        col_groups.into_iter().map(|g| (g.key, g.label)).unzip();
    let row_index: HashMap<&str, usize> = rows
        .iter()
        .enumerate()
        .map(|(i, k)| (k.as_str(), i))
        .collect();
    let col_index: HashMap<&str, usize> = cols
        .iter()
        .enumerate()
        .map(|(i, k)| (k.as_str(), i))
        .collect();

    let mut cells = vec![vec![0usize; cols.len()]; rows.len()];
    for row in filtered(ds, spec) {
        let r = row_index[row_dim.value(row).as_str()];
        let c = col_index[col_dim.value(row).as_str()];
        cells[r][c] += 1;
    }
    Matrix {
        rows,
        row_labels,
        cols,
        col_labels,
        cells,
    }
}

/// One line of a view. Sizes, stress calc, and the mismatch flag come from the line's first
/// hold in the selection, because they are line-level attributes.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LineRow {
    pub line_id: String,
    pub holds: usize,
    /// In order of first appearance.
    pub disciplines: Vec<String>,
    /// In order of first appearance.
    pub hold_types: Vec<String>,
    /// Number of distinct blockers.
    pub blockers: usize,
    pub oldest_age_days: Option<i64>,
    pub model_size: Option<f64>,
    pub ldt_size: Option<f64>,
    pub stress_calc: String,
    pub size_mismatch: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum LineSort {
    /// Most holds first.
    #[default]
    HoldsDesc,
    /// Fewest disciplines, then fewest holds: the lines cheapest to free.
    Easiest,
    /// Oldest open hold first.
    OldestFirst,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct LineQuery {
    pub sort: LineSort,
    /// Keep only lines with exactly one hold in the selection.
    pub single_hold_only: bool,
}

/// The selected holds, in file order.
pub fn holds(ds: &Dataset, spec: &FilterSpec) -> Vec<Row> {
    filtered(ds, spec).cloned().collect()
}

fn push_unique(list: &mut Vec<String>, value: &str) {
    if !list.iter().any(|v| v == value) {
        list.push(value.to_string());
    }
}

pub fn lines(ds: &Dataset, spec: &FilterSpec, query: &LineQuery) -> Vec<LineRow> {
    let mut index: HashMap<&str, usize> = HashMap::new();
    let mut out: Vec<LineRow> = Vec::new();
    let mut blocker_keys: Vec<Vec<String>> = Vec::new();

    for row in filtered(ds, spec) {
        let position = *index.entry(row.hold.line_id.as_str()).or_insert_with(|| {
            out.push(LineRow {
                line_id: row.hold.line_id.clone(),
                holds: 0,
                disciplines: Vec::new(),
                hold_types: Vec::new(),
                blockers: 0,
                oldest_age_days: None,
                model_size: row.hold.model_size,
                ldt_size: row.hold.ldt_size,
                stress_calc: row.hold.stress_calc.clone(),
                size_mismatch: row.size_mismatch(),
            });
            blocker_keys.push(Vec::new());
            out.len() - 1
        });
        let line = &mut out[position];
        line.holds += 1;
        push_unique(&mut line.disciplines, &row.hold.discipline);
        push_unique(&mut line.hold_types, &row.hold.hold_type);
        push_unique(&mut blocker_keys[position], &row.blocker_key());
        line.oldest_age_days = line.oldest_age_days.max(row.age_days);
    }
    for (line, keys) in out.iter_mut().zip(&blocker_keys) {
        line.blockers = keys.len();
    }

    if query.single_hold_only {
        out.retain(|line| line.holds == 1);
    }

    match query.sort {
        LineSort::HoldsDesc => {
            out.sort_by(|a, b| {
                b.holds
                    .cmp(&a.holds)
                    .then_with(|| a.line_id.cmp(&b.line_id))
            });
        }
        LineSort::Easiest => {
            out.sort_by(|a, b| {
                a.disciplines
                    .len()
                    .cmp(&b.disciplines.len())
                    .then_with(|| a.holds.cmp(&b.holds))
                    .then_with(|| a.disciplines.first().cmp(&b.disciplines.first()))
                    .then_with(|| a.line_id.cmp(&b.line_id))
            });
        }
        LineSort::OldestFirst => {
            out.sort_by(|a, b| {
                Reverse(a.oldest_age_days)
                    .cmp(&Reverse(b.oldest_age_days))
                    .then_with(|| a.line_id.cmp(&b.line_id))
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filter::Status;
    use crate::testkit::sample;

    fn open() -> FilterSpec {
        FilterSpec::default()
    }

    fn sorted(sort: LineSort) -> LineQuery {
        LineQuery {
            sort,
            ..Default::default()
        }
    }

    fn all() -> FilterSpec {
        FilterSpec {
            status: Status::All,
            ..Default::default()
        }
    }

    fn keys(groups: &[Group]) -> Vec<(&str, usize, usize)> {
        groups
            .iter()
            .map(|g| (g.key.as_str(), g.holds, g.lines))
            .collect()
    }

    #[test]
    fn summary_of_open_holds() {
        let s = summary(&sample(), &open());
        assert_eq!(
            s,
            Summary {
                holds: 4,
                lines: 3,
                single_hold_lines: 2,
                median_age_days: Some(5),
                median_duration_days: None
            }
        );
    }

    #[test]
    fn summary_of_nothing() {
        let spec = FilterSpec {
            text: "no such text".into(),
            ..Default::default()
        };
        let s = summary(&sample(), &spec);
        assert_eq!(
            s,
            Summary {
                holds: 0,
                lines: 0,
                single_hold_lines: 0,
                median_age_days: None,
                median_duration_days: None
            }
        );
    }

    #[test]
    fn groups_sort_by_holds_then_key() {
        let groups = group_by(&sample(), &open(), &Dim::Discipline);
        assert_eq!(
            keys(&groups),
            vec![("Civil", 2, 2), ("Piping", 1, 1), ("Unspecified", 1, 1)]
        );
    }

    #[test]
    fn groups_follow_the_status_filter() {
        let all = FilterSpec {
            status: Status::All,
            ..Default::default()
        };
        let groups = group_by(&sample(), &all, &Dim::HoldType);
        assert_eq!(keys(&groups), vec![("MISC.", 3, 3), ("P&ID", 2, 2)]);
    }

    #[test]
    fn groups_by_blocker_type() {
        let groups = group_by(&sample(), &open(), &Dim::BlockerType);
        assert_eq!(
            keys(&groups),
            vec![("PR", 2, 2), ("P&ID", 1, 1), ("VENDOR", 1, 1)]
        );
    }

    #[test]
    fn matrix_counts_holds_per_cell() {
        let m = matrix(&sample(), &open(), &Dim::Discipline, &Dim::HoldType);
        assert_eq!(m.rows, vec!["Civil", "Piping", "Unspecified"]);
        assert_eq!(m.cols, vec!["MISC.", "P&ID"]);
        assert_eq!(m.cells, vec![vec![2, 0], vec![0, 1], vec![1, 0]]);
    }

    #[test]
    fn line_rows_aggregate_their_holds() {
        let rows = lines(&sample(), &open(), &LineQuery::default());
        let ids: Vec<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert_eq!(ids, vec!["L1", "L2", "L4"]);

        let l1 = &rows[0];
        assert_eq!(l1.holds, 2);
        assert_eq!(l1.disciplines, vec!["Civil", "Piping"]);
        assert_eq!(l1.hold_types, vec!["MISC.", "P&ID"]);
        assert_eq!(l1.blockers, 2);
        assert_eq!(l1.oldest_age_days, Some(40));
        assert!(!l1.size_mismatch);

        let l4 = &rows[2];
        assert_eq!(l4.model_size, Some(4.0));
        assert_eq!(l4.ldt_size, Some(6.0));
        assert_eq!(l4.stress_calc, "NR");
        assert!(l4.size_mismatch);
    }

    #[test]
    fn easiest_puts_single_discipline_single_hold_lines_first() {
        let rows = lines(&sample(), &open(), &sorted(LineSort::Easiest));
        let ids: Vec<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert_eq!(ids, vec!["L2", "L4", "L1"]);
    }

    #[test]
    fn oldest_first() {
        let rows = lines(&sample(), &open(), &sorted(LineSort::OldestFirst));
        let ids: Vec<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert_eq!(ids, vec!["L1", "L2", "L4"]);
    }

    #[test]
    fn median_of_two_ages_is_the_lower_one() {
        let mut ds = sample();
        ds.rows.truncate(2);
        ds.rows[0].age_days = Some(9);
        ds.rows[1].age_days = Some(3);
        assert_eq!(summary(&ds, &open()).median_age_days, Some(3));
    }

    #[test]
    fn oldest_first_puts_lines_without_a_creation_date_last() {
        let mut ds = sample();
        // L2 has a single open hold; without a creation date it has no age.
        ds.rows[2].age_days = None;
        let rows = lines(&ds, &open(), &sorted(LineSort::OldestFirst));
        let ids: Vec<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert_eq!(ids, vec!["L1", "L4", "L2"]);
    }

    #[test]
    fn summary_of_all_holds_separates_age_and_duration() {
        let s = summary(&sample(), &all());
        assert_eq!(s.median_age_days, Some(5));
        assert_eq!(s.median_duration_days, Some(30));
        assert_eq!(summary(&sample(), &open()).median_duration_days, None);
    }

    fn label_of<'a>(groups: &'a [Group], key: &str) -> &'a str {
        &groups.iter().find(|g| g.key == key).unwrap().label
    }

    #[test]
    fn remark_groups_show_the_cleaned_remark() {
        let groups = group_by(&sample(), &open(), &Dim::Remark);
        assert_eq!(
            label_of(&groups, "PENDING 538-PR-100"),
            "Pending 538-PR-100"
        );
    }

    #[test]
    fn blocker_groups_show_discipline_and_item() {
        let groups = group_by(&sample(), &open(), &Dim::Blocker);
        assert_eq!(label_of(&groups, "Civil|538-PR-100"), "Civil / 538-PR-100");
    }

    #[test]
    fn an_empty_key_is_labelled_blank() {
        let groups = group_by(&sample(), &open(), &Dim::StressCalc);
        assert_eq!(label_of(&groups, ""), "(blank)");
        assert_eq!(label_of(&groups, "NR"), "NR");
        let custom = group_by(&sample(), &open(), &Dim::Custom("Area".into()));
        assert_eq!(label_of(&custom, ""), "(blank)");
    }

    #[test]
    fn matrix_labels_follow_the_group_rule() {
        let m = matrix(&sample(), &open(), &Dim::Discipline, &Dim::HoldType);
        assert_eq!(m.row_labels, m.rows);
        assert_eq!(m.col_labels, m.cols);
        assert_eq!(m.cells, vec![vec![2, 0], vec![0, 1], vec![1, 0]]);
        let b = matrix(&sample(), &open(), &Dim::Blocker, &Dim::StressCalc);
        let civil = b.rows.iter().position(|k| k == "Civil|538-PR-100").unwrap();
        assert_eq!(b.row_labels[civil], "Civil / 538-PR-100");
        let blank = b.cols.iter().position(|k| k.is_empty()).unwrap();
        assert_eq!(b.col_labels[blank], "(blank)");
    }

    #[test]
    fn single_hold_only_keeps_lines_with_one_selected_hold() {
        let query = LineQuery {
            single_hold_only: true,
            ..Default::default()
        };
        let ids: Vec<String> = lines(&sample(), &open(), &query)
            .into_iter()
            .map(|r| r.line_id)
            .collect();
        assert_eq!(ids, vec!["L2", "L4"]);
    }

    #[test]
    fn holds_returns_selected_rows_in_file_order() {
        let ids: Vec<String> = holds(&sample(), &open())
            .into_iter()
            .map(|r| r.hold.line_id)
            .collect();
        assert_eq!(ids, vec!["L1", "L1", "L2", "L4"]);
        assert_eq!(holds(&sample(), &all()).len(), 5);
    }

    #[test]
    fn line_query_round_trips_and_defaults_from_empty_json() {
        let query = LineQuery {
            sort: LineSort::OldestFirst,
            single_hold_only: true,
        };
        let json = serde_json::to_string(&query).unwrap();
        assert_eq!(serde_json::from_str::<LineQuery>(&json).unwrap(), query);
        assert_eq!(
            serde_json::from_str::<LineQuery>("{}").unwrap(),
            LineQuery::default()
        );
    }

    #[test]
    fn oldest_age_ignores_released_holds() {
        let rows = lines(&sample(), &all(), &LineQuery::default());
        let l3 = rows.iter().find(|r| r.line_id == "L3").unwrap();
        assert_eq!(l3.oldest_age_days, None);
    }
}
