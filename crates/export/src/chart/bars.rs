//! Bar rows: a label, a neutral bar, and the value, one row per category (DESIGN.md, "Bar row").

use super::svg::{Anchor, Ink};
use super::{
    baseline, count, Page, INNER, LINE, MARGIN, NEUTRAL, SMALL, TEXT, TEXT_MUTED, TEXT_SECONDARY,
};
use crate::fonts::Face;

/// The height of a bar row (`--density-bar-row-height`).
const ROW: f32 = 32.0;
/// The thickness of a bar (`--size-bar-height`).
const BAR: f32 = 8.0;
/// The corner of a bar (`--radius-xs`).
const RADIUS: f32 = 2.0;
/// The least width of the label column (`--size-bar-label-width`).
const LABEL_MIN: f32 = 180.0;
/// The least width of the bars' column (`--size-bar-min-width`).
const BARS_MIN: f32 = 96.0;
/// The space between the label, the bars, and the value (`--space-3`).
const GAP: f32 = 12.0;
/// The space that sets the folded row apart from the rows before it (`--space-1`).
const FOLD_GAP: f32 = 4.0;

/// One row: what it names and how many holds it has.
pub(super) struct Bar {
    label: String,
    holds: usize,
    /// Whether the row is "All others", the values folded into one.
    folded: bool,
}

impl Bar {
    pub(super) fn new(label: &str, holds: usize) -> Self {
        Bar {
            label: label.to_string(),
            holds,
            folded: false,
        }
    }

    pub(super) fn folded(label: &str, holds: usize) -> Self {
        Bar {
            label: label.to_string(),
            holds,
            folded: true,
        }
    }
}

/// Draws `bars` in their order under a header that names the labels (`label_name`) and the
/// values (`value_name`). The label column is as wide as the longest label, at least
/// [`LABEL_MIN`], and leaves the bars [`BARS_MIN`]; a longer label is cut with an ellipsis. Each
/// bar is the share of its holds in the largest row's.
pub(super) fn draw(page: &mut Page, bars: &[Bar], label_name: &str, value_name: &str, face: Face) {
    let caption = Ink::new(Face::Body, SMALL, TEXT_MUTED);
    let value_ink = Ink::new(Face::Body, SMALL, TEXT);
    let values: Vec<String> = bars.iter().map(|bar| count(bar.holds)).collect();
    let value_width = values
        .iter()
        .map(|value| page.width(value, value_ink))
        .fold(page.width(value_name, caption), f32::max);
    let label_ink = Ink::new(face, SMALL, TEXT);
    let longest = bars
        .iter()
        .map(|bar| page.width(&bar.label, label_ink))
        .fold(0.0, f32::max);
    let label_max = (INNER - value_width - BARS_MIN - 2.0 * GAP).max(LABEL_MIN);
    let label_width = longest.clamp(LABEL_MIN, label_max);
    let bars_x = MARGIN + label_width + GAP;
    let bars_width = INNER - label_width - value_width - 2.0 * GAP;
    let right = MARGIN + INNER;

    let y = baseline(page.y, LINE, SMALL);
    let name = page.fit(label_name, caption, label_width);
    page.svg.text(MARGIN, y, &name, caption, Anchor::Start);
    page.svg.text(right, y, value_name, caption, Anchor::End);
    page.y += LINE + 4.0;

    let largest = bars.iter().map(|bar| bar.holds).max().unwrap_or(0).max(1);
    for (bar, value) in bars.iter().zip(&values) {
        if bar.folded {
            page.y += FOLD_GAP;
        }
        let top = page.y;
        let ink = if bar.folded {
            Ink::new(face, SMALL, TEXT_SECONDARY)
        } else {
            label_ink
        };
        let label = page.fit(&bar.label, ink, label_width);
        let y = baseline(top, ROW, SMALL);
        page.svg.text(MARGIN, y, &label, ink, Anchor::Start);
        // Counts are far inside the range an `f32` holds closely enough for a length.
        let share = bar.holds as f32 / largest as f32;
        let length = if bar.holds > 0 {
            (share * bars_width).max(1.0)
        } else {
            0.0
        };
        if length > 0.0 {
            let bar_top = top + (ROW - BAR) / 2.0;
            page.svg.rect(bars_x, bar_top, length, BAR, NEUTRAL, RADIUS);
        }
        page.svg.text(right, y, value, value_ink, Anchor::End);
        page.y += ROW;
    }
}
