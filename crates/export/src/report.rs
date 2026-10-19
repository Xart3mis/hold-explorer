//! The status report of the kept holds: a PDF of A4 pages in portrait.
//!
//! Each page is composed as an SVG document, measured with the embedded faces of [`Fonts`] as
//! the charts are, and drawn into the PDF with `krilla-svg`: text stays text, in subsets of the
//! embedded faces. A page is drawn at 100 pixels to the inch, so that the interface's sizes in
//! pixels are its sizes here (13 px is 9.36 points), and the bars and the curve are the charts'
//! own drawings in the box of the page.
//!
//! The first page has the header, the tiles, the stale holds, and the bars by discipline. Then
//! come the bars by hold type and by role, the top blockers, the head of the solve order with its
//! curve, and the oldest open holds. A table that does not fit continues on the next page with
//! its header repeated. Every page ends with its number of the count and the app version. Every
//! word comes from the catalog through [`ExportText`]. Nothing of the moment or the machine enters
//! the file but the moment the head states: the same input gives the same bytes.

use chrono::{Datelike, NaiveDate, NaiveDateTime, Timelike};
use hx_core::dataset::{Dataset, Row};
use hx_core::filter::{Dim, FilterSpec, Status};
use hx_core::query::{ages_known, holds, stale_count, summary, HoldQuery, HoldSort};
use hx_core::solve::{solve_view, SolvePlan, SolveRow};
use krilla::geom::Size;
use krilla::metadata::{DateTime, Metadata};
use krilla::page::PageSettings;
use krilla::Document;
use krilla_svg::{SurfaceExt, SvgSettings};
use resvg::usvg::Tree;

use crate::chart::svg::{Anchor, Ink};
use crate::chart::{
    bars, baseline, count, curve, dim_bars, dim_face, fill, top_blocker_bars, Page, EDGE, LINE,
    SMALL, SURFACE, TEXT, TEXT_MUTED, TEXT_SECONDARY, TITLE, TITLE_LINE,
};
use crate::fonts::{Face, Fonts};
use crate::raster;
use crate::text::ExportText;
use crate::views::{dim_name, STALE_DAYS};
use crate::ExportError;

/// What the report's header states.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReportHead {
    /// The name of the workspace.
    pub workspace: String,
    /// The date of the snapshot in view.
    pub snapshot: NaiveDate,
    /// The active filters as the filter bar writes them, one per entry; empty when none is set.
    pub filters: Vec<String>,
    /// The version of the app that made the report.
    pub app_version: String,
    /// When the report was made, in the local time the header states. It is also the document's
    /// creation date.
    pub made_at: NaiveDateTime,
}

/// The width of an A4 page, in points.
pub const PAGE_WIDTH: f32 = 595.28;
/// The height of an A4 page, in points.
pub const PAGE_HEIGHT: f32 = 841.89;
/// The margin on every side of a page, in points.
pub const PAGE_MARGIN: f32 = 40.0;

/// Points to a pixel of a page: a page is drawn at 100 pixels to the inch.
const POINTS_PER_PIXEL: f32 = 0.72;
/// The page in pixels.
const WIDTH: f32 = PAGE_WIDTH / POINTS_PER_PIXEL;
const HEIGHT: f32 = PAGE_HEIGHT / POINTS_PER_PIXEL;
/// The margin in pixels.
const MARGIN: f32 = PAGE_MARGIN / POINTS_PER_PIXEL;
/// The width inside the margins.
const INNER: f32 = WIDTH - 2.0 * MARGIN;
/// The top of the footer's line.
const FOOTER_TOP: f32 = HEIGHT - MARGIN - LINE;
/// Where the content of a page ends: `--space-4` over the footer.
const BOTTOM: f32 = FOOTER_TOP - 16.0;

/// The title of the report (`--font-size-lg` on `--line-height-lg`).
const PAGE_TITLE: f32 = 22.0;
const PAGE_TITLE_LINE: f32 = 28.0;
/// A value of a tile (`--font-size-xl` on `--line-height-xl`).
const STAT: f32 = 28.0;
const STAT_LINE: f32 = 32.0;
/// The space between the sections (`--space-6`).
const SECTION_GAP: f32 = 24.0;
/// The space between a section's title and what follows it (`--density-stack-gap`, compact).
const STACK_GAP: f32 = 8.0;
/// The height of a table row of one line, and of the header row (`--density-row-height`,
/// compact).
const ROW: f32 = 28.0;
/// The space above and below the text of a table row or a fact.
const ROW_PAD: f32 = (ROW - LINE) / 2.0;
/// The space at each side of a cell (`--space-2`).
const CELL_PAD: f32 = 8.0;
/// The label column of the header's facts (`--size-bar-label-width`).
const FACT_LABEL: f32 = 180.0;
/// The space inside a tile (`--space-4`).
const TILE_PAD: f32 = 16.0;
/// The corner of the group of tiles (`--radius-md`).
const TILE_RADIUS: f32 = 6.0;
/// Hairlines between rows and between tiles.
const BORDER_SUBTLE: &str = "--color-border-subtle";

