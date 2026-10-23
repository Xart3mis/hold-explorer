//! Derives the blocker a hold waits for from its remark.

use fancy_regex::Regex as LookaheadRegex;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

use crate::normalize::clean_text;

/// What a hold waits for, derived from its remark by [`RuleSet::classify`].
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Blocker {
    /// Blocker type: a tag code such as `PR`, `TIE-IN`, a keyword label, or `Other`.
    pub kind: String,
    /// The specific thing waited for, such as `577-PR-400`.
    pub item: String,
}

/// An optional three-digit unit, a one-to-five-letter code, a hyphen, and a
/// two-to-five-digit number with an optional single trailing letter. The
/// number must not continue with another digit or with `-digit`.
/// Word boundaries are ASCII-only, as in JavaScript. `fancy-regex` rejects `(?-u:\b)`, so the
/// tag pattern states its start boundary as a lookbehind; the other patterns use `(?-u:\b)`.
const TAG_PATTERN: &str = r"(?<![A-Za-z0-9_])(?:[0-9]{3}-)?([A-Z]{1,5})- ?([0-9]{2,5})(?:[A-Z](?![A-Z]))?(?![0-9]|-[0-9])";

const TIE_IN_PATTERN: &str = r"(?-u:\b)T[0-9]{3}-R[0-9]{3}(?-u:\b)";

/// Tested in this order; the first hit wins.
const KEYWORDS: [(&str, &str); 16] = [
    (
        r"P(?-u:\s)?&(?-u:\s)?IDS?(?-u:\b)|(?-u:\b)PIDS?(?-u:\b)",
        "P&ID",
    ),
    (r"SLEEPER", "SLEEPERS"),
    (r"MISC", "MISC."),
    (r"FIV|AIV", "FIV/AIV"),
    (r"(?-u:\b)LDT(?-u:\b)", "LDT"),
    (r"LINE SIZE|HOLD SIZE", "LINE SIZE"),
    (r"DATA ?SHEET", "DATA SHEET"),
    (r"ISOMETRIC", "ISOMETRIC"),
    (r"PLOT PLAN", "PLOT PLAN"),
    (r"TAG NO", "INSTRUMENT TAG"),
    (r"PIPING MATERIAL CLASS|(?-u:\b)PMC(?-u:\b)", "PMC"),
    (r"PLATFORM", "PLATFORM"),
    (r"SUPPORT", "SUPPORT"),
    (r"(?-u:\b)GA(?-u:\b)|(?-u:\b)GA'S", "GA DRAWING"),
    (r"VENDOR", "VENDOR"),
    (r"STRUCTURE|STEEL|STRU", "STRUCTURE"),
];

/// The compiled patterns that turn a hold remark into a [`Blocker`].
pub struct RuleSet {
    tag: LookaheadRegex,
    tie_in: Regex,
    keywords: Vec<(Regex, &'static str)>,
    leading_hold: Regex,
    leading_pending: Regex,
}

impl RuleSet {
    /// The rules of the HTML tool, compiled once and shared.
    pub fn builtin() -> &'static RuleSet {
        static BUILTIN: OnceLock<RuleSet> = OnceLock::new();
        BUILTIN.get_or_init(Self::compile)
    }

    fn compile() -> RuleSet {
        let literal = "pattern is a valid literal";
        RuleSet {
            tag: LookaheadRegex::new(TAG_PATTERN).expect(literal),
            tie_in: Regex::new(TIE_IN_PATTERN).expect(literal),
            keywords: KEYWORDS
                .iter()
                .map(|(pattern, label)| (Regex::new(pattern).expect(literal), *label))
                .collect(),
            leading_hold: Regex::new(r"^HOLD ").expect(literal),
            leading_pending: Regex::new(r"^(PENDING|ON) ?").expect(literal),
        }
    }

