//! The heatmap of two dimensions: a cell per pair, filled with the step of the blue ramp that
//! its count takes, and the count printed in it (DESIGN.md, "Heatmap" and "Legend").

use hx_core::query::FoldedMatrix;

use super::svg::{Anchor, Ink};
use super::{
    baseline, count, fill, Page, EDGE, INNER, LINE, MARGIN, RAMP, SMALL, SURFACE, TEXT,
    TEXT_INVERSE, TEXT_MUTED, TEXT_SECONDARY,
};
use crate::fonts::Face;
use crate::xlsx::color;

/// The widest a cell is (`--size-heatmap-cell-width`).
const CELL_MAX: f32 = 56.0;
/// The height of a cell (`--density-row-height`).
const CELL_HEIGHT: f32 = 36.0;
/// The space between cells (`--space-0-5`).
const CELL_GAP: f32 = 2.0;
/// The space that sets "All others" apart from the rows and columns before it, added to the
/// gap between cells (`--space-1` in all).
const FOLD_GAP: f32 = 2.0;
/// The corner of a cell and of a step of the legend (`--radius-xs`).
const RADIUS: f32 = 2.0;
/// The smallest size a value of a cell is printed in, where 13 px does not fit its cell.
const VALUE_MIN: f32 = 9.0;
/// The space between a value and the edge of its cell (`--space-1`).
const PAD: f32 = 4.0;
/// The width of the row labels (`--size-bar-label-width`).
const LABELS: f32 = 180.0;
/// The space between the row labels and the first cell (`--space-2`).
const LABEL_GAP: f32 = 8.0;
/// The height of the row of column labels, which stand upright (`--size-heatmap-header-height`).
const HEADER: f32 = 128.0;
/// The side of the swatch of an empty cell, and the height of a step of the legend
/// (`--size-legend-swatch`).
const SWATCH: f32 = 12.0;
/// The width of a step of the legend (`--size-legend-step`).
const STEP: f32 = 24.0;

/// The words of a heatmap: the names of its dimensions, of the folded values, and of the ends
/// of its legend (`more` with the place of the largest count, `{max}`).
pub(super) struct Words {
    pub(super) rows: String,
    pub(super) cols: String,
    pub(super) other: String,
    pub(super) fewer: String,
    pub(super) more: String,
}

/// The step of the ramp of seven that `value` takes in a domain from 0 to `max`, as the screen
/// gives it (`step` in `ui/src/components/charts/scale.ts`): the domain is cut into seven equal
/// parts, each with its upper bound. A value of 0 takes no step; a value above `max`, or any
/// value of a domain of 0, takes the last.
pub(super) fn ramp_step(value: usize, max: usize) -> usize {
    let steps = RAMP.len();
    if value == 0 {
        return 0;
    }
    if max == 0 {
        return steps;
    }
    // Multiplied before it is divided, so whole numbers on a boundary stay whole.
    (value * steps).div_ceil(max).clamp(1, steps)
}

