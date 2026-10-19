//! Tests of the chart images: each SVG read back with `usvg` against the embedded faces.

use std::collections::BTreeMap;
use std::sync::{Arc, OnceLock};

use chrono::NaiveDate;
use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec, Status};
use hx_core::load::load_file;
use hx_core::model::Hold;
use hx_core::query::{group_by, matrix_top};
use hx_core::rules::RuleSet;
use hx_core::solve::{solve_plan, solve_view, SolvePlan};
use hx_synth::{generate, write_workbook, SynthConfig};
use resvg::usvg;

use super::*;
use crate::fonts::{Face, Fonts};
use crate::text::{ExportText, FILE_TEXT_KEYS};
use crate::xlsx::color;

/// The English of the keys the charts ask for, as the interface's catalog writes them.
const CHART_WORDS: [(&str, &str); 12] = [
    ("file.about.noFilters", "No filters"),
    ("file.chart.bars", "Holds by {dim}"),
    ("file.chart.curve", "Lines freed by the solve order"),
    ("file.chart.fewer", "Fewer"),
    ("file.chart.freed", "Freed so far"),
    ("file.chart.heatmap", "Holds by {rows} and {cols}"),
    ("file.chart.holds", "Holds"),
    ("file.chart.more", "More, up to {max}"),
    (
        "file.chart.mostFreed",
        "Step {step}: {freed} of {total} lines freed, 90 percent or more",
    ),
    ("file.chart.noHolds", "No holds"),
    ("file.chart.step", "Step"),
    ("file.chart.topBlockers", "Top blockers"),
];

/// Every label the crate asks for, written as its own key, except the words of the charts and
/// the names of the dimensions and of the folded values.
fn text() -> ExportText {
    let mut labels: BTreeMap<String, String> = FILE_TEXT_KEYS
        .iter()
        .map(|key| (key.to_string(), key.to_string()))
        .collect();
    for (key, word) in CHART_WORDS {
        labels.insert(key.into(), word.into());
    }
    for (key, word) in [
        ("file.dim.discipline", "Discipline"),
        ("file.dim.holdType", "Hold type"),
        ("file.dim.name", "Name"),
        ("file.dim.blocker", "Blocker"),
        ("file.matrix.other", "All others"),
    ] {
        labels.insert(key.into(), word.into());
    }
    ExportText {
        labels,
        months: Vec::new(),
    }
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

fn fonts() -> &'static Fonts {
    static FONTS: OnceLock<Fonts> = OnceLock::new();
    FONTS.get_or_init(Fonts::embedded)
}

fn snapshot() -> chrono::NaiveDateTime {
    NaiveDate::from_ymd_opt(2026, 10, 1)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
}

/// Open holds, each on a line of its own, named so that name `n` of `names` has `n + 1` holds.
fn named(names: &[String]) -> Dataset {
    let mut holds = Vec::new();
    for (at, name) in names.iter().enumerate() {
        for copy in 0..=at {
            holds.push(Hold {
                line_id: format!("L-{at}-{copy}"),
                name: name.clone(),
                remark: "WAITING FOR STRESS".into(),
                hold_type: "Stress".into(),
                discipline: "Piping".into(),
                ..Default::default()
            });
        }
    }
    Dataset::build(holds, RuleSet::builtin(), snapshot())
}

fn empty() -> Dataset {
    Dataset::build(Vec::new(), RuleSet::builtin(), snapshot())
}

fn plan_of(ds: &Dataset, spec: &FilterSpec) -> Option<SolvePlan> {
    spec.open_only().map(|open| solve_plan(ds, &open, None))
}

fn svg_of(ds: &Dataset, chart: &ChartChoice, filters: &[&str]) -> String {
    let spec = FilterSpec::default();
    let plan = plan_of(ds, &spec);
    let filters: Vec<String> = filters.iter().map(|f| f.to_string()).collect();
    chart_svg(ds, plan.as_ref(), &spec, chart, &filters, &text(), fonts()).unwrap()
}

/// The SVG parsed as the raster parses it: with the embedded faces only.
fn tree(svg: &str) -> usvg::Tree {
    let options = usvg::Options {
        fontdb: Arc::clone(fonts().database()),
        font_family: "Public Sans".into(),
        ..Default::default()
    };
    usvg::Tree::from_str(svg, &options).unwrap()
}

/// Every text of the tree, in document order, each with whether it was drawn in glyphs.
fn texts_of(group: &usvg::Group, out: &mut Vec<(String, bool)>) {
    for node in group.children() {
        match node {
            usvg::Node::Group(group) => texts_of(group, out),
            usvg::Node::Text(text) => {
                let content: String = text.chunks().iter().map(|c| c.text()).collect();
                out.push((content, !text.flattened().children().is_empty()));
            }
            _ => {}
        }
    }
}

