//! The cumulative curve of lines freed by the solve order: one neutral line on one value axis,
//! the step after which 90 percent of the lines are freed marked on it (DESIGN.md, "Line
//! chart").

use hx_core::solve::SolveView;

use super::svg::{Anchor, Ink};
use super::{
    baseline, count, fill, Page, AXIS, GRID, INNER, LINE, MARGIN, NEUTRAL, NEUTRAL_SELECTED, SMALL,
    SURFACE, TEXT_MUTED, TEXT_SECONDARY,
};
use crate::fonts::Face;

/// The height of the plot, the band of the x axis included (`--size-line-chart-height`).
const HEIGHT: f32 = 240.0;
/// The height of the band of the x axis: the space under the baseline and the tick labels.
const X_BAND: f32 = 28.0;
/// The width of the value axis at the leading side (`--size-chart-axis-width`).
const AXIS_WIDTH: f32 = 56.0;
/// The room at the trailing end of the plot for half of the last tick label.
const TRAILING: f32 = 16.0;
/// The stroke of the line (`--size-chart-line`).
const STROKE: f32 = 2.0;
/// The diameter of a marker (`--size-chart-marker`).
const MARKER: f32 = 8.0;
/// The ring around a marker (`--space-0-5`).
const RING: f32 = 2.0;
/// The most ticks past the first on the value axis and on the x axis, as on the screen.
const Y_TICKS: usize = 5;
const X_TICKS: usize = 8;

/// The words of the curve: the names of its axes, and the sentence of the marked step, with the
/// places of its values (`{step}`, `{freed}`, `{total}`).
pub(super) struct Words {
    pub(super) step: String,
    pub(super) freed: String,
    pub(super) most: String,
}

/// The smallest clean step (1, 2, or 5 times a power of ten, and at least 1, for counts) that
/// cuts `span` into at most `most` parts. As `cleanStep` in `ui/src/components/charts/scale.ts`.
fn clean_step(span: f64, most: usize) -> f64 {
    // Tick counts are tiny numbers an `f64` holds exactly.
    let most = most.max(1) as f64;
    let rough = span / most;
    let power = 10f64.powf(rough.log10().floor());
    [1.0, 2.0, 5.0, 10.0]
        .into_iter()
        .map(|factor| factor * power)
        .find(|candidate| (span / candidate + 1e-9).floor() <= most)
        .unwrap_or(10.0 * power)
        .max(1.0)
}

/// The values from `from` to `to` at which an axis has a tick: whole multiples of one clean
/// step, at most `most` past the first. A range of no length has its one value.
fn ticks(from: usize, to: usize, most: usize) -> Vec<usize> {
    if to <= from {
        return vec![from];
    }
    // Counts of steps and lines are far inside the range an `f64` holds exactly.
    let size = clean_step((to - from) as f64, most) as usize;
    let first = from.div_ceil(size) * size;
    (first..=to).step_by(size).collect()
}

/// Draws the first `steps` steps of `view` (at least one, at most all): the name of the value
/// over the axis, the plot with its ticks and gridlines, the line, the last value at the end of
/// the line, the name of the step under the axis, and, when the step after which 90 percent of
/// the lines are freed is drawn, its marker and a line that says it.
pub(super) fn draw(page: &mut Page, view: &SolveView, steps: usize, words: &Words) {
    let caption = Ink::new(Face::Body, SMALL, TEXT_MUTED);
    let shown = &view.rows[..steps.clamp(1, view.rows.len())];
    let (first, last) = (shown[0].step, shown[shown.len() - 1].step);
    let top_value = view.lines_on_hold.max(1);

    page.svg.text(
        MARGIN,
        baseline(page.y, LINE, SMALL),
        &words.freed,
        caption,
        Anchor::Start,
    );
    page.y += LINE + 12.0;

    let left = MARGIN + AXIS_WIDTH;
    let right = MARGIN + INNER - TRAILING;
    let top = page.y;
    let bottom = top + HEIGHT - X_BAND;
    // Counts are far inside the range an `f32` holds closely enough for a place.
    let x_at = |step: usize| {
        if last > first {
            left + (step - first) as f32 / (last - first) as f32 * (right - left)
        } else {
            (left + right) / 2.0
        }
    };
    let y_at =
        |value: usize| bottom - value.min(top_value) as f32 / top_value as f32 * (bottom - top);

    for tick in ticks(0, top_value, Y_TICKS) {
        let y = y_at(tick);
        if tick > 0 {
            page.svg.line((left, y), (right, y), GRID);
        }
        let label = count(tick);
        page.svg
            .text(left - 8.0, y + SMALL * 0.36, &label, caption, Anchor::End);
    }
    page.svg.line((left, bottom), (right, bottom), AXIS);
    for tick in ticks(first, last, X_TICKS) {
        let y = baseline(bottom + 8.0, LINE, SMALL);
        page.svg
            .text(x_at(tick), y, &count(tick), caption, Anchor::Middle);
    }

    let most = view.steps_to_most;
    let marked = (first..=last).contains(&most).then(|| &shown[most - first]);
    if let Some(row) = marked {
        page.svg
            .line((x_at(row.step), bottom), (x_at(row.step), top), AXIS);
    }
    let points: Vec<(f32, f32)> = shown
        .iter()
        .map(|row| (x_at(row.step), y_at(row.cumulative)))
        .collect();
    page.svg.polyline(&points, NEUTRAL, STROKE);
    if shown.len() == 1 {
        page.svg
            .marker(points[0], MARKER / 2.0, NEUTRAL, (SURFACE, RING));
    }
    if let Some(row) = marked {
        let at = (x_at(row.step), y_at(row.cumulative));
        page.svg
            .marker(at, MARKER / 2.0, NEUTRAL_SELECTED, (SURFACE, RING));
    }
    let end = points[points.len() - 1];
    let value_ink = Ink::new(Face::Body, SMALL, TEXT_SECONDARY);
    let end_value = count(shown[shown.len() - 1].cumulative);
    page.svg
        .text(end.0, end.1 - 8.0, &end_value, value_ink, Anchor::End);
    page.y = bottom + X_BAND;

    page.svg.text(
        right,
        baseline(page.y, LINE, SMALL),
        &words.step,
        caption,
        Anchor::End,
    );
    page.y += LINE;

    if let Some(row) = marked {
        page.y += 8.0;
        let line_top = page.y;
        page.svg.marker(
            (MARGIN + MARKER / 2.0 + RING, line_top + LINE / 2.0),
            MARKER / 2.0,
            NEUTRAL_SELECTED,
            (SURFACE, RING),
        );
        let sentence = fill(
            &words.most,
            &[
                ("step", &count(row.step)),
                ("freed", &count(row.cumulative)),
                ("total", &count(view.lines_on_hold)),
            ],
        );
        let x = MARGIN + MARKER + 2.0 * RING + 8.0;
        for line in page
            .fonts
            .wrap(&sentence, Face::Body, SMALL, MARGIN + INNER - x)
        {
            page.svg.text(
                x,
                baseline(page.y, LINE, SMALL),
                &line,
                caption,
                Anchor::Start,
            );
            page.y += LINE;
        }
    }
}
