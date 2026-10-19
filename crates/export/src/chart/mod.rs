//! Charts as standalone SVG documents, drawn as the screen draws them in the light theme.
//!
//! Every chart is 960 pixels wide and as tall as its content: its title, the filters it was drawn
//! under, and then the chart (bars, a heatmap, or a curve). Text is text, in the embedded faces
//! of [`Fonts`], measured with them so that a label is cut where it would not fit. Colors are the
//! light-theme values of `palette.json`. Every word comes from the catalog through
//! [`ExportText`]; numbers are written with their thousands separated, as the interface writes
//! them. Nothing of the moment or the machine enters a drawing: the same input gives the same
//! bytes.

mod bars;
mod curve;
mod heatmap;
mod svg;

use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::query::{group_by, matrix_top};
use hx_core::solve::{solve_view, SolvePlan};
use serde::Deserialize;

use crate::fonts::{Face, Fonts};
use crate::text::ExportText;
use crate::views::{dim_name, TOP_ITEMS};
use crate::xlsx::color;
use crate::ExportError;

use bars::Bar;
#[cfg(test)]
use heatmap::{cell_ink, contrast, ramp_step};
use svg::{Anchor, Ink, Svg};

/// The most bars a chart of one dimension draws; the other values are folded into "All others".
pub const BAR_LIMIT: usize = 30;
/// The most rows and columns a heatmap draws; the other values are folded into "All others".
pub const MATRIX_LIMIT: usize = 30;

/// The width of every chart, in pixels.
pub(crate) const WIDTH: f32 = 960.0;
/// The space around a chart, on every side (`--space-6`).
pub(crate) const MARGIN: f32 = 24.0;
/// The width inside the margins.
const INNER: f32 = WIDTH - 2.0 * MARGIN;

/// The size of body text, labels, values, and captions (`--font-size-sm`).
const SMALL: f32 = 13.0;
/// The size of a title (`--font-size-md`).
const TITLE: f32 = 17.0;
/// The height of a line of a title (`--line-height-md`).
const TITLE_LINE: f32 = 24.0;
/// The height of a line of a caption or a label (`--line-height-tight`).
const LINE: f32 = 16.0;
/// The space between the header of a chart and the chart (`--space-6`).
const SECTION_GAP: f32 = 24.0;

/// The surface every chart is drawn on.
const SURFACE: &str = "--color-surface-app";
/// Titles, labels, and values.
const TEXT: &str = "--color-text-primary";
/// The labels of folded values and of the heatmap's columns.
const TEXT_SECONDARY: &str = "--color-text-secondary";
/// Axis names, ticks, the filters, and the legend.
const TEXT_MUTED: &str = "--color-text-muted";
/// Gridlines.
const GRID: &str = "--color-chart-grid";
/// The baseline and the hairline at the marked step.
const AXIS: &str = "--color-chart-axis";
/// The hairline inside the edge of an empty cell of the heatmap, and of its swatch.
const EDGE: &str = "--color-border-default";
/// Bars and the line: one neutral for plain data.
const NEUTRAL: &str = "--color-chart-neutral";
/// The marker of the 90 percent step.
const NEUTRAL_SELECTED: &str = "--color-chart-neutral-selected";
/// The value on a dark step of the heatmap's ramp.
const TEXT_INVERSE: &str = "--color-chart-text-inverse";
/// The sequential ramp of the heatmap, lightest first.
const RAMP: [&str; 7] = [
    "--color-chart-seq-1",
    "--color-chart-seq-2",
    "--color-chart-seq-3",
    "--color-chart-seq-4",
    "--color-chart-seq-5",
    "--color-chart-seq-6",
    "--color-chart-seq-7",
];

/// Every color a chart uses, which a test finds in `palette.json`.
#[cfg(test)]
const CHART_COLORS: [&str; 17] = [
    SURFACE,
    EDGE,
    TEXT,
    TEXT_SECONDARY,
    TEXT_MUTED,
    GRID,
    AXIS,
    NEUTRAL,
    NEUTRAL_SELECTED,
    TEXT_INVERSE,
    RAMP[0],
    RAMP[1],
    RAMP[2],
    RAMP[3],
    RAMP[4],
    RAMP[5],
    RAMP[6],
];
/// The colors of text on the surface, which a test checks at 4.5:1. Text on a cell of the
/// ramp takes [`heatmap::cell_ink`], checked on its own.
#[cfg(test)]
const TEXT_COLORS: [&str; 3] = [TEXT, TEXT_SECONDARY, TEXT_MUTED];
/// The colors of marks on the surface, which a test checks at 3:1.
#[cfg(test)]
const MARK_COLORS: [&str; 2] = [NEUTRAL, NEUTRAL_SELECTED];

