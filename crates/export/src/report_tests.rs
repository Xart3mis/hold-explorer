//! Tests of the status report: the pages as SVG documents, and the PDF made of them.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use chrono::{NaiveDate, NaiveDateTime};
use hx_core::dataset::Dataset;
use hx_core::filter::{FilterSpec, Status};
use hx_core::load::load_file;
use hx_core::rules::RuleSet;
use hx_core::solve::{solve_plan, SolvePlan};
use hx_synth::{generate, write_workbook, SynthConfig};

use super::*;
use crate::chart::{EDGE, TEXT};
use crate::fonts::Fonts;
use crate::text::{ExportText, FILE_TEXT_KEYS};
use crate::xlsx::palette;

/// The English of every key the report asks for, as the interface's catalog writes them (the
/// `file.report.*` keys are new with the report). Every other key is written as itself.
const WORDS: [(&str, &str); 53] = [
    ("file.about.filters", "Filters"),
    ("file.about.madeAt", "Made at"),
    ("file.about.noFilters", "No filters"),
    ("file.about.snapshot", "Snapshot"),
    ("file.about.workspace", "Workspace"),
    ("file.chart.bars", "Holds by {dim}"),
    ("file.chart.curve", "Lines freed by the solve order"),
    ("file.chart.freed", "Freed so far"),
    ("file.chart.holds", "Holds"),
    (
        "file.chart.mostFreed",
        "Step {step}: {freed} of {total} lines freed, 90 percent or more",
    ),
    ("file.chart.noHolds", "No holds"),
    ("file.chart.step", "Step"),
    ("file.chart.topBlockers", "Top blockers"),
    ("file.column.blockers.blocker", "Blocker"),
    ("file.column.blockers.cumulative", "Freed so far"),
    ("file.column.blockers.gain", "Freed by this step"),
    ("file.column.blockers.holds", "Holds"),
    ("file.column.blockers.step", "Step"),
    ("file.column.holds.age", "Age"),
    ("file.column.holds.discipline", "Discipline"),
    ("file.column.holds.holdType", "Hold type"),
    ("file.column.holds.line", "Line ID"),
    ("file.column.holds.remark", "Remark"),
    ("file.dim.blocker", "Blocker"),
    ("file.dim.discipline", "Discipline"),
    ("file.dim.holdType", "Hold type"),
    ("file.dim.role", "Role"),
    ("file.matrix.other", "All others"),
    ("file.report.days", "{days} d"),
    ("file.report.holdsShown", "Holds shown: {shown} of {count} open holds"),
    ("file.report.oldestHolds", "Oldest open holds"),
    ("file.report.page", "Page {page} of {pages}"),
    (
        "file.report.releasedOnly",
        "Not shown: the filters keep released holds only, and this part is about open holds.",
    ),
    ("file.report.solveOrder", "Solve order"),
    ("file.report.stale", "Holds open for {days} days or more: {count}"),
    (
        "file.report.staleUnknown",
        "How long the holds have been open is not known: no open hold the filters keep has a creation date.",
    ),
    ("file.report.stepsShown", "Steps shown: {shown} of {count}"),
    ("file.report.title", "Hold status report"),
    ("file.report.unknown", "Not known"),
    ("file.report.version", "Hold Explorer {version}"),
    ("file.summary.all.holds", "Holds"),
    ("file.summary.all.lines", "Lines"),
    ("file.summary.all.median", "Median age of open holds"),
    ("file.summary.linesWithOneHold", "Lines with one hold"),
    ("file.summary.open.holds", "Open holds"),
    ("file.summary.open.lines", "Lines on hold"),
    ("file.summary.open.median", "Median age"),
    ("file.summary.released.holds", "Released holds"),
    ("file.summary.released.lines", "Lines with released holds"),
    ("file.summary.released.median", "Median duration"),
    ("file.summary.singleHoldLines", "Single-hold lines"),
    ("file.summary.stale", "Holds open for 90 days or more"),
    ("file.title", "Hold Explorer export"),
];

