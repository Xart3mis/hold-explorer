//! Aggregations behind Overview, Breakdown, Lines, and the pickers of the filter bar.

use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::dataset::{Dataset, Row};
use crate::filter::{AgeBand, Dim, FilterSpec, Status};
use crate::normalize::{DASH, UNSPECIFIED};

fn filtered<'a>(ds: &'a Dataset, spec: &'a FilterSpec) -> impl Iterator<Item = &'a Row> {
    ds.rows.iter().filter(move |row| spec.matches(row))
}

/// Headline numbers for a selection of holds.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Summary {
    /// Number of selected holds.
    pub holds: usize,
    /// Number of distinct lines among the selected holds.
    pub lines: usize,
    /// Number of lines that have exactly one selected hold.
    pub single_hold_lines: usize,
    /// Lower median of the ages of the selected open holds, in days (the lower of the two middle
    /// values when their count is even); `None` when no selected open hold has a creation date.
    pub median_age_days: Option<i64>,
    /// Lower median of the durations of the selected released holds, in days; `None` when no
    /// selected released hold has both a creation and a release date.
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

/// Counts the holds and lines selected by `spec` and gives the median age and duration.
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

/// One value of a dimension and how many holds and lines have it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Group {
    /// The dimension value, compared exactly (case-sensitive); empty when the hold has none.
    pub key: String,
    /// What to show for this group: `(blank)` for an empty key, the original remark of the
    /// group's first hold for a remark group, `<discipline> / <item>` for a blocker group,
    /// and the key otherwise.
    pub label: String,
    /// Number of selected holds with this value.
    pub holds: usize,
    /// Number of distinct lines among those holds.
    pub lines: usize,
}

pub(crate) fn label_for(dim: &Dim, key: &str, row: &Row) -> String {
    if key.is_empty() {
        return "(blank)".to_string();
    }
    match dim {
        Dim::Remark => row.hold.remark.clone(),
        Dim::Blocker => format!("{} / {}", row.hold.discipline, row.blocker.item),
        _ => key.to_string(),
    }
}

/// Groups the selected holds by `dim`. Groups are ordered by hold count, largest first, then by
/// key in byte order. Grouping is case-sensitive.
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

/// Hold counts for every pair of values of two dimensions.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Matrix {
    /// Row dimension values, ordered as `group_by` orders groups.
    pub rows: Vec<String>,
    /// Display label of each entry of `rows`.
    pub row_labels: Vec<String>,
    /// Column dimension values, ordered as `group_by` orders groups.
    pub cols: Vec<String>,
    /// Display label of each entry of `cols`.
    pub col_labels: Vec<String>,
    /// `cells[r][c]` is the number of holds with row value `rows[r]` and column value `cols[c]`.
    pub cells: Vec<Vec<usize>>,
}

/// Counts the selected holds for each pair of a `row_dim` value and a `col_dim` value.
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
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LineRow {
    /// The line.
    pub line_id: String,
    /// Number of selected holds on the line.
    pub holds: usize,
    /// In order of first appearance.
    pub disciplines: Vec<String>,
    /// In order of first appearance.
    pub hold_types: Vec<String>,
    /// Number of distinct blockers (by discipline and item) among the selected holds.
    pub blockers: usize,
    /// Greatest age of the line's selected open holds, in days; `None` when none has an age.
    pub oldest_age_days: Option<i64>,
    /// Model size of the line's first selected hold; `None` when it has none.
    pub model_size: Option<f64>,
    /// LDT size of the line's first selected hold; `None` when it has none.
    pub ldt_size: Option<f64>,
    /// Stress calculation of the line's first selected hold.
    pub stress_calc: String,
    /// Whether the line's first selected hold has differing model and LDT sizes.
    pub size_mismatch: bool,
}

/// How `lines` orders its result; ties end in line id order. A line without the sorted value
/// (no size, blank stress calc, no age) comes last.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum LineSort {
    /// Most holds first.
    #[default]
    HoldsDesc,
    /// The lines cheapest to free first: fewest disciplines, then fewest holds, then the name of
    /// the first-appearing discipline, then line ID.
    Easiest,
    /// Line with the oldest open hold first; lines with no open-hold age come last.
    OldestFirst,
    /// Line ID ascending, in byte order.
    LineId,
    /// Most distinct blockers first.
    Blockers,
    /// Most disciplines first.
    Disciplines,
    /// Largest model size first.
    ModelSize,
    /// Largest LDT size first.
    LdtSize,
    /// Stress calculation ascending, without regard to case.
    StressCalc,
}

