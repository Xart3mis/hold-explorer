//! A chart drawn as pixels: a PNG file, or RGBA pixels for the clipboard.
//!
//! The SVG is read with the embedded faces only, and an image it names by a path or a link is
//! never read, so nothing of the machine enters the drawing.

use resvg::tiny_skia::{Color, Pixmap, Transform};
use resvg::usvg::{ImageHrefResolver, Options, Tree, WriteOptions};

use crate::chart::svg::escape;
use crate::fonts::{Fonts, SANS_FAMILY};
use crate::xlsx::color;
use crate::ExportError;

/// How many pixels of the image a pixel of the drawing takes, each way.
const SCALE: f32 = 2.0;

/// The SVG drawn at twice its size as a PNG with an opaque surface background.
///
/// `Err(ExportError::Image)` when the SVG cannot be read or drawn: a fault of the application.
pub fn png(svg: &str, fonts: &Fonts) -> Result<Vec<u8>, ExportError> {
    draw(svg, fonts)?
        .encode_png()
        .map_err(|error| ExportError::Image {
            reason: error.to_string(),
        })
}

/// The same drawing as RGBA pixels, for the clipboard: its width, its height, and four bytes a
/// pixel, row by row from the top. Every pixel is opaque.
///
/// `Err(ExportError::Image)` when the SVG cannot be read or drawn: a fault of the application.
pub fn rgba(svg: &str, fonts: &Fonts) -> Result<(u32, u32, Vec<u8>), ExportError> {
    let pixmap = draw(svg, fonts)?;
    // The surface under the drawing is opaque, so every pixel is, and its premultiplied
    // channels are its plain ones.
    Ok((pixmap.width(), pixmap.height(), pixmap.take()))
}

/// The SVG read with the embedded faces and written again with every text as the outlines of
/// its glyphs, with `title` as the document's `<title>`: a file that looks the same on every
/// machine, whatever fonts it has.
///
/// `Err(ExportError::Image)` when the SVG cannot be read: a fault of the application.
pub(crate) fn outlined(svg: &str, title: &str, fonts: &Fonts) -> Result<String, ExportError> {
    let tree = Tree::from_str(svg, &options(fonts)).map_err(|error| ExportError::Image {
        reason: error.to_string(),
    })?;
    // `preserve_text` is off by default: the writer draws each text as paths.
    let written = tree.to_string(&WriteOptions::default());
    let title = format!("<title>{}</title>", escape(title));
    // The title goes first inside the root element, before anything drawn.
    let opened = written
        .find("<svg")
        .and_then(|start| written[start..].find('>').map(|end| start + end + 1));
    match opened {
        Some(at) => Ok(format!("{}{title}{}", &written[..at], &written[at..])),
        None => Err(ExportError::Image {
            reason: "the outlined drawing has no root element".into(),
        }),
    }
}

/// How a drawing of this crate is read: with the embedded faces only, and without reading an
/// image it names by a path or a link.
pub(crate) fn options(fonts: &Fonts) -> Options<'static> {
    Options {
        fontdb: fonts.database().clone(),
        font_family: SANS_FAMILY.into(),
        image_href_resolver: ImageHrefResolver {
            resolve_data: ImageHrefResolver::default_data_resolver(),
            // A path or a link names something outside the drawing: it is never read.
            resolve_string: Box::new(|_, _| None),
        },
        ..Options::default()
    }
}

/// The SVG read with the embedded faces and drawn at [`SCALE`] over the surface.
fn draw(svg: &str, fonts: &Fonts) -> Result<Pixmap, ExportError> {
    let fault = |reason: String| ExportError::Image { reason };
    let tree = Tree::from_str(svg, &options(fonts)).map_err(|error| fault(error.to_string()))?;
    let size = tree
        .size()
        .to_int_size()
        .scale_by(SCALE)
        .ok_or_else(|| fault(format!("the drawing of {:?} cannot be scaled", tree.size())))?;
    let mut pixmap = Pixmap::new(size.width(), size.height()).ok_or_else(|| {
        fault(format!(
            "an image of {} by {} pixels cannot be made",
            size.width(),
            size.height()
        ))
    })?;
    let surface = color("--color-surface-app");
    let channel = |shift: u32| ((surface >> shift) & 0xFF) as u8;
    pixmap.fill(Color::from_rgba8(channel(16), channel(8), channel(0), 0xFF));
    resvg::render(
        &tree,
        Transform::from_scale(SCALE, SCALE),
        &mut pixmap.as_mut(),
    );
    Ok(pixmap)
}

#[cfg(test)]
#[path = "raster_tests.rs"]
mod tests;
