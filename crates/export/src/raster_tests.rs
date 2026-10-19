//! Tests of the chart drawn as pixels.

use super::*;

/// A drawing of 960 by 300 with a text, a bar, and the surface as background.
const SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="960" height="300" viewBox="0 0 960 300"><rect width="960" height="300" fill="#f8fbfb"/><text x="24" y="40" font-family="Public Sans" font-weight="600" font-size="17" fill="#162525">Holds by Discipline</text><rect x="24" y="60" width="400" height="8" fill="#6c7b7b"/></svg>"##;

/// The width and height a PNG states in its header.
fn ihdr(png: &[u8]) -> (u32, u32) {
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    assert_eq!(&png[12..16], b"IHDR");
    let word = |at: usize| u32::from_be_bytes([png[at], png[at + 1], png[at + 2], png[at + 3]]);
    (word(16), word(20))
}

#[test]
fn png_draws_the_svg_at_twice_its_size() {
    let png = png(SVG, &Fonts::embedded()).unwrap();
    assert_eq!(ihdr(&png), (1920, 600));
}

#[test]
fn png_of_a_chart_is_twice_the_size_of_the_chart() {
    let fonts = Fonts::embedded();
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="960" height="417" viewBox="0 0 960 417"><text x="24" y="40" font-size="13">{}</text></svg>"##,
        "Piping"
    );
    assert_eq!(ihdr(&png(&svg, &fonts).unwrap()), (1920, 834));
}

#[test]
fn rgba_gives_opaque_pixels_of_twice_the_size_with_the_drawing_on_the_surface() {
    let (width, height, pixels) = rgba(SVG, &Fonts::embedded()).unwrap();
    assert_eq!((width, height), (1920, 600));
    assert_eq!(pixels.len(), 1920 * 600 * 4);
    assert!(
        pixels.chunks(4).all(|p| p[3] == 255),
        "every pixel is opaque"
    );
    let at = |x: usize, y: usize| {
        let i = (y * 1920 + x) * 4;
        [pixels[i], pixels[i + 1], pixels[i + 2]]
    };
    // A corner is the surface, the middle of the bar the neutral, at twice their places.
    assert_eq!(at(0, 0), [0xf8, 0xfb, 0xfb]);
    assert_eq!(at(400, 128), [0x6c, 0x7b, 0x7b]);
    // The title is drawn: some pixel of its line is darker than the surface.
    let inked = (40..80).any(|y| (48..400).any(|x| at(x, y)[0] < 0x80));
    assert!(inked, "the title is drawn in glyphs");
}

#[test]
fn a_transparent_svg_is_drawn_on_the_surface() {
    let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>"#;
    let (_, _, pixels) = rgba(svg, &Fonts::embedded()).unwrap();
    assert!(pixels.chunks(4).all(|p| p == [0xf8, 0xfb, 0xfb, 0xff]));
}

#[test]
fn the_same_svg_gives_the_same_png() {
    let fonts = Fonts::embedded();
    assert_eq!(png(SVG, &fonts).unwrap(), png(SVG, &fonts).unwrap());
}

#[test]
fn an_svg_that_does_not_parse_is_refused_as_a_fault() {
    let result = png("<svg", &Fonts::embedded());
    assert!(
        matches!(result, Err(ExportError::Image { .. })),
        "{result:?}"
    );
}

#[test]
fn an_image_of_a_file_on_disk_is_not_read() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("red.svg");
    std::fs::write(
        &path,
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#ff0000"/></svg>"##,
    )
    .unwrap();
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><image width="10" height="10" xlink:href="{}"/></svg>"#,
        path.display()
    );
    let (_, _, pixels) = rgba(&svg, &Fonts::embedded()).unwrap();
    assert!(pixels.chunks(4).all(|p| p == [0xf8, 0xfb, 0xfb, 0xff]));
}