/// Options for `lines`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(default)]
pub struct LineQuery {
    /// Order of the result.
    pub sort: LineSort,
    /// Keep only lines with exactly one hold in the selection.
    pub single_hold_only: bool,
    /// Keep only lines whose sizes differ. Combines with `single_hold_only` by AND.
    pub size_mismatch_only: bool,
    /// Reverse the order among the lines that have the sorted value; the others stay last and
    /// ties still end in line ID order.
    pub reverse: bool,
}

/// How `holds` orders its result; ties stay in file order. Text compares without regard to case.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum HoldSort {
    /// The order of the file.
    #[default]
    FileOrder,
    /// Greatest `Row::days` first; rows without one come last.
    OldestFirst,
    /// Line ID ascending, in byte order.
    LineId,
    /// Discipline ascending; holds with the blank spelling `Unspecified` come last.
    Discipline,
    /// Hold type ascending; holds with the blank spelling `—` come last.
    HoldType,
    /// Blocker ascending: the discipline, then the item.
    Blocker,
    /// Name ascending; holds with the blank spelling `—` come last.
    Name,
}

/// Options for `holds`: the order and the page to return.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(default)]
pub struct HoldQuery {
    /// Order of the selected holds before the page is cut.
    pub sort: HoldSort,
    /// Number of sorted holds to skip. An offset at or past the total gives no rows.
    pub offset: usize,
    /// Most rows to return; `None` returns every row from `offset`.
    pub limit: Option<usize>,
    /// Reverse the order among the holds that have the sorted value; the others stay last and
    /// ties stay in file order. On `FileOrder` it gives the file backwards.
    pub reverse: bool,
}

/// One page of the selected holds.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct HoldPage {
    /// Selected holds before paging.
    pub total: usize,
    /// The holds of the page, in the order `HoldQuery::sort` gives.
    pub rows: Vec<Row>,
    /// The position in `Dataset::rows` of each entry of `rows`.
    pub positions: Vec<usize>,
    /// Characters of the longest line ID among the selected holds; 0 when there is none.
    pub widest_line_id: usize,
}

/// Orders `items` by `key`. Items whose key is `None` come last, and ties end as `tie` says.
/// `reverse` flips the comparison of keys only.
fn order_by<T, K>(
    items: &mut Vec<T>,
    key: impl Fn(&T) -> Option<K>,
    compare: impl Fn(&K, &K) -> Ordering,
    reverse: bool,
    tie: impl Fn(&T, &T) -> Ordering,
) {
    let mut keyed: Vec<(Option<K>, T)> = items.drain(..).map(|item| (key(&item), item)).collect();
    keyed.sort_by(|(ka, a), (kb, b)| match (ka, kb) {
        (Some(x), Some(y)) => {
            let order = compare(x, y);
            (if reverse { order.reverse() } else { order }).then_with(|| tie(a, b))
        }
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => tie(a, b),
    });
    items.extend(keyed.into_iter().map(|(_, item)| item));
}

fn chars(text: &str) -> usize {
    text.chars().count()
}

/// The page of the selected holds that `query` asks for, with the number of selected holds.
pub fn holds(ds: &Dataset, spec: &FilterSpec, query: &HoldQuery) -> HoldPage {
    let mut selected: Vec<(usize, &Row)> = ds
        .rows
        .iter()
        .enumerate()
        .filter(|(_, row)| spec.matches(row))
        .collect();
    let widest_line_id = selected
        .iter()
        .map(|(_, row)| chars(&row.hold.line_id))
        .max()
        .unwrap_or(0);
    let reverse = query.reverse;
    let same = |_: &(usize, &Row), _: &(usize, &Row)| Ordering::Equal;
    let text = |value: &str, blank: &str| (value != blank).then(|| value.to_lowercase());
    match query.sort {
        HoldSort::FileOrder if reverse => selected.reverse(),
        HoldSort::FileOrder => {}
        HoldSort::OldestFirst => order_by(
            &mut selected,
            |(_, row)| row.days(),
            |a, b| b.cmp(a),
            reverse,
            same,
        ),
        HoldSort::LineId => order_by(
            &mut selected,
            |(_, row)| Some(row.hold.line_id.clone()),
            |a, b| a.cmp(b),
            reverse,
            same,
        ),
        HoldSort::Discipline => order_by(
            &mut selected,
            |(_, row)| text(&row.hold.discipline, UNSPECIFIED),
            |a, b| a.cmp(b),
            reverse,
            same,
        ),
        HoldSort::HoldType => order_by(
            &mut selected,
            |(_, row)| text(&row.hold.hold_type, DASH),
            |a, b| a.cmp(b),
            reverse,
            same,
        ),
        HoldSort::Name => order_by(
            &mut selected,
            |(_, row)| text(&row.hold.name, DASH),
            |a, b| a.cmp(b),
            reverse,
            same,
        ),
        HoldSort::Blocker => order_by(
            &mut selected,
            |(_, row)| {
                Some((
                    row.hold.discipline.to_lowercase(),
                    row.blocker.item.to_lowercase(),
                ))
            },
            |a, b| a.cmp(b),
            reverse,
            same,
        ),
    }
    let total = selected.len();
    let (positions, rows) = selected
        .into_iter()
        .skip(query.offset)
        .take(query.limit.unwrap_or(usize::MAX))
        .map(|(position, row)| (position, row.clone()))
        .unzip();
    HoldPage {
        total,
        rows,
        positions,
        widest_line_id,
    }
}

