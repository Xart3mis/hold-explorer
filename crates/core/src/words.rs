//! The words the core writes into labels. The interface's catalog holds the same words;
//! `ui/src/api/core-words.json` is read by a test on each side, so neither drifts.

/// A blank value in a label: "(blank)".
pub const BLANK: &str = "(blank)";
/// The spelling of a blank role in a hold row, as today.
pub const NONE: &str = "—";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_words_are_those_of_the_shared_fixture() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../ui/src/api/core-words.json")).unwrap();
        assert_eq!(fixture["blank"], BLANK);
        assert_eq!(fixture["none"], NONE);
    }
}