/// The relative luminance of `0xRRGGBB`, as WCAG 2.1 defines it.
fn luminance(rgb: u32) -> f64 {
    let channel = |shift: u32| {
        let c = f64::from((rgb >> shift) & 0xFF) / 255.0;
        if c <= 0.039_28 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

/// The contrast of two colors, `0xRRGGBB`, as WCAG 2.1 defines it: from 1 to 21.
pub(super) fn contrast(a: u32, b: u32) -> f64 {
    let (a, b) = (luminance(a), luminance(b));
    (a.max(b) + 0.05) / (a.min(b) + 0.05)
}

/// The color of a value printed on a cell filled with `fill`: the primary ink where it reads at
/// 4.5:1 or more, and the inverse ink otherwise.
pub(super) fn cell_ink(fill: u32) -> u32 {
    let primary = color(TEXT);
    if contrast(primary, fill) >= 4.5 {
        primary
    } else {
        color(TEXT_INVERSE)
    }
}

/// The token of the ink of a cell filled with the step `token`.
fn cell_ink_token(token: &str) -> &'static str {
    if cell_ink(color(token)) == color(TEXT) {
        TEXT
    } else {
        TEXT_INVERSE
    }
}

/// Draws the legend, the column labels under the name of the columns, and a row per row value:
/// its label and its cells. Every cell with a value prints it: in 13 px where the widest value
/// fits a cell, else in the size that fits it down to [`VALUE_MIN`]; where even that does not
/// fit the 960 pixels, the cells are made as wide as the widest value and the image wider.
pub(super) fn draw(page: &mut Page, matrix: &FoldedMatrix, words: &Words) {
    let caption = Ink::new(Face::Body, SMALL, TEXT_MUTED);
    let max = matrix.max_cell;
    legend(page, max, words);

    let n_cols = matrix.cols.len() + usize::from(matrix.other_col.is_some());
    let grid_x = MARGIN + LABELS + LABEL_GAP;
    let fold_room = if matrix.other_col.is_some() {
        FOLD_GAP
    } else {
        0.0
    };
    // Counts of columns are far inside the range an `f32` holds exactly.
    let gaps = fold_room + CELL_GAP * (n_cols as f32 - 1.0);
    let fit = (INNER - LABELS - LABEL_GAP - gaps) / n_cols as f32;
    let mut cell_w = fit.min(CELL_MAX);
    let widest = matrix
        .cells
        .iter()
        .flatten()
        .filter(|value| **value > 0)
        .map(|value| page.width(&count(*value), Ink::new(Face::Body, SMALL, TEXT)))
        .fold(0.0, f32::max);
    // A width in the face grows with the size in proportion.
    let value_size = if widest + 2.0 * PAD <= cell_w {
        SMALL
    } else {
        let size = ((cell_w - 2.0 * PAD) / widest * SMALL * 2.0).floor() / 2.0;
        if size >= VALUE_MIN {
            size
        } else {
            cell_w = (widest * VALUE_MIN / SMALL + 2.0 * PAD).ceil();
            VALUE_MIN
        }
    };
    page.width = page
        .width
        .max(grid_x + n_cols as f32 * cell_w + gaps + MARGIN);
    let col_x = |at: usize| {
        let fold = if at == matrix.cols.len() {
            fold_room
        } else {
            0.0
        };
        grid_x + at as f32 * (cell_w + CELL_GAP) + fold
    };

    // The name of the columns, over their labels.
    let y = baseline(page.y, LINE, SMALL);
    let cols_name = page.fit(&words.cols, caption, INNER - LABELS - LABEL_GAP);
    page.svg.text(grid_x, y, &cols_name, caption, Anchor::Start);
    page.y += LINE + 4.0;

    // The column labels stand upright, read from bottom to top, set at the bottom of the
    // header; the corner holds the name of the rows at its bottom.
    let header_ink = Ink::new(Face::Body, SMALL, TEXT_SECONDARY);
    let bottom = page.y + HEADER - PAD;
    let labels = matrix
        .cols
        .iter()
        .map(|group| group.label.as_str())
        .chain(matrix.other_col.as_ref().map(|_| words.other.as_str()));
    for (at, label) in labels.enumerate() {
        let x = col_x(at) + cell_w / 2.0 + SMALL * 0.36;
        let label = page.fit(label, header_ink, HEADER - 2.0 * PAD);
        page.svg
            .upright_text(x, bottom, &label, header_ink, Anchor::Start);
    }
    let rows_name = page.fit(&words.rows, header_ink, LABELS);
    page.svg
        .text(MARGIN, bottom, &rows_name, header_ink, Anchor::Start);
    page.y += HEADER + CELL_GAP;

    let row_labels = matrix
        .rows
        .iter()
        .map(|group| (group.label.as_str(), false))
        .chain(
            matrix
                .other_row
                .as_ref()
                .map(|_| (words.other.as_str(), true)),
        );
    for ((label, folded), cells) in row_labels.zip(&matrix.cells) {
        if folded {
            page.y += FOLD_GAP;
        }
        let top = page.y;
        let ink = Ink::new(
            Face::Body,
            SMALL,
            if folded { TEXT_SECONDARY } else { TEXT },
        );
        let label = page.fit(label, ink, LABELS);
        let y = baseline(top, CELL_HEIGHT, SMALL);
        page.svg.text(MARGIN, y, &label, ink, Anchor::Start);
        for (at, value) in cells.iter().enumerate() {
            let x = col_x(at);
            let step = ramp_step(*value, max);
            let Some(fill) = step.checked_sub(1).map(|index| RAMP[index]) else {
                page.svg.hollow(x, top, cell_w, CELL_HEIGHT, SURFACE, EDGE);
                continue;
            };
            page.svg.rect(x, top, cell_w, CELL_HEIGHT, fill, RADIUS);
            let value_ink = Ink::new(Face::Body, value_size, cell_ink_token(fill));
            let value_y = baseline(top, CELL_HEIGHT, value_size);
            page.svg.text(
                x + cell_w - PAD,
                value_y,
                &count(*value),
                value_ink,
                Anchor::End,
            );
        }
        page.y += CELL_HEIGHT + CELL_GAP;
    }
    page.y -= CELL_GAP;
}

/// The key of the heatmap, one line: the swatch of an empty cell and 0, then "Fewer", the seven
/// steps of the ramp, and "More, up to" the largest count.
fn legend(page: &mut Page, max: usize, words: &Words) {
    let caption = Ink::new(Face::Body, SMALL, TEXT_MUTED);
    let top = page.y;
    let y = baseline(top, LINE, SMALL);
    let swatch_top = top + (LINE - SWATCH) / 2.0;
    let mut x = MARGIN;
    page.svg
        .hollow(x, swatch_top, SWATCH, SWATCH, SURFACE, EDGE);
    x += SWATCH + 4.0;
    let zero = count(0);
    page.svg.text(x, y, &zero, caption, Anchor::Start);
    x += page.width(&zero, caption) + 16.0;
    page.svg.text(x, y, &words.fewer, caption, Anchor::Start);
    x += page.width(&words.fewer, caption) + 4.0;
    for token in RAMP {
        page.svg.rect(x, swatch_top, STEP, SWATCH, token, RADIUS);
        x += STEP + CELL_GAP;
    }
    x += 4.0 - CELL_GAP;
    let more = fill(&words.more, &[("max", &count(max))]);
    page.svg.text(x, y, &more, caption, Anchor::Start);
    page.y += LINE + 8.0;
}