/// The most bars a dimension draws in the report; the others are folded into "All others", so
/// that the bars by discipline fit on the first page under the header and the tiles.
const REPORT_BARS: usize = 15;
/// The most steps of the solve order the report lists.
pub(crate) const SOLVE_ROWS: usize = 20;
/// How many of the oldest open holds the report lists.
const OLDEST_ROWS: usize = 20;
/// The most lines a remark is wrapped over; the last one ends with an ellipsis when it is cut.
const REMARK_LINES: usize = 4;

/// Every color the report draws in, which a test finds in `palette.json`. The bars and the curve
/// draw in the colors of the charts, which their own test checks.
#[cfg(test)]
const REPORT_COLORS: [&str; 5] = [SURFACE, EDGE, BORDER_SUBTLE, TEXT, TEXT_SECONDARY];

/// The status report of the kept holds as PDF bytes, A4 portrait.
///
/// `plan` is the solve plan of the open kept holds, `None` when `spec` keeps released holds
/// only; then the parts that need open holds (the tiles of age, the solve order, and the oldest
/// open holds) say why they are empty. The document's title is the catalog's, and its creation
/// date is `head.made_at`; nothing else of the moment or the machine enters it.
///
/// `Err(ExportError::Text)` when `text` lacks a label; `Err(ExportError::Report)` when a page
/// cannot be drawn, a fault of the application.
pub fn status_report(
    ds: &Dataset,
    plan: Option<&SolvePlan>,
    spec: &FilterSpec,
    head: &ReportHead,
    text: &ExportText,
    fonts: &Fonts,
) -> Result<Vec<u8>, ExportError> {
    let pages = report_pages(ds, plan, spec, head, text, fonts)?;
    pdf(&pages, text.get("file.report.title")?, head.made_at, fonts)
}

/// The pages of the report, each an SVG document of an A4 page at 100 pixels to the inch.
pub(crate) fn report_pages(
    ds: &Dataset,
    plan: Option<&SolvePlan>,
    spec: &FilterSpec,
    head: &ReportHead,
    text: &ExportText,
    fonts: &Fonts,
) -> Result<Vec<String>, ExportError> {
    let words = Words::of(text, spec.status, !head.filters.is_empty())?;
    let mut flow = Flow::new(fonts);
    header(&mut flow, head, text, &words);
    figures(&mut flow, ds, spec, &words);
    for dim in [Dim::Discipline, Dim::HoldType, Dim::Role] {
        let name = dim_name(&dim, text)?;
        let title = fill(&words.bars, &[("dim", &name)]);
        let bars = dim_bars(ds, spec, &dim, REPORT_BARS, &words.other);
        section(&mut flow, &title, |page| {
            if bars.is_empty() {
                page.note(&words.no_holds);
            } else {
                bars::draw(page, &bars, &name, &words.holds, dim_face(&dim));
            }
        });
    }
    let blockers = top_blocker_bars(ds, spec);
    let blocker = dim_name(&Dim::Blocker, text)?;
    section(&mut flow, &words.top_blockers, |page| {
        if blockers.is_empty() {
            page.note(&words.no_holds);
        } else {
            bars::draw(page, &blockers, &blocker, &words.holds, Face::Body);
        }
    });
    solve_order(&mut flow, plan, &words);
    oldest_holds(&mut flow, ds, spec, &words);
    let version = fill(&words.version, &[("version", &head.app_version)]);
    Ok(flow.finish(|number, pages| {
        let page = fill(
            &words.page,
            &[("page", &count(number)), ("pages", &count(pages))],
        );
        (version.clone(), page)
    }))
}

/// Every word of the report, read from the catalog before anything is drawn.
struct Words {
    title: String,
    workspace: String,
    snapshot: String,
    made_at: String,
    filters: String,
    no_filters: String,
    /// The labels of the tiles: holds, lines, lines with one hold, and the median.
    tiles: [String; 4],
    stale: String,
    stale_unknown: String,
    days: String,
    unknown: String,
    released_only: String,
    bars: String,
    other: String,
    holds: String,
    no_holds: String,
    top_blockers: String,
    solve_order: String,
    solve_columns: [String; 5],
    steps_shown: String,
    curve_title: String,
    curve: curve::Words,
    oldest: String,
    oldest_columns: [String; 5],
    holds_shown: String,
    page: String,
    version: String,
}