fn texts(svg: &str) -> Vec<String> {
    let mut out = Vec::new();
    texts_of(tree(svg).root(), &mut out);
    for (text, drawn) in &out {
        assert!(*drawn, "{text} is drawn in the embedded faces");
    }
    out.into_iter().map(|(text, _)| text).collect()
}

/// Every fill color of the paths of the tree, as `0xRRGGBB`.
fn fills_of(group: &usvg::Group, out: &mut Vec<u32>) {
    for node in group.children() {
        match node {
            usvg::Node::Group(group) => fills_of(group, out),
            usvg::Node::Path(path) => {
                if let Some(usvg::Paint::Color(c)) = path.fill().map(|f| f.paint()) {
                    out.push(u32::from(c.red) << 16 | u32::from(c.green) << 8 | u32::from(c.blue));
                }
            }
            _ => {}
        }
    }
}

fn fills(svg: &str) -> Vec<u32> {
    let mut out = Vec::new();
    fills_of(tree(svg).root(), &mut out);
    out
}

fn neutral() -> u32 {
    color("--color-chart-neutral")
}

fn has(texts: &[String], wanted: &str) -> bool {
    texts.iter().any(|text| text == wanted)
}

// --- Every chart ---

#[test]
fn every_chart_parses_with_the_embedded_faces_and_has_its_size() {
    let ds = full();
    for chart in [
        ChartChoice::Bars {
            dim: Dim::Discipline,
        },
        ChartChoice::TopBlockers,
        ChartChoice::Heatmap {
            rows: Dim::Discipline,
            cols: Dim::HoldType,
        },
        ChartChoice::Curve { steps: 20 },
    ] {
        let svg = svg_of(ds, &chart, &[]);
        let tree = tree(&svg);
        assert_eq!(tree.size().width(), WIDTH, "{chart:?}");
        let height = tree.size().height();
        assert!(height > 100.0, "{chart:?}: {height}");
        assert_eq!(height.fract(), 0.0, "{chart:?}: a whole number of pixels");
        assert!(texts(&svg).len() > 3, "{chart:?}");
    }
}

#[test]
fn every_chart_names_the_filters_it_was_drawn_under_or_none() {
    let ds = full();
    let chart = ChartChoice::Bars {
        dim: Dim::Discipline,
    };
    let texts_of_none = texts(&svg_of(ds, &chart, &[]));
    assert!(has(&texts_of_none, "No filters"), "{texts_of_none:?}");
    let set = texts(&svg_of(
        ds,
        &chart,
        &["Discipline: Piping", "Hold type: Stress"],
    ));
    assert!(has(&set, "Discipline: Piping"), "{set:?}");
    assert!(has(&set, "Hold type: Stress"), "{set:?}");
    assert!(!has(&set, "No filters"), "{set:?}");
}

#[test]
fn the_same_input_gives_the_same_bytes() {
    let ds = full();
    for chart in [
        ChartChoice::Bars { dim: Dim::Blocker },
        ChartChoice::TopBlockers,
        ChartChoice::Heatmap {
            rows: Dim::Discipline,
            cols: Dim::Blocker,
        },
        ChartChoice::Curve { steps: usize::MAX },
    ] {
        let one = svg_of(ds, &chart, &["Discipline: Piping"]);
        let two = svg_of(ds, &chart, &["Discipline: Piping"]);
        assert_eq!(one, two, "{chart:?}");
        assert_eq!(
            crate::raster::png(&one, fonts()).unwrap(),
            crate::raster::png(&two, fonts()).unwrap(),
            "{chart:?}"
        );
    }
}

#[test]
fn a_chart_of_no_holds_says_so_and_draws_no_mark() {
    let ds = empty();
    for chart in [
        ChartChoice::Bars {
            dim: Dim::Discipline,
        },
        ChartChoice::TopBlockers,
        ChartChoice::Heatmap {
            rows: Dim::Discipline,
            cols: Dim::HoldType,
        },
        ChartChoice::Curve { steps: 10 },
    ] {
        let svg = svg_of(&ds, &chart, &[]);
        let texts = texts(&svg);
        assert!(has(&texts, "No holds"), "{chart:?}: {texts:?}");
        let fills = fills(&svg);
        assert!(!fills.contains(&neutral()), "{chart:?}: no bar");
        for step in 1..=7 {
            let seq = color(&format!("--color-chart-seq-{step}"));
            assert!(!fills.contains(&seq), "{chart:?}: no cell");
        }
        assert!(!svg.contains("<path"), "{chart:?}: no line");
    }
}