/// Which chart, with what it draws.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(tag = "kind")]
pub enum ChartChoice {
    /// Bars of the kept holds by one dimension (Overview's three, and Breakdown's list),
    /// largest first, at most 30 bars, the rest folded into "All others".
    Bars {
        /// The dimension the holds are grouped by.
        dim: Dim,
    },
    /// The ten blockers with the most kept holds.
    TopBlockers,
    /// The heatmap of two dimensions, as Breakdown's matrix (30 by 30, folded).
    Heatmap {
        /// The dimension of the rows.
        rows: Dim,
        /// The dimension of the columns.
        cols: Dim,
    },
    /// The cumulative curve of lines freed, the first `steps` steps (the head on screen, or all).
    Curve {
        /// How many steps are drawn, from the first, at most all; 0 draws every step.
        steps: usize,
    },
}

/// The chart as a standalone SVG document, light theme, with its title and, under it, the
/// filters it was drawn under. Text is text, in the embedded faces.
///
/// `plan` is the solve plan of the open kept holds, for the curve; `filters` are the filters the
/// filter bar shows as set, one per entry (the catalog's "No filters" when there is none). A
/// chart with nothing to draw (no kept hold, or no open one for the curve) says the catalog's
/// "No holds" in the place of its marks.
///
/// `Err(ExportError::Text)` when `text` lacks a label.
pub fn chart_svg(
    ds: &Dataset,
    plan: Option<&SolvePlan>,
    spec: &FilterSpec,
    chart: &ChartChoice,
    filters: &[String],
    text: &ExportText,
    fonts: &Fonts,
) -> Result<String, ExportError> {
    let none = text.get("file.chart.noHolds")?;
    let holds = text.get("file.chart.holds")?;
    match chart {
        ChartChoice::Bars { dim } => {
            let title = fill(
                text.get("file.chart.bars")?,
                &[("dim", &dim_name(dim, text)?)],
            );
            let other = text.get("file.matrix.other")?;
            let mut page = Page::new(&title, filters, text, fonts)?;
            let groups = group_by(ds, spec, dim);
            let rest = groups.get(BAR_LIMIT..).unwrap_or_default();
            let mut bars: Vec<Bar> = groups
                .iter()
                .take(BAR_LIMIT)
                .map(|group| Bar::new(&group.label, group.holds))
                .collect();
            if !rest.is_empty() {
                bars.push(Bar::folded(other, rest.iter().map(|g| g.holds).sum()));
            }
            let face = if *dim == Dim::LineId {
                Face::Mono
            } else {
                Face::Body
            };
            if bars.is_empty() {
                page.note(none);
            } else {
                bars::draw(&mut page, &bars, &dim_name(dim, text)?, holds, face);
            }
            Ok(page.finish())
        }
        ChartChoice::TopBlockers => {
            let mut page = Page::new(text.get("file.chart.topBlockers")?, filters, text, fonts)?;
            let bars: Vec<Bar> = group_by(ds, spec, &Dim::Blocker)
                .iter()
                .take(TOP_ITEMS)
                .map(|group| Bar::new(&group.label, group.holds))
                .collect();
            if bars.is_empty() {
                page.note(none);
            } else {
                let name = dim_name(&Dim::Blocker, text)?;
                bars::draw(&mut page, &bars, &name, holds, Face::Body);
            }
            Ok(page.finish())
        }
        ChartChoice::Heatmap { rows, cols } => {
            let (rows_name, cols_name) = (dim_name(rows, text)?, dim_name(cols, text)?);
            let title = fill(
                text.get("file.chart.heatmap")?,
                &[("rows", &rows_name), ("cols", &cols_name)],
            );
            let words = heatmap::Words {
                rows: rows_name.clone(),
                cols: cols_name.clone(),
                other: text.get("file.matrix.other")?.to_string(),
                fewer: text.get("file.chart.fewer")?.to_string(),
                more: text.get("file.chart.more")?.to_string(),
            };
            let mut page = Page::new(&title, filters, text, fonts)?;
            let matrix = matrix_top(ds, spec, rows, cols, MATRIX_LIMIT, MATRIX_LIMIT);
            if matrix.rows.is_empty() || matrix.cols.is_empty() {
                page.note(none);
            } else {
                heatmap::draw(&mut page, &matrix, &words);
            }
            Ok(page.finish())
        }
        ChartChoice::Curve { steps } => {
            let words = curve::Words {
                step: text.get("file.chart.step")?.to_string(),
                freed: text.get("file.chart.freed")?.to_string(),
                most: text.get("file.chart.mostFreed")?.to_string(),
            };
            let mut page = Page::new(text.get("file.chart.curve")?, filters, text, fonts)?;
            match plan.map(solve_view) {
                Some(view) if !view.rows.is_empty() => {
                    curve::draw(&mut page, &view, *steps, &words);
                }
                _ => page.note(none),
            }
            Ok(page.finish())
        }
    }
}