impl Words {
    /// The words of a report under `status`; `filtered` when a filter is set, which names the
    /// lines with one hold as the Overview does.
    fn of(text: &ExportText, status: Status, filtered: bool) -> Result<Self, ExportError> {
        let get = |key: &str| text.get(key).map(str::to_string);
        let figures = match status {
            Status::Open => "open",
            Status::Released => "released",
            Status::All => "all",
        };
        let single = if filtered {
            "file.summary.linesWithOneHold"
        } else {
            "file.summary.singleHoldLines"
        };
        let summary = |part: &str| get(&format!("file.summary.{figures}.{part}"));
        let step = |id: &str| get(&format!("file.column.blockers.{id}"));
        let hold = |id: &str| get(&format!("file.column.holds.{id}"));
        Ok(Words {
            title: get("file.report.title")?,
            workspace: get("file.about.workspace")?,
            snapshot: get("file.about.snapshot")?,
            made_at: get("file.about.madeAt")?,
            filters: get("file.about.filters")?,
            no_filters: get("file.about.noFilters")?,
            tiles: [
                summary("holds")?,
                summary("lines")?,
                get(single)?,
                summary("median")?,
            ],
            stale: get("file.report.stale")?,
            stale_unknown: get("file.report.staleUnknown")?,
            days: get("file.report.days")?,
            unknown: get("file.report.unknown")?,
            released_only: get("file.report.releasedOnly")?,
            bars: get("file.chart.bars")?,
            other: get("file.matrix.other")?,
            holds: get("file.chart.holds")?,
            no_holds: get("file.chart.noHolds")?,
            top_blockers: get("file.chart.topBlockers")?,
            solve_order: get("file.report.solveOrder")?,
            solve_columns: [
                step("step")?,
                step("blocker")?,
                step("holds")?,
                step("gain")?,
                step("cumulative")?,
            ],
            steps_shown: get("file.report.stepsShown")?,
            curve_title: get("file.chart.curve")?,
            curve: curve::Words {
                step: get("file.chart.step")?,
                freed: get("file.chart.freed")?,
                most: get("file.chart.mostFreed")?,
            },
            oldest: get("file.report.oldestHolds")?,
            oldest_columns: [
                hold("line")?,
                hold("discipline")?,
                hold("holdType")?,
                hold("remark")?,
                hold("age")?,
            ],
            holds_shown: get("file.report.holdsShown")?,
            page: get("file.report.page")?,
            version: get("file.report.version")?,
        })
    }
}

/// The pages being composed: those that are full, and the one being drawn.
pub(crate) struct Flow<'a> {
    done: Vec<Page<'a>>,
    page: Page<'a>,
    fonts: &'a Fonts,
}

impl<'a> Flow<'a> {
    /// The first page, empty.
    pub(crate) fn new(fonts: &'a Fonts) -> Self {
        Flow {
            done: Vec::new(),
            page: Self::blank(fonts, MARGIN),
            fonts,
        }
    }