fn push_unique(list: &mut Vec<String>, value: &str) {
    if !list.iter().any(|v| v == value) {
        list.push(value.to_string());
    }
}

/// One page of lines.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct LinePage {
    /// Lines the query selects, before paging.
    pub total: usize,
    /// Characters of the longest line ID among them; 0 when there is none.
    pub widest_line_id: usize,
    /// The lines of the page, in the order `LineQuery::sort` gives.
    pub rows: Vec<LineRow>,
}

/// One row per line that has a selected hold, in the order `query.sort` gives. Disciplines and
/// hold types are listed in order of first appearance among the selected holds.
pub fn lines(ds: &Dataset, spec: &FilterSpec, query: &LineQuery) -> Vec<LineRow> {
    line_page(ds, spec, query, 0, None).rows
}

/// The page of lines that `query` selects and orders, from `offset`, at most `limit` of them
/// (`None` for all). An offset at or past the total gives no rows.
pub fn line_page(
    ds: &Dataset,
    spec: &FilterSpec,
    query: &LineQuery,
    offset: usize,
    limit: Option<usize>,
) -> LinePage {
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

    out.retain(|line| {
        (!query.single_hold_only || line.holds == 1)
            && (!query.size_mismatch_only || line.size_mismatch)
    });

    let reverse = query.reverse;
    let by_id = |a: &LineRow, b: &LineRow| a.line_id.cmp(&b.line_id);
    match query.sort {
        LineSort::HoldsDesc => order_by(
            &mut out,
            |line| Some(line.holds),
            |a, b| b.cmp(a),
            reverse,
            by_id,
        ),
        LineSort::Easiest => order_by(
            &mut out,
            |line| {
                Some((
                    line.disciplines.len(),
                    line.holds,
                    line.disciplines.first().cloned(),
                ))
            },
            |a, b| a.cmp(b),
            reverse,
            by_id,
        ),
        LineSort::OldestFirst => order_by(
            &mut out,
            |line| line.oldest_age_days,
            |a, b| b.cmp(a),
            reverse,
            by_id,
        ),
        LineSort::LineId => order_by(
            &mut out,
            |line| Some(line.line_id.clone()),
            |a, b| a.cmp(b),
            reverse,
            by_id,
        ),
        LineSort::Blockers => order_by(
            &mut out,
            |line| Some(line.blockers),
            |a, b| b.cmp(a),
            reverse,
            by_id,
        ),
        LineSort::Disciplines => order_by(
            &mut out,
            |line| Some(line.disciplines.len()),
            |a, b| b.cmp(a),
            reverse,
            by_id,
        ),
        LineSort::ModelSize => order_by(
            &mut out,
            |line| line.model_size,
            |a, b| b.total_cmp(a),
            reverse,
            by_id,
        ),
        LineSort::LdtSize => order_by(
            &mut out,
            |line| line.ldt_size,
            |a, b| b.total_cmp(a),
            reverse,
            by_id,
        ),
        LineSort::StressCalc => order_by(
            &mut out,
            |line| (!line.stress_calc.is_empty()).then(|| line.stress_calc.to_lowercase()),
            |a, b| a.cmp(b),
            reverse,
            by_id,
        ),
    }

    let total = out.len();
    let widest_line_id = out
        .iter()
        .map(|line| chars(&line.line_id))
        .max()
        .unwrap_or(0);
    let rows = out
        .into_iter()
        .skip(offset)
        .take(limit.unwrap_or(usize::MAX))
        .collect();
    LinePage {
        total,
        widest_line_id,
        rows,
    }
}

