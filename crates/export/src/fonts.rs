//! The faces a file is drawn in, embedded in the application, and text measured in them.
//!
//! Three static instances of the interface's faces (`fonts/README.md` says how they were made):
//! Public Sans at 400 and 600, and Reddit Mono at 400. A file never reads a font of the machine,
//! so an image or a report looks the same on every machine.

use std::sync::Arc;

use resvg::usvg::fontdb::Database;
use ttf_parser::Face as Parsed;

/// Public Sans at weight 400: body text, labels, values.
const PUBLIC_SANS_REGULAR: &[u8] = include_bytes!("../fonts/PublicSans-Regular.ttf");
/// Public Sans at weight 600: titles.
const PUBLIC_SANS_SEMIBOLD: &[u8] = include_bytes!("../fonts/PublicSans-SemiBold.ttf");
/// Reddit Mono at weight 400: identifiers.
const REDDIT_MONO_REGULAR: &[u8] = include_bytes!("../fonts/RedditMono-Regular.ttf");

/// The family of the body faces, as a drawing names it.
pub const SANS_FAMILY: &str = "Public Sans";
/// The family of the monospace face, as a drawing names it.
pub const MONO_FAMILY: &str = "Reddit Mono";

/// The ellipsis that ends a text cut to fit.
const ELLIPSIS: char = '…';

/// One of the embedded faces.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Face {
    /// Public Sans, regular (400): body text, labels, values.
    Body,
    /// Public Sans, semibold (600): titles.
    BodyStrong,
    /// Reddit Mono, regular (400): identifiers such as line IDs.
    Mono,
}

impl Face {
    /// The family a drawing names the face by.
    pub fn family(self) -> &'static str {
        match self {
            Face::Body | Face::BodyStrong => SANS_FAMILY,
            Face::Mono => MONO_FAMILY,
        }
    }

    /// The weight a drawing names the face by.
    pub fn weight(self) -> u16 {
        match self {
            Face::Body | Face::Mono => 400,
            Face::BodyStrong => 600,
        }
    }

    /// The face's place in [`Fonts`]'s parsed faces.
    fn index(self) -> usize {
        match self {
            Face::Body => 0,
            Face::BodyStrong => 1,
            Face::Mono => 2,
        }
    }
}

/// The embedded faces in a font database, and the width of a text in one of them.
pub struct Fonts {
    /// The three faces and nothing else, shared with every drawing.
    db: Arc<Database>,
    /// The same faces parsed, for measuring, in the order of [`Face::index`].
    faces: [Parsed<'static>; 3],
}

impl Fonts {
    /// The three embedded faces. No font of the machine is read.
    pub fn embedded() -> Fonts {
        let mut db = Database::new();
        let parse = |data: &'static [u8]| {
            Parsed::parse(data, 0)
                .expect("the embedded faces are compiled into the crate, and a test loads each")
        };
        for data in [
            PUBLIC_SANS_REGULAR,
            PUBLIC_SANS_SEMIBOLD,
            REDDIT_MONO_REGULAR,
        ] {
            db.load_font_data(data.to_vec());
        }
        Fonts {
            db: Arc::new(db),
            faces: [
                parse(PUBLIC_SANS_REGULAR),
                parse(PUBLIC_SANS_SEMIBOLD),
                parse(REDDIT_MONO_REGULAR),
            ],
        }
    }

    /// The font database of the three faces, as a drawing is given it.
    pub fn database(&self) -> &Arc<Database> {
        &self.db
    }

    /// The width of `text` in `face` at `size` pixels: the sum of the advances of its
    /// characters. A character the face lacks is measured in the first embedded face that has
    /// it, as a drawing falls back to it, or as the face's missing glyph.
    pub fn width(&self, text: &str, face: Face, size: f32) -> f32 {
        let own = &self.faces[face.index()];
        let ems: f32 = text
            .chars()
            .map(|c| {
                let found = std::iter::once(own)
                    .chain(self.faces.iter())
                    .find_map(|parsed| parsed.glyph_index(c).map(|glyph| (parsed, glyph)));
                let (parsed, glyph) = found.unwrap_or((own, ttf_parser::GlyphId(0)));
                let advance = f32::from(parsed.glyph_hor_advance(glyph).unwrap_or(0));
                advance / f32::from(parsed.units_per_em())
            })
            .sum();
        ems * size
    }

    /// `text` cut with an ellipsis to fit `width`: the longest start of it that fits with the
    /// ellipsis after it, without a space before the ellipsis. A text that fits is kept whole;
    /// a width too small for any character gives the ellipsis alone.
    pub fn fit(&self, text: &str, face: Face, size: f32, width: f32) -> String {
        if self.width(text, face, size) <= width {
            return text.to_string();
        }
        let ends: Vec<usize> = text.char_indices().map(|(at, _)| at).skip(1).collect();
        // The starts of the text grow wider with every character: find the longest that fits.
        let fits = |end: usize| {
            let start = text[..end].trim_end();
            self.width(&format!("{start}{ELLIPSIS}"), face, size) <= width
        };
        let longest = ends.partition_point(|end| fits(*end));
        match longest.checked_sub(1).map(|at| ends[at]) {
            Some(end) => format!("{}{ELLIPSIS}", text[..end].trim_end()),
            None => ELLIPSIS.to_string(),
        }
    }

    /// `text` broken into lines of at most `width`, between words; a word wider than a line is
    /// broken between characters. White space between words becomes one space, and a line has
    /// none at its ends. An empty text has no line.
    pub fn wrap(&self, text: &str, face: Face, size: f32, width: f32) -> Vec<String> {
        let fits = |line: &str| self.width(line, face, size) <= width;
        let mut lines = Vec::new();
        let mut line = String::new();
        for word in text.split_whitespace() {
            let joined = if line.is_empty() {
                word.to_string()
            } else {
                format!("{line} {word}")
            };
            if fits(&joined) {
                line = joined;
                continue;
            }
            if !line.is_empty() {
                lines.push(std::mem::take(&mut line));
            }
            // The word starts a line of its own, broken where it is wider than one.
            for c in word.chars() {
                let longer = format!("{line}{c}");
                if !line.is_empty() && !fits(&longer) {
                    lines.push(std::mem::take(&mut line));
                    line.push(c);
                } else {
                    line = longer;
                }
            }
        }
        if !line.is_empty() {
            lines.push(line);
        }
        lines
    }
}

#[cfg(test)]
#[path = "fonts_tests.rs"]
mod tests;