/// `template` with each `{name}` of `values` replaced by its value. The catalog writes the
/// places of the values with single braces, which the interface leaves as they are.
fn fill(template: &str, values: &[(&str, &str)]) -> String {
    values
        .iter()
        .fold(template.to_string(), |text, (name, value)| {
            text.replace(&format!("{{{name}}}"), value)
        })
}

/// A whole number with its thousands separated by commas, as the interface writes counts.
pub(crate) fn count(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (at, digit) in digits.chars().enumerate() {
        if at > 0 && (digits.len() - at).is_multiple_of(3) {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

/// The baseline of a line of text of `size` set in a line box from `top`, `height` tall, so
/// that its capitals sit in the middle of the box.
fn baseline(top: f32, height: f32, size: f32) -> f32 {
    top + height / 2.0 + size * 0.36
}

/// A chart being drawn: its drawing so far, where the next part goes, and the faces.
struct Page<'a> {
    svg: Svg,
    /// The width of the image: [`WIDTH`], or more where a heatmap needs it to print every value.
    width: f32,
    /// The top of the next part.
    y: f32,
    fonts: &'a Fonts,
}

impl<'a> Page<'a> {
    /// A page with its title and, under it, the filters, one per line (wrapped where long), or
    /// the catalog's "No filters".
    fn new(
        title: &str,
        filters: &[String],
        text: &ExportText,
        fonts: &'a Fonts,
    ) -> Result<Self, ExportError> {
        let mut page = Page {
            svg: Svg::default(),
            width: WIDTH,
            y: MARGIN,
            fonts,
        };
        let strong = Ink::new(Face::BodyStrong, TITLE, TEXT);
        for line in fonts.wrap(title, Face::BodyStrong, TITLE, INNER) {
            let y = baseline(page.y, TITLE_LINE, TITLE);
            page.svg.text(MARGIN, y, &line, strong, Anchor::Start);
            page.y += TITLE_LINE;
        }
        page.y += 4.0;
        let none = [text.get("file.about.noFilters")?.to_string()];
        let lines = if filters.is_empty() { &none } else { filters };
        let muted = Ink::new(Face::Body, SMALL, TEXT_MUTED);
        for filter in lines {
            for line in fonts.wrap(filter, Face::Body, SMALL, INNER) {
                page.svg.text(
                    MARGIN,
                    baseline(page.y, LINE, SMALL),
                    &line,
                    muted,
                    Anchor::Start,
                );
                page.y += LINE;
            }
        }
        page.y += SECTION_GAP;
        Ok(page)
    }

    /// The width of `text` in `ink`.
    fn width(&self, text: &str, ink: Ink) -> f32 {
        self.fonts.width(text, ink.face, ink.size)
    }

    /// `text` cut to fit `width` in `ink`.
    fn fit(&self, text: &str, ink: Ink, width: f32) -> String {
        self.fonts.fit(text, ink.face, ink.size, width)
    }

    /// One line of body text in the place of the chart: there is nothing to draw.
    fn note(&mut self, text: &str) {
        let ink = Ink::new(Face::Body, SMALL, TEXT_MUTED);
        let y = baseline(self.y, LINE, SMALL);
        self.svg.text(MARGIN, y, text, ink, Anchor::Start);
        self.y += LINE;
    }

    /// The SVG document: the drawing on the surface, as wide as the page and as tall as its
    /// content and the margin under it, in whole pixels.
    fn finish(self) -> String {
        let height = (self.y + MARGIN).ceil();
        self.svg.document(self.width.ceil(), height, SURFACE)
    }
}

/// The light-theme color of `token` as `#rrggbb`.
fn hex(token: &str) -> String {
    format!("#{:06x}", color(token))
}

#[cfg(test)]
mod tests;