#[test]
fn a_text_written_into_a_chart_is_escaped() {
    let ds = named(&["<Pipe & \"Co\">".to_string()]);
    let svg = svg_of(&ds, &ChartChoice::Bars { dim: Dim::Name }, &["Name: a<b"]);
    let texts = texts(&svg);
    assert!(has(&texts, "<Pipe & \"Co\">"), "{texts:?}");
    assert!(has(&texts, "Name: a<b"), "{texts:?}");
}

// --- Bars ---

#[test]
fn bars_hold_the_title_the_axis_names_the_labels_and_the_values() {
    let ds = full();
    let svg = svg_of(
        ds,
        &ChartChoice::Bars {
            dim: Dim::Discipline,
        },
        &[],
    );
    let texts = texts(&svg);
    assert!(has(&texts, "Holds by Discipline"), "{texts:?}");
    assert!(has(&texts, "Discipline"), "{texts:?}");
    assert!(has(&texts, "Holds"), "{texts:?}");
    let groups = group_by(ds, &FilterSpec::default(), &Dim::Discipline);
    assert!(!groups.is_empty());
    for group in &groups {
        assert!(has(&texts, &group.label), "{} in {texts:?}", group.label);
        assert!(has(&texts, &count(group.holds)), "{} holds", group.holds);
    }
    let bars = fills(&svg).iter().filter(|c| **c == neutral()).count();
    assert_eq!(bars, groups.len());
}

#[test]
fn bars_of_forty_groups_fold_into_thirty_bars_and_all_others_with_the_rest() {
    let names: Vec<String> = (0..40).map(|n| format!("Name {n:02}")).collect();
    let ds = named(&names);
    let groups = group_by(&ds, &FilterSpec::default(), &Dim::Name);
    assert_eq!(groups.len(), 40);
    let svg = svg_of(&ds, &ChartChoice::Bars { dim: Dim::Name }, &[]);
    let texts = texts(&svg);
    for group in &groups[..BAR_LIMIT] {
        assert!(has(&texts, &group.label), "{}", group.label);
    }
    for group in &groups[BAR_LIMIT..] {
        assert!(!has(&texts, &group.label), "{} is folded", group.label);
    }
    let rest: usize = groups[BAR_LIMIT..].iter().map(|g| g.holds).sum();
    // The ten smallest names hold 1 to 10 holds.
    assert_eq!(rest, 55);
    let at = texts.iter().position(|t| t == "All others").unwrap();
    assert_eq!(texts[at + 1], count(rest), "{texts:?}");
    let bars = fills(&svg).iter().filter(|c| **c == neutral()).count();
    assert_eq!(bars, BAR_LIMIT + 1);
}

#[test]
fn a_long_label_is_cut_to_fit_its_column() {
    let long = "Instrumentation and control / Client documents for the vendor package of the \
                compressor station, revision C, with every comment of the last review included";
    let ds = named(&[long.to_string(), "Short".to_string()]);
    let svg = svg_of(&ds, &ChartChoice::Bars { dim: Dim::Name }, &[]);
    let texts = texts(&svg);
    assert!(!has(&texts, long));
    let cut = texts
        .iter()
        .find(|t| t.ends_with('…'))
        .expect("the long label is cut");
    assert!(long.starts_with(cut.trim_end_matches('…')), "{cut}");
    let width = fonts().width(cut, Face::Body, 13.0);
    // The label column leaves room for the bars and the values.
    assert!(width <= WIDTH - 2.0 * MARGIN - 96.0, "{width}");
    assert!(has(&texts, "Short"));
}

#[test]
fn top_blockers_are_the_ten_with_the_most_holds() {
    let ds = full();
    let svg = svg_of(ds, &ChartChoice::TopBlockers, &[]);
    let texts = texts(&svg);
    assert!(has(&texts, "Top blockers"), "{texts:?}");
    assert!(has(&texts, "Blocker"), "{texts:?}");
    assert!(has(&texts, "Holds"), "{texts:?}");
    let groups = group_by(ds, &FilterSpec::default(), &Dim::Blocker);
    assert!(groups.len() > crate::TOP_ITEMS);
    for group in &groups[..crate::TOP_ITEMS] {
        assert!(has(&texts, &group.label), "{} in {texts:?}", group.label);
        assert!(has(&texts, &count(group.holds)));
    }
    assert!(!has(&texts, &groups[crate::TOP_ITEMS].label));
    assert!(!has(&texts, "All others"));
    let bars = fills(&svg).iter().filter(|c| **c == neutral()).count();
    assert_eq!(bars, crate::TOP_ITEMS);
}

