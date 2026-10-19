//! The few SVG elements a chart is made of, written in order into one document.

use std::fmt::Write as _;

use super::hex;
use crate::fonts::Face;

/// How a text is set: its face, its size in pixels, and the token of its color.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Ink {
    pub(crate) face: Face,
    pub(crate) size: f32,
    pub(crate) color: &'static str,
}

impl Ink {
    pub(crate) fn new(face: Face, size: f32, color: &'static str) -> Self {
        Ink { face, size, color }
    }
}

/// Which end of a text its point is.
#[derive(Debug, Clone, Copy)]
pub(crate) enum Anchor {
    Start,
    Middle,
    End,
}

impl Anchor {
    fn name(self) -> &'static str {
        match self {
            Anchor::Start => "start",
            Anchor::Middle => "middle",
            Anchor::End => "end",
        }
    }
}

/// A number of pixels as a drawing writes it: at most two decimals, no trailing zero, never
/// `-0`. Written the same on every machine.
pub(crate) fn px(value: f32) -> String {
    let rounded = (value * 100.0).round() / 100.0 + 0.0;
    format!("{rounded}")
}

/// `text` with the five characters XML gives a meaning to written as entities.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

/// The elements of a drawing, in the order they are drawn.
#[derive(Debug, Default)]
pub(crate) struct Svg {
    body: String,
}

impl Svg {
    /// A text with its baseline at `y`. Its white space is kept as it is.
    pub(crate) fn text(&mut self, x: f32, y: f32, text: &str, ink: Ink, anchor: Anchor) {
        self.text_at(
            &format!(r#"x="{}" y="{}""#, px(x), px(y)),
            text,
            ink,
            anchor,
        );
    }

    /// A text that reads from bottom to top, its point at `x`, `y`.
    pub(crate) fn upright_text(&mut self, x: f32, y: f32, text: &str, ink: Ink, anchor: Anchor) {
        let place = format!(r#"transform="translate({} {}) rotate(-90)""#, px(x), px(y));
        self.text_at(&place, text, ink, anchor);
    }

    fn text_at(&mut self, place: &str, text: &str, ink: Ink, anchor: Anchor) {
        let _ = write!(
            self.body,
            r#"<text {place} font-family="{}" font-weight="{}" font-size="{}" fill="{}" text-anchor="{}" xml:space="preserve">{}</text>"#,
            ink.face.family(),
            ink.face.weight(),
            px(ink.size),
            hex(ink.color),
            anchor.name(),
            escape(text),
        );
    }

    /// A filled rectangle with corners of `radius`.
    pub(crate) fn rect(&mut self, x: f32, y: f32, w: f32, h: f32, fill: &str, radius: f32) {
        let _ = write!(
            self.body,
            r#"<rect x="{}" y="{}" width="{}" height="{}" rx="{}" fill="{}"/>"#,
            px(x),
            px(y),
            px(w),
            px(h),
            px(radius),
            hex(fill),
        );
    }

    /// A rectangle of the surface with a one-pixel hairline inside its edge.
    pub(crate) fn hollow(&mut self, x: f32, y: f32, w: f32, h: f32, fill: &str, edge: &str) {
        let _ = write!(
            self.body,
            r#"<rect x="{}" y="{}" width="{}" height="{}" rx="1.5" fill="{}" stroke="{}" stroke-width="1"/>"#,
            px(x + 0.5),
            px(y + 0.5),
            px(w - 1.0),
            px(h - 1.0),
            hex(fill),
            hex(edge),
        );
    }

    /// A rectangle at `x`, `y` of `w` by `h`, of `fill`, with corners of `radius` and a one-pixel
    /// hairline in `edge` inside its edge.
    pub(crate) fn frame(
        &mut self,
        (x, y): (f32, f32),
        (w, h): (f32, f32),
        radius: f32,
        fill: &str,
        edge: &str,
    ) {
        let _ = write!(
            self.body,
            r#"<rect x="{}" y="{}" width="{}" height="{}" rx="{}" fill="{}" stroke="{}" stroke-width="1"/>"#,
            px(x + 0.5),
            px(y + 0.5),
            px(w - 1.0),
            px(h - 1.0),
            px(radius),
            hex(fill),
            hex(edge),
        );
    }

    /// A one-pixel hairline from one point to another.
    pub(crate) fn line(&mut self, from: (f32, f32), to: (f32, f32), stroke: &str) {
        let _ = write!(
            self.body,
            r#"<line x1="{}" y1="{}" x2="{}" y2="{}" stroke="{}" stroke-width="1"/>"#,
            px(from.0),
            px(from.1),
            px(to.0),
            px(to.1),
            hex(stroke),
        );
    }

    /// A line through `points`, `width` pixels wide, with round joins and caps and no fill.
    pub(crate) fn polyline(&mut self, points: &[(f32, f32)], stroke: &str, width: f32) {
        let mut d = String::new();
        for (at, (x, y)) in points.iter().enumerate() {
            let _ = write!(
                d,
                "{}{} {}",
                if at == 0 { 'M' } else { 'L' },
                px(*x),
                px(*y)
            );
        }
        let _ = write!(
            self.body,
            r#"<path d="{d}" fill="none" stroke="{}" stroke-width="{}" stroke-linejoin="round" stroke-linecap="round"/>"#,
            hex(stroke),
            px(width),
        );
    }

    /// A disc of `radius` with a ring of `ring` pixels around it.
    pub(crate) fn marker(&mut self, at: (f32, f32), radius: f32, fill: &str, ring: (&str, f32)) {
        let _ = write!(
            self.body,
            r#"<circle cx="{}" cy="{}" r="{}" fill="{}" stroke="{}" stroke-width="{}"/>"#,
            px(at.0),
            px(at.1),
            px(radius),
            hex(fill),
            hex(ring.0),
            px(ring.1),
        );
    }

    /// The document: `width` by `height` pixels, the surface under the drawing.
    pub(crate) fn document(self, width: f32, height: f32, surface: &str) -> String {
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="{}"/>{}</svg>"#,
            hex(surface),
            self.body,
            w = px(width),
            h = px(height),
        )
    }
}