fn text() -> ExportText {
    let mut labels: BTreeMap<String, String> = FILE_TEXT_KEYS
        .iter()
        .map(|key| (key.to_string(), key.to_string()))
        .collect();
    for (key, word) in WORDS {
        labels.insert(key.into(), word.into());
    }
    ExportText {
        labels,
        months: [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
        ]
        .iter()
        .map(|m| m.to_string())
        .collect(),
    }
}

fn fonts() -> &'static Fonts {
    static FONTS: OnceLock<Fonts> = OnceLock::new();
    FONTS.get_or_init(Fonts::embedded)
}

/// A full synthetic snapshot of 600 holds on 80 lines, read as an import reads it.
fn full() -> &'static Dataset {
    static FULL: OnceLock<Dataset> = OnceLock::new();
    FULL.get_or_init(|| {
        let cfg = SynthConfig::new(11, 80, 600);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds.xlsx");
        write_workbook(&generate(&cfg), &cfg, &path).unwrap();
        let loaded = load_file(&path).unwrap();
        Dataset::build(
            loaded.parsed.holds,
            RuleSet::builtin(),
            loaded.snapshot.unwrap().at,
        )
    })
}

fn moment(y: i32, m: u32, d: u32, h: u32, min: u32) -> NaiveDateTime {
    NaiveDate::from_ymd_opt(y, m, d)
        .unwrap()
        .and_hms_opt(h, min, 0)
        .unwrap()
}

fn empty() -> Dataset {
    Dataset::build(Vec::new(), RuleSet::builtin(), moment(2026, 10, 1, 0, 0))
}

fn plan_of(ds: &Dataset, spec: &FilterSpec) -> Option<SolvePlan> {
    spec.open_only().map(|open| solve_plan(ds, &open, None))
}

fn head(ds: &Dataset, filters: &[&str]) -> ReportHead {
    ReportHead {
        workspace: "Unit 573 piping".into(),
        snapshot: ds.snapshot.date(),
        filters: filters.iter().map(|f| f.to_string()).collect(),
        app_version: "0.1.0".into(),
        made_at: moment(2026, 10, 19, 14, 5),
    }
}

fn report_of(ds: &Dataset, spec: &FilterSpec, filters: &[&str]) -> Vec<u8> {
    let plan = plan_of(ds, spec);
    status_report(
        ds,
        plan.as_ref(),
        spec,
        &head(ds, filters),
        &text(),
        fonts(),
    )
    .unwrap()
}

fn pages_of(ds: &Dataset, spec: &FilterSpec, filters: &[&str]) -> Vec<String> {
    let plan = plan_of(ds, spec);
    report_pages(
        ds,
        plan.as_ref(),
        spec,
        &head(ds, filters),
        &text(),
        fonts(),
    )
    .unwrap()
}

