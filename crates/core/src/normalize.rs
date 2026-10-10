//! Text cleaning shared by import, grouping, and blocker rules.

/// Shown when a hold has no discipline.
pub const UNSPECIFIED: &str = "Unspecified";

/// Shown when a hold has no name, role, or hold type.
pub const DASH: &str = "—";

/// The characters JavaScript's `\s` matches. Rust's `char::is_whitespace` differs: it includes
/// U+0085 and excludes U+FEFF.
fn is_js_whitespace(c: char) -> bool {
    matches!(c,
        '\u{9}'..='\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

/// Removes the literal `_x000D_` (any letter case) that Excel leaves in exported text, collapses
/// every run of whitespace (line breaks included, as JavaScript counts whitespace) to one
/// space, and trims.
pub fn clean_text(input: &str) -> String {
    // ASCII lower-casing keeps byte offsets, so matches in the copy locate the original.
    const ESCAPE: &str = "_x000d_";
    let mut without_escape = String::with_capacity(input.len());
    let mut copied = 0;
    for (start, _) in input.to_ascii_lowercase().match_indices(ESCAPE) {
        without_escape.push_str(&input[copied..start]);
        without_escape.push(' ');
        copied = start + ESCAPE.len();
    }
    without_escape.push_str(&input[copied..]);
    without_escape
        .split(is_js_whitespace)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Grouping key: cleaned and upper-cased, so remarks that differ only in case
/// or spacing group together.
pub fn fold_key(input: &str) -> String {
    clean_text(input).to_uppercase()
}

/// Cleans `input` with [`clean_text`]; a blank result becomes [`UNSPECIFIED`].
pub fn discipline_or_default(input: &str) -> String {
    let cleaned = clean_text(input);
    if cleaned.is_empty() {
        UNSPECIFIED.to_string()
    } else {
        cleaned
    }
}

/// Cleans `input` with [`clean_text`]; a blank result becomes [`DASH`].
pub fn or_dash(input: &str) -> String {
    let cleaned = clean_text(input);
    if cleaned.is_empty() {
        DASH.to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use crate::normalize::*;

    #[test]
    fn clean_text_collapses_whitespace_and_line_breaks() {
        assert_eq!(clean_text("  FIV/AIV   REPORT\n"), "FIV/AIV REPORT");
        assert_eq!(clean_text("a\r\n\tb"), "a b");
    }

    #[test]
    fn clean_text_splits_on_the_javascript_whitespace_set() {
        // U+FEFF is whitespace to JavaScript, so it splits and is trimmed.
        assert_eq!(clean_text("P\u{feff}&ID"), "P &ID");
        assert_eq!(clean_text("\u{feff}hold pending x"), "hold pending x");
        // U+0085 is not, so it stays.
        assert_eq!(clean_text("a\u{85}b"), "a\u{85}b");
        for c in [
            '\u{9}', '\u{b}', '\u{c}', '\u{a0}', '\u{1680}', '\u{2000}', '\u{200a}', '\u{2028}',
            '\u{2029}', '\u{202f}', '\u{205f}', '\u{3000}',
        ] {
            assert_eq!(clean_text(&format!("a{c}b")), "a b", "U+{:04X}", c as u32);
        }
        // Zero-width space (U+200B) is not whitespace to JavaScript.
        assert_eq!(clean_text("a\u{200b}b"), "a\u{200b}b");
    }

    #[test]
    fn clean_text_removes_excel_carriage_return_escape() {
        assert_eq!(clean_text("P&ID update_x000D_\nrev 2"), "P&ID update rev 2");
        assert_eq!(clean_text("a_x000d_b"), "a b");
        assert_eq!(clean_text("a_X000d_b"), "a b");
        assert_eq!(clean_text("a_x000D_b_X000D_c"), "a b c");
    }

    #[test]
    fn fold_key_ignores_case_and_spacing() {
        assert_eq!(fold_key("Fiv/Aiv  report "), fold_key("FIV/AIV REPORT\n"));
        assert_eq!(fold_key("Vendor Catalogue"), "VENDOR CATALOGUE");
    }

    #[test]
    fn blank_discipline_becomes_unspecified() {
        assert_eq!(discipline_or_default("   "), "Unspecified");
        assert_eq!(discipline_or_default(" Civil "), "Civil");
    }

    #[test]
    fn blank_label_becomes_dash() {
        assert_eq!(or_dash(""), "—");
        assert_eq!(or_dash(" Designer "), "Designer");
    }
}