    /// An empty page whose first part is drawn at `top`.
    fn blank(fonts: &'a Fonts, top: f32) -> Page<'a> {
        Page::boxed(fonts, WIDTH, MARGIN, INNER, top)
    }

    /// The room left on the page.
    fn room(&self) -> f32 {
        BOTTOM - self.page.y
    }

    /// Whether nothing is drawn on the page yet.
    fn fresh(&self) -> bool {
        self.page.y <= MARGIN
    }

    /// Ends the page and starts the next.
    fn break_page(&mut self) {
        let next = Self::blank(self.fonts, MARGIN);
        self.done.push(std::mem::replace(&mut self.page, next));
    }

    /// Starts the next page when `height` does not fit in the room left, unless the page is
    /// still empty: a part taller than a page starts at the top of one.
    fn keep(&mut self, height: f32) {
        if height > self.room() && !self.fresh() {
            self.break_page();
        }
    }

    /// The height of what `draw` draws.
    fn measure(&self, draw: impl FnOnce(&mut Page<'a>)) -> f32 {
        let mut scratch = Self::blank(self.fonts, 0.0);
        draw(&mut scratch);
        scratch.y
    }

    /// The SVG document of every page, each with its footer: the two texts `footer` gives for
    /// the page's number and the count of pages, at the leading and the trailing edge.
    pub(crate) fn finish(
        mut self,
        footer: impl Fn(usize, usize) -> (String, String),
    ) -> Vec<String> {
        self.done.push(self.page);
        let pages = self.done.len();
        let ink = Ink::new(Face::Body, SMALL, TEXT_MUTED);
        let y = baseline(FOOTER_TOP, LINE, SMALL);
        self.done
            .into_iter()
            .enumerate()
            .map(|(at, mut page)| {
                let (leading, trailing) = footer(at + 1, pages);
                page.svg.text(MARGIN, y, &leading, ink, Anchor::Start);
                page.svg
                    .text(MARGIN + INNER, y, &trailing, ink, Anchor::End);
                page.document(WIDTH, HEIGHT)
            })
            .collect()
    }
}

/// The height of a section's title over `INNER`, with the gap under it.
fn title_height(fonts: &Fonts, title: &str) -> f32 {
    fonts.wrap(title, Face::BodyStrong, TITLE, INNER).len() as f32 * TITLE_LINE + STACK_GAP
}

/// Draws a section's title (`--text-section-title`), wrapped where long.
fn draw_title(page: &mut Page, title: &str) {
    let ink = Ink::new(Face::BodyStrong, TITLE, TEXT);
    for line in page.fonts.wrap(title, Face::BodyStrong, TITLE, INNER) {
        let y = baseline(page.y, TITLE_LINE, TITLE);
        page.svg.text(MARGIN, y, &line, ink, Anchor::Start);
        page.y += TITLE_LINE;
    }
    page.y += STACK_GAP;
}

/// A section that is never split: its title and what `body` draws, on the next page when they
/// do not fit the room left.
fn section<'a>(flow: &mut Flow<'a>, title: &str, body: impl Fn(&mut Page<'a>)) {
    let height = title_height(flow.fonts, title) + flow.measure(&body);
    flow.keep(height);
    draw_title(&mut flow.page, title);
    body(&mut flow.page);
    flow.page.y += SECTION_GAP;
}

/// One line of `ink`'s text, wrapped over the width of the page.
fn sentence(page: &mut Page, text: &str, ink: Ink) {
    for line in page.fonts.wrap(text, ink.face, ink.size, INNER) {
        let y = baseline(page.y, LINE, SMALL);
        page.svg.text(MARGIN, y, &line, ink, Anchor::Start);
        page.y += LINE;
    }
}

/// The title, then the facts: the workspace, the snapshot date, when the report was made, and
/// the filters, one per line, or "No filters".
fn header(flow: &mut Flow, head: &ReportHead, text: &ExportText, words: &Words) {
    let page = &mut flow.page;
    let title = Ink::new(Face::BodyStrong, PAGE_TITLE, TEXT);
    for line in page
        .fonts
        .wrap(&words.title, Face::BodyStrong, PAGE_TITLE, INNER)
    {
        let y = baseline(page.y, PAGE_TITLE_LINE, PAGE_TITLE);
        page.svg.text(MARGIN, y, &line, title, Anchor::Start);
        page.y += PAGE_TITLE_LINE;
    }
    page.y += 12.0;

    let made_at = format!(
        "{} {:02}:{:02}",
        text.date(head.made_at.date()),
        head.made_at.hour(),
        head.made_at.minute()
    );
    let value = Ink::new(Face::Body, SMALL, TEXT);
    let muted = Ink::new(Face::Body, SMALL, TEXT_MUTED);
    // One row a value: the filters take a row each, the label beside the first.
    let mut facts: Vec<(&str, String, Ink)> = vec![
        (&words.workspace, head.workspace.clone(), value),
        (&words.snapshot, text.date(head.snapshot), value),
        (&words.made_at, made_at, value),
    ];
    if head.filters.is_empty() {
        facts.push((&words.filters, words.no_filters.clone(), muted));
    }
    for (at, filter) in head.filters.iter().enumerate() {
        let name = if at == 0 { words.filters.as_str() } else { "" };
        facts.push((name, filter.clone(), value));
    }
    let right = MARGIN + INNER;
    page.svg
        .line((MARGIN, page.y), (right, page.y), BORDER_SUBTLE);
    let label = Ink::new(Face::Body, SMALL, TEXT_SECONDARY);
    let value_x = MARGIN + FACT_LABEL + 12.0;
    for (name, value, ink) in facts {
        let lines = flow.fonts.wrap(&value, ink.face, ink.size, right - value_x);
        let height = (lines.len().max(1) as f32 * LINE + 2.0 * ROW_PAD).max(ROW);
        // So many filters that they fill the page go on over the next.
        flow.keep(height);
        let page = &mut flow.page;
        let top = page.y;
        let y = baseline(top + ROW_PAD, LINE, SMALL);
        let name = page.fit(name, label, FACT_LABEL);
        page.svg.text(MARGIN, y, &name, label, Anchor::Start);
        for (at, line) in lines.iter().enumerate() {
            let y = y + at as f32 * LINE;
            page.svg.text(value_x, y, line, ink, Anchor::Start);
        }
        page.y = top + height;
        page.svg
            .line((MARGIN, page.y), (right, page.y), BORDER_SUBTLE);
    }
    flow.page.y += SECTION_GAP;
}

/// What a tile shows: a figure, or words that say it is not known.
enum Figure {
    Value(String),
    Unknown(String),
}

/// The tiles of the Overview's figures without deltas, and the line of the stale holds; under
/// released holds only, the tiles of holds and lines, and the statement of why the figures of
/// age are not there.
fn figures(flow: &mut Flow, ds: &Dataset, spec: &FilterSpec, words: &Words) {
    let figures = summary(ds, spec);
    let mut tiles = vec![
        (&words.tiles[0], Figure::Value(count(figures.holds))),
        (&words.tiles[1], Figure::Value(count(figures.lines))),
        (
            &words.tiles[2],
            Figure::Value(count(figures.single_hold_lines)),
        ),
    ];
    let released = spec.status == Status::Released;
    if !released {
        let median = match figures.median_age_days {
            Some(days) => Figure::Value(fill(&words.days, &[("days", &days.to_string())])),
            None => Figure::Unknown(words.unknown.clone()),
        };
        tiles.push((&words.tiles[3], median));
    }
    let page = &mut flow.page;
    let width = INNER / tiles.len() as f32;
    let label = Ink::new(Face::Body, SMALL, TEXT_SECONDARY);
    let labels: Vec<Vec<String>> = tiles
        .iter()
        .map(|(name, _)| {
            page.fonts
                .wrap(name, label.face, label.size, width - 2.0 * TILE_PAD)
        })
        .collect();
    let label_lines = labels.iter().map(Vec::len).max().unwrap_or(1);
    let height = 2.0 * TILE_PAD + label_lines as f32 * LINE + 4.0 + STAT_LINE;
    let top = page.y;
    page.svg
        .frame((MARGIN, top), (INNER, height), TILE_RADIUS, SURFACE, EDGE);
    for (at, ((_, figure), lines)) in tiles.iter().zip(&labels).enumerate() {
        let x = MARGIN + at as f32 * width;
        if at > 0 {
            page.svg
                .line((x, top + 1.0), (x, top + height - 1.0), BORDER_SUBTLE);
        }
        let mut y = top + TILE_PAD;
        for line in lines {
            let base = baseline(y, LINE, SMALL);
            page.svg
                .text(x + TILE_PAD, base, line, label, Anchor::Start);
            y += LINE;
        }
        let value_top = top + TILE_PAD + label_lines as f32 * LINE + 4.0;
        match figure {
            Figure::Value(value) => {
                let ink = Ink::new(Face::BodyStrong, STAT, TEXT);
                let base = baseline(value_top, STAT_LINE, STAT);
                page.svg.text(x + TILE_PAD, base, value, ink, Anchor::Start);
            }
            Figure::Unknown(words) => {
                let ink = Ink::new(Face::Body, SMALL, TEXT_MUTED);
                let base = baseline(value_top, STAT_LINE, SMALL);
                let fitted = page.fit(words, ink, width - 2.0 * TILE_PAD);
                page.svg
                    .text(x + TILE_PAD, base, &fitted, ink, Anchor::Start);
            }
        }
    }
    page.y = top + height + 12.0;
    let secondary = Ink::new(Face::Body, SMALL, TEXT_SECONDARY);
    if released {
        sentence(
            page,
            &words.released_only,
            Ink::new(Face::Body, SMALL, TEXT_MUTED),
        );
    } else if ages_known(ds, spec) {
        let stale = fill(
            &words.stale,
            &[
                ("days", &STALE_DAYS.to_string()),
                ("count", &count(stale_count(ds, spec, STALE_DAYS))),
            ],
        );
        sentence(page, &stale, secondary);
    } else {
        sentence(page, &words.stale_unknown, secondary);
    }
    page.y += SECTION_GAP;
}

/// The steps of the solve order of `plan` the report lists: those after which 90 percent of the
/// lines on hold are freed, at most [`SOLVE_ROWS`]. None without a plan.
pub(crate) fn solve_rows(plan: Option<&SolvePlan>) -> Vec<SolveRow> {
    let Some(view) = plan.map(solve_view) else {
        return Vec::new();
    };
    let shown = view.steps_to_most.min(SOLVE_ROWS);
    view.rows.into_iter().take(shown).collect()
}

/// The head of the solve order as a table, how many steps it lists of how many, and the curve
/// of every step with the 90 percent step marked.
fn solve_order(flow: &mut Flow, plan: Option<&SolvePlan>, words: &Words) {
    let Some(plan) = plan else {
        section(flow, &words.solve_order, |page| {
            sentence(
                page,
                &words.released_only,
                Ink::new(Face::Body, SMALL, TEXT_MUTED),
            );
        });
        return;
    };
    let view = solve_view(plan);
    let rows = solve_rows(Some(plan));
    if rows.is_empty() {
        section(flow, &words.solve_order, |page| page.note(&words.no_holds));
        return;
    }
    let [step, blocker, holds, gain, cumulative] = &words.solve_columns;
    let columns = vec![
        Col::number(step),
        Col::share(blocker, 160.0),
        Col::number(holds),
        Col::number(gain),
        Col::number(cumulative),
    ];
    let cells: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            vec![
                count(row.step),
                row.label.clone(),
                count(row.holds),
                count(row.gain),
                count(row.cumulative),
            ]
        })
        .collect();
    let shown = fill(
        &words.steps_shown,
        &[
            ("shown", &count(rows.len())),
            ("count", &count(view.rows.len())),
        ],
    );
    titled_table(flow, &words.solve_order, &columns, &cells, &shown);
    section(flow, &words.curve_title, |page| {
        curve::draw(page, &view, 0, &words.curve);
    });
}