// --- Heatmap ---

#[test]
fn a_heatmap_holds_its_title_axis_names_labels_legend_and_every_value() {
    let ds = full();
    let svg = svg_of(
        ds,
        &ChartChoice::Heatmap {
            rows: Dim::Discipline,
            cols: Dim::HoldType,
        },
        &[],
    );
    let texts = texts(&svg);
    assert!(
        has(&texts, "Holds by Discipline and Hold type"),
        "{texts:?}"
    );
    assert!(has(&texts, "Discipline"));
    assert!(has(&texts, "Hold type"));
    assert!(has(&texts, "Fewer"));
    let held = matrix_top(
        ds,
        &FilterSpec::default(),
        &Dim::Discipline,
        &Dim::HoldType,
        MATRIX_LIMIT,
        MATRIX_LIMIT,
    );
    assert!(has(
        &texts,
        &format!("More, up to {}", count(held.max_cell))
    ));
    for group in &held.rows {
        assert!(has(&texts, &group.label), "{} in {texts:?}", group.label);
    }
    // A column label stands upright in a header 128 pixels tall: a longer one is cut to fit.
    for group in &held.cols {
        let whole = has(&texts, &group.label);
        let cut = texts
            .iter()
            .any(|t| t.ends_with('…') && group.label.starts_with(t.trim_end_matches('…')));
        assert!(whole || cut, "{} in {texts:?}", group.label);
        if cut {
            assert!(
                fonts().width(&group.label, Face::Body, 13.0) > 120.0,
                "{}",
                group.label
            );
        }
    }
    let printed: Vec<&String> = texts
        .iter()
        .filter(|t| t.parse::<usize>().is_ok())
        .collect();
    let mut cells: Vec<usize> = held
        .cells
        .iter()
        .flatten()
        .copied()
        .filter(|n| *n > 0)
        .collect();
    // The legend's 0 is printed once; no cell of 0 prints a value.
    let zero = printed.iter().filter(|t| t.as_str() == "0").count();
    assert_eq!(zero, 1);
    for cell in &cells {
        assert!(has(&texts, &count(*cell)), "{cell}");
    }
    cells.sort_unstable();
    let mut values: Vec<usize> = printed
        .iter()
        .filter(|t| t.as_str() != "0")
        .map(|t| t.parse().unwrap())
        .collect();
    values.sort_unstable();
    assert_eq!(values, cells);
}

#[test]
fn a_heatmap_folds_at_thirty_by_thirty_into_all_others() {
    let ds = full();
    let held = matrix_top(
        ds,
        &FilterSpec::default(),
        &Dim::Blocker,
        &Dim::Remark,
        MATRIX_LIMIT,
        MATRIX_LIMIT,
    );
    assert!(held.other_row.is_some() && held.other_col.is_some());
    let svg = svg_of(
        ds,
        &ChartChoice::Heatmap {
            rows: Dim::Blocker,
            cols: Dim::Remark,
        },
        &[],
    );
    let texts = texts(&svg);
    assert_eq!(texts.iter().filter(|t| *t == "All others").count(), 2);
    // Every cell is filled with a step of the ramp, or drawn empty: 31 by 31.
    let ramp: Vec<u32> = (1..=7)
        .map(|step| color(&format!("--color-chart-seq-{step}")))
        .collect();
    let cells = fills(&svg).iter().filter(|c| ramp.contains(c)).count();
    // The legend draws each step once.
    let filled = held.cells.iter().flatten().filter(|n| **n > 0).count();
    assert_eq!(cells, filled + 7);
}

#[test]
fn a_cell_takes_the_step_of_its_share_of_the_largest() {
    assert_eq!(ramp_step(0, 70), 0);
    assert_eq!(ramp_step(1, 70), 1);
    assert_eq!(ramp_step(10, 70), 1);
    assert_eq!(ramp_step(11, 70), 2);
    assert_eq!(ramp_step(70, 70), 7);
    assert_eq!(ramp_step(80, 70), 7);
    assert_eq!(ramp_step(3, 0), 7);
}

#[test]
fn the_value_on_every_step_of_the_ramp_reads_at_4_5_to_1() {
    for step in 1..=7 {
        let fill = color(&format!("--color-chart-seq-{step}"));
        let ink = cell_ink(fill);
        let ratio = contrast(ink, fill);
        assert!(ratio >= 4.5, "step {step}: {ratio:.2} to 1");
    }
    // Steps 1 to 4 take the primary ink and 5 to 7 the inverse, as on the screen.
    assert_eq!(
        cell_ink(color("--color-chart-seq-4")),
        color("--color-text-primary")
    );
    assert_eq!(
        cell_ink(color("--color-chart-seq-5")),
        color("--color-chart-text-inverse")
    );
}