    /// Derives the blocker a remark waits for. Tests, in order: a tag such as
    /// `577-PR-400` (kind is its letter code, with `STRU` reported as `STR`; `UNIT-` codes
    /// are skipped), a tie-in such as `T123-R456`, the keyword list (first hit wins), and
    /// otherwise `Other` with the remark upper-cased, stripped of a leading `HOLD ` and
    /// `PENDING `/`ON `, and cut to 60 UTF-16 units; a blank remark gives the item `—`.
    pub fn classify(&self, remark: &str) -> Blocker {
        let upper = clean_text(remark).to_uppercase();

        let mut position = 0;
        while position < upper.len() {
            // The pattern is bounded, so a runtime error is not expected. If one happens the
            // loop ends and the remark falls through to the later rules.
            let Ok(Some(captures)) = self.tag.captures_from_pos(&upper, position) else {
                break;
            };
            let Some(whole) = captures.get(0) else { break };
            let code = captures.get(1).map(|m| m.as_str()).unwrap_or_default();
            if code == "UNIT" {
                position = whole.end();
                continue;
            }
            let kind = if code == "STRU" { "STR" } else { code };
            return Blocker {
                kind: kind.to_string(),
                item: whole
                    .as_str()
                    .chars()
                    .filter(|c| !c.is_whitespace())
                    .collect(),
            };
        }

        if let Some(found) = self.tie_in.find(&upper) {
            return Blocker {
                kind: "TIE-IN".to_string(),
                item: found.as_str().to_string(),
            };
        }

        for (pattern, label) in &self.keywords {
            if pattern.is_match(&upper) {
                return Blocker {
                    kind: label.to_string(),
                    item: label.to_string(),
                };
            }
        }

        let rest = self.leading_hold.replace(&upper, "");
        let rest = self.leading_pending.replace(&rest, "");
        // JavaScript cuts at 60 UTF-16 code units; never split a character.
        let mut units = 0;
        let item: String = rest
            .chars()
            .take_while(|c| {
                units += c.len_utf16();
                units <= 60
            })
            .collect();
        Blocker {
            kind: "Other".to_string(),
            item: if item.is_empty() {
                crate::words::NONE.to_string()
            } else {
                item
            },
        }
    }
}

