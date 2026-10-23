//! Global search over the holds of one snapshot: line IDs, blockers, people and roles, remarks,
//! and the values of hold type, discipline, and stress calc.
//!
//! Matching ignores case, accents, and runs of white space, through one normalization ("folding")
//! applied to the query and to every text alike. A text matches when the folded query is a
//! substring of it; failing that, when every query word of at least four characters is within
//! one edit of a word of the text (two edits from eight characters), an edit being an
//! insertion, a deletion, a substitution, or a swap of two neighbours (the optimal string
//! alignment distance). A query word shorter than four characters, or made of digits only, must
//! then start a word of the text as it is. A query with `*` is a pattern for whole line IDs, `*`
//! standing for any run of characters, and searches Lines only. A query shorter than two
//! characters, as typed and trimmed, finds nothing.
//!
//! Folding lowers the case, removes the accents of the Latin-1 Supplement and Latin Extended-A
//! letters (U+00C0 to U+017F, so `é` is `e`, `ß` is `ss`, and `æ` is `ae`) and the combining marks
//! U+0300 to U+036F, collapses each run of white space to one space, and trims. Other scripts are
//! compared after lowering their case only. Every folded byte remembers the characters of the
//! original text it came from, so a match in the folded text marks the original one.
//!
//! The search reads every hold of the snapshot, open and released; no filter applies.

use std::cmp::Reverse;
use std::collections::HashMap;

use serde::Serialize;

use crate::dataset::Dataset;
use crate::normalize::UNSPECIFIED;
use crate::query::blocker_label;
use crate::words::{BLANK, NONE};

/// Fewest characters a query has, once trimmed, to search at all.
pub const MIN_QUERY_CHARS: usize = 2;
/// Most characters of a remark a hit shows, the marks of a cut included.
pub const REMARK_CHARS: usize = 120;
/// The mark of a remark cut before or after the part shown.
const CUT: char = '…';

/// What a hit is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum SearchKind {
    /// A line ID.
    Line,
    /// A blocker, by its key `<discipline>|<item>`.
    Blocker,
    /// The name of a person on a hold.
    Person,
    /// A role.
    Role,
    /// A remark, by its case-folded key.
    Remark,
    /// A hold type.
    HoldType,
    /// A discipline.
    Discipline,
    /// A stress calc value.
    StressCalc,
}

impl SearchKind {
    /// The group a hit of this kind is listed in.
    fn group(self) -> SearchGroupKind {
        match self {
            SearchKind::Line => SearchGroupKind::Lines,
            SearchKind::Blocker => SearchGroupKind::Blockers,
            SearchKind::Person | SearchKind::Role => SearchGroupKind::People,
            SearchKind::Remark => SearchGroupKind::Remarks,
            SearchKind::HoldType | SearchKind::Discipline | SearchKind::StressCalc => {
                SearchGroupKind::Holds
            }
        }
    }
}

/// A run of the text, marked when it matched the query.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct TextPart {
    /// The characters of the run.
    pub text: String,
    /// Whether the run matched the query.
    pub matched: bool,
}

/// One value the query matched.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SearchHit {
    /// What the hit is.
    pub kind: SearchKind,
    /// The value: a line ID, a blocker key, a name, a remark...; what choosing it acts on.
    pub value: String,
    /// The text shown, split into matched and unmatched parts.
    pub parts: Vec<TextPart>,
    /// A second line: the role of a person; empty when none (a blocker's label already names its
    /// discipline).
    pub detail: String,
    /// Holds with this value in the snapshot, open and released.
    pub holds: usize,
    /// Every one of those holds is released.
    pub released: bool,
}

/// The groups of the results, in the order they are listed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum SearchGroupKind {
    /// Line IDs.
    Lines,
    /// Blockers.
    Blockers,
    /// Names and roles.
    People,
    /// Remarks.
    Remarks,
    /// Hold types, disciplines, and stress calcs.
    Holds,
}

/// The hits of one group, best first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SearchGroup {
    /// Which group.
    pub kind: SearchGroupKind,
    /// The best hits, at most the number asked for.
    pub hits: Vec<SearchHit>,
    /// Every match of the group, those beyond `hits` included.
    pub total: usize,
}

/// What a query found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct SearchResults {
    /// The query as it was asked.
    pub query: String,
    /// The groups with at least one hit, in the order Lines, Blockers, People, Remarks, Holds.
    pub groups: Vec<SearchGroup>,
}

/// Searches every hold of `dataset` for `query` and keeps at most `per_group` hits in each group.
///
/// Within a group, matches at the start of the text come first, then at the start of a word,
/// then elsewhere, then typo matches; ties go to more holds, then to the value. A group without
/// a hit is left out. Blank values are not searched.
pub fn search(dataset: &Dataset, query: &str, per_group: usize) -> SearchResults {
    let mut results = SearchResults {
        query: query.to_string(),
        groups: Vec::new(),
    };
    let Some(matcher) = Matcher::new(query) else {
        return results;
    };
    let lines_only = matches!(matcher, Matcher::Pattern(_));
    let candidates = Candidates::gather(dataset, lines_only);

    let mut found: HashMap<SearchGroupKind, Vec<Found<'_>>> = HashMap::new();
    let mut folded = String::new();
    let mut scratch = Scratch::default();
    for candidate in candidates.list() {
        folded.clear();
        fold_into(candidate.text, &mut folded, None);
        if let Some((rank, _)) = matcher.matches(&folded, &mut scratch) {
            found
                .entry(candidate.kind.group())
                .or_default()
                .push(Found { rank, candidate });
        }
    }

    for kind in [
        SearchGroupKind::Lines,
        SearchGroupKind::Blockers,
        SearchGroupKind::People,
        SearchGroupKind::Remarks,
        SearchGroupKind::Holds,
    ] {
        let Some(mut hits) = found.remove(&kind) else {
            continue;
        };
        hits.sort_by(|a, b| {
            (
                a.rank,
                Reverse(a.candidate.holds),
                &a.candidate.value,
                a.candidate.kind,
            )
                .cmp(&(
                    b.rank,
                    Reverse(b.candidate.holds),
                    &b.candidate.value,
                    b.candidate.kind,
                ))
        });
        let total = hits.len();
        let hits = hits
            .into_iter()
            .take(per_group)
            .map(|hit| hit.candidate.into_hit(&matcher, &mut scratch))
            .collect();
        results.groups.push(SearchGroup { kind, hits, total });
    }
    results
}

/// A value that can be found, before it is matched.
struct Candidate<'a> {
    kind: SearchKind,
    value: String,
    /// The text the query is matched against.
    text: &'a str,
    /// What the shown text has before `text`: `<discipline> / ` for a blocker.
    prefix: String,
    detail: String,
    holds: usize,
    released: bool,
}

