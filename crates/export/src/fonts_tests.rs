//! Tests of the embedded faces and of text measured in them.

use super::*;

#[test]
fn the_database_holds_the_three_embedded_faces_and_no_other() {
    let fonts = Fonts::embedded();
    let mut faces: Vec<(String, u16)> = fonts
        .database()
        .faces()
        .map(|face| {
            let family = face
                .families
                .first()
                .map(|(name, _)| name.clone())
                .unwrap_or_default();
            (family, face.weight.0)
        })
        .collect();
    faces.sort();
    assert_eq!(
        faces,
        vec![
            ("Public Sans".to_string(), 400),
            ("Public Sans".to_string(), 600),
            ("Reddit Mono".to_string(), 400),
        ]
    );
}

#[test]
fn a_longer_text_is_wider_and_the_width_grows_with_the_size() {
    let fonts = Fonts::embedded();
    let short = fonts.width("Piping", Face::Body, 13.0);
    let long = fonts.width("Piping and supports", Face::Body, 13.0);
    assert!(short > 0.0);
    assert!(long > short);
    let double = fonts.width("Piping", Face::Body, 26.0);
    assert!((double - 2.0 * short).abs() < 0.01, "{double} and {short}");
    assert_eq!(fonts.width("", Face::Body, 13.0), 0.0);
}

#[test]
fn the_strong_face_is_wider_than_the_body_face() {
    let fonts = Fonts::embedded();
    let body = fonts.width("Holds by discipline", Face::Body, 17.0);
    let strong = fonts.width("Holds by discipline", Face::BodyStrong, 17.0);
    assert!(strong > body, "{strong} and {body}");
}

#[test]
fn every_character_of_the_mono_face_has_the_same_width() {
    let fonts = Fonts::embedded();
    let one = fonts.width("0", Face::Mono, 13.0);
    assert!(one > 0.0);
    let id = "78B01-573-OO-0100";
    let width = fonts.width(id, Face::Mono, 13.0);
    assert!((width - one * id.chars().count() as f32).abs() < 0.01);
}

#[test]
fn a_text_that_fits_is_kept_whole() {
    let fonts = Fonts::embedded();
    assert_eq!(fonts.fit("Piping", Face::Body, 13.0, 200.0), "Piping");
    let exact = fonts.width("Piping", Face::Body, 13.0);
    assert_eq!(fonts.fit("Piping", Face::Body, 13.0, exact), "Piping");
}

#[test]
fn a_long_text_is_cut_with_an_ellipsis_to_fit() {
    let fonts = Fonts::embedded();
    let text = "Instrumentation and control / Client documents for the vendor package";
    let cut = fonts.fit(text, Face::Body, 13.0, 120.0);
    assert!(cut.ends_with('…'), "{cut}");
    assert!(fonts.width(&cut, Face::Body, 13.0) <= 120.0, "{cut}");
    let kept = cut.trim_end_matches('…');
    assert!(text.starts_with(kept), "{cut}");
    assert!(!kept.ends_with(' '), "no space before the ellipsis: {cut}");
    // The start up to the next character that is not a space would not fit.
    let rest = text[kept.len()..].trim_start();
    let next = text.len() - rest.len() + rest.chars().next().unwrap().len_utf8();
    let longer = format!("{}…", &text[..next]);
    assert!(fonts.width(&longer, Face::Body, 13.0) > 120.0);
}

#[test]
fn a_width_too_small_for_any_character_gives_the_ellipsis_alone() {
    let fonts = Fonts::embedded();
    assert_eq!(fonts.fit("Piping", Face::Body, 13.0, 0.0), "…");
}

#[test]
fn wrap_breaks_between_words_into_lines_that_fit() {
    let fonts = Fonts::embedded();
    let text = "Discipline: Piping, Structural, Instrumentation and control, Electrical";
    let lines = fonts.wrap(text, Face::Body, 13.0, 160.0);
    assert!(lines.len() > 1, "{lines:?}");
    for line in &lines {
        assert!(fonts.width(line, Face::Body, 13.0) <= 160.0, "{line}");
        assert_eq!(line.trim(), line);
    }
    assert_eq!(lines.join(" "), text);
}

#[test]
fn wrap_breaks_a_word_longer_than_a_line() {
    let fonts = Fonts::embedded();
    let word = "78B01-573-OO-0100-78B01-573-OO-0100";
    let lines = fonts.wrap(word, Face::Mono, 13.0, 80.0);
    assert!(lines.len() > 1, "{lines:?}");
    for line in &lines {
        assert!(fonts.width(line, Face::Mono, 13.0) <= 80.0, "{line}");
    }
    assert_eq!(lines.concat(), word);
}

#[test]
fn wrap_keeps_a_short_text_on_one_line_and_an_empty_one_on_none() {
    let fonts = Fonts::embedded();
    assert_eq!(
        fonts.wrap("Piping", Face::Body, 13.0, 200.0),
        vec!["Piping"]
    );
    assert!(fonts.wrap("", Face::Body, 13.0, 200.0).is_empty());
    assert!(fonts.wrap("   ", Face::Body, 13.0, 200.0).is_empty());
}
