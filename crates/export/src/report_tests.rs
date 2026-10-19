//! Tests of the status report: the pages as SVG documents, and the PDF made of them.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use chrono::{DateTime, FixedOffset, NaiveDate, NaiveDateTime};
use hx_core::dataset::Dataset;
use hx_core::filter::{FilterSpec, Status};
use hx_core::load::load_file;
use hx_core::rules::RuleSet;
use hx_core::solve::{solve_plan, SolvePlan};
use hx_synth::{generate, write_workbook, SynthConfig};
use sha2::{Digest, Sha256};

use super::*;
use crate::fonts::Fonts;
use crate::text::{ExportText, FILE_TEXT_KEYS};
use crate::xlsx::palette;

/// The English of every key the report asks for, as the interface's catalog writes them (the
/// `file.report.*` keys are new with the report). Every other key is written as itself.
const WORDS: [(&str, &str); 54] = [
    ("file.about.filters", "Filters"),
    ("file.about.madeAt", "Made at"),
    ("file.about.noFilters", "No filters"),
    ("file.about.noSnapshot", "No snapshot"),
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
    ("file.summary.stale", "Holds open for {days} days or more"),
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

/// 19 Oct 2026 14:05 at three hours east of UTC.
fn made_at() -> DateTime<FixedOffset> {
    moment(2026, 10, 19, 14, 5)
        .and_local_timezone(FixedOffset::east_opt(3 * 3600).unwrap())
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
        snapshot: Some(ds.snapshot.date()),
        filters: filters.iter().map(|f| f.to_string()).collect(),
        app_version: "0.1.0".into(),
        made_at: made_at(),
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
    // The three faces and no other.
    assert_eq!(occurrences(&pdf, b"/FontFile2"), 3);
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
const GOLDEN: &str = "5a6fd7d4fc6e993bd8f3dff7862d85976bbef6d0ba2a3686958018419975e98e";

#[test]
fn the_report_of_the_synthetic_snapshot_has_the_checked_in_hash() {
    let pdf = report_of(full(), &FilterSpec::default(), &["Discipline: Piping"]);
    assert_eq!(sha256_hex(&pdf), GOLDEN);
}

#[test]
fn the_document_has_the_catalog_title_and_the_moment_it_was_made_and_nothing_of_the_machine() {
    let pdf = report_of(full(), &FilterSpec::default(), &[]);
    assert!(contains(&pdf, b"Hold status report"));
    // The local time the header states, with its offset from UTC: hours and minutes, as
    // pdf-writer writes them (without the closing apostrophe, which PDF 2.0 drops), and in XMP.
    assert!(contains(&pdf, b"/CreationDate(D:20261019140500+03'00)"));
    assert!(contains(
        &pdf,
        b"<xmp:CreateDate>2026-10-19T14:05:00+03:00</xmp:CreateDate>"
    ));
    for word in [&b"/Producer"[..], b"/Creator", b"krilla", b"CreatorTool"] {
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
fn a_report_without_a_snapshot_says_so_in_the_place_of_its_date() {
    let ds = empty();
    let spec = FilterSpec::default();
    let plan = plan_of(&ds, &spec);
    let head = ReportHead {
        snapshot: None,
        ..head(&ds, &[])
    };
    let pages = report_pages(&ds, plan.as_ref(), &spec, &head, &text(), fonts()).unwrap();
    let first = texts(&pages[0]);
    assert!(first.iter().any(|t| t == "No snapshot"), "{first:?}");
    assert!(
        !first.contains(&text().date(ds.snapshot.date())),
        "{first:?}"
    );
    // A report with a snapshot never says it has none.
    let pages = pages_of(full(), &spec, &[]);
    assert!(!texts(&pages[0]).iter().any(|t| t == "No snapshot"));
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
    // The solve order and the oldest open holds say it together, on one page.
    let page_of = |title: &str| {
        pages
            .iter()
            .position(|page| texts(page).iter().any(|t| t == title))
            .unwrap()
    };
    assert_eq!(page_of("Solve order"), page_of("Oldest open holds"));
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
}

/// SHA-256 of `data` as lowercase hex, for the golden test.
fn sha256_hex(data: &[u8]) -> String {
    Sha256::digest(data)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
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

/// Every element of an SVG page that is drawn below `bottom`, except those of the footer.
fn below(svg: &str, bottom: f32) -> Vec<String> {
    let number = |element: &str, name: &str| -> Option<f32> {
        let start = element.find(&format!(" {name}=\""))? + name.len() + 3;
        let end = start + element[start..].find('"')?;
        element[start..end].parse().ok()
    };
    let mut out = Vec::new();
    for element in svg.split('<').skip(1) {
        let lowest = if element.starts_with("text ") {
            let footer = element.contains(">Page ") || element.contains(">Hold Explorer ");
            if footer {
                None
            } else {
                number(element, "y")
            }
        } else if element.starts_with("rect ") && element.contains(" x=\"") {
            Some(number(element, "y").unwrap_or(0.0) + number(element, "height").unwrap_or(0.0))
        } else if element.starts_with("line ") {
            Some(
                number(element, "y1")
                    .unwrap_or(0.0)
                    .max(number(element, "y2").unwrap_or(0.0)),
            )
        } else {
            None
        };
        if lowest.is_some_and(|y| y > bottom) {
            out.push(element.chars().take(120).collect());
        }
    }
    out
}

#[test]
fn many_and_long_filters_never_draw_into_the_footer() {
    let long = format!(
        "Line ID: {}",
        (0..1200)
            .map(|n| format!("L-{n:04}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    // Filter rows ending at every place near the bottom of page 1, and a filter of more lines
    // than a page holds.
    for rows in 20..=45 {
        let mut filters: Vec<String> = (0..rows).map(|n| format!("Hold type: Type {n}")).collect();
        filters.push(long.clone());
        let refs: Vec<&str> = filters.iter().map(String::as_str).collect();
        let pages = pages_of(full(), &FilterSpec::default(), &refs);
        for (at, page) in pages.iter().enumerate() {
            let low = below(page, BOTTOM);
            assert!(low.is_empty(), "{rows} filters, page {}: {low:?}", at + 1);
        }
        // The long filter is cut to its lines, with an ellipsis.
        let all: Vec<String> = pages.iter().flat_map(|page| texts(page)).collect();
        assert!(
            all.iter().any(|t| t.starts_with("L-") && t.ends_with('…')),
            "{rows}"
        );
        assert!(all.iter().any(|t| t == "Open holds"));
    }
}

#[test]
fn a_median_of_a_thousand_days_or_more_has_its_thousands_separated() {
    assert_eq!(count_days(1234), "1,234");
    assert_eq!(count_days(-1234), "-1,234");
}

#[test]
fn a_hold_type_column_is_as_wide_as_its_widest_value() {
    let columns = vec![Col::sized("Hold type", 220.0), Col::share("Remark", 120.0)];
    let rows = vec![vec!["INSTRUMENT VENDOR DATA".to_string(), "x".to_string()]];
    let mut flow = Flow::new(fonts());
    table(&mut flow, &columns, &rows);
    let pages = flow.finish(|_, _| (String::new(), String::new()));
    assert!(texts(&pages[0]).contains(&"INSTRUMENT VENDOR DATA".to_string()));
}