impl Candidate<'_> {
    /// The hit, with the parts of its shown text marked where the query matched.
    fn into_hit(self, matcher: &Matcher, scratch: &mut Scratch) -> SearchHit {
        let mut folded = String::new();
        let mut origin = Vec::new();
        fold_into(self.text, &mut folded, Some(&mut origin));
        let mut ranges: Vec<(usize, usize)> = matcher
            .matches(&folded, scratch)
            .map(|(_, ranges)| ranges)
            .unwrap_or_default()
            .into_iter()
            .filter(|(start, end)| end > start)
            .map(|(start, end)| (origin[start].0, origin[end - 1].1))
            .collect();
        // A typo match gives its ranges in the order of the query's words: put them in the
        // order of the text, overlaps merged.
        ranges.sort_unstable();
        ranges.dedup_by(|next, kept| {
            let overlaps = next.0 <= kept.1;
            if overlaps {
                kept.1 = kept.1.max(next.1);
            }
            overlaps
        });
        let mut text = format!("{}{}", self.prefix, self.text);
        let mut ranges: Vec<(usize, usize)> = ranges
            .into_iter()
            .map(|(start, end)| (start + self.prefix.len(), end + self.prefix.len()))
            .collect();
        if self.kind == SearchKind::Remark {
            (text, ranges) = cut_around(&text, ranges);
        }
        SearchHit {
            kind: self.kind,
            value: self.value,
            parts: parts(&text, ranges),
            detail: self.detail,
            holds: self.holds,
            released: self.released,
        }
    }
}

/// A candidate the query matched, with how well.
struct Found<'a> {
    rank: Rank,
    candidate: Candidate<'a>,
}

/// How well a text matched: better first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Rank {
    /// The query starts the text.
    Start,
    /// The query starts a word of the text.
    Word,
    /// The query is inside a word.
    Inside,
    /// Each query word is close to a word of the text.
    Typo,
}

/// How many holds carry a value, how many of them are released, and the first of them.
#[derive(Default)]
struct Tally {
    holds: usize,
    released: usize,
    first: usize,
}

impl Tally {
    fn add(&mut self, index: usize, released: bool) {
        if self.holds == 0 {
            self.first = index;
        }
        self.holds += 1;
        self.released += usize::from(released);
    }

    fn all_released(&self) -> bool {
        self.released == self.holds
    }
}

/// The distinct values of a dataset, counted.
struct Candidates<'a> {
    dataset: &'a Dataset,
    lines: HashMap<&'a str, Tally>,
    blockers: HashMap<(&'a str, &'a str), Tally>,
    people: HashMap<&'a str, (Tally, HashMap<&'a str, usize>)>,
    roles: HashMap<&'a str, Tally>,
    remarks: HashMap<&'a str, Tally>,
    hold_types: HashMap<&'a str, Tally>,
    disciplines: HashMap<&'a str, Tally>,
    stress_calcs: HashMap<&'a str, Tally>,
}

/// Whether a value is one of the spellings of nothing, which the search leaves out.
fn is_blank(value: &str) -> bool {
    let value = value.trim();
    value.is_empty() || value == NONE || value.eq_ignore_ascii_case(BLANK) || value == UNSPECIFIED
}

/// Counts the hold at `index` for `value`, unless the value is blank.
fn tally<'a>(map: &mut HashMap<&'a str, Tally>, value: &'a str, index: usize, released: bool) {
    if !is_blank(value) {
        map.entry(value).or_default().add(index, released);
    }
}

impl<'a> Candidates<'a> {
    fn gather(dataset: &'a Dataset, lines_only: bool) -> Candidates<'a> {
        let mut all = Candidates {
            dataset,
            lines: HashMap::new(),
            blockers: HashMap::new(),
            people: HashMap::new(),
            roles: HashMap::new(),
            remarks: HashMap::new(),
            hold_types: HashMap::new(),
            disciplines: HashMap::new(),
            stress_calcs: HashMap::new(),
        };
        for (i, row) in dataset.rows.iter().enumerate() {
            let hold = &row.hold;
            let released = hold.released;
            tally(&mut all.lines, &hold.line_id, i, released);
            if lines_only {
                continue;
            }
            if !is_blank(&row.blocker.item) {
                all.blockers
                    .entry((&hold.discipline, &row.blocker.item))
                    .or_default()
                    .add(i, released);
            }
            if !is_blank(&hold.name) {
                let (person, roles) = all.people.entry(&hold.name).or_default();
                person.add(i, released);
                if !is_blank(&hold.role) {
                    *roles.entry(&hold.role).or_default() += 1;
                }
            }
            tally(&mut all.roles, &hold.role, i, released);
            if !is_blank(&hold.remark) {
                all.remarks
                    .entry(&row.remark_key)
                    .or_default()
                    .add(i, released);
            }
            tally(&mut all.hold_types, &hold.hold_type, i, released);
            tally(&mut all.disciplines, &hold.discipline, i, released);
            tally(&mut all.stress_calcs, &hold.stress_calc, i, released);
        }
        all
    }

    /// Every candidate, each matched against its own text.
    fn list(&self) -> Vec<Candidate<'a>> {
        let dataset = self.dataset;
        let plain = |kind: SearchKind, value: &'a str, tally: &Tally| Candidate {
            kind,
            value: value.to_string(),
            text: value,
            prefix: String::new(),
            detail: String::new(),
            holds: tally.holds,
            released: tally.all_released(),
        };
        let mut list = Vec::new();
        list.extend(
            self.lines
                .iter()
                .map(|(value, tally)| plain(SearchKind::Line, value, tally)),
        );
        list.extend(self.blockers.iter().map(|((discipline, item), tally)| {
            let label = blocker_label(discipline, item);
            let prefix = label[..label.len() - item.len()].to_string();
            Candidate {
                kind: SearchKind::Blocker,
                value: format!("{discipline}|{item}"),
                text: item,
                prefix,
                // The label carries the discipline.
                detail: String::new(),
                holds: tally.holds,
                released: tally.all_released(),
            }
        }));
        list.extend(self.people.iter().map(|(name, (tally, roles))| {
            // The role most of the person's holds name; of two as common, the first by name.
            let role = roles
                .iter()
                .max_by(|a, b| a.1.cmp(b.1).then_with(|| b.0.cmp(a.0)))
                .map(|(role, _)| role.to_string())
                .unwrap_or_default();
            Candidate {
                detail: role,
                ..plain(SearchKind::Person, name, tally)
            }
        }));
        list.extend(
            self.roles
                .iter()
                .map(|(value, tally)| plain(SearchKind::Role, value, tally)),
        );
        list.extend(self.remarks.iter().map(|(key, tally)| Candidate {
            // The remark as the first of its holds writes it, as the Breakdown labels it.
            text: &dataset.rows[tally.first].hold.remark,
            ..plain(SearchKind::Remark, key, tally)
        }));
        for (kind, map) in [
            (SearchKind::HoldType, &self.hold_types),
            (SearchKind::Discipline, &self.disciplines),
            (SearchKind::StressCalc, &self.stress_calcs),
        ] {
            list.extend(map.iter().map(|(value, tally)| plain(kind, value, tally)));
        }
        list
    }
}