impl std::fmt::Debug for RuleSet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RuleSet")
            .field("keyword_rules", &self.keywords.len())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_is_shared_and_debug_counts_keywords() {
        assert!(std::ptr::eq(RuleSet::builtin(), RuleSet::builtin()));
        assert!(format!("{:?}", RuleSet::builtin()).contains("16"));
    }

    fn classify(remark: &str) -> (String, String) {
        let b = RuleSet::builtin().classify(remark);
        (b.kind, b.item)
    }

    fn pair(kind: &str, item: &str) -> (String, String) {
        (kind.to_string(), item.to_string())
    }

    #[test]
    fn next_line_char_is_not_whitespace_in_the_pid_pattern() {
        assert_eq!(classify("P\u{85}&ID").0, "Other");
        assert_eq!(classify("P & ID").1, "P&ID");
    }

    #[test]
    fn tag_with_unit_prefix() {
        assert_eq!(
            classify("Hold Pending Civil Drawings for 577-PR-400"),
            pair("PR", "577-PR-400")
        );
        assert_eq!(
            classify("Pending 538-STR-006 issuance"),
            pair("STR", "538-STR-006")
        );
        assert_eq!(
            classify("Hold Pending Piping Platform Supports for 565-V-302"),
            pair("V", "565-V-302")
        );
    }

    #[test]
    fn tag_with_trailing_letter_and_brackets() {
        assert_eq!(
            classify("control valve(538-PV-3064A)"),
            pair("PV", "538-PV-3064A")
        );
    }

    #[test]
    fn tag_with_space_after_hyphen_is_joined() {
        assert_eq!(classify("pending 538-PR- 100"), pair("PR", "538-PR-100"));
    }

    #[test]
    fn stru_code_is_reported_as_str() {
        assert_eq!(
            classify("wait for 538-STRU-006"),
            pair("STR", "538-STRU-006")
        );
    }

    #[test]
    fn unit_code_is_skipped_in_favor_of_next_tag() {
        assert_eq!(
            classify("UNIT-577 hold for 538-V-104"),
            pair("V", "538-V-104")
        );
    }

    #[test]
    fn six_digit_number_is_not_a_tag() {
        assert_eq!(classify("AB-123456"), pair("Other", "AB-123456"));
    }

    #[test]
    fn tie_in() {
        assert_eq!(
            classify("Tie-in T123-R456 not confirmed"),
            pair("TIE-IN", "T123-R456")
        );
    }

    #[test]
    fn keywords_in_priority_order() {
        assert_eq!(classify("FIV/AIV REPORT\n"), pair("FIV/AIV", "FIV/AIV"));
        assert_eq!(
            classify("Hold Pending Acme FIV/AIV Report"),
            pair("FIV/AIV", "FIV/AIV")
        );
        assert_eq!(
            classify("Isometric by vendor"),
            pair("ISOMETRIC", "ISOMETRIC")
        );
        assert_eq!(classify("Vendor Catalogue"), pair("VENDOR", "VENDOR"));
        assert_eq!(
            classify("P&ID update_x000D_\nrev 2 pending"),
            pair("P&ID", "P&ID")
        );
        assert_eq!(classify("updated PIDs needed"), pair("P&ID", "P&ID"));
        assert_eq!(classify("sleepers elevation"), pair("SLEEPERS", "SLEEPERS"));
        assert_eq!(
            classify("LINE SIZE to be confirmed by process"),
            pair("LINE SIZE", "LINE SIZE")
        );
        assert_eq!(
            classify("pending GA's from vendor"),
            pair("GA DRAWING", "GA DRAWING")
        );
        assert_eq!(
            classify("steel design not final"),
            pair("STRUCTURE", "STRUCTURE")
        );
    }

    #[test]
    fn other_strips_leading_hold_and_pending() {
        assert_eq!(
            classify("Hold pending IA layout for Unit 577"),
            pair("Other", "IA LAYOUT FOR UNIT 577")
        );
        assert_eq!(
            classify("Pending Issuing SMR for Cold Shoes for uninsulated lines"),
            pair("Other", "ISSUING SMR FOR COLD SHOES FOR UNINSULATED LINES")
        );
        assert_eq!(
            classify("on client decision"),
            pair("Other", "CLIENT DECISION")
        );
    }

    #[test]
    fn other_is_cut_to_sixty_characters() {
        let long = "x".repeat(80);
        assert_eq!(classify(&long).1.chars().count(), 60);
    }

    #[test]
    fn word_boundaries_are_ascii_only_like_javascript() {
        assert_eq!(classify("é538-PR-100 pending"), pair("PR", "538-PR-100"));
        assert_eq!(classify("wait T123-R456é"), pair("TIE-IN", "T123-R456"));
        assert_eq!(classify("LDTé"), pair("LDT", "LDT"));
        assert_eq!(classify("ÉLDT list"), pair("LDT", "LDT"));
    }

    #[test]
    fn other_is_cut_at_sixty_utf16_units_without_splitting_a_character() {
        let remark = format!("{}{}", "😀".repeat(40), "x".repeat(40));
        let item = classify(&remark).1;
        assert_eq!(item, "😀".repeat(30));
        assert_eq!(item.encode_utf16().count(), 60);
        // A character that would pass the limit is dropped whole.
        let odd = format!("x{}", "😀".repeat(40));
        assert_eq!(classify(&odd).1, format!("X{}", "😀".repeat(29)));
    }

    #[test]
    fn blank_remark_is_other_dash() {
        assert_eq!(classify(""), pair("Other", "—"));
        assert_eq!(classify("  \n "), pair("Other", "—"));
    }
}