/// How many holds each choice of the filters that are not dimensions would keep, each counted
/// with that one filter replaced and every other part of `spec` in force.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct FacetCounts {
    /// Holds kept with the status Open.
    pub open: usize,
    /// Holds kept with the status Released.
    pub released: usize,
    /// One per entry of `bands`: holds kept with `age_bands` set to that band alone.
    pub age_bands: Vec<usize>,
    /// Holds kept with `size_mismatch` `Some(true)`.
    pub size_mismatch: usize,
    /// Holds kept with `size_mismatch` `Some(false)`.
    pub size_match: usize,
}

/// Counts the holds that each status, each of `bands`, and each size choice would keep, with the
/// rest of `spec` in force.
pub fn facet_counts(ds: &Dataset, spec: &FilterSpec, bands: &[AgeBand]) -> FacetCounts {
    let count = |spec: &FilterSpec| filtered(ds, spec).count();
    let with_status = |status| FilterSpec {
        status,
        ..spec.clone()
    };
    let with_size = |wanted| FilterSpec {
        size_mismatch: Some(wanted),
        ..spec.clone()
    };
    FacetCounts {
        open: count(&with_status(Status::Open)),
        released: count(&with_status(Status::Released)),
        age_bands: bands
            .iter()
            .map(|band| {
                count(&FilterSpec {
                    age_bands: vec![*band],
                    ..spec.clone()
                })
            })
            .collect(),
        size_mismatch: count(&with_size(true)),
        size_match: count(&with_size(false)),
    }
}

/// The values of a dimension a picker offers.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ValuePage {
    /// How many values match `search`, before the limit.
    pub total: usize,
    /// The first `limit` of them, ordered as `group_by` orders groups.
    pub values: Vec<Group>,
}