/// A query word of at least four characters, with the edits it allows.
struct LongWord {
    chars: Vec<char>,
    edits: usize,
}

/// The query, folded, as it is matched.
enum Matcher {
    /// A substring, or failing that the words of the query with typos allowed.
    Text {
        folded: String,
        long: Vec<LongWord>,
        /// The words shorter than four characters, and those of digits only: no edit allowed.
        exact: Vec<String>,
    },
    /// The literal runs of a line-ID pattern, between its `*`.
    Pattern(Vec<String>),
}

/// Buffers reused across the candidates, so matching allocates little.
#[derive(Default)]
struct Scratch {
    word: Vec<char>,
    rows: [Vec<usize>; 3],
}

impl Matcher {
    /// The matcher of `query`; `None` when the query, trimmed, is shorter than
    /// [`MIN_QUERY_CHARS`] characters as typed.
    fn new(query: &str) -> Option<Matcher> {
        if query.trim().chars().count() < MIN_QUERY_CHARS {
            return None;
        }
        let mut folded = String::new();
        fold_into(query, &mut folded, None);
        if folded.is_empty() {
            return None;
        }
        if folded.contains('*') {
            return Some(Matcher::Pattern(
                folded.split('*').map(str::to_string).collect(),
            ));
        }
        let mut long = Vec::new();
        let mut exact = Vec::new();
        for (start, end) in words(&folded) {
            let word = &folded[start..end];
            let chars: Vec<char> = word.chars().collect();
            if chars.len() < 4 || chars.iter().all(char::is_ascii_digit) {
                exact.push(word.to_string());
            } else {
                let edits = if chars.len() < 8 { 1 } else { 2 };
                long.push(LongWord { chars, edits });
            }
        }
        Some(Matcher::Text {
            folded,
            long,
            exact,
        })
    }

    /// Whether the folded `text` matches, how well, and the folded byte ranges that matched.
    fn matches(&self, text: &str, scratch: &mut Scratch) -> Option<(Rank, Vec<(usize, usize)>)> {
        match self {
            Matcher::Pattern(runs) => {
                pattern_ranges(runs, text).map(|ranges| (Rank::Start, ranges))
            }
            Matcher::Text {
                folded,
                long,
                exact,
            } => substring(folded, text).or_else(|| typo(long, exact, text, scratch)),
        }
    }
}

/// The best occurrence of `query` in `text`, overlapping ones included: at the start, then at
/// the start of a word, then the first.
fn substring(query: &str, text: &str) -> Option<(Rank, Vec<(usize, usize)>)> {
    let mut best: Option<(Rank, usize)> = None;
    let mut from = 0;
    while let Some(found) = text[from..].find(query) {
        let at = from + found;
        // The next search starts one character on, so an overlapping occurrence is seen.
        from = at + text[at..].chars().next().map_or(1, char::len_utf8);
        let rank = match text[..at].chars().next_back() {
            None => Rank::Start,
            Some(before) if !before.is_alphanumeric() => Rank::Word,
            Some(_) => Rank::Inside,
        };
        if best.is_none_or(|(known, _)| rank < known) {
            best = Some((rank, at));
        }
        if rank != Rank::Inside {
            break;
        }
    }
    best.map(|(rank, at)| (rank, vec![(at, at + query.len())]))
}

/// A typo match: every long query word is close to a word of `text`, and every exact one starts
/// a word of `text` as it is. Marks the words of the text the long words matched, and the start
/// each exact word matched.
fn typo(
    long: &[LongWord],
    exact: &[String],
    text: &str,
    scratch: &mut Scratch,
) -> Option<(Rank, Vec<(usize, usize)>)> {
    if long.is_empty() {
        return None;
    }
    let text_words = words(text);
    let mut ranges = Vec::with_capacity(long.len() + exact.len());
    for query_word in exact {
        let (start, _) = text_words
            .iter()
            .find(|(start, end)| text[*start..*end].starts_with(query_word.as_str()))?;
        ranges.push((*start, start + query_word.len()));
    }
    for query_word in long {
        let close = text_words.iter().find(|(start, end)| {
            let word = &text[*start..*end];
            // A word whose length differs by more than the edits allowed cannot be close.
            let length = word.chars().count();
            if length.abs_diff(query_word.chars.len()) > query_word.edits {
                return false;
            }
            scratch.word.clear();
            scratch.word.extend(word.chars());
            within(
                &query_word.chars,
                &scratch.word,
                query_word.edits,
                &mut scratch.rows,
            )
        })?;
        ranges.push(*close);
    }
    Some((Rank::Typo, ranges))
}