/// The text of every `<text>` element of an SVG page, in order.
fn texts(svg: &str) -> Vec<String> {
    svg.split("<text ")
        .skip(1)
        .filter_map(|part| {
            let start = part.find('>')? + 1;
            let end = part.find("</text>")?;
            Some(part[start..end].to_string())
        })
        .collect()
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

fn occurrences(haystack: &[u8], needle: &[u8]) -> usize {
    haystack
        .windows(needle.len())
        .filter(|w| *w == needle)
        .count()
}

/// The pages of a PDF, as its page objects declare them (`/Pages` is their tree).
fn page_count(pdf: &[u8]) -> usize {
    occurrences(pdf, b"/Type/Page/") + occurrences(pdf, b"/Type/Page>")
}

#[test]
fn the_bytes_are_a_pdf() {
    let pdf = report_of(full(), &FilterSpec::default(), &[]);
    assert!(pdf.starts_with(b"%PDF-"), "{:?}", &pdf[..8]);
    assert!(pdf.ends_with(b"%%EOF") || pdf.ends_with(b"%%EOF\n"));
}

#[test]
fn a_full_snapshot_takes_four_pages_and_an_empty_one_one() {
    let full_pdf = report_of(full(), &FilterSpec::default(), &[]);
    // The header, the tiles, and the disciplines; hold types, roles, and the top blockers; the
    // solve order and its curve; the oldest open holds.
    assert_eq!(page_count(&full_pdf), 4);
    assert_eq!(pages_of(full(), &FilterSpec::default(), &[]).len(), 4);
    let empty_pdf = report_of(&empty(), &FilterSpec::default(), &[]);
    assert_eq!(page_count(&empty_pdf), 1);
}

#[test]
fn every_page_is_a4_portrait() {
    let pdf = report_of(full(), &FilterSpec::default(), &[]);
    let boxes = occurrences(&pdf, b"/MediaBox[0 0 595.28 841.89]");
    assert_eq!(boxes, page_count(&pdf));
}

#[test]
fn the_three_faces_are_embedded_as_subsets() {
    let pdf = report_of(full(), &FilterSpec::default(), &[]);
    assert!(contains(&pdf, b"/FontFile2"));
    // The PostScript names of the static instances of `fonts/`.
    for name in [
        &b"PublicSansRoman-Regular"[..],
        b"PublicSansRoman-SemiBold",
        b"RedditMono-Regular",
    ] {
        // A subset is named with a tag of six capitals and a plus before the face's name.
        let found = pdf
            .windows(name.len() + 7)
            .any(|w| w[..6].iter().all(u8::is_ascii_uppercase) && w[6] == b'+' && &w[7..] == name);
        assert!(found, "{}", String::from_utf8_lossy(name));
    }
}

#[test]
fn the_report_made_twice_is_the_same_bytes() {
    let one = report_of(full(), &FilterSpec::default(), &["Discipline: Piping"]);
    let two = report_of(full(), &FilterSpec::default(), &["Discipline: Piping"]);
    assert!(one == two, "two reports of the same input differ");
}

/// The SHA-256 of the report of the synthetic snapshot, made at a fixed moment. CI on Windows and
/// on Linux checks the same value, so the report is the same file on both. A change of a
/// dependency that changes the bytes updates this value in the same commit, with the reason.
const GOLDEN: &str = "640acae00c97e66d114108865378f76cd469bded605a7913cbb8263d436d71a7";

#[test]
fn the_report_of_the_synthetic_snapshot_has_the_checked_in_hash() {
    let pdf = report_of(full(), &FilterSpec::default(), &["Discipline: Piping"]);
    assert_eq!(sha256_hex(&pdf), GOLDEN);
}

#[test]
fn the_document_has_the_catalog_title_and_the_moment_it_was_made_and_nothing_of_the_machine() {
    let pdf = report_of(full(), &FilterSpec::default(), &[]);
    assert!(contains(&pdf, b"Hold status report"));
    assert!(contains(&pdf, b"D:20261019140500"));
    for word in [&b"/Producer"[..], b"/Creator ", b"krilla", b"CreatorTool"] {
        assert!(!contains(&pdf, word), "{}", String::from_utf8_lossy(word));
    }
}

#[test]
fn the_first_page_has_the_header_the_tiles_the_stale_line_and_the_disciplines() {
    let pages = pages_of(
        full(),
        &FilterSpec::default(),
        &["Discipline: Piping", "Hold type: Stress"],
    );
    let first = texts(&pages[0]);
    for wanted in [
        "Hold status report",
        "Unit 573 piping",
        "19 Oct 2026 14:05",
        "Discipline: Piping",
        "Hold type: Stress",
        "Open holds",
        "Lines on hold",
        "Lines with one hold",
        "Median age",
        "Holds by Discipline",
    ] {
        assert!(first.iter().any(|t| t == wanted), "{wanted} in {first:?}");
    }
    assert!(first
        .iter()
        .any(|t| t.starts_with("Holds open for 90 days or more: ")));
    let snapshot = text().date(full().snapshot.date());
    assert!(first.contains(&snapshot), "{snapshot} in {first:?}");
}

#[test]
fn no_filter_is_said_as_no_filters() {
    let pages = pages_of(full(), &FilterSpec::default(), &[]);
    assert!(texts(&pages[0]).iter().any(|t| t == "No filters"));
}

#[test]
fn every_part_after_the_first_page_is_there_in_order() {
    let pages = pages_of(full(), &FilterSpec::default(), &[]);
    let all: Vec<String> = pages.iter().flat_map(|page| texts(page)).collect();
    let at = |wanted: &str| {
        all.iter()
            .position(|t| t == wanted)
            .unwrap_or_else(|| panic!("{wanted} in {all:?}"))
    };
    let order = [
        at("Holds by Discipline"),
        at("Holds by Hold type"),
        at("Holds by Role"),
        at("Top blockers"),
        at("Solve order"),
        at("Lines freed by the solve order"),
        at("Oldest open holds"),
    ];
    assert!(order.windows(2).all(|w| w[0] < w[1]), "{order:?}");
}

#[test]
fn every_page_has_its_number_of_the_count_and_the_version() {
    let pages = pages_of(full(), &FilterSpec::default(), &[]);
    let count = pages.len();
    for (at, page) in pages.iter().enumerate() {
        let words = texts(page);
        let number = format!("Page {} of {count}", at + 1);
        assert!(words.contains(&number), "{number} in {words:?}");
        assert!(
            words.iter().any(|t| t == "Hold Explorer 0.1.0"),
            "{words:?}"
        );
    }
}

#[test]
fn the_solve_order_lists_the_steps_to_ninety_percent_at_most_twenty() {
    let spec = FilterSpec::default();
    let plan = plan_of(full(), &spec).unwrap();
    let view = hx_core::solve::solve_view(&plan);
    let rows = solve_rows(Some(&plan));
    assert_eq!(rows.len(), view.steps_to_most.min(SOLVE_ROWS));
    assert!(rows.len() <= 20);
    assert_eq!(rows[0].step, 1);
}

#[test]
fn the_oldest_open_holds_are_twenty_open_holds_by_age() {
    let spec = FilterSpec {
        status: Status::All,
        ..Default::default()
    };
    let (rows, total) = oldest_page(full(), &spec).unwrap();
    assert!(total > 20);
    assert_eq!(rows.len(), 20);
    assert!(rows.iter().all(|row| !row.hold.released));
    let ages: Vec<i64> = rows.iter().filter_map(|row| row.days()).collect();
    assert!(ages.windows(2).all(|w| w[0] >= w[1]), "{ages:?}");
}

#[test]
fn released_holds_only_say_why_the_parts_of_open_holds_are_empty() {
    let spec = FilterSpec {
        status: Status::Released,
        ..Default::default()
    };
    let pages = pages_of(full(), &spec, &["Status: Released"]);
    let all: Vec<String> = pages.iter().flat_map(|page| texts(page)).collect();
    let why = "Not shown: the filters keep released holds only, and this part is about open holds.";
    // The tiles of age (and the stale holds), the solve order, and the oldest open holds.
    assert_eq!(all.iter().filter(|t| *t == why).count(), 3, "{all:?}");
    assert!(!all.iter().any(|t| t == "Lines freed by the solve order"));
    assert!(!all.iter().any(|t| t == "Median duration"));
    assert!(all.iter().any(|t| t == "Released holds"));
}

#[test]
fn a_table_of_forty_five_rows_continues_on_a_second_page_with_its_header() {
    let columns = vec![
        Col::text("Line ID", 160.0, Face::Mono),
        Col::share("Remark", 120.0),
        Col::number("Age"),
    ];
    let rows: Vec<Vec<String>> = (0..45)
        .map(|n| vec![format!("L-{n:03}"), format!("Remark {n}"), n.to_string()])
        .collect();
    let mut flow = Flow::new(fonts());
    table(&mut flow, &columns, &rows);
    let pages = flow.finish(|_, _| (String::new(), String::new()));
    assert_eq!(pages.len(), 2);
    for page in &pages {
        let words = texts(page);
        assert_eq!(
            words.iter().filter(|t| *t == "Line ID").count(),
            1,
            "{words:?}"
        );
        assert_eq!(
            words.iter().filter(|t| *t == "Remark").count(),
            1,
            "{words:?}"
        );
    }
    let first = texts(&pages[0]);
    let second = texts(&pages[1]);
    assert!(first.contains(&"L-000".to_string()));
    assert!(second.contains(&"L-044".to_string()));
    let on_both = (0..45)
        .map(|n| format!("L-{n:03}"))
        .filter(|id| first.contains(id) && second.contains(id))
        .count();
    assert_eq!(on_both, 0, "every row is drawn once");
    let drawn = (0..45)
        .map(|n| format!("L-{n:03}"))
        .filter(|id| first.contains(id) || second.contains(id))
        .count();
    assert_eq!(drawn, 45);
}

#[test]
fn a_long_remark_is_wrapped_over_lines_of_its_column() {
    let columns = vec![
        Col::text("Line ID", 160.0, Face::Mono),
        Col::share("Remark", 120.0),
    ];
    let remark =
        "Waiting for the stress calculation of the connected equipment nozzle loads ".repeat(3);
    let rows = vec![vec!["L-1".to_string(), remark.clone()]];
    let mut flow = Flow::new(fonts());
    table(&mut flow, &columns, &rows);
    let pages = flow.finish(|_, _| (String::new(), String::new()));
    let words = texts(&pages[0]);
    let lines: Vec<&String> = words
        .iter()
        .filter(|t| remark.contains(t.as_str()))
        .collect();
    assert!(lines.len() >= 2, "{words:?}");
}

#[test]
fn a_catalog_without_a_report_word_is_refused_naming_the_key() {
    let mut lacking = text();
    lacking.labels.remove("file.report.page");
    let spec = FilterSpec::default();
    let plan = plan_of(full(), &spec);
    let result = status_report(
        full(),
        plan.as_ref(),
        &spec,
        &head(full(), &[]),
        &lacking,
        fonts(),
    );
    assert_eq!(
        result,
        Err(ExportError::Text {
            key: "file.report.page".into()
        })
    );
}

#[test]
fn every_color_of_the_report_is_in_the_palette() {
    for token in REPORT_COLORS {
        assert!(palette().contains_key(token), "{token}");
    }
    assert!(REPORT_COLORS.contains(&TEXT) && REPORT_COLORS.contains(&EDGE));
}

/// SHA-256 (FIPS 180-4) of `data` as lowercase hex, for the golden test.
fn sha256_hex(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut message = data.to_vec();
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
    for chunk in message.chunks(64) {
        let mut w = [0u32; 64];
        for (i, word) in chunk.chunks(4).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ (!e & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (slot, value) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *slot = slot.wrapping_add(value);
        }
    }
    h.iter().map(|word| format!("{word:08x}")).collect()
}

#[test]
fn the_hash_of_the_golden_test_is_sha_256() {
    assert_eq!(
        sha256_hex(b""),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    assert_eq!(
        sha256_hex(b"abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    let long = vec![b'a'; 1_000];
    assert_eq!(
        sha256_hex(&long),
        "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3"
    );
}

#[test]
#[ignore = "writes reports for a reviewer to look at, into the folder HX_REPORT_DIR names"]
fn write_the_reports_of_the_synthetic_snapshot() {
    let dir = std::path::PathBuf::from(std::env::var("HX_REPORT_DIR").unwrap());
    let released = FilterSpec {
        status: Status::Released,
        ..Default::default()
    };
    for (name, ds, spec, filters) in [
        (
            "full",
            full(),
            FilterSpec::default(),
            vec!["Discipline: Piping"],
        ),
        ("released", full(), released, vec!["Status: Released"]),
        ("empty", &empty(), FilterSpec::default(), Vec::new()),
    ] {
        let pdf = report_of(ds, &spec, &filters);
        std::fs::write(dir.join(format!("m1c-export-task-9-{name}.pdf")), pdf).unwrap();
    }
}

#[test]
fn filters_that_fill_the_first_page_go_on_over_the_next() {
    let filters: Vec<String> = (0..40).map(|n| format!("Line ID: L-{n}")).collect();
    let refs: Vec<&str> = filters.iter().map(String::as_str).collect();
    let pages = pages_of(full(), &FilterSpec::default(), &refs);
    let first = texts(&pages[0]);
    let second = texts(&pages[1]);
    assert!(first.contains(&"Line ID: L-0".to_string()));
    assert!(second.contains(&"Line ID: L-39".to_string()));
    let drawn = filters
        .iter()
        .filter(|f| first.contains(f) || second.contains(f))
        .count();
    assert_eq!(drawn, 40);
}