/// The oldest open holds the filter keeps, at most [`OLDEST_ROWS`], in the order
/// [`HoldSort::OldestFirst`] gives, and how many open holds it keeps. `None` when the filter
/// keeps released holds only.
pub(crate) fn oldest_page(ds: &Dataset, spec: &FilterSpec) -> Option<(Vec<Row>, usize)> {
    let open = spec.open_only()?;
    let query = HoldQuery {
        sort: HoldSort::OldestFirst,
        reverse: false,
        offset: 0,
        limit: Some(OLDEST_ROWS),
    };
    let page = holds(ds, &open, &query);
    Some((page.rows, page.total))
}

/// A text the export left blank (empty, or the dash an import writes for a blank) is no value.
fn given(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "—" {
        String::new()
    } else {
        value.to_string()
    }
}

/// The oldest open holds as a table: line, discipline, hold type, the remark wrapped, and age.
fn oldest_holds(flow: &mut Flow, ds: &Dataset, spec: &FilterSpec, words: &Words) {
    let Some((rows, total)) = oldest_page(ds, spec) else {
        section(flow, &words.oldest, |page| {
            sentence(
                page,
                &words.released_only,
                Ink::new(Face::Body, SMALL, TEXT_MUTED),
            );
        });
        return;
    };
    if rows.is_empty() {
        section(flow, &words.oldest, |page| page.note(&words.no_holds));
        return;
    }
    let [line, discipline, hold_type, remark, age] = &words.oldest_columns;
    let widest = rows
        .iter()
        .map(|row| flow.fonts.width(&row.hold.line_id, Face::Mono, SMALL))
        .fold(0.0, f32::max);
    let columns = vec![
        Col::text(line, (widest + 2.0 * CELL_PAD).ceil(), Face::Mono),
        Col::text(discipline, 100.0, Face::Body),
        Col::text(hold_type, 190.0, Face::Body),
        Col::share(remark, 160.0),
        Col::number(age),
    ];
    let cells: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            vec![
                row.hold.line_id.clone(),
                given(&row.hold.discipline),
                given(&row.hold.hold_type),
                row.hold.remark.clone(),
                row.days().map(count_days).unwrap_or_default(),
            ]
        })
        .collect();
    let shown = fill(
        &words.holds_shown,
        &[("shown", &count(rows.len())), ("count", &count(total))],
    );
    titled_table(flow, &words.oldest, &columns, &cells, &shown);
}