// --- Curve ---

#[test]
fn a_curve_holds_its_title_axis_names_and_marks_the_ninety_percent_step() {
    let ds = full();
    let spec = FilterSpec::default();
    let view = solve_view(&plan_of(ds, &spec).unwrap());
    assert!(view.steps_to_most > 1 && view.steps_to_most < view.rows.len());
    let svg = svg_of(ds, &ChartChoice::Curve { steps: usize::MAX }, &[]);
    let texts = texts(&svg);
    assert!(has(&texts, "Lines freed by the solve order"), "{texts:?}");
    assert!(has(&texts, "Step"));
    assert!(has(&texts, "Freed so far"));
    let most = &view.rows[view.steps_to_most - 1];
    let sentence = format!(
        "Step {}: {} of {} lines freed, 90 percent or more",
        count(view.steps_to_most),
        count(most.cumulative),
        count(view.lines_on_hold)
    );
    assert!(has(&texts, &sentence), "{sentence} in {texts:?}");
    let last = view.rows.last().unwrap();
    assert!(has(&texts, &count(last.cumulative)), "{texts:?}");
    // One line, and the marker in the selected step of the neutral.
    assert_eq!(svg.matches("<path").count(), 1);
    assert!(fills(&svg).contains(&color("--color-chart-neutral-selected")));
}

#[test]
fn a_curve_of_the_head_ends_at_its_last_step() {
    let ds = full();
    let view = solve_view(&plan_of(ds, &FilterSpec::default()).unwrap());
    let head = view.steps_to_most;
    let svg = svg_of(ds, &ChartChoice::Curve { steps: head }, &[]);
    let drawn = texts(&svg);
    assert!(has(&drawn, &count(view.rows[head - 1].cumulative)));
    // The line has one point per step drawn.
    let path = svg.split("<path").nth(1).unwrap();
    let d = path
        .split(" d=\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap();
    assert_eq!(d.matches(['M', 'L']).count(), head, "{d}");
    // A head shorter than the 90 percent step has no mark.
    let short = svg_of(ds, &ChartChoice::Curve { steps: head - 1 }, &[]);
    assert!(!texts(&short).iter().any(|t| t.contains("90 percent")));
}

#[test]
fn a_curve_of_released_holds_only_says_there_is_no_open_hold() {
    let ds = full();
    let spec = FilterSpec {
        status: Status::Released,
        ..Default::default()
    };
    let plan = plan_of(ds, &spec);
    assert!(plan.is_none());
    let svg = chart_svg(
        ds,
        None,
        &spec,
        &ChartChoice::Curve { steps: 10 },
        &[],
        &text(),
        fonts(),
    )
    .unwrap();
    assert!(has(&texts(&svg), "No holds"));
    assert!(!svg.contains("<path"));
}

// --- Text ---

#[test]
fn a_catalog_without_a_chart_word_is_refused_naming_the_key() {
    let mut lacking = text();
    lacking.labels.remove("file.chart.noHolds");
    let result = chart_svg(
        &empty(),
        None,
        &FilterSpec::default(),
        &ChartChoice::TopBlockers,
        &[],
        &lacking,
        fonts(),
    );
    assert_eq!(
        result,
        Err(crate::ExportError::Text {
            key: "file.chart.noHolds".into()
        })
    );
}

#[test]
fn counts_are_written_with_their_thousands_separated() {
    assert_eq!(count(0), "0");
    assert_eq!(count(999), "999");
    assert_eq!(count(1_000), "1,000");
    assert_eq!(count(1_234_567), "1,234,567");
}

#[test]
fn every_color_a_chart_uses_is_in_the_palette() {
    for token in CHART_COLORS {
        assert!(crate::xlsx::palette().contains_key(token), "{token}");
        color(token);
    }
}

#[test]
fn every_text_of_a_chart_reads_at_4_5_to_1_on_the_surface() {
    let surface = color("--color-surface-app");
    for token in TEXT_COLORS {
        let ratio = contrast(color(token), surface);
        assert!(ratio >= 4.5, "{token}: {ratio:.2} to 1");
    }
}

#[test]
fn every_mark_of_a_chart_reads_at_3_to_1_on_the_surface() {
    let surface = color("--color-surface-app");
    for token in MARK_COLORS {
        let ratio = contrast(color(token), surface);
        assert!(ratio >= 3.0, "{token}: {ratio:.2} to 1");
    }
}
