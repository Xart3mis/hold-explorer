#!/usr/bin/env node
// Checks the design tokens in DESIGN.md. No dependencies beyond Node.
//
//   node tools/design/check-tokens.mjs                 run every check; exit 1 when one fails
//   node tools/design/check-tokens.mjs --hex dark --color-chart-1 --color-chart-2
//                                                      print the sRGB hex of tokens, comma-separated
//                                                      (the input format of the chart palette validator)
//   node tools/design/check-tokens.mjs --css           print the tokens as CSS custom properties
//   node tools/design/check-tokens.mjs --orders        list every order of the categorical slots that
//                                                      passes the series check, best first
//
// What it reads from DESIGN.md:
//   - Token tables: any Markdown table whose first header cell is "Token". Each row names one CSS
//     custom property in its first cell. The other header cells name the columns: "Dark" and "Light"
//     for themed tokens, "Comfortable" and "Compact" for density tokens, "Value" for the rest.
//     A column named "Use" is prose and is ignored.
//   - The pairs table: the Markdown table whose first header cell is "Foreground". Each row names a
//     foreground token, a background token, a minimum contrast ratio, and a kind.
//   - The fills table: the Markdown table whose first header cell is "Fill". Each row names a fill
//     token and says "yes" or "no" under "Carries marks".
//   - The roles table: the Markdown table whose first header cell is "Role". Each row names a
//     --text- token, its letter spacing token, and its figure style token.
//
// What it checks, in both themes:
//   1. Colors: every color token is a valid oklch() value inside the sRGB gamut, and neither pure
//      black nor pure white.
//   2. Hues: no hue anchor and no color lies in the excluded purple range, and only accent tokens
//      come near the accent hue.
//   3. Contrast pairs: every pair in the pairs table meets its minimum WCAG contrast ratio, and no
//      minimum is set below the floor of its kind.
//   4. Chart marks: every chart mark token meets 3:1 on every fill that carries marks, and every
//      surface token is classified in the fills table.
//   5. Chart series: the categorical slots, compared in slot order, stay inside the lightness band,
//      above the chroma floor, and far enough apart in normal and simulated color-blind vision.
//   6. Chart status: the status marks are far enough from each other and from every series slot.
//   7. Chart ramps: each ramp keeps one hue, changes lightness in one direction by a visible step,
//      and every sequential step is the background of a text pair.
//   8. Token references: every token named anywhere in DESIGN.md (outside commands) is defined in a
//      token table, and none is defined twice.
//   9. Type: the font sizes are at least a ratio of 1.25 apart, and every text role has one row in
//      the roles table.
//  10. Motion: every duration lies between 150 and 250 ms.
//  11. Text: DESIGN.md and PRODUCT.md contain no em dash.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const THEMES = ["dark", "light"];

/** Lowest minimum a pair of each kind may declare. */
export const KIND_FLOOR = {
  text: 4.5,
  "large-text": 3,
  "control-border": 3,
  "focus-ring": 3,
  graphic: 3,
};

const GAMUT_TOLERANCE = 0.0005;
const SIZE_RATIO_MIN = 1.25;
const DURATION_RANGE_MS = [150, 250];

/** Hue range, in OKLCH degrees, that holds violet, indigo, purple, and magenta. Closed at both ends. */
export const EXCLUDED_HUE_RANGE = [270, 350];
/** Only accent tokens may lie this close to --hue-accent, in degrees. */
export const ACCENT_HUE_RESERVE = 25;
/** Below this chroma a color is a tinted neutral and may share the accent hue. */
export const TINT_CHROMA_MAX = 0.04;
const ACCENT_FAMILY = /^--color-(?:accent(?:-[a-z0-9]+)*|focus-ring|text-on-accent)$/;

/** A chart mark must reach this contrast on every fill that carries marks. */
export const MARK_CONTRAST_MIN = 3;
/** Chart tokens that are not marks: cell fills, the cell label ink, and chart chrome. */
const NOT_A_MARK = /^--color-chart-(?:seq-[0-9]+|text-inverse|grid|axis|band)$/;

// Distances are Euclidean in OKLab, times 100, between the painted 8-bit colors. The color-blind
// thresholds are calibrated to the simulation of Machado, Oliveira and Fernandes (2009) at
// severity 1.0, the same model and the same numbers as the palette validator of the data
// visualization method (tools/design/palette-validation.md records its runs).
export const SERIES = {
  band: { dark: [0.48, 0.67], light: [0.43, 0.77] },
  chromaFloor: 0.1,
  cvdMin: 8,
  normalMin: 15,
  allPairsSlots: 3,
};
export const STATUS = { cvdMin: 6, normalMin: 15, seriesMin: 10 };
export const RAMP = { stepMin: 0.06, hueSpreadMax: 1 };

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

// ---------------------------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------------------------

/** OKLCH (L 0..1, C, H in degrees) to linear-light sRGB. Not clamped. */
export function oklchToLinearSrgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** OKLCH to 8-bit sRGB channels, the values a screen paints. */
export function oklchToRgb8(lch) {
  return oklchToLinearSrgb(lch).map((v) => Math.round(encode(clamp01(v)) * 255));
}

