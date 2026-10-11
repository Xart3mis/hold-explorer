#!/usr/bin/env node
// Checks the design tokens in DESIGN.md. No dependencies beyond Node.
//
//   node tools/design/check-tokens.mjs                 run every check; exit 1 when one fails
//   node tools/design/check-tokens.mjs --hex dark --color-chart-1 --color-chart-2
//                                                      print the sRGB hex of tokens, comma-separated
//                                                      (the input format of the chart palette validator)
//   node tools/design/check-tokens.mjs --css           print the tokens as CSS custom properties
//
// What it reads from DESIGN.md:
//   - Token tables: any Markdown table whose first header cell is "Token". Each row names one CSS
//     custom property in its first cell. The other header cells name the columns: "Dark" and "Light"
//     for themed tokens, "Comfortable" and "Compact" for density tokens, "Value" for the rest.
//     A column named "Use" is prose and is ignored.
//   - The pairs table: the Markdown table whose first header cell is "Foreground". Each row names a
//     foreground token, a background token, a minimum contrast ratio, and a kind.
//
// What it checks:
//   1. Every color token is a valid, opaque-or-alpha oklch() value, inside the sRGB gamut, and
//      neither pure black nor pure white, in both themes.
//   2. Every pair in the pairs table meets its minimum WCAG contrast ratio in both themes, and no
//      minimum is set below the floor of its kind.
//   3. Every token named anywhere in DESIGN.md (outside commands) is defined in a token table, and
//      none is defined twice.
//   4. The font sizes are at least a ratio of 1.25 apart.
//   5. Every duration lies between 150 and 250 ms.
//   6. The sequential and ordinal chart ramps change lightness in one direction.
//   7. DESIGN.md and PRODUCT.md contain no em dash.

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
 * Tokens and contrast pairs of a DESIGN.md.
 * tokens: Map name -> { columns: { [column]: value }, line }
 * pairs: [{ fg, bg, min, kind, usedBy, line }]
 */
export function parseDesign(markdown) {
  const tokens = new Map();
  const pairs = [];
  const problems = [];
  for (const table of readTables(markdown)) {
    const head = table.header.map((h) => h.toLowerCase());
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
      const col = (name) => head.indexOf(name);
      table.rows.forEach((row, r) => {
        const line = table.line + 2 + r;
        pairs.push({
          fg: stripCode(row[col("foreground")] ?? ""),
          bg: stripCode(row[col("background")] ?? ""),
          min: Number.parseFloat(row[col("minimum")] ?? ""),
          kind: stripCode(row[col("kind")] ?? ""),
          usedBy: row[col("used by")] ?? "",
          line,
        });
      });
    }
  }
  return { tokens, pairs, problems };
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

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

function checkColors(tokens, out) {
  let count = 0;
  for (const name of tokens.keys()) {
    if (!name.startsWith("--color-")) continue;
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

function checkReferences(tokens, markdown, out) {
  // Commands are not token references: skip fenced code blocks and inline code that starts with "node ".
  const prose = markdown.replace(/^```[\s\S]*?^```/gm, "").replace(/`node [^`]*`/g, "");
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

function checkRamps(tokens, out) {
  for (const prefix of ["--color-chart-seq-", "--color-chart-ord-"]) {
    const names = [...tokens.keys()]
      .filter((name) => name.startsWith(prefix))
      .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
    if (names.length < 3) {
      out.fail(`fewer than three ${prefix}N tokens found`);
      continue;
    }
    for (const theme of THEMES) {
      let lightness;
      try {
        lightness = names.map((name) => colorOf(tokens, name, theme).lch[0]);
      } catch {
        continue; // reported by the color check
      }
      const steps = lightness.slice(1).map((l, i) => l - lightness[i]);
      const oneWay = steps.every((d) => d > 0) || steps.every((d) => d < 0);
      if (!oneWay) out.fail(`${prefix}1 to ${prefix}${names.length} (${theme}) does not change lightness in one direction: ${lightness.join(", ")}`);
    }
    out.note(`${prefix}1 to ${names.length}: lightness runs one way in both themes`);
  }
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

function runChecks() {
  const { markdown, tokens, pairs, problems } = load();
  const failures = [];
  const out = {
    fail: (message) => failures.push(message),
    note: (message) => console.log(`  ${message}`),
    table: (line) => console.log(line),
  };
  for (const problem of problems) out.fail(problem);

  console.log("Colors");
  checkColors(tokens, out);
  console.log("\nContrast pairs (WCAG 2 ratio; text 4.5, large text 3, control border 3, focus ring 3, graphic 3)");
  checkPairs(tokens, pairs, out);
  console.log("\nToken references");
  checkReferences(tokens, markdown, out);
  console.log("\nType scale");
  checkTypeScale(tokens, out);
  console.log("\nMotion");
  checkDurations(tokens, out);
  console.log("\nChart ramps");
  checkRamps(tokens, out);
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
  else if (args.length === 0) runChecks();
  else {
    console.error("usage: check-tokens.mjs [--hex <dark|light> <token> ...] [--css]");
    process.exit(2);
  }
}