/// The byte ranges of the words of `text`: its runs of letters and digits.
fn words(text: &str) -> Vec<(usize, usize)> {
    let mut found = Vec::new();
    let mut start = None;
    for (at, c) in text.char_indices() {
        match (c.is_alphanumeric(), start) {
            (true, None) => start = Some(at),
            (false, Some(from)) => {
                found.push((from, at));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(from) = start {
        found.push((from, text.len()));
    }
    found
}

/// Whether `a` and `b` are at most `max` edits apart: insertions, deletions, substitutions, and
/// swaps of two neighbours, no part edited twice (the optimal string alignment distance).
fn within(a: &[char], b: &[char], max: usize, rows: &mut [Vec<usize>; 3]) -> bool {
    if a.len().abs_diff(b.len()) > max {
        return false;
    }
    let width = b.len() + 1;
    for row in rows.iter_mut() {
        row.clear();
        row.resize(width, 0);
    }
    let [before, previous, current] = rows;
    for (j, cell) in previous.iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=a.len() {
        current[0] = i;
        let mut lowest = i;
        for j in 1..width {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            let mut best = (previous[j] + 1)
                .min(current[j - 1] + 1)
                .min(previous[j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                best = best.min(before[j - 2] + 1);
            }
            current[j] = best;
            lowest = lowest.min(best);
        }
        if lowest > max {
            return false;
        }
        std::mem::swap(before, previous);
        std::mem::swap(previous, current);
    }
    previous[width - 1] <= max
}

/// The ranges of the literal runs of a `*` pattern when it matches the whole of `text`.
fn pattern_ranges(runs: &[String], text: &str) -> Option<Vec<(usize, usize)>> {
    let (first, rest) = runs.split_first()?;
    let Some((last, middle)) = rest.split_last() else {
        return (text == first).then(|| vec![(0, text.len())]);
    };
    if !text.starts_with(first.as_str()) {
        return None;
    }
    let mut ranges = vec![(0, first.len())];
    let mut at = first.len();
    for run in middle {
        let found = at + text[at..].find(run.as_str())?;
        ranges.push((found, found + run.len()));
        at = found + run.len();
    }
    if text.len() < at + last.len() || !text.ends_with(last.as_str()) {
        return None;
    }
    ranges.push((text.len() - last.len(), text.len()));
    Some(ranges)
}

/// What a lower-case letter of U+00C0 to U+017F is without its accent.
fn unaccent(c: char) -> Option<&'static str> {
    Some(match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' => "a",
        'æ' => "ae",
        'ç' | 'ć' | 'ĉ' | 'ċ' | 'č' => "c",
        'ð' | 'ď' | 'đ' => "d",
        'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' => "e",
        'ĝ' | 'ğ' | 'ġ' | 'ģ' => "g",
        'ĥ' | 'ħ' => "h",
        'ì' | 'í' | 'î' | 'ï' | 'ĩ' | 'ī' | 'ĭ' | 'į' | 'ı' => "i",
        'ĳ' => "ij",
        'ĵ' => "j",
        'ķ' | 'ĸ' => "k",
        'ĺ' | 'ļ' | 'ľ' | 'ŀ' | 'ł' => "l",
        'ñ' | 'ń' | 'ņ' | 'ň' | 'ŉ' | 'ŋ' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'ō' | 'ŏ' | 'ő' => "o",
        'œ' => "oe",
        'ŕ' | 'ŗ' | 'ř' => "r",
        'ś' | 'ŝ' | 'ş' | 'š' | 'ſ' => "s",
        'ß' => "ss",
        'ţ' | 'ť' | 'ŧ' => "t",
        'þ' => "th",
        'ù' | 'ú' | 'û' | 'ü' | 'ũ' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' => "u",
        'ŵ' => "w",
        'ý' | 'ÿ' | 'ŷ' => "y",
        'ź' | 'ż' | 'ž' => "z",
        _ => return None,
    })
}

/// Appends the folded `text` to `out` (see the module documentation). With `origin`, records
/// for each byte appended the byte range of the original character it came from; a character
/// that folds to nothing widens the range of the byte before it.
fn fold_into(text: &str, out: &mut String, mut origin: Option<&mut Vec<(usize, usize)>>) {
    fn push(
        out: &mut String,
        origin: &mut Option<&mut Vec<(usize, usize)>>,
        piece: char,
        from: (usize, usize),
    ) {
        out.push(piece);
        if let Some(origin) = origin.as_deref_mut() {
            origin.extend(std::iter::repeat_n(from, piece.len_utf8()));
        }
    }
    let mut space: Option<(usize, usize)> = None;
    for (at, c) in text.char_indices() {
        let from = (at, at + c.len_utf8());
        if c.is_whitespace() {
            if !out.is_empty() && space.is_none() {
                space = Some(from);
            }
            continue;
        }
        let before = out.len();
        for lower in c.to_lowercase() {
            if ('\u{300}'..='\u{36f}').contains(&lower) {
                continue;
            }
            if let Some(gap) = space.take() {
                push(out, &mut origin, ' ', gap);
            }
            match unaccent(lower) {
                Some(plain) => plain
                    .chars()
                    .for_each(|piece| push(out, &mut origin, piece, from)),
                None => push(out, &mut origin, lower, from),
            }
        }
        if out.len() == before {
            if let Some(last) = origin.as_deref_mut().and_then(|origin| origin.last_mut()) {
                last.1 = from.1;
            }
        }
    }
}

/// Cuts a text longer than [`REMARK_CHARS`] to that many characters around the matched
/// `ranges` (in text order, without overlaps), marking each cut with "…". When several matches
/// span more than fits, the first is kept in view and the cut comes after it, before any match
/// it would go through; the matches cut off are not shown. The cut never goes through a match: a single match longer than fits is
/// kept whole.
fn cut_around(text: &str, ranges: Vec<(usize, usize)>) -> (String, Vec<(usize, usize)>) {
    let length = text.chars().count();
    if length <= REMARK_CHARS {
        return (text.to_string(), ranges);
    }
    let char_at = |byte: usize| text[..byte].chars().count();
    let (mut span_start, mut span_end) = match (ranges.first(), ranges.last()) {
        (Some(first), Some(last)) => (char_at(first.0), char_at(last.1)),
        _ => (0, 0),
    };
    if span_end - span_start > REMARK_CHARS - 2 && ranges.len() > 1 {
        if let Some(first) = ranges.first() {
            (span_start, span_end) = (char_at(first.0), char_at(first.1));
        }
    }
    let span = span_end - span_start;
    let (from, mut to) = if span_end < REMARK_CHARS {
        // The start of the text, and a cut after.
        (0, REMARK_CHARS - 1)
    } else if span_start > length - REMARK_CHARS {
        // A cut before, and the end of the text.
        (length - (REMARK_CHARS - 1), length)
    } else if span <= REMARK_CHARS - 2 {
        // Cuts on both sides, the match in the middle.
        let room = REMARK_CHARS - 2 - span;
        let from = span_start
            .saturating_sub(room / 2)
            .min(length - (REMARK_CHARS - 2));
        (from, from + REMARK_CHARS - 2)
    } else {
        (span_start, span_end)
    };
    // A later match the window's end would cut is left out whole: the window ends before it.
    if let Some(start) = ranges
        .iter()
        .map(|(start, end)| (char_at(*start), char_at(*end)))
        .find(|(start, end)| *start < to && *end > to)
        .map(|(start, _)| start)
    {
        to = start;
    }
    let byte_at = |index: usize| {
        text.char_indices()
            .nth(index)
            .map_or(text.len(), |(at, _)| at)
    };
    let (from_byte, to_byte) = (byte_at(from), byte_at(to));
    let mut cut = String::new();
    let mut shift = 0;
    if from > 0 {
        cut.push(CUT);
        shift = CUT.len_utf8();
    }
    cut.push_str(&text[from_byte..to_byte]);
    if to < length {
        cut.push(CUT);
    }
    let ranges = ranges
        .into_iter()
        .filter(|(start, end)| *start >= from_byte && *end <= to_byte)
        .map(|(start, end)| (start - from_byte + shift, end - from_byte + shift))
        .collect();
    (cut, ranges)
}

/// `text` split into runs, those inside `ranges` marked.
fn parts(text: &str, mut ranges: Vec<(usize, usize)>) -> Vec<TextPart> {
    ranges.sort_unstable();
    let mut parts = Vec::new();
    let mut at = 0;
    let add = |parts: &mut Vec<TextPart>, piece: &str, matched: bool| {
        if !piece.is_empty() {
            parts.push(TextPart {
                text: piece.to_string(),
                matched,
            });
        }
    };
    for (start, end) in ranges {
        let start = start.max(at);
        if end <= start {
            continue;
        }
        add(&mut parts, &text[at..start], false);
        add(&mut parts, &text[start..end], true);
        at = end;
    }
    add(&mut parts, &text[at..], false);
    parts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Hold;
    use crate::rules::RuleSet;
    use crate::testkit::{hold, snapshot};

    fn build(holds: Vec<Hold>) -> Dataset {
        Dataset::build(holds, RuleSet::builtin(), snapshot())
    }

    fn person(line: &str, name: &str, role: &str) -> Hold {
        let mut h = hold(line, "Piping", "MISC.", "x", 1);
        h.name = name.to_string();
        h.role = role.to_string();
        h
    }

    fn with_remark(line: &str, remark: &str) -> Hold {
        hold(line, "Piping", "MISC.", remark, 1)
    }

    fn group(results: &SearchResults, kind: SearchGroupKind) -> Option<&SearchGroup> {
        results.groups.iter().find(|g| g.kind == kind)
    }

    /// The values of a group's hits, in order.
    fn values(results: &SearchResults, kind: SearchGroupKind) -> Vec<String> {
        group(results, kind)
            .map(|g| g.hits.iter().map(|h| h.value.clone()).collect())
            .unwrap_or_default()
    }

    fn shown(hit: &SearchHit) -> String {
        hit.parts.iter().map(|p| p.text.as_str()).collect()
    }

    fn marked(hit: &SearchHit) -> Vec<String> {
        hit.parts
            .iter()
            .filter(|p| p.matched)
            .map(|p| p.text.clone())
            .collect()
    }

    fn only_hit(results: &SearchResults, kind: SearchGroupKind) -> SearchHit {
        let g = group(results, kind).expect("the group is there");
        assert_eq!(g.hits.len(), 1, "{:?}", g.hits);
        g.hits[0].clone()
    }

    #[test]
    fn each_kind_is_found_in_its_group() {
        let mut h = hold(
            "78B01-573-0001-FW-001",
            "Mechanical",
            "VENDOR DATA",
            "Pending 538-PR-100",
            1,
        );
        h.name = "Zoë Quill".into();
        h.role = "Stress Analyst".into();
        h.stress_calc = "Quarterly".into();
        let ds = build(vec![h]);

        let hit = only_hit(&search(&ds, "fw-001", 8), SearchGroupKind::Lines);
        assert_eq!(
            (hit.kind, hit.value.as_str()),
            (SearchKind::Line, "78B01-573-0001-FW-001")
        );

        let r = search(&ds, "538-pr", 8);
        let hit = only_hit(&r, SearchGroupKind::Blockers);
        assert_eq!(hit.kind, SearchKind::Blocker);
        assert_eq!(hit.value, "Mechanical|538-PR-100");
        assert_eq!(shown(&hit), "Mechanical / 538-PR-100");
        assert_eq!(marked(&hit), ["538-PR"]);
        // The label carries the discipline.
        assert_eq!(hit.detail, "");
        let remark = only_hit(&r, SearchGroupKind::Remarks);
        assert_eq!(remark.kind, SearchKind::Remark);
        assert_eq!(remark.value, "PENDING 538-PR-100");
        assert_eq!(shown(&remark), "Pending 538-PR-100");

        let hit = only_hit(&search(&ds, "quill", 8), SearchGroupKind::People);
        assert_eq!(
            (hit.kind, hit.value.as_str(), hit.detail.as_str()),
            (SearchKind::Person, "Zoë Quill", "Stress Analyst")
        );
        let hit = only_hit(&search(&ds, "analyst", 8), SearchGroupKind::People);
        assert_eq!(
            (hit.kind, hit.value.as_str()),
            (SearchKind::Role, "Stress Analyst")
        );

        for (query, kind, value) in [
            ("vendor data", SearchKind::HoldType, "VENDOR DATA"),
            ("mechanical", SearchKind::Discipline, "Mechanical"),
            ("quarterly", SearchKind::StressCalc, "Quarterly"),
        ] {
            let hit = only_hit(&search(&ds, query, 8), SearchGroupKind::Holds);
            assert_eq!((hit.kind, hit.value.as_str()), (kind, value), "{query}");
            assert_eq!(hit.holds, 1);
            assert!(!hit.released);
        }
    }

    #[test]
    fn groups_come_in_their_order_and_an_empty_group_is_left_out() {
        let mut h = hold("PIPE-1", "Piping", "PIPE SUPPORT", "Vendor catalogue", 1);
        h.name = "Pip Ercolani".into();
        let ds = build(vec![h]);
        let kinds: Vec<SearchGroupKind> = search(&ds, "pip", 8)
            .groups
            .iter()
            .map(|g| g.kind)
            .collect();
        assert_eq!(
            kinds,
            [
                SearchGroupKind::Lines,
                SearchGroupKind::People,
                SearchGroupKind::Holds
            ]
        );
        assert!(search(&ds, "zzzz", 8).groups.is_empty());
    }

    #[test]
    fn a_substring_match_comes_before_a_typo_match() {
        let ds = build(vec![
            with_remark("L1", "Await vendor drawing"),
            with_remark("L2", "Await vendro drawing"),
            with_remark("L2", "Await vendro drawing"),
        ]);
        let r = search(&ds, "vendor", 8);
        // The typo match has more holds, and still comes after.
        assert_eq!(
            values(&r, SearchGroupKind::Remarks),
            ["AWAIT VENDOR DRAWING", "AWAIT VENDRO DRAWING"]
        );
        let typo = &group(&r, SearchGroupKind::Remarks).unwrap().hits[1];
        assert_eq!(marked(typo), ["vendro"]);
    }

    #[test]
    fn the_start_of_the_text_comes_before_a_word_start_before_the_inside() {
        let ds = build(vec![
            with_remark("L1", "Xstress check"),
            with_remark("L2", "Check stress loads"),
            with_remark("L2", "Check stress loads"),
            with_remark("L3", "Stress review"),
            with_remark("L4", "Overstressed nozzle"),
            with_remark("L4", "Overstressed nozzle"),
            with_remark("L4", "Overstressed nozzle"),
        ]);
        let r = search(&ds, "stress", 8);
        assert_eq!(
            values(&r, SearchGroupKind::Remarks),
            [
                "STRESS REVIEW",
                "CHECK STRESS LOADS",
                "OVERSTRESSED NOZZLE",
                "XSTRESS CHECK"
            ]
        );
    }

    #[test]
    fn ties_go_to_more_holds_then_to_the_value() {
        let ds = build(vec![
            hold("AB-2", "Piping", "MISC.", "x", 1),
            hold("AB-1", "Piping", "MISC.", "x", 1),
            hold("AB-3", "Piping", "MISC.", "x", 1),
            hold("AB-3", "Piping", "MISC.", "x", 1),
        ]);
        assert_eq!(
            values(&search(&ds, "ab", 8), SearchGroupKind::Lines),
            ["AB-3", "AB-1", "AB-2"]
        );
    }

    #[test]
    fn a_word_of_four_to_seven_characters_allows_one_edit_and_from_eight_two() {
        let ds = build(vec![
            with_remark("L1", "Await vendor drawing"),
            with_remark("L2", "Isometric checking"),
        ]);
        let found = |q: &str| values(&search(&ds, q, 8), SearchGroupKind::Remarks);
        // One edit at six characters: a substitution, an insertion, a deletion.
        assert_eq!(found("vendir"), ["AWAIT VENDOR DRAWING"]);
        assert_eq!(found("venddor"), ["AWAIT VENDOR DRAWING"]);
        assert_eq!(found("vendr"), ["AWAIT VENDOR DRAWING"]);
        // Two edits at six characters are too many.
        assert!(found("vandir").is_empty());
        // Two edits at nine characters are allowed, three are not.
        assert_eq!(found("isomatrik"), ["ISOMETRIC CHECKING"]);
        assert!(found("isamatrik").is_empty());
        // Below four characters no typo is allowed.
        assert!(found("vnd").is_empty());
    }

    #[test]
    fn a_swap_of_two_neighbours_is_one_edit() {
        let ds = build(vec![with_remark("L1", "Await vendor drawing")]);
        let r = search(&ds, "vendro", 8);
        let hit = only_hit(&r, SearchGroupKind::Remarks);
        assert_eq!(marked(&hit), ["vendor"]);
        // Two swaps at six characters are two edits.
        assert!(group(&search(&ds, "evndro", 8), SearchGroupKind::Remarks).is_none());
        assert!(within(
            &['a', 'b', 'c', 'd'],
            &['a', 'c', 'b', 'd'],
            1,
            &mut Default::default()
        ));
    }

    #[test]
    fn every_long_query_word_must_be_close_to_a_word_and_a_short_one_present() {
        let ds = build(vec![with_remark("L1", "Await vendor drawing for P&ID")]);
        let found = |q: &str| group(&search(&ds, q, 8), SearchGroupKind::Remarks).is_some();
        assert!(found("drawng vendro"));
        assert!(found("vendro id"));
        assert!(!found("vendro xy"));
        assert!(!found("vendro cable"));
        let hit = only_hit(&search(&ds, "drawng vendro", 8), SearchGroupKind::Remarks);
        assert_eq!(marked(&hit), ["vendor", "drawing"]);
    }

    #[test]
    fn case_and_accents_are_ignored_and_the_original_is_marked() {
        let mut h = person("L1", "Zoë Ångström", "Ingénieur");
        h.remark = "Révision du schéma".into();
        let ds = build(vec![h]);
        let hit = only_hit(&search(&ds, "ZOE ANG", 8), SearchGroupKind::People);
        assert_eq!(marked(&hit), ["Zoë Ång"]);
        assert_eq!(shown(&hit), "Zoë Ångström");
        let hit = only_hit(&search(&ds, "angstrom", 8), SearchGroupKind::People);
        assert_eq!(marked(&hit), ["Ångström"]);
        let hit = only_hit(&search(&ds, "ingenieur", 8), SearchGroupKind::People);
        assert_eq!(hit.kind, SearchKind::Role);
        // The query's accents are folded as well.
        let hit = only_hit(&search(&ds, "SCHÉMA", 8), SearchGroupKind::Remarks);
        assert_eq!(marked(&hit), ["schéma"]);
        // A decomposed accent and a ligature fold as their composed letters do.
        let ds = build(vec![person("L1", "Bjo\u{308}rn Strasse", "Designer")]);
        let hit = only_hit(&search(&ds, "björn straße", 8), SearchGroupKind::People);
        assert_eq!(marked(&hit), ["Bjo\u{308}rn Strasse"]);
    }

    #[test]
    fn runs_of_white_space_are_one_space() {
        let ds = build(vec![person("L1", "Ada   Lovelace", "Designer")]);
        let hit = only_hit(
            &search(&ds, "  ada \t lovelace ", 8),
            SearchGroupKind::People,
        );
        assert_eq!(marked(&hit), ["Ada   Lovelace"]);
        assert_eq!(hit.parts.len(), 1);
    }

    #[test]
    fn a_pattern_with_a_star_matches_whole_line_ids_and_only_lines() {
        let ds = build(vec![
            hold(
                "78B01-573-0001-FW-001",
                "Piping",
                "MISC.",
                "78B01-573 pending",
                1,
            ),
            hold("78B01-573-0002-CW-002", "Piping", "MISC.", "x", 1),
            hold("78B01-574-0003-FW-001", "Piping", "MISC.", "x", 1),
            hold("12A01-573-0004-PR-003", "Piping", "MISC.", "x", 1),
        ]);
        let lines = |q: &str| {
            let r = search(&ds, q, 8);
            assert!(
                r.groups.iter().all(|g| g.kind == SearchGroupKind::Lines),
                "{q}: {r:?}"
            );
            let mut found = values(&r, SearchGroupKind::Lines);
            found.sort();
            found
        };
        assert_eq!(
            lines("78B01-573-*"),
            ["78B01-573-0001-FW-001", "78B01-573-0002-CW-002"]
        );
        assert_eq!(
            lines("*-573-*"),
            [
                "12A01-573-0004-PR-003",
                "78B01-573-0001-FW-001",
                "78B01-573-0002-CW-002"
            ]
        );
        assert_eq!(lines("78b01*").len(), 3);
        // The pattern matches the whole ID: it must reach the end of it.
        assert!(lines("78B01-573*0001").is_empty());
        assert!(lines("*-573").is_empty());
        assert_eq!(
            lines("*fw-001"),
            ["78B01-573-0001-FW-001", "78B01-574-0003-FW-001"]
        );
        let hit = only_hit(&search(&ds, "*-0004-*", 8), SearchGroupKind::Lines);
        assert_eq!(marked(&hit), ["-0004-"]);
        assert_eq!(shown(&hit), "12A01-573-0004-PR-003");
    }

    #[test]
    fn a_query_shorter_than_two_characters_finds_nothing() {
        let ds = build(vec![hold("A", "Piping", "MISC.", "a b", 1)]);
        for query in ["", " ", "a", "  a  ", "*"] {
            let r = search(&ds, query, 8);
            assert!(r.groups.is_empty(), "{query:?}");
            assert_eq!(r.query, query);
        }
        assert!(!search(&ds, "pi", 8).groups.is_empty());
    }

    #[test]
    fn a_value_whose_holds_are_all_released_is_tagged() {
        let mut gone = hold("L-2", "Piping", "MISC.", "x", 1);
        gone.released = true;
        let mut also = hold("L-1", "Piping", "MISC.", "x", 1);
        also.released = true;
        let ds = build(vec![hold("L-1", "Piping", "MISC.", "x", 1), also, gone]);
        let r = search(&ds, "l-", 8);
        let hits = &group(&r, SearchGroupKind::Lines).unwrap().hits;
        let tags: Vec<(&str, usize, bool)> = hits
            .iter()
            .map(|h| (h.value.as_str(), h.holds, h.released))
            .collect();
        assert_eq!(tags, [("L-1", 2, false), ("L-2", 1, true)]);
    }

    #[test]
    fn total_counts_every_match_beyond_the_hits_kept() {
        let ds = build(
            (0..12)
                .map(|i| hold(&format!("L-{i:02}"), "Piping", "MISC.", "x", 1))
                .collect(),
        );
        let r = search(&ds, "l-", 8);
        let lines = group(&r, SearchGroupKind::Lines).unwrap();
        assert_eq!((lines.hits.len(), lines.total), (8, 12));
        assert_eq!(search(&ds, "l-", 3).groups[0].hits.len(), 3);
    }

    #[test]
    fn blank_values_are_not_searched() {
        let mut h = hold("L1", "Unspecified", "—", "", 1);
        h.name = "—".into();
        h.role = "—".into();
        let mut blank = hold("L2", "Piping", "(blank)", "(blank)", 1);
        blank.name = "(blank)".into();
        blank.stress_calc = "(BLANK)".into();
        let ds = build(vec![h, blank]);
        // Each query is long enough to search, and would match a blank spelling were it kept.
        for query in ["unspec", "unspecified", "(bla", "(blank)", "blank"] {
            assert_eq!(search(&ds, query, 8).groups, [], "{query}");
        }
        // The same holds' values that are not blank are found.
        assert_eq!(
            values(&search(&ds, "piping", 8), SearchGroupKind::Holds),
            ["Piping"]
        );
    }

    #[test]
    fn a_long_remark_is_cut_around_the_match() {
        let filler = "lorem ipsum ".repeat(20);
        let remark = format!("{filler}NEEDLE here{filler}");
        let ds = build(vec![with_remark("L1", &remark)]);
        let hit = only_hit(&search(&ds, "needle", 8), SearchGroupKind::Remarks);
        let text = shown(&hit);
        assert_eq!(text.chars().count(), REMARK_CHARS);
        assert!(text.starts_with('…') && text.ends_with('…'), "{text}");
        assert_eq!(marked(&hit), ["NEEDLE"]);

        // A match near the start keeps the start, a match near the end the end.
        let ds = build(vec![with_remark("L1", &format!("NEEDLE {filler}"))]);
        let text = shown(&only_hit(
            &search(&ds, "needle", 8),
            SearchGroupKind::Remarks,
        ));
        assert!(text.starts_with("NEEDLE") && text.ends_with('…'));
        assert_eq!(text.chars().count(), REMARK_CHARS);
        let ds = build(vec![with_remark("L1", &format!("{filler}NEEDLE"))]);
        let text = shown(&only_hit(
            &search(&ds, "needle", 8),
            SearchGroupKind::Remarks,
        ));
        assert!(text.starts_with('…') && text.ends_with("NEEDLE"));
        assert_eq!(text.chars().count(), REMARK_CHARS);

        // A match wider than the room is kept whole.
        let long = "word ".repeat(40);
        let ds = build(vec![with_remark("L1", &format!("{filler}{long}{filler}"))]);
        let query = long.trim();
        let hit = only_hit(&search(&ds, query, 8), SearchGroupKind::Remarks);
        assert_eq!(marked(&hit), [query]);

        // A short remark is shown whole.
        let ds = build(vec![with_remark("L1", "Short NEEDLE remark")]);
        let hit = only_hit(&search(&ds, "needle", 8), SearchGroupKind::Remarks);
        assert_eq!(shown(&hit), "Short NEEDLE remark");
    }

    #[test]
    fn the_parts_rebuild_the_shown_text() {
        let mut h = person("78B01-573-0001-FW-001", "Zoë   Ångström", "Designer");
        h.remark = "Révision du schéma, révision 2".into();
        let ds = build(vec![h]);
        for query in [
            "rev",
            "573",
            "angstrom",
            "revisoin schema",
            "*fw*",
            "designer",
        ] {
            let groups = search(&ds, query, 8).groups;
            assert!(!groups.is_empty(), "{query}");
            for g in groups {
                for hit in g.hits {
                    assert!(hit.parts.iter().any(|p| p.matched), "{query}: {hit:?}");
                    assert!(hit.parts.iter().all(|p| !p.text.is_empty()));
                    // Neighbouring parts alternate.
                    assert!(hit.parts.windows(2).all(|w| w[0].matched != w[1].matched));
                    let expected = match hit.kind {
                        SearchKind::Blocker => {
                            format!("Piping / {}", hit.value.split('|').nth(1).unwrap())
                        }
                        SearchKind::Remark => "Révision du schéma, révision 2".to_string(),
                        _ => hit.value.clone(),
                    };
                    assert_eq!(shown(&hit), expected, "{query}");
                }
            }
        }
    }

    #[test]
    fn a_blocker_is_found_by_its_item_and_its_blank_item_is_not() {
        let ds = build(vec![
            hold("L1", "Piping", "MISC.", "Vendor catalogue", 1),
            hold("L2", "Piping", "MISC.", "", 1),
        ]);
        let hit = only_hit(&search(&ds, "vendor", 8), SearchGroupKind::Blockers);
        assert_eq!(hit.value, "Piping|VENDOR");
        assert_eq!(shown(&hit), "Piping / VENDOR");
        // The discipline is not the blocker's text: the Holds group lists it.
        assert!(group(&search(&ds, "piping", 8), SearchGroupKind::Blockers).is_none());
    }

    #[test]
    fn a_person_shows_the_role_most_of_their_holds_name() {
        let ds = build(vec![
            person("L1", "Ada Lovelace", "Checker"),
            person("L2", "Ada Lovelace", "Designer"),
            person("L3", "Ada Lovelace", "Designer"),
            person("L4", "Ada Lovelace", "—"),
        ]);
        let r = search(&ds, "lovelace", 8);
        let hit = only_hit(&r, SearchGroupKind::People);
        assert_eq!((hit.detail.as_str(), hit.holds), ("Designer", 4));
    }

    #[test]
    fn typo_ranges_out_of_text_order_cut_a_long_remark_without_failing() {
        // The query words come in the reverse order of the text's.
        let filler = "lorem ipsum ".repeat(20);
        let remark = format!("Await vendor {filler} drawing");
        let ds = build(vec![with_remark("L1", &remark)]);
        let hit = only_hit(&search(&ds, "drawng vendro", 8), SearchGroupKind::Remarks);
        let text = shown(&hit);
        // The words are further apart than a remark shows: the first stays in view.
        assert!(remark.starts_with(text.trim_end_matches('…')), "{text}");
        assert_eq!(text.chars().count(), REMARK_CHARS);
        assert_eq!(marked(&hit), ["vendor"]);

        // Both in view: both are marked, in the order of the text.
        let filler = "lorem ipsum ".repeat(10);
        let remark = format!("{filler}Await vendor and drawing {filler}");
        let ds = build(vec![with_remark("L1", &remark)]);
        let hit = only_hit(&search(&ds, "drawng vendro", 8), SearchGroupKind::Remarks);
        let text = shown(&hit);
        assert_eq!(text.chars().count(), REMARK_CHARS);
        assert!(remark.contains(text.trim_matches('…')), "{text}");
        assert_eq!(marked(&hit), ["vendor", "drawing"]);
    }

    #[test]
    fn a_remark_window_ends_before_a_match_it_would_cut() {
        // "vendor" and "drawing" are too far apart to show both; "drawing" starts at character
        // 118, where the window kept for "vendor" would end within it.
        let remark = format!(
            "Await vendor {} drawing {}",
            "z".repeat(104),
            "lorem ipsum ".repeat(10)
        );
        assert_eq!(remark.find("drawing"), Some(118));
        let ds = build(vec![with_remark("L1", &remark)]);
        let hit = only_hit(&search(&ds, "vendro drawng", 8), SearchGroupKind::Remarks);
        assert_eq!(shown(&hit), format!("{}…", &remark[..118]));
        assert_eq!(marked(&hit), ["vendor"]);
    }

    #[test]
    fn an_overlapping_occurrence_at_a_word_start_is_found() {
        let ds = build(vec![
            hold("XA-A-A", "Piping", "MISC.", "x", 1),
            hold("YA-A", "Piping", "MISC.", "x", 1),
            hold("YA-A", "Piping", "MISC.", "x", 1),
        ]);
        let r = search(&ds, "a-a", 8);
        // "A-A" starts a word of XA-A-A at its second occurrence, which overlaps the first.
        assert_eq!(values(&r, SearchGroupKind::Lines), ["XA-A-A", "YA-A"]);
        let first = &group(&r, SearchGroupKind::Lines).unwrap().hits[0];
        let parts: Vec<(&str, bool)> = first
            .parts
            .iter()
            .map(|p| (p.text.as_str(), p.matched))
            .collect();
        assert_eq!(parts, [("XA-", false), ("A-A", true)]);
    }

    #[test]
    fn a_short_query_word_must_start_a_word_of_the_text() {
        let ds = build(vec![with_remark("L1", "Await vendor for fluid line")]);
        let found = |q: &str| group(&search(&ds, q, 8), SearchGroupKind::Remarks).is_some();
        assert!(!found("vendro id"));
        assert!(found("vendro flu"));
        let ds = build(vec![with_remark("L1", "Await vendor for P&ID")]);
        let hit = only_hit(&search(&ds, "vendro id", 8), SearchGroupKind::Remarks);
        assert_eq!(marked(&hit), ["vendor", "ID"]);
    }

    #[test]
    fn a_query_word_of_digits_allows_no_edit() {
        let ds = build(vec![with_remark("L1", "Pending 573-PR-1450")]);
        let found = |q: &str| group(&search(&ds, q, 8), SearchGroupKind::Remarks).is_some();
        assert!(found("pendnig 1450"));
        // One swap away, and the word is digits only.
        assert!(!found("pendnig 1405"));
        assert!(!found("pendnig 1451"));
    }

    #[test]
    fn the_two_character_minimum_counts_the_query_as_typed() {
        let ds = build(vec![person("L1", "Strasse Aeby", "Designer")]);
        // Each folds to two letters, but is one character as typed.
        for query in ["ß", " ß ", "æ"] {
            assert!(search(&ds, query, 8).groups.is_empty(), "{query}");
        }
        assert!(!search(&ds, "ss", 8).groups.is_empty());
    }

    #[test]
    fn the_edit_limits_hold_at_their_bounds() {
        let ds = build(vec![
            with_remark("L1", "Pump seal"),
            with_remark("L2", "Await drawing"),
            with_remark("L3", "Check drawings"),
        ]);
        let found = |q: &str| values(&search(&ds, q, 8), SearchGroupKind::Remarks);
        // Four characters, one edit: allowed.
        assert_eq!(found("pumo"), ["PUMP SEAL"]);
        // Seven characters, two edits: refused.
        assert!(found("drewinf").is_empty());
        // Eight characters, two edits: allowed.
        assert_eq!(found("drewinfs"), ["CHECK DRAWINGS"]);
    }

    #[test]
    fn a_cut_remark_with_multi_byte_text_keeps_whole_characters() {
        let filler = "Révision du schéma ".repeat(10);
        let remark = format!("{filler}NÉEDLE ici {filler}");
        let ds = build(vec![with_remark("L1", &remark)]);
        let hit = only_hit(&search(&ds, "needle", 8), SearchGroupKind::Remarks);
        let text = shown(&hit);
        assert_eq!(text.chars().count(), REMARK_CHARS);
        assert!(text.starts_with('…') && text.ends_with('…'), "{text}");
        assert!(remark.contains(text.trim_matches('…')), "{text}");
        assert_eq!(marked(&hit), ["NÉEDLE"]);
    }

    #[test]
    fn folding_keeps_the_origin_of_every_byte() {
        let mut folded = String::new();
        let mut origin = Vec::new();
        fold_into("  Æb\u{301}  ß ", &mut folded, Some(&mut origin));
        assert_eq!(folded, "aeb ss");
        assert_eq!(origin.len(), folded.len());
        // "ae" from Æ (bytes 2..4), "b" widened over its combining accent (4..7), one space from
        // the first of the run, "ss" from ß.
        assert_eq!(origin, [(2, 4), (2, 4), (4, 7), (7, 8), (9, 11), (9, 11)]);
    }

    /// The value of a hit is the key the filter of its field takes: filtering by it keeps exactly
    /// the holds the hit counts, so choosing a hit in the interface filters to what it found.
    #[test]
    fn a_hit_value_is_the_key_of_its_filter() {
        use crate::filter::{Dim, FieldFilter, FilterSpec, Status};
        let mut released = person("L2", "Ann Lee", "Checker");
        released.released = true;
        released.stress_calc = "SC-9".to_string();
        let mut holds = vec![
            person("L1", "Ann Lee", "Checker"),
            released,
            with_remark("L3", "Hold pending  573-PR-1"),
            with_remark("L4", "HOLD PENDING 573-pr-1"),
            hold("L5", "Process", "Vendor data", "x", 1),
        ];
        holds[0].stress_calc = "SC-9".to_string();
        let dataset = build(holds);
        let checked = [
            ("Ann", SearchKind::Person, Dim::Name),
            ("Checker", SearchKind::Role, Dim::Role),
            ("pending", SearchKind::Remark, Dim::Remark),
            ("Vendor", SearchKind::HoldType, Dim::HoldType),
            ("Process", SearchKind::Discipline, Dim::Discipline),
            ("SC-9", SearchKind::StressCalc, Dim::StressCalc),
        ];
        for (query, kind, dim) in checked {
            let results = search(&dataset, query, 8);
            let hit = results
                .groups
                .iter()
                .flat_map(|group| &group.hits)
                .find(|hit| hit.kind == kind)
                .unwrap_or_else(|| panic!("a {kind:?} hit for {query}"));
            let spec = FilterSpec {
                status: Status::All,
                fields: vec![FieldFilter {
                    dim,
                    values: vec![hit.value.clone()],
                    negate: false,
                }],
                ..FilterSpec::default()
            };
            let kept = dataset.rows.iter().filter(|row| spec.matches(row)).count();
            assert_eq!(kept, hit.holds, "{kind:?} {}", hit.value);
            assert!(kept > 0);
        }
    }
}