/// A number of days with its thousands separated; a negative one (a date after the snapshot)
/// keeps its sign.
fn count_days(days: i64) -> String {
    let digits = count(usize::try_from(days.unsigned_abs()).unwrap_or(usize::MAX));
    if days < 0 {
        format!("-{digits}")
    } else {
        digits
    }
}

/// How a column of a table is laid out.
pub(crate) struct Col {
    header: String,
    /// The width the column is given, or the least it takes when it shares the rest.
    width: f32,
    /// Whether it takes the width the other columns leave, and wraps its text over lines.
    share: bool,
    /// Whether its values are numbers, set at its trailing edge.
    number: bool,
    face: Face,
}

impl Col {
    /// A column `width` wide of text in `face`, cut with an ellipsis where it would not fit.
    pub(crate) fn text(header: &str, width: f32, face: Face) -> Col {
        Col {
            header: header.to_string(),
            width,
            share: false,
            number: false,
            face,
        }
    }

    /// The column that takes the width the others leave, at least `least`, its text wrapped.
    pub(crate) fn share(header: &str, least: f32) -> Col {
        Col {
            header: header.to_string(),
            width: least,
            share: true,
            number: false,
            face: Face::Body,
        }
    }

    /// A column of numbers at its trailing edge, as wide as its header or its widest value.
    pub(crate) fn number(header: &str) -> Col {
        Col {
            header: header.to_string(),
            width: 0.0,
            share: false,
            number: true,
            face: Face::Body,
        }
    }
}