/// Groups the holds kept by `spec.without(dim)` by `dim`, keeps the groups whose label contains
/// `search` (case-insensitive; an empty search keeps all), and returns the first `limit`.
pub fn value_page(
    ds: &Dataset,
    spec: &FilterSpec,
    dim: &Dim,
    search: &str,
    limit: usize,
) -> ValuePage {
    let needle = search.to_lowercase();
    let mut matching: Vec<Group> = group_by(ds, &spec.without(dim), dim)
        .into_iter()
        .filter(|group| group.label.to_lowercase().contains(&needle))
        .collect();
    let total = matching.len();
    matching.truncate(limit);
    ValuePage {
        total,
        values: matching,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dataset::Dataset;
    use crate::filter::{default_age_bands, FieldFilter};
    use crate::model::Hold;
    use crate::rules::RuleSet;
    use crate::testkit::{hold, sample, snapshot};

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

    fn page(spec: &FilterSpec, query: HoldQuery) -> (usize, Vec<String>) {
        let page = holds(&sample(), spec, &query);
        let ids = page.rows.into_iter().map(|r| r.hold.line_id).collect();
        (page.total, ids)
    }

    #[test]
    fn holds_returns_selected_rows_in_file_order() {
        let (total, ids) = page(&open(), HoldQuery::default());
        assert_eq!(total, 4);
        assert_eq!(ids, vec!["L1", "L1", "L2", "L4"]);
        assert_eq!(page(&all(), HoldQuery::default()).0, 5);
    }

    #[test]
    fn holds_page_by_offset_and_limit() {
        let limited = HoldQuery {
            limit: Some(2),
            ..Default::default()
        };
        assert_eq!(page(&open(), limited), (4, vec!["L1".into(), "L1".into()]));
        let tail = HoldQuery {
            offset: 3,
            limit: Some(2),
            ..Default::default()
        };
        assert_eq!(page(&open(), tail), (4, vec!["L4".to_string()]));
        let past = HoldQuery {
            offset: 10,
            ..Default::default()
        };
        assert_eq!(page(&open(), past), (4, Vec::new()));
    }

    #[test]
    fn holds_sort_oldest_first_and_by_line() {
        let oldest = holds(
            &sample(),
            &open(),
            &HoldQuery {
                sort: HoldSort::OldestFirst,
                ..Default::default()
            },
        );
        let ages: Vec<_> = oldest.rows.iter().map(|r| r.age_days).collect();
        assert_eq!(ages, vec![Some(40), Some(10), Some(5), Some(1)]);
        let by_line = HoldQuery {
            sort: HoldSort::LineId,
            ..Default::default()
        };
        assert_eq!(page(&all(), by_line).1, vec!["L1", "L1", "L2", "L3", "L4"]);
    }

    #[test]
    fn hold_query_defaults_from_empty_json() {
        assert_eq!(
            serde_json::from_str::<HoldQuery>("{}").unwrap(),
            HoldQuery::default()
        );
    }

    #[test]
    fn line_query_round_trips_and_defaults_from_empty_json() {
        let query = LineQuery {
            sort: LineSort::OldestFirst,
            single_hold_only: true,
            size_mismatch_only: true,
            reverse: true,
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

    fn only(dim: Dim, values: &[&str]) -> FilterSpec {
        FilterSpec {
            fields: vec![FieldFilter {
                dim,
                values: values.iter().map(|s| s.to_string()).collect(),
                negate: false,
            }],
            ..Default::default()
        }
    }

    #[test]
    fn facet_counts_ignore_the_status_and_obey_the_field_filters() {
        let spec = FilterSpec {
            status: Status::All,
            ..only(Dim::Discipline, &["Civil", "Process"])
        };
        let counts = facet_counts(&sample(), &spec, &default_age_bands());
        assert_eq!((counts.open, counts.released), (2, 1));

        let released_only = FilterSpec {
            status: Status::Released,
            ..FilterSpec::default()
        };
        let counts = facet_counts(&sample(), &released_only, &default_age_bands());
        assert_eq!((counts.open, counts.released), (4, 1));
    }

    #[test]
    fn each_age_band_count_is_the_summary_with_that_band_alone() {
        let bands = default_age_bands();
        let counts = facet_counts(&sample(), &open(), &bands);
        assert_eq!(counts.age_bands, vec![3, 0, 1, 0, 0]);
        // The spec's own age bands are replaced, not combined.
        let banded = FilterSpec {
            age_bands: vec![bands[4]],
            ..open()
        };
        assert_eq!(
            facet_counts(&sample(), &banded, &bands).age_bands,
            counts.age_bands
        );
        for (band, count) in bands.iter().zip(&counts.age_bands) {
            let alone = FilterSpec {
                age_bands: vec![*band],
                ..open()
            };
            assert_eq!(summary(&sample(), &alone).holds, *count);
        }
    }

    #[test]
    fn size_counts_replace_the_mismatch_filter_and_add_up_to_the_kept_holds() {
        let counts = facet_counts(&sample(), &open(), &default_age_bands());
        assert_eq!((counts.size_mismatch, counts.size_match), (1, 3));
        let mismatched = FilterSpec {
            size_mismatch: Some(true),
            ..open()
        };
        let replaced = facet_counts(&sample(), &mismatched, &default_age_bands());
        assert_eq!(
            (replaced.size_mismatch, replaced.size_match),
            (counts.size_mismatch, counts.size_match)
        );
        // Every other count obeys the mismatch filter that is in force.
        assert_eq!(replaced.open, 1);
        assert_eq!(
            counts.size_mismatch + counts.size_match,
            summary(&sample(), &open()).holds
        );
    }

    #[test]
    fn a_discipline_filter_lowers_every_count() {
        let spec = only(Dim::Discipline, &["Civil"]);
        let counts = facet_counts(&sample(), &spec, &default_age_bands());
        assert_eq!(counts.open, 2);
        assert_eq!(counts.age_bands, vec![2, 0, 0, 0, 0]);
        assert_eq!((counts.size_mismatch, counts.size_match), (0, 2));
    }

    #[test]
    fn value_page_counts_ignore_its_own_entry_and_obey_the_others() {
        let spec = only(Dim::Discipline, &["Civil"]);
        let page = value_page(&sample(), &spec, &Dim::Discipline, "", 10);
        assert_eq!(page.total, 3);
        assert_eq!(
            keys(&page.values),
            vec![("Civil", 2, 2), ("Piping", 1, 1), ("Unspecified", 1, 1)]
        );

        let mut narrowed = spec;
        narrowed.fields.push(FieldFilter {
            dim: Dim::HoldType,
            values: vec!["P&ID".into()],
            negate: false,
        });
        let page = value_page(&sample(), &narrowed, &Dim::Discipline, "", 10);
        assert_eq!(keys(&page.values), vec![("Piping", 1, 1)]);
    }

    #[test]
    fn value_page_search_matches_the_label_without_regard_to_case() {
        let page = value_page(&sample(), &open(), &Dim::Discipline, "CIV", 10);
        assert_eq!(keys(&page.values), vec![("Civil", 2, 2)]);
        assert_eq!(page.total, 1);
        let page = value_page(&sample(), &open(), &Dim::Discipline, "i", 10);
        assert_eq!(page.total, 3);
    }

    #[test]
    fn value_page_total_counts_matches_before_the_limit() {
        let page = value_page(&sample(), &open(), &Dim::Discipline, "", 2);
        assert_eq!(page.total, 3);
        assert_eq!(keys(&page.values), vec![("Civil", 2, 2), ("Piping", 1, 1)]);
        let none = value_page(&sample(), &open(), &Dim::Discipline, "", 0);
        assert_eq!(none.total, 3);
        assert!(none.values.is_empty());
    }

    #[test]
    fn value_page_finds_a_blocker_by_its_label() {
        let page = value_page(&sample(), &open(), &Dim::Blocker, "civil / 538-pr-100", 10);
        assert_eq!(page.total, 1);
        assert_eq!(page.values[0].key, "Civil|538-PR-100");
        assert_eq!(page.values[0].label, "Civil / 538-PR-100");
    }

    /// Lines C, A, B, D in file order; every hold is open.
    ///
    /// | line | holds | disciplines | blockers | oldest | model | ldt  | stress |
    /// |------|-------|-------------|----------|--------|-------|------|--------|
    /// | C    | 1     | 1           | 1        | 5      | none  | 8    | blank  |
    /// | A    | 2     | 2           | 2        | 20     | 6     | 6    | b      |
    /// | B    | 1     | 1           | 1        | none   | 12    | none | B      |
    /// | D    | 3     | 1           | 2        | 9      | 12    | 4    | a      |
    fn line_set() -> Dataset {
        let pr1 = "Pending 538-PR-100";
        let pr2 = "Pending 538-PR-200";
        let line = |id: &str, discipline: &str, remark: &str, age: i64| {
            hold(id, discipline, "MISC.", remark, age)
        };
        let mut c = line("C", "Civil", pr1, 5);
        c.ldt_size = Some(8.0);
        let mut a = line("A", "Civil", pr1, 20);
        a.model_size = Some(6.0);
        a.ldt_size = Some(6.0);
        a.stress_calc = "b".to_string();
        let mut b = line("B", "Civil", pr2, 0);
        b.created = None;
        b.model_size = Some(12.0);
        b.stress_calc = "B".to_string();
        let mut d = line("D", "Civil", pr1, 9);
        d.model_size = Some(12.0);
        d.ldt_size = Some(4.0);
        d.stress_calc = "a".to_string();
        Dataset::build(
            vec![
                c,
                a,
                line("A", "Piping", "P&ID update", 2),
                b,
                d,
                line("D", "Civil", "Pending 538-PR-300", 1),
                line("D", "Civil", pr1, 4),
            ],
            RuleSet::builtin(),
            snapshot(),
        )
    }

    fn line_ids(ds: &Dataset, query: &LineQuery) -> String {
        lines(ds, &open(), query)
            .into_iter()
            .map(|r| r.line_id)
            .collect()
    }

    fn line_order(sort: LineSort, reverse: bool) -> String {
        line_ids(
            &line_set(),
            &LineQuery {
                sort,
                reverse,
                ..Default::default()
            },
        )
    }

    #[test]
    fn new_line_sorts_put_lines_without_the_value_last_and_end_ties_by_line() {
        assert_eq!(line_order(LineSort::LineId, false), "ABCD");
        assert_eq!(line_order(LineSort::Blockers, false), "ADBC");
        assert_eq!(line_order(LineSort::Disciplines, false), "ABCD");
        assert_eq!(line_order(LineSort::ModelSize, false), "BDAC");
        assert_eq!(line_order(LineSort::LdtSize, false), "CADB");
        assert_eq!(line_order(LineSort::StressCalc, false), "DABC");
        assert_eq!(line_order(LineSort::HoldsDesc, false), "DABC");
        assert_eq!(line_order(LineSort::OldestFirst, false), "ADCB");
        assert_eq!(line_order(LineSort::Easiest, false), "BCDA");
    }

    #[test]
    fn reverse_flips_the_rows_that_have_a_value_and_keeps_the_others_last() {
        assert_eq!(line_order(LineSort::LineId, true), "DCBA");
        assert_eq!(line_order(LineSort::Blockers, true), "BCAD");
        assert_eq!(line_order(LineSort::Disciplines, true), "BCDA");
        assert_eq!(line_order(LineSort::ModelSize, true), "ABDC");
        assert_eq!(line_order(LineSort::LdtSize, true), "DACB");
        assert_eq!(line_order(LineSort::StressCalc, true), "ABDC");
        assert_eq!(line_order(LineSort::HoldsDesc, true), "BCAD");
        assert_eq!(line_order(LineSort::OldestFirst, true), "CDAB");
        assert_eq!(line_order(LineSort::Easiest, true), "ADBC");
    }

    #[test]
    fn size_mismatch_only_combines_with_single_hold_only_by_and() {
        let mismatched = LineQuery {
            size_mismatch_only: true,
            ..Default::default()
        };
        assert_eq!(line_ids(&line_set(), &mismatched), "D");
        let both = LineQuery {
            single_hold_only: true,
            ..mismatched
        };
        assert_eq!(line_ids(&line_set(), &both), "");
        let single = LineQuery {
            single_hold_only: true,
            ..Default::default()
        };
        assert_eq!(line_ids(&line_set(), &single), "BC");
    }

    const EVERY_LINE_SORT: [LineSort; 9] = [
        LineSort::HoldsDesc,
        LineSort::Easiest,
        LineSort::OldestFirst,
        LineSort::LineId,
        LineSort::Blockers,
        LineSort::Disciplines,
        LineSort::ModelSize,
        LineSort::LdtSize,
        LineSort::StressCalc,
    ];

    #[test]
    fn line_page_totals_do_not_depend_on_the_page() {
        let ds = line_set();
        for sort in EVERY_LINE_SORT {
            let query = LineQuery {
                sort,
                ..Default::default()
            };
            let whole = line_page(&ds, &open(), &query, 0, None);
            assert_eq!(whole.total, 4);
            assert_eq!(whole.widest_line_id, 1);
            assert_eq!(lines(&ds, &open(), &query), whole.rows);
            let tail = line_page(&ds, &open(), &query, 3, Some(5));
            assert_eq!((tail.total, tail.widest_line_id), (4, 1));
            assert_eq!(tail.rows, whole.rows[3..].to_vec());
            let middle = line_page(&ds, &open(), &query, 1, Some(2));
            assert_eq!(middle.rows, whole.rows[1..3].to_vec());
            assert_eq!(middle.total, 4);
        }
    }

    #[test]
    fn line_page_past_the_total_has_no_rows() {
        let page = line_page(&line_set(), &open(), &LineQuery::default(), 4, None);
        assert_eq!((page.total, page.rows.len()), (4, 0));
        let page = line_page(&line_set(), &open(), &LineQuery::default(), 99, Some(3));
        assert_eq!((page.total, page.rows.len()), (4, 0));
    }

    #[test]
    fn widest_line_id_counts_characters_and_is_zero_without_lines() {
        let ds = Dataset::build(
            vec![
                hold("é-é", "Civil", "MISC.", "x", 1),
                hold("ab", "Civil", "MISC.", "x", 1),
            ],
            RuleSet::builtin(),
            snapshot(),
        );
        assert_eq!(
            line_page(&ds, &open(), &LineQuery::default(), 0, Some(1)).widest_line_id,
            3
        );
        assert_eq!(holds(&ds, &open(), &HoldQuery::default()).widest_line_id, 3);
        let nothing = FilterSpec {
            text: "no such text".into(),
            ..Default::default()
        };
        assert_eq!(
            line_page(&ds, &nothing, &LineQuery::default(), 0, None).widest_line_id,
            0
        );
        assert_eq!(
            holds(&ds, &nothing, &HoldQuery::default()).widest_line_id,
            0
        );
    }

    /// Positions 0 to 4: (line, discipline, hold type, name, remark).
    fn hold_set() -> Dataset {
        let make =
            |line: &str, discipline: &str, hold_type: &str, name: &str, remark: &str| -> Hold {
                let mut h = hold(line, discipline, hold_type, remark, 3);
                h.name = name.to_string();
                h
            };
        Dataset::build(
            vec![
                make("L1", "Piping", "pid", "bob", "P&ID update"),
                make("L2", "civil", "MISC.", "Alice", "Pending 538-PR-200"),
                make("L3", "Civil", "misc.", "alice", "Pending 538-PR-100"),
                make("L4", "Piping", "P&ID", "Bob", "Pending 538-PR-100"),
                make("L5", "Civil", "Zed", "—", "Pending 538-PR-100"),
            ],
            RuleSet::builtin(),
            snapshot(),
        )
    }

    fn hold_positions(ds: &Dataset, sort: HoldSort, reverse: bool) -> Vec<usize> {
        let page = holds(
            ds,
            &open(),
            &HoldQuery {
                sort,
                reverse,
                ..Default::default()
            },
        );
        page.positions
    }

    #[test]
    fn new_hold_sorts_compare_text_without_case_and_keep_file_order_on_ties() {
        let ds = hold_set();
        assert_eq!(
            hold_positions(&ds, HoldSort::Discipline, false),
            vec![1, 2, 4, 0, 3]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::HoldType, false),
            vec![1, 2, 3, 0, 4]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::Name, false),
            vec![1, 2, 0, 3, 4]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::Blocker, false),
            vec![2, 4, 1, 3, 0]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::FileOrder, false),
            vec![0, 1, 2, 3, 4]
        );
    }

    #[test]
    fn reverse_flips_holds_and_keeps_ties_in_file_order() {
        let ds = hold_set();
        assert_eq!(
            hold_positions(&ds, HoldSort::Discipline, true),
            vec![0, 3, 1, 2, 4]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::HoldType, true),
            vec![4, 0, 3, 1, 2]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::Name, true),
            vec![0, 3, 1, 2, 4]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::Blocker, true),
            vec![0, 3, 1, 2, 4]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::LineId, true),
            vec![4, 3, 2, 1, 0]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::FileOrder, true),
            vec![4, 3, 2, 1, 0]
        );
    }

    #[test]
    fn holds_with_a_blank_spelling_come_last_in_both_directions() {
        let make = |discipline: &str, hold_type: &str, name: &str| -> Hold {
            let mut h = hold("L", discipline, hold_type, "x", 3);
            h.name = name.to_string();
            h
        };
        // Position 1 is blank for all three sorts; 0 and 3 tie on every value.
        let ds = Dataset::build(
            vec![
                make("Civil", "b", "bob"),
                make(UNSPECIFIED, DASH, DASH),
                make("Piping", "a", "Alice"),
                make("Civil", "b", "bob"),
                make(UNSPECIFIED, DASH, DASH),
            ],
            RuleSet::builtin(),
            snapshot(),
        );
        for (sort, forward, backward) in [
            (
                HoldSort::Discipline,
                vec![0, 3, 2, 1, 4],
                vec![2, 0, 3, 1, 4],
            ),
            (HoldSort::HoldType, vec![2, 0, 3, 1, 4], vec![0, 3, 2, 1, 4]),
            (HoldSort::Name, vec![2, 0, 3, 1, 4], vec![0, 3, 2, 1, 4]),
        ] {
            assert_eq!(hold_positions(&ds, sort, false), forward, "{sort:?}");
            assert_eq!(
                hold_positions(&ds, sort, true),
                backward,
                "{sort:?} reversed"
            );
        }
    }

    #[test]
    fn reversed_oldest_first_keeps_holds_without_an_age_last() {
        let mut ds = sample();
        ds.rows[2].age_days = None;
        assert_eq!(
            hold_positions(&ds, HoldSort::OldestFirst, false),
            vec![1, 0, 4, 2]
        );
        assert_eq!(
            hold_positions(&ds, HoldSort::OldestFirst, true),
            vec![4, 0, 1, 2]
        );
    }

    #[test]
    fn positions_name_the_row_of_the_dataset_for_every_sort_and_page() {
        let ds = hold_set();
        let sorts = [
            HoldSort::FileOrder,
            HoldSort::OldestFirst,
            HoldSort::LineId,
            HoldSort::Discipline,
            HoldSort::HoldType,
            HoldSort::Blocker,
            HoldSort::Name,
        ];
        for sort in sorts {
            for reverse in [false, true] {
                for (offset, limit) in [(0, None), (2, Some(2)), (4, Some(9))] {
                    let query = HoldQuery {
                        sort,
                        offset,
                        limit,
                        reverse,
                    };
                    let page = holds(&ds, &open(), &query);
                    assert_eq!(page.total, 5);
                    assert_eq!(page.positions.len(), page.rows.len());
                    for (position, row) in page.positions.iter().zip(&page.rows) {
                        assert_eq!(&ds.rows[*position], row);
                    }
                }
            }
        }
        let released = FilterSpec {
            status: Status::All,
            ..Default::default()
        };
        let page = holds(
            &sample(),
            &released,
            &HoldQuery {
                offset: 3,
                ..Default::default()
            },
        );
        assert_eq!(page.positions, vec![3, 4]);
    }

    #[test]
    fn line_and_hold_queries_default_the_new_fields_from_old_json() {
        let line: LineQuery = serde_json::from_str(r#"{"sort":"Blockers"}"#).unwrap();
        assert_eq!(line.sort, LineSort::Blockers);
        assert!(!line.reverse && !line.size_mismatch_only);
        let hold: HoldQuery = serde_json::from_str(r#"{"sort":"Name"}"#).unwrap();
        assert!(!hold.reverse);
    }
}