export function inSrgbGamut(lch) {
  return oklchToLinearSrgb(lch).every((v) => v >= -GAMUT_TOLERANCE && v <= 1 + GAMUT_TOLERANCE);
}

export function toHex(lch) {
  return "#" + oklchToRgb8(lch).map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** WCAG 2 relative luminance of the painted 8-bit color. */
export function relativeLuminance(lch) {
  const [r, g, b] = oklchToRgb8(lch).map((v) => decode(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two OKLCH colors. */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function linearSrgbToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab of the painted 8-bit color, as seen with normal vision or with a simulated deficiency. */
export function paintedOklab(lch, vision) {
  let rgb = oklchToRgb8(lch).map((v) => decode(v / 255));
  if (vision) rgb = MACHADO[vision].map((row) => clamp01(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]));
  return linearSrgbToOklab(rgb);
}

/** Distance between two painted colors: Euclidean in OKLab, times 100. */
export function colorDistance(a, b, vision) {
  const [x, y] = [paintedOklab(a, vision), paintedOklab(b, vision)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** The smaller of the distances under simulated protanopia and deuteranopia. */
export function colorBlindDistance(a, b) {
  return Math.min(colorDistance(a, b, "protan"), colorDistance(a, b, "deutan"));
}

/** Shortest distance between two hues on the circle, in degrees. */
export function hueDistance(a, b) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

const inExcludedRange = (hue) => {
  const h = ((hue % 360) + 360) % 360;
  return h >= EXCLUDED_HUE_RANGE[0] && h <= EXCLUDED_HUE_RANGE[1];
};

// ---------------------------------------------------------------------------------------------
// Reading DESIGN.md
// ---------------------------------------------------------------------------------------------

const TOKEN_NAME = /--[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g;

function splitRow(line) {
  // Cells are separated by "|". A "|" inside a code span would need escaping; the tables use none.
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

const stripCode = (cell) => cell.replace(/^`+|`+$/g, "").trim();

/** Every Markdown table in the text, as { header: string[], rows: string[][], line: number }. */
export function readTables(markdown) {
  const lines = markdown.split("\n");
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const start = i;
    const block = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) block.push(lines[i++]);
    if (block.length < 2 || !/^\|[\s:|-]+\|?$/.test(block[1].trim())) continue;
    tables.push({ header: splitRow(block[0]), rows: block.slice(2).map(splitRow), line: start + 1 });
  }
  return tables;
}

/**
 * Tokens, contrast pairs, fills, and text roles of a DESIGN.md.
 * tokens: Map name -> { columns: { [column]: value }, line }
 * pairs: [{ fg, bg, min, kind, usedBy, line }]
 * fills: [{ name, carries, line }]
 * roles: [{ name, letterSpacing, figures, line }]
 */
export function parseDesign(markdown) {
  const tokens = new Map();
  const pairs = [];
  const fills = [];
  const roles = [];
  const problems = [];
  for (const table of readTables(markdown)) {
    const head = table.header.map((h) => h.toLowerCase());
    const col = (name) => head.indexOf(name);
    const cell = (row, name) => stripCode(row[col(name)] ?? "");
    if (head[0] === "token") {
      table.rows.forEach((row, r) => {
        const name = stripCode(row[0] ?? "");
        const line = table.line + 2 + r;
        if (!/^--[a-z][a-z0-9-]*$/.test(name)) {
          problems.push(`line ${line}: "${row[0]}" is not a token name`);
          return;
        }
        if (tokens.has(name)) {
          problems.push(`line ${line}: ${name} is already defined on line ${tokens.get(name).line}`);
          return;
        }
        const columns = {};
        head.forEach((h, c) => {
          if (c === 0 || h === "use") return;
          columns[h] = stripCode(row[c] ?? "");
        });
        tokens.set(name, { columns, line });
      });
    } else if (head[0] === "foreground") {
      table.rows.forEach((row, r) => {
        pairs.push({
          fg: cell(row, "foreground"),
          bg: cell(row, "background"),
          min: Number.parseFloat(row[col("minimum")] ?? ""),
          kind: cell(row, "kind"),
          usedBy: row[col("used by")] ?? "",
          line: table.line + 2 + r,
        });
      });
    } else if (head[0] === "fill") {
      table.rows.forEach((row, r) => {
        fills.push({ name: cell(row, "fill"), carries: cell(row, "carries marks").toLowerCase(), line: table.line + 2 + r });
      });
    } else if (head[0] === "role") {
      table.rows.forEach((row, r) => {
        roles.push({
          name: cell(row, "role"),
          letterSpacing: cell(row, "letter spacing"),
          figures: cell(row, "figures"),
          line: table.line + 2 + r,
        });
      });
    }
  }
  return { tokens, pairs, fills, roles, problems };
}

/** The value of a token in one column set, with var() references resolved. */
export function resolveValue(tokens, name, theme, seen = []) {
  const token = tokens.get(name);
  if (!token) throw new Error(`${name} is not defined in a token table`);
  if (seen.includes(name)) throw new Error(`${name} refers to itself through ${seen.join(" -> ")}`);
  const raw = token.columns[theme] ?? token.columns.value ?? token.columns.comfortable;
  if (raw === undefined || raw === "") throw new Error(`${name} has no value for ${theme}`);
  return raw.replace(/var\((--[a-z0-9-]+)\)/g, (_, ref) => resolveValue(tokens, ref, theme, [...seen, name]));
}

const OKLCH = /^oklch\(\s*([0-9.]+)(%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*([0-9.]+)(%?))?\s*\)$/;

/** Parses "oklch(L C H)" or "oklch(L C H / A)". Returns { lch, alpha } or null. */
export function parseOklch(value) {
  const m = OKLCH.exec(value.trim());
  if (!m) return null;
  const L = m[2] === "%" ? Number(m[1]) / 100 : Number(m[1]);
  const alpha = m[5] === undefined ? 1 : m[6] === "%" ? Number(m[5]) / 100 : Number(m[5]);
  return { lch: [L, Number(m[3]), Number(m[4])], alpha };
}

function colorOf(tokens, name, theme) {
  const value = resolveValue(tokens, name, theme);
  const parsed = parseOklch(value);
  if (!parsed) throw new Error(`${name} (${theme}) is "${value}", not an oklch() color`);
  return parsed;
}

/** The color of a token in one theme, or null when it cannot be read (the color check reports why). */
function tryColor(tokens, name, theme) {
  try {
    return colorOf(tokens, name, theme);
  } catch {
    return null;
  }
}

const colorNames = (tokens) => [...tokens.keys()].filter((name) => name.startsWith("--color-"));

/** Tokens named prefix + number, in numeric order. */
function numbered(tokens, prefix) {
  return [...tokens.keys()]
    .filter((name) => name.startsWith(prefix) && /^[0-9]+$/.test(name.slice(prefix.length)))
    .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
}

const short = (name) => name.replace(/^--color-/, "");

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

function checkColors(tokens, out) {
  let count = 0;
  for (const name of colorNames(tokens)) {
    for (const theme of THEMES) {
      count++;
      let color;
      try {
        color = colorOf(tokens, name, theme);
      } catch (error) {
        out.fail(error.message);
        continue;
      }
      const [L, C] = color.lch;
      if (L <= 0 || L >= 1) out.fail(`${name} (${theme}) has lightness ${L}; it must lie strictly between 0 and 1`);
      if (C < 0) out.fail(`${name} (${theme}) has a negative chroma`);
      if (!inSrgbGamut(color.lch)) out.fail(`${name} (${theme}) ${resolveValue(tokens, name, theme)} is outside the sRGB gamut`);
      const hex = toHex(color.lch);
      if (hex === "#000000" || hex === "#ffffff") out.fail(`${name} (${theme}) paints as ${hex}; pure black and pure white are not allowed`);
    }
  }
  out.note(`${count} color values parsed, in gamut, and neither pure black nor pure white`);
}

function checkHues(tokens, out) {
  const [from, to] = EXCLUDED_HUE_RANGE;
  const anchors = [...tokens.keys()].filter((name) => name.startsWith("--hue-"));
  const hues = new Map();
  for (const name of anchors) {
    const value = Number(resolveValue(tokens, name, "dark"));
    if (!Number.isFinite(value)) {
      out.fail(`${name} is "${resolveValue(tokens, name, "dark")}", not a hue in degrees`);
      continue;
    }
    hues.set(name, value);
    if (inExcludedRange(value)) out.fail(`${name} is ${value}; hues from ${from} to ${to} (violet, indigo, purple, magenta) are excluded`);
  }
  for (const required of ["--hue-accent", "--hue-neutral"]) {
    if (!hues.has(required)) out.fail(`${required} is not defined`);
  }
  const accent = hues.get("--hue-accent");
  if (accent !== undefined) {
    for (const [name, value] of hues) {
      if (name === "--hue-accent" || name === "--hue-neutral") continue;
      if (hueDistance(value, accent) < ACCENT_HUE_RESERVE) {
        out.fail(`${name} is ${value}, within ${ACCENT_HUE_RESERVE} degrees of --hue-accent (${accent}); only the accent and the neutral tint use that hue`);
      }
    }
  }
  let colored = 0;
  for (const name of colorNames(tokens)) {
    for (const theme of THEMES) {
      const color = tryColor(tokens, name, theme);
      if (!color) continue;
      const [, C, H] = color.lch;
      if (inExcludedRange(H)) out.fail(`${name} (${theme}) has hue ${H}; hues from ${from} to ${to} (violet, indigo, purple, magenta) are excluded`);
      if (accent === undefined || C < TINT_CHROMA_MAX || ACCENT_FAMILY.test(name)) continue;
      colored++;
      if (hueDistance(H, accent) < ACCENT_HUE_RESERVE) {
        out.fail(`${name} (${theme}) has hue ${H}, within ${ACCENT_HUE_RESERVE} degrees of --hue-accent (${accent}); teal is reserved for the accent tokens`);
      }
    }
  }
  out.note(`hue anchors ${[...hues].map(([name, value]) => `${name} ${value}`).join(", ")}; none between ${from} and ${to}`);
  out.note(`no color has a hue between ${from} and ${to}; ${colored} colored values outside the accent family keep ${ACCENT_HUE_RESERVE} degrees from the accent hue`);
}

function checkPairs(tokens, pairs, out) {
  if (pairs.length === 0) {
    out.fail('no pairs table found (a table whose first header cell is "Foreground")');
    return;
  }
  const rows = [];
  for (const pair of pairs) {
    const floor = KIND_FLOOR[pair.kind];
    if (floor === undefined) {
      out.fail(`line ${pair.line}: unknown kind "${pair.kind}" (use ${Object.keys(KIND_FLOOR).join(", ")})`);
      continue;
    }
    if (!(pair.min >= floor)) {
      out.fail(`line ${pair.line}: minimum ${pair.min} for ${pair.fg} on ${pair.bg} is below the ${pair.kind} floor of ${floor}`);
      continue;
    }
    const ratios = {};
    let broken = false;
    for (const theme of THEMES) {
      try {
        const fg = colorOf(tokens, pair.fg, theme);
        const bg = colorOf(tokens, pair.bg, theme);
        if (fg.alpha !== 1 || bg.alpha !== 1) throw new Error(`${pair.fg} on ${pair.bg}: a pair needs two opaque colors`);
        ratios[theme] = contrastRatio(fg.lch, bg.lch);
      } catch (error) {
        out.fail(`line ${pair.line}: ${error.message}`);
        broken = true;
      }
    }
    if (broken) continue;
    const failing = THEMES.filter((theme) => ratios[theme] < pair.min);
    rows.push({ pair, ratios, failing });
    for (const theme of failing) {
      out.fail(`${pair.fg} on ${pair.bg} (${pair.kind}, ${theme}): ${ratios[theme].toFixed(2)} is below ${pair.min}`);
    }
  }
  const width = (key) => Math.max(...rows.map((r) => r.pair[key].length), key.length);
  const wf = width("fg");
  const wb = width("bg");
  const wk = width("kind");
  out.table(`  ${"foreground".padEnd(wf)}  ${"background".padEnd(wb)}  ${"kind".padEnd(wk)}   min   dark  light`);
  for (const { pair, ratios, failing } of rows) {
    const cell = (theme) => ratios[theme].toFixed(2).padStart(5) + (failing.includes(theme) ? "!" : " ");
    out.table(
      `  ${pair.fg.padEnd(wf)}  ${pair.bg.padEnd(wb)}  ${pair.kind.padEnd(wk)}  ${pair.min.toFixed(1).padStart(4)}  ${cell("dark")} ${cell("light")} ${failing.length ? "FAIL" : "ok"}`,
    );
  }
  out.note(`${rows.length} pairs checked in both themes`);
}

/** The chart tokens that are drawn as marks: every --color-chart- token that is not a cell fill, ink, or chrome. */
export function markTokens(tokens) {
  return [...tokens.keys()].filter((name) => name.startsWith("--color-chart-") && !NOT_A_MARK.test(name));
}

function checkMarks(tokens, fills, out) {
  if (fills.length === 0) {
    out.fail('no fills table found (a table whose first header cell is "Fill")');
    return;
  }
  const listed = new Map();
  for (const fill of fills) {
    if (!tokens.has(fill.name)) {
      out.fail(`line ${fill.line}: ${fill.name} is not defined in a token table`);
      continue;
    }
    if (fill.carries !== "yes" && fill.carries !== "no") {
      out.fail(`line ${fill.line}: ${fill.name} must say "yes" or "no" under "Carries marks", not "${fill.carries}"`);
      continue;
    }
    if (listed.has(fill.name)) {
      out.fail(`line ${fill.line}: ${fill.name} is listed twice in the fills table`);
      continue;
    }
    listed.set(fill.name, fill.carries);
  }
  for (const name of tokens.keys()) {
    if (name.startsWith("--color-surface-") && !listed.has(name)) {
      out.fail(`${name} is a surface that the fills table does not list; say whether it carries chart marks`);
    }
  }
  const carriers = [...listed].filter(([, carries]) => carries === "yes").map(([name]) => name);
  const marks = markTokens(tokens);
  if (carriers.length === 0 || marks.length === 0) {
    out.fail("the fills table lists no fill that carries marks, or no chart mark token is defined");
    return;
  }
  const width = Math.max(...marks.map((name) => name.length), "mark".length);
  out.table(`  ${"mark".padEnd(width)}  ${"dark, lowest on".padEnd(36)}  light, lowest on`);
  let count = 0;
  for (const mark of marks) {
    const cells = [];
    for (const theme of THEMES) {
      const fg = tryColor(tokens, mark, theme);
      if (!fg) {
        cells.push("unreadable");
        continue;
      }
      if (fg.alpha !== 1) out.fail(`${mark} (${theme}) is translucent; a chart mark is opaque`);
      let worst = null;
      for (const fill of carriers) {
        const bg = tryColor(tokens, fill, theme);
        if (!bg) continue;
        if (bg.alpha !== 1) {
          out.fail(`${fill} (${theme}) is translucent; a fill that carries marks is opaque`);
          continue;
        }
        count++;
        const ratio = contrastRatio(fg.lch, bg.lch);
        if (ratio < MARK_CONTRAST_MIN) out.fail(`${mark} on ${fill} (chart mark, ${theme}): ${ratio.toFixed(2)} is below ${MARK_CONTRAST_MIN}`);
        if (!worst || ratio < worst.ratio) worst = { ratio, fill };
      }
      cells.push(worst ? `${worst.ratio.toFixed(2).padStart(5)}${worst.ratio < MARK_CONTRAST_MIN ? "!" : " "} ${short(worst.fill)}` : "no fill");
    }
    out.table(`  ${mark.padEnd(width)}  ${cells[0].padEnd(36)}  ${cells[1]}`);
  }
  out.note(`${marks.length} mark tokens on ${carriers.length} fills that carry marks: ${count} pairs checked, minimum ${MARK_CONTRAST_MIN}`);
  out.note(`fills: ${carriers.map(short).join(", ")}`);
}

/** The pair with the smallest distance among the given index pairs. */
function worstPair(colors, names, pairs, measure) {
  let worst = null;
  for (const [i, j] of pairs) {
    const d = measure(colors[i], colors[j]);
    if (!worst || d < worst.d) worst = { d, a: names[i], b: names[j] };
  }
  return worst;
}

const adjacentPairs = (n) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => [i, i + 1]);
const everyPair = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, k) => [i, i + 1 + k])).flat();

function checkSeries(tokens, out) {
  const slots = numbered(tokens, "--color-chart-");
  if (slots.length < 2) {
    out.fail("fewer than two categorical slots (--color-chart-1, --color-chart-2, ...) found");
    return [];
  }
  for (const theme of THEMES) {
    const colors = slots.map((name) => tryColor(tokens, name, theme)?.lch);
    if (colors.some((c) => !c)) continue; // reported by the color check
    const [lo, hi] = SERIES.band[theme];
    slots.forEach((name, i) => {
      const [L, a, b] = paintedOklab(colors[i]);
      const C = Math.hypot(a, b);
      if (L < lo || L > hi) out.fail(`${name} (${theme}) has painted lightness ${L.toFixed(3)}, outside the series band ${lo} to ${hi}`);
      if (C < SERIES.chromaFloor) out.fail(`${name} (${theme}) has painted chroma ${C.toFixed(3)}, below the floor of ${SERIES.chromaFloor}; it would read as gray`);
    });
    const lead = Math.min(SERIES.allPairsSlots, slots.length);
    const groups = [
      ["neighbouring slots", adjacentPairs(slots.length)],
      [`slots 1 to ${lead}, every pair`, everyPair(lead)],
    ];
    for (const [label, pairs] of groups) {
      const cvd = worstPair(colors, slots, pairs, colorBlindDistance);
      const normal = worstPair(colors, slots, pairs, colorDistance);
      if (cvd.d < SERIES.cvdMin) out.fail(`${cvd.a} and ${cvd.b} (${theme}, ${label}) are ${cvd.d.toFixed(1)} apart under simulated color blindness; the minimum is ${SERIES.cvdMin}`);
      if (normal.d < SERIES.normalMin) out.fail(`${normal.a} and ${normal.b} (${theme}, ${label}) are ${normal.d.toFixed(1)} apart in normal vision; the minimum is ${SERIES.normalMin}`);
      out.note(`${theme}, ${label}: closest ${cvd.d.toFixed(1)} color-blind (${short(cvd.a)}, ${short(cvd.b)}), ${normal.d.toFixed(1)} normal (${short(normal.a)}, ${short(normal.b)})`);
    }
    const loose = worstPair(colors, slots, everyPair(slots.length), colorDistance);
    out.note(`${theme}, all ${slots.length} slots, every pair (not a claim, see DESIGN.md): closest ${loose.d.toFixed(1)} normal (${short(loose.a)}, ${short(loose.b)})`);
  }
  out.note(`${slots.length} slots in slot order; minimums ${SERIES.cvdMin} color-blind and ${SERIES.normalMin} normal, chroma floor ${SERIES.chromaFloor}`);
  return slots;
}

function checkStatus(tokens, slots, out) {
  const marks = [...tokens.keys()].filter((name) => name.startsWith("--color-chart-status-"));
  if (marks.length < 2) {
    out.fail("fewer than two status marks (--color-chart-status-...) found");
    return;
  }
  for (const theme of THEMES) {
    const colors = marks.map((name) => tryColor(tokens, name, theme)?.lch);
    const series = slots.map((name) => tryColor(tokens, name, theme)?.lch);
    if (colors.some((c) => !c) || series.some((c) => !c)) continue; // reported by the color check
    const pairs = everyPair(marks.length);
    const cvd = worstPair(colors, marks, pairs, colorBlindDistance);
    const normal = worstPair(colors, marks, pairs, colorDistance);
    if (cvd.d < STATUS.cvdMin) out.fail(`${cvd.a} and ${cvd.b} (${theme}) are ${cvd.d.toFixed(1)} apart under simulated color blindness; the minimum is ${STATUS.cvdMin}`);
    if (normal.d < STATUS.normalMin) out.fail(`${normal.a} and ${normal.b} (${theme}) are ${normal.d.toFixed(1)} apart in normal vision; the minimum is ${STATUS.normalMin}`);
    let nearest = null;
    slots.forEach((slot, i) => {
      marks.forEach((mark, j) => {
        const d = colorDistance(series[i], colors[j]);
        if (d < STATUS.seriesMin) out.fail(`${slot} and ${mark} (${theme}) are ${d.toFixed(1)} apart; a series slot keeps at least ${STATUS.seriesMin} from every status mark`);
        if (!nearest || d < nearest.d) nearest = { d, a: slot, b: mark };
      });
    });
    out.note(`${theme}, status marks, every pair: closest ${cvd.d.toFixed(1)} color-blind (${short(cvd.a)}, ${short(cvd.b)}), ${normal.d.toFixed(1)} normal (${short(normal.a)}, ${short(normal.b)})`);
    if (nearest) out.note(`${theme}, series slot against status mark: closest ${nearest.d.toFixed(1)} (${short(nearest.a)}, ${short(nearest.b)})`);
  }
  out.note(`minimums ${STATUS.cvdMin} color-blind and ${STATUS.normalMin} normal between status marks, ${STATUS.seriesMin} between a series slot and a status mark`);
}

function checkRamps(tokens, pairs, out) {
  for (const prefix of ["--color-chart-seq-", "--color-chart-ord-"]) {
    const names = numbered(tokens, prefix);
    if (names.length < 3) {
      out.fail(`fewer than three ${prefix}N tokens found`);
      continue;
    }
    for (const theme of THEMES) {
      const colors = names.map((name) => tryColor(tokens, name, theme)?.lch);
      if (colors.some((c) => !c)) continue; // reported by the color check
      const lightness = colors.map((c) => c[0]);
      const steps = lightness.slice(1).map((l, i) => l - lightness[i]);
      const oneWay = steps.every((d) => d > 0) || steps.every((d) => d < 0);
      if (!oneWay) out.fail(`${prefix}1 to ${prefix}${names.length} (${theme}) does not change lightness in one direction: ${lightness.join(", ")}`);
      steps.forEach((d, i) => {
        // A step is compared after rounding, so 0.06 written as 0.670 - 0.610 is not lost to floating point.
        if (Math.round(Math.abs(d) * 1000) < Math.round(RAMP.stepMin * 1000)) {
          out.fail(`${names[i]} and ${names[i + 1]} (${theme}) differ by ${Math.abs(d).toFixed(3)} in lightness; neighbouring steps differ by at least ${RAMP.stepMin}`);
        }
      });
      const hues = colors.map((c) => c[2]);
      const spread = Math.max(...hues.map((h) => hueDistance(h, hues[0])));
      if (spread > RAMP.hueSpreadMax) out.fail(`${prefix}1 to ${prefix}${names.length} (${theme}) spans ${spread} degrees of hue; a ramp keeps one hue`);
    }
    out.note(`${prefix}1 to ${names.length}: one hue, lightness runs one way in steps of at least ${RAMP.stepMin}, in both themes`);
  }
  const cells = numbered(tokens, "--color-chart-seq-");
  const labelled = new Set(pairs.filter((pair) => pair.kind === "text").map((pair) => pair.bg));
  for (const name of cells) {
    if (!labelled.has(name)) out.fail(`${name} is not the background of a text pair; every heatmap cell prints its value, so every step needs a checked label color`);
  }
  out.note(`every sequential step is the background of a text pair (${cells.length} steps)`);
}

function checkReferences(tokens, markdown, out) {
  // Commands are not token references: skip fenced code blocks and inline code that starts with "node ".
  // A code span that ends in a hyphen, such as `--color-surface-`, names a prefix, not a token.
  const prose = markdown
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/`node [^`]*`/g, "")
    .replace(/`--[a-z0-9-]*-`/g, "");
  const named = new Set(prose.match(TOKEN_NAME) ?? []);
  const missing = [...named].filter((name) => !tokens.has(name)).sort();
  for (const name of missing) out.fail(`${name} is named in DESIGN.md but defined in no token table`);
  out.note(`${named.size} distinct tokens named in DESIGN.md, ${tokens.size} defined`);
}

function toPx(value) {
  const m = /^(-?[0-9.]+)(px|rem)$/.exec(value.trim());
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
}

function checkTypeScale(tokens, out) {
  const sizes = [];
  for (const name of tokens.keys()) {
    if (!name.startsWith("--font-size-")) continue;
    const px = toPx(resolveValue(tokens, name, "dark"));
    if (px === null) out.fail(`${name} is not a px or rem length`);
    else sizes.push({ name, px });
  }
  if (sizes.length < 2) {
    out.fail("fewer than two --font-size- tokens found");
    return;
  }
  sizes.sort((a, b) => a.px - b.px);
  for (let i = 1; i < sizes.length; i++) {
    const ratio = sizes[i].px / sizes[i - 1].px;
    if (ratio < SIZE_RATIO_MIN) {
      out.fail(`${sizes[i].name} (${sizes[i].px}px) is only ${ratio.toFixed(3)} times ${sizes[i - 1].name} (${sizes[i - 1].px}px); the minimum is ${SIZE_RATIO_MIN}`);
    }
  }
  out.note(`type sizes ${sizes.map((s) => `${s.px}px`).join(", ")}; ratios ${sizes.slice(1).map((s, i) => (s.px / sizes[i].px).toFixed(3)).join(", ")}`);
}

function checkRoles(tokens, roles, out) {
  const defined = [...tokens.keys()].filter((name) => name.startsWith("--text-"));
  if (roles.length === 0) {
    out.fail('no roles table found (a table whose first header cell is "Role")');
    return;
  }
  const seen = new Set();
  for (const role of roles) {
    if (!role.name.startsWith("--text-") || !tokens.has(role.name)) out.fail(`line ${role.line}: ${role.name} is not a defined --text- token`);
    if (seen.has(role.name)) out.fail(`line ${role.line}: ${role.name} has two rows in the roles table`);
    seen.add(role.name);
    if (!role.letterSpacing.startsWith("--letter-spacing-") || !tokens.has(role.letterSpacing)) {
      out.fail(`line ${role.line}: the letter spacing of ${role.name} is "${role.letterSpacing}", not a defined --letter-spacing- token`);
    }
    if (!role.figures.startsWith("--font-numeric-") || !tokens.has(role.figures)) {
      out.fail(`line ${role.line}: the figures of ${role.name} are "${role.figures}", not a defined --font-numeric- token`);
    }
  }
  for (const name of defined) {
    if (!seen.has(name)) out.fail(`${name} has no row in the roles table; give it a letter spacing and a figure style`);
  }
  out.note(`${defined.length} text roles, each with a letter spacing token and a figure style token`);
}

function checkDurations(tokens, out) {
  const found = [];
  for (const name of tokens.keys()) {
    if (!name.startsWith("--duration-")) continue;
    const m = /^([0-9.]+)ms$/.exec(resolveValue(tokens, name, "dark"));
    if (!m) {
      out.fail(`${name} is not a duration in ms`);
      continue;
    }
    const ms = Number(m[1]);
    found.push(`${ms}ms`);
    if (ms < DURATION_RANGE_MS[0] || ms > DURATION_RANGE_MS[1]) {
      out.fail(`${name} is ${ms}ms; durations lie between ${DURATION_RANGE_MS[0]} and ${DURATION_RANGE_MS[1]}ms`);
    }
  }
  if (found.length === 0) out.fail("no --duration- tokens found");
  else out.note(`durations ${found.join(", ")}`);
}

const EM_DASH = String.fromCharCode(0x2014);

function checkDashes(files, out) {
  for (const [label, text] of files) {
    text.split("\n").forEach((line, i) => {
      if (line.includes(EM_DASH)) out.fail(`${label} line ${i + 1} contains an em dash`);
    });
  }
  out.note(`no em dash in ${files.map(([label]) => label).join(", ")}`);
}

// ---------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------

function load() {
  const designPath = resolve(ROOT, "DESIGN.md");
  if (!existsSync(designPath)) {
    console.error(`DESIGN.md not found at ${designPath}`);
    process.exit(2);
  }
  const markdown = readFileSync(designPath, "utf8");
  return { markdown, ...parseDesign(markdown) };
}

function runHex(args) {
  const [theme, ...names] = args;
  if (!THEMES.includes(theme) || names.length === 0) {
    console.error("usage: check-tokens.mjs --hex <dark|light> <token> [<token> ...]");
    process.exit(2);
  }
  const { tokens } = load();
  try {
    console.log(names.map((name) => toHex(colorOf(tokens, name, theme).lch)).join(","));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

function runCss() {
  const { tokens } = load();
  const block = (selector, column, filter) => {
    const lines = [];
    for (const [name, token] of tokens) {
      if (!filter(token.columns)) continue;
      lines.push(`  ${name}: ${token.columns[column]};`);
    }
    return `${selector} {\n${lines.join("\n")}\n}`;
  };
  console.log(
    [
      block(":root", "value", (c) => "value" in c),
      block(':root, :root[data-theme="dark"]', "dark", (c) => "dark" in c),
      block(':root[data-theme="light"]', "light", (c) => "light" in c),
      block(':root, :root[data-density="comfortable"]', "comfortable", (c) => "comfortable" in c),
      block(':root[data-density="compact"]', "compact", (c) => "compact" in c),
    ].join("\n\n"),
  );
}

/** Every order of the items. */
function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

/**
 * The order search behind the slot order. For every order of the categorical colors it takes the
 * closest pair of neighbours and the closest pair among the first slots, in both themes, and lists
 * the orders that meet the minimums of the series check. An order and its reverse have the same
 * neighbours but different first slots, so both are listed.
 */
function runOrders() {
  const { tokens } = load();
  const slots = numbered(tokens, "--color-chart-");
  const colors = Object.fromEntries(THEMES.map((theme) => [theme, slots.map((name) => colorOf(tokens, name, theme).lch)]));
  const lead = Math.min(SERIES.allPairsSlots, slots.length);
  const index = slots.map((_, i) => i);
  const closest = (order, pairs, measure) =>
    Math.min(...THEMES.flatMap((theme) => pairs.map(([i, j]) => measure(colors[theme][order[i]], colors[theme][order[j]]))));
  const rows = permutations(index).map((order) => ({
    order,
    cvd: closest(order, adjacentPairs(order.length), colorBlindDistance),
    normal: closest(order, adjacentPairs(order.length), colorDistance),
    leadCvd: closest(order, everyPair(lead), colorBlindDistance),
    leadNormal: closest(order, everyPair(lead), colorDistance),
  }));
  const passing = rows
    .filter((r) => r.cvd >= SERIES.cvdMin && r.normal >= SERIES.normalMin && r.leadCvd >= SERIES.cvdMin && r.leadNormal >= SERIES.normalMin)
    .sort((a, b) => Math.min(b.cvd, b.leadCvd) - Math.min(a.cvd, a.leadCvd) || b.normal - a.normal);
  console.log(`${rows.length} orders of ${slots.length} slots; ${passing.length} pass in both themes`);
  console.log(`(neighbours and every pair of the first ${lead}: at least ${SERIES.cvdMin} color-blind and ${SERIES.normalMin} normal)`);
  console.log(`columns: order by current slot number | neighbours color-blind, normal | first ${lead} color-blind, normal`);
  for (const r of passing) {
    const current = r.order.every((slot, i) => slot === i) ? "  <- current order" : "";
    console.log(
      `  ${r.order.map((i) => i + 1).join(" ")} | ${r.cvd.toFixed(1).padStart(5)} ${r.normal.toFixed(1).padStart(5)} | ${r.leadCvd.toFixed(1).padStart(5)} ${r.leadNormal.toFixed(1).padStart(5)}${current}`,
    );
  }
  if (!passing.some((r) => r.order.every((slot, i) => slot === i))) {
    console.log("the current order is not among them");
    process.exit(1);
  }
}

function runChecks() {
  const { markdown, tokens, pairs, fills, roles, problems } = load();
  const failures = [];
  const out = {
    fail: (message) => failures.push(message),
    note: (message) => console.log(`  ${message}`),
    table: (line) => console.log(line),
  };
  for (const problem of problems) out.fail(problem);

  console.log("Colors");
  checkColors(tokens, out);
  console.log("\nHues");
  checkHues(tokens, out);
  console.log("\nContrast pairs (WCAG 2 ratio; text 4.5, large text 3, control border 3, focus ring 3, graphic 3)");
  checkPairs(tokens, pairs, out);
  console.log(`\nChart marks on fills (WCAG 2 ratio, minimum ${MARK_CONTRAST_MIN}; every mark on every fill that carries marks)`);
  checkMarks(tokens, fills, out);
  console.log("\nChart series (distance in OKLab times 100)");
  const slots = checkSeries(tokens, out);
  console.log("\nChart status (distance in OKLab times 100)");
  checkStatus(tokens, slots, out);
  console.log("\nChart ramps");
  checkRamps(tokens, pairs, out);
  console.log("\nToken references");
  checkReferences(tokens, markdown, out);
  console.log("\nType");
  checkTypeScale(tokens, out);
  checkRoles(tokens, roles, out);
  console.log("\nMotion");
  checkDurations(tokens, out);
  console.log("\nText");
  const files = [["DESIGN.md", markdown]];
  const productPath = resolve(ROOT, "PRODUCT.md");
  if (existsSync(productPath)) files.push(["PRODUCT.md", readFileSync(productPath, "utf8")]);
  else out.fail("PRODUCT.md not found");
  checkDashes(files, out);

  if (failures.length > 0) {
    console.log(`\nFAILED: ${failures.length} problem${failures.length === 1 ? "" : "s"}`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
  console.log("\nPASSED: every check holds in both themes");
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args[0] === "--hex") runHex(args.slice(1));
  else if (args[0] === "--css") runCss();
  else if (args[0] === "--orders") runOrders();
  else if (args.length === 0) runChecks();
  else {
    console.error("usage: check-tokens.mjs [--hex <dark|light> <token> ...] [--css] [--orders]");
    process.exit(2);
  }
}