/// A table under a section title, kept with its header and first row, and a count line under
/// it.
fn titled_table(flow: &mut Flow, title: &str, columns: &[Col], rows: &[Vec<String>], shown: &str) {
    let widths = widths(flow.fonts, columns, rows);
    let first = rows
        .first()
        .map_or(0.0, |row| row_lines(flow.fonts, columns, &widths, row).1);
    flow.keep(title_height(flow.fonts, title) + ROW + first);
    draw_title(&mut flow.page, title);
    table(flow, columns, rows);
    flow.keep(LINE);
    let page = &mut flow.page;
    page.y += 4.0;
    sentence(page, shown, Ink::new(Face::Body, SMALL, TEXT_MUTED));
    page.y += SECTION_GAP;
}

/// The most a number column widens for its header; a longer header is cut with an ellipsis.
const NUMBER_HEADER_MAX: f32 = 140.0;
/// The least width of the column that shares the rest.
const SHARE_LEAST: f32 = 120.0;

/// The width of each column: a number column as wide as its widest value or its header (up to
/// [`NUMBER_HEADER_MAX`]), a text column as given, and the share column the rest. When they need
/// more than the page has, the text columns give way, so that the share column keeps
/// [`SHARE_LEAST`] and the table never runs past the margin.
fn widths(fonts: &Fonts, columns: &[Col], rows: &[Vec<String>]) -> Vec<f32> {
    // Whole pixels, so that the room a text was measured for is never a rounding short of it.
    let header = |col: &Col| (fonts.width(&col.header, Face::Body, SMALL) + 2.0 * CELL_PAD).ceil();
    let mut widths: Vec<f32> = columns
        .iter()
        .enumerate()
        .map(|(at, col)| {
            if col.number {
                rows.iter()
                    .filter_map(|row| row.get(at))
                    .map(|value| (fonts.width(value, col.face, SMALL) + 2.0 * CELL_PAD).ceil())
                    .fold(header(col).min(NUMBER_HEADER_MAX), f32::max)
            } else {
                col.width
            }
        })
        .collect();
    let sum = |widths: &[f32], pick: &dyn Fn(&Col) -> bool| -> f32 {
        columns
            .iter()
            .zip(widths)
            .filter(|(col, _)| pick(col))
            .map(|(_, width)| width)
            .sum()
    };
    let numbers = sum(&widths, &|col| col.number);
    let texts = sum(&widths, &|col| !col.number && !col.share);
    let least = if columns.iter().any(|col| col.share) {
        columns
            .iter()
            .zip(&widths)
            .filter(|(col, _)| col.share)
            .map(|(_, width)| width.max(SHARE_LEAST))
            .sum()
    } else {
        0.0
    };
    let room = INNER - numbers - least;
    if texts > room && texts > 0.0 {
        let scale = (room / texts).max(0.0);
        for (col, width) in columns.iter().zip(widths.iter_mut()) {
            if !col.number && !col.share {
                *width *= scale;
            }
        }
    }
    let fixed = sum(&widths, &|col| !col.share);
    for (col, width) in columns.iter().zip(widths.iter_mut()) {
        if col.share {
            *width = (INNER - fixed).max(SHARE_LEAST);
        }
    }
    widths
}

/// The lines of each cell of a row, and the height of the row.
fn row_lines(
    fonts: &Fonts,
    columns: &[Col],
    widths: &[f32],
    row: &[String],
) -> (Vec<Vec<String>>, f32) {
    let cells: Vec<Vec<String>> = columns
        .iter()
        .zip(widths)
        .zip(row)
        .map(|((col, width), value)| {
            let room = width - 2.0 * CELL_PAD;
            if value.is_empty() {
                Vec::new()
            } else if col.share {
                let mut lines = fonts.wrap(value, col.face, SMALL, room);
                if lines.len() > REMARK_LINES {
                    let rest = lines[REMARK_LINES - 1..].join(" ");
                    lines.truncate(REMARK_LINES - 1);
                    lines.push(fonts.fit(&format!("{rest} …"), col.face, SMALL, room));
                }
                lines
            } else {
                vec![fonts.fit(value, col.face, SMALL, room)]
            }
        })
        .collect();
    let most = cells.iter().map(Vec::len).max().unwrap_or(1).max(1);
    let height = (most as f32 * LINE + 2.0 * ROW_PAD).max(ROW);
    (cells, height)
}

