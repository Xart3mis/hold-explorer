// Stylesheets take every color, size, and duration from a token of DESIGN.md. This configuration
// is the lint rule for that: a literal fails, `var(--...)` passes.

const fromToken = "Take the value from a token of DESIGN.md: var(--...).";

/** Functions that write a color, and functions that write an easing curve. */
const colorFunctions = [
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "light-dark",
];
const easingFunctions = ["cubic-bezier", "steps", "linear"];

/** An easing keyword that stands on its own, not the name of a token such as `--ease-out`. */
const easingKeyword =
  /(?<![\w-])(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)(?![\w(-])/;

export default {
  // Generated from the tables of DESIGN.md by `pnpm tokens`: the one file that holds the literals.
  ignoreFiles: ["ui/src/design/tokens.css"],
  rules: {
    // Mistakes.
    "block-no-empty": true,
    "declaration-block-no-duplicate-custom-properties": true,
    "declaration-block-no-duplicate-properties": true,
    "function-no-unknown": true,
    "keyframe-block-no-duplicate-selectors": true,
    "no-duplicate-selectors": true,
    "no-invalid-double-slash-comments": true,
    "property-no-unknown": true,
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global"] }],
    "selector-pseudo-element-no-unknown": true,
    "unit-no-unknown": true,

    // No color literal.
    "color-named": ["never", { message: fromToken }],
    "color-no-hex": [true, { message: fromToken }],
    "function-disallowed-list": [[...colorFunctions, ...easingFunctions], { message: fromToken }],

    // No size in pixels and no duration: lengths, type sizes, and times are tokens. A media query
    // may name a width or a height, where a custom property cannot be read.
    "unit-disallowed-list": [
      ["px", "ms", "s"],
      {
        ignoreMediaFeatureNames: { px: ["/width$/", "/height$/"] },
        message: fromToken,
      },
    ],

    // No type size, line height, or letter spacing written out, in any unit.
    "declaration-property-unit-disallowed-list": [
      {
        "/^(font|font-size|line-height|letter-spacing)$/": ["px", "pt", "rem", "em", "%"],
      },
      { message: fromToken },
    ],

    // No easing curve written out, and no font weight or layer by number.
    "declaration-property-value-disallowed-list": [
      {
        "/^(transition|animation)/": [easingKeyword],
        "font-weight": ["/^\\d+$/", "bold", "bolder", "lighter"],
        "z-index": ["/^-?\\d+$/"],
      },
      { message: fromToken },
    ],
  },
};