/// Draws the header row of a table at the top of the page's room.
fn table_header(page: &mut Page, columns: &[Col], widths: &[f32]) {
    let ink = Ink::new(Face::Body, SMALL, TEXT_SECONDARY);
    let top = page.y;
    let mut x = MARGIN;
    for (col, width) in columns.iter().zip(widths) {
        let label = page.fit(&col.header, ink, width - 2.0 * CELL_PAD);
        let y = baseline(top, ROW, SMALL);
        if col.number {
            page.svg
                .text(x + width - CELL_PAD, y, &label, ink, Anchor::End);
        } else {
            page.svg.text(x + CELL_PAD, y, &label, ink, Anchor::Start);
        }
        x += width;
    }
    page.y = top + ROW;
    page.svg
        .line((MARGIN, page.y - 0.5), (MARGIN + INNER, page.y - 0.5), EDGE);
}

/// A table of `rows` under a header row of `columns`. A row that does not fit the room left
/// goes to the next page, under the header drawn again.
pub(crate) fn table(flow: &mut Flow, columns: &[Col], rows: &[Vec<String>]) {
    let widths = widths(flow.fonts, columns, rows);
    let first = rows
        .first()
        .map_or(0.0, |row| row_lines(flow.fonts, columns, &widths, row).1);
    flow.keep(ROW + first);
    table_header(&mut flow.page, columns, &widths);
    for row in rows {
        let (cells, height) = row_lines(flow.fonts, columns, &widths, row);
        if height > flow.room() {
            flow.break_page();
            table_header(&mut flow.page, columns, &widths);
        }
        let page = &mut flow.page;
        let top = page.y;
        let mut x = MARGIN;
        for ((col, width), lines) in columns.iter().zip(&widths).zip(&cells) {
            let ink = Ink::new(col.face, SMALL, TEXT);
            for (at, line) in lines.iter().enumerate() {
                let y = baseline(top + ROW_PAD + at as f32 * LINE, LINE, SMALL);
                if col.number {
                    page.svg
                        .text(x + width - CELL_PAD, y, line, ink, Anchor::End);
                } else {
                    page.svg.text(x + CELL_PAD, y, line, ink, Anchor::Start);
                }
            }
            x += width;
        }
        page.y = top + height;
        page.svg.line(
            (MARGIN, page.y - 0.5),
            (MARGIN + INNER, page.y - 0.5),
            BORDER_SUBTLE,
        );
    }
}

/// The pages drawn into a PDF of A4 pages, with the title and the creation date as its only
/// metadata.
fn pdf(
    pages: &[String],
    title: &str,
    made_at: NaiveDateTime,
    fonts: &Fonts,
) -> Result<Vec<u8>, ExportError> {
    let fault = |reason: String| ExportError::Report { reason };
    let size = Size::from_wh(PAGE_WIDTH, PAGE_HEIGHT)
        .ok_or_else(|| fault("the size of an A4 page was refused".into()))?;
    let options = raster::options(fonts);
    let mut document = Document::new();
    for (at, svg) in pages.iter().enumerate() {
        let tree = Tree::from_str(svg, &options).map_err(|error| fault(error.to_string()))?;
        let mut page = document.start_page_with(PageSettings::new(size));
        let mut surface = page.surface();
        let drawn = surface.draw_svg(&tree, size, SvgSettings::default());
        surface.finish();
        page.finish();
        drawn.ok_or_else(|| fault(format!("page {} could not be drawn", at + 1)))?;
    }
    document.set_metadata(
        Metadata::new()
            .title(title.to_string())
            .creation_date(date_time(made_at)),
    );
    document
        .finish()
        .map_err(|error| fault(format!("{error:?}")))
}

/// A moment as the PDF's date, without an offset from UTC: the local time the header states.
fn date_time(at: NaiveDateTime) -> DateTime {
    // Every part is in range by construction: the year is clamped, the others come from a date.
    let part = |value: u32| u8::try_from(value).unwrap_or(0);
    let year = u16::try_from(at.year().clamp(0, 9999)).unwrap_or(0);
    DateTime::new(year)
        .month(part(at.month()))
        .day(part(at.day()))
        .hour(part(at.hour()))
        .minute(part(at.minute()))
        .second(part(at.second()))
}

#[cfg(test)]
#[path = "report_tests.rs"]
mod tests;
