// Tests for check-tokens.mjs. Run with:  node --test tools/design/
//
// Each test copies DESIGN.md and PRODUCT.md to a temporary directory, makes one change to the copy,
// runs the checker on it with --dir, and asserts the exit code and the message. The files in the
// repository are never written. The first test runs the checker on an unchanged copy, so a failure
// there means the documents themselves are broken, not the checker.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CHECKER = join(HERE, "check-tokens.mjs");
const DESIGN = readFileSync(join(ROOT, "DESIGN.md"), "utf8");
const PRODUCT = readFileSync(join(ROOT, "PRODUCT.md"), "utf8");

/** Runs the checker on a copy of the two documents. Returns { status, output }. */
function check({ design = DESIGN, product = PRODUCT, args = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "check-tokens-"));
  try {
    writeFileSync(join(dir, "DESIGN.md"), design);
    writeFileSync(join(dir, "PRODUCT.md"), product);
    const result = spawnSync(process.execPath, [CHECKER, "--dir", dir, ...args], { encoding: "utf8" });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cellsOf = (line) => line.split("|").slice(1, -1).map((cell) => cell.trim());
const code = (text) => `\`${text}\``;

/**
 * Edits one row of a table of DESIGN.md. The table is found by its first header cell ("Token",
 * "Fill", ...) and the row by its first cell. `edit` receives the row's cells and the lowercased
 * header and returns the lines that replace the row. Throws unless exactly one row matches, so a
 * test cannot pass because its change silently did nothing.
 */
function editRow(markdown, firstHeader, key, edit) {
  const lines = markdown.split("\n");
  const out = [];
  let header = null;
  let found = 0;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) {
      header = null;
      out.push(line);
      continue;
    }
    const cells = cellsOf(line);
    if (header === null) {
      header = cells.map((cell) => cell.toLowerCase());
      out.push(line);
      continue;
    }
    if (header[0] !== firstHeader || cells[0] !== code(key)) {
      out.push(line);
      continue;
    }
    found++;
    out.push(...edit(cells, header).map((row) => `| ${row.join(" | ")} |`));
  }
  assert.equal(found, 1, `expected exactly one "${firstHeader}" row for ${key}, found ${found}`);
  return out.join("\n");
}

/** Sets cells of a token's row, by column name: setToken(md, "--hue-accent", { value: "300" }). */
function setToken(markdown, token, values) {
  return editRow(markdown, "token", token, (cells, header) => {
    for (const [column, value] of Object.entries(values)) {
      const index = header.indexOf(column);
      assert.notEqual(index, -1, `${token} has no column "${column}"`);
      cells[index] = code(value);
    }
    return [cells];
  });
}

/** The value of one cell of a token's row, without its backticks. */
function tokenValue(markdown, token, column) {
  let value;
  editRow(markdown, "token", token, (cells, header) => {
    value = cells[header.indexOf(column)].replace(/^`|`$/g, "");
    return [cells];
  });
  return value;
}

/** Adds a themed token in the row after an existing one. */
function addTokenAfter(markdown, after, token, dark, light) {
  return editRow(markdown, "token", after, (cells) => [cells, [code(token), code(dark), code(light), "A token added by a test."]]);
}

/** The checker's list of problems, which is the end of its output; short enough to print when a test fails. */
const problemsOf = (output) => (output.includes("\nFAILED") ? output.slice(output.lastIndexOf("\nFAILED")) : output.slice(-1500));

function assertFails(result, message) {
  const problems = problemsOf(result.output);
  assert.equal(result.status, 1, `expected exit code 1, got ${result.status}\n${problems}`);
  assert.ok(/^FAILED: \d+ problems?$/m.test(result.output), `no FAILED line\n${problems}`);
  assert.ok(message.test(result.output), `expected a problem matching ${message}\n${problems}`);
}

test("the documents as committed pass every check", () => {
  const result = check();
  assert.equal(result.status, 0, result.output.slice(-3000));
  assert.match(result.output, /^PASSED: every check holds in both themes$/m);
});

test("a chart mark that is too faint on an interactive fill fails", () => {
  // 0.640 still clears 3:1 on the app surface, which is the only surface the first version checked.
  const design = setToken(DESIGN, "--color-chart-neutral", { light: "oklch(0.640 0.018 var(--hue-neutral))" });
  const result = check({ design });
  assertFails(result, /--color-chart-neutral on --color-surface-pressed \(chart mark, light\): \d\.\d\d is below 3/);
  assertFails(result, /--color-chart-neutral on --color-accent-subtle-hover \(chart mark, light\): \d\.\d\d is below 3/);
  assert.doesNotMatch(result.output, /--color-chart-neutral on --color-surface-app \(chart mark/);
});

test("the first ordinal step under 3:1 fails", () => {
  const design = setToken(DESIGN, "--color-chart-ord-1", { dark: "oklch(0.540 0.115 var(--hue-ramp))" });
  assertFails(check({ design }), /--color-chart-ord-1 on --color-accent-subtle-hover \(chart mark, dark\): \d\.\d\d is below 3/);
});

test("a series slot moved onto a status mark fails", () => {
  const warning = tokenValue(DESIGN, "--color-chart-status-warning", "light");
  const design = setToken(DESIGN, "--color-chart-6", { light: warning });
  assertFails(check({ design }), /--color-chart-6 and --color-chart-status-warning \(light\) are 0\.0 apart; a series slot keeps at least 10 from every status mark/);
});

test("a hue anchor in the excluded range fails", () => {
  const accent = check({ design: setToken(DESIGN, "--hue-accent", { value: "300" }) });
  assertFails(accent, /--hue-accent is 300; hues from 270 to 350 \(violet, indigo, purple, magenta\) are excluded/);
  assertFails(accent, /--color-accent \(dark\) has hue 300; hues from 270 to 350/);
  const neutral = check({ design: setToken(DESIGN, "--hue-neutral", { value: "270" }) });
  assertFails(neutral, /--hue-neutral is 270; hues from 270 to 350/);
});

test("a series color inside the reserve around the accent fails", () => {
  const design = setToken(DESIGN, "--color-chart-2", { dark: "oklch(0.620 0.100 195)", light: "oklch(0.600 0.100 195)" });
  const result = check({ design });
  assertFails(result, /--color-chart-2 \(dark\) has hue 195, within 25 degrees of --hue-accent \(200\); teal is reserved for the accent tokens/);
  assertFails(result, /--color-chart-2 \(light\) has hue 195, within 25 degrees of --hue-accent \(200\)/);
});

test("a surface that the fills table does not classify fails", () => {
  const design = addTokenAfter(
    DESIGN,
    "--color-surface-disabled",
    "--color-surface-banner",
    "oklch(0.300 0.012 var(--hue-neutral))",
    "oklch(0.900 0.010 var(--hue-neutral))",
  );
  assertFails(check({ design }), /--color-surface-banner is a fill that the fills table does not list/);
});

test("a fill of another family that the fills table does not classify fails", () => {
  const design = addTokenAfter(
    DESIGN,
    "--color-accent-subtle-hover",
    "--color-accent-subtle-pressed",
    "oklch(0.340 0.050 var(--hue-accent))",
    "oklch(0.890 0.040 var(--hue-accent))",
  );
  assertFails(check({ design }), /--color-accent-subtle-pressed is a fill that the fills table does not list/);
});

test("a text pair under 4.5 fails", () => {
  const design = setToken(DESIGN, "--color-text-muted", { light: "oklch(0.600 0.020 var(--hue-neutral))" });
  assertFails(check({ design }), /--color-text-muted on --color-surface-app \(text, light\): \d\.\d\d is below 4\.5/);
});

test("a primary button on a fill where its fill does not stand out fails", () => {
  const design = editRow(DESIGN, "fill", "--color-surface-hover", (cells, header) => {
    cells[header.indexOf("carries a primary button")] = "yes";
    return [cells];
  });
  assertFails(check({ design }), /--color-accent on --color-surface-hover \(primary button, rest, dark\): \d\.\d\d is below 3/);
});

test("a fills table row without a yes or a no fails", () => {
  const design = editRow(DESIGN, "fill", "--color-surface-app", (cells, header) => {
    cells[header.indexOf("carries marks")] = "maybe";
    return [cells];
  });
  assertFails(check({ design }), /--color-surface-app must say "yes" or "no" under "Carries marks", not "maybe"/);
});

test("a gap in the numbered slots fails", () => {
  // Slot 4 renamed to 7 leaves 1, 2, 3, 5, 6, 7.
  const design = editRow(DESIGN, "token", "--color-chart-4", (cells) => [[code("--color-chart-7"), ...cells.slice(1)]]);
  assertFails(check({ design }), /--color-chart-5 is numbered 5 where --color-chart-4 is expected; the numbers run from 1 without a gap/);
});

test("slots in an order whose neighbours are too close fail", () => {
  // Jade (slot 2) and rose (slot 5) change places, which puts rose beside burnt orange and jade beside olive.
  const jade = { dark: tokenValue(DESIGN, "--color-chart-2", "dark"), light: tokenValue(DESIGN, "--color-chart-2", "light") };
  const rose = { dark: tokenValue(DESIGN, "--color-chart-5", "dark"), light: tokenValue(DESIGN, "--color-chart-5", "light") };
  const design = setToken(setToken(DESIGN, "--color-chart-2", rose), "--color-chart-5", jade);
  const result = check({ design });
  assertFails(result, /--color-chart-2 and --color-chart-3 \(dark, neighbouring slots\) are \d+\.\d apart in normal vision; the minimum is 15/);
  assertFails(result, /--color-chart-5 and --color-chart-6 \(dark, neighbouring slots\) are \d+\.\d apart under simulated color blindness; the minimum is 8/);
});

test("a token named in a component section but defined nowhere fails", () => {
  const design = DESIGN.replace("fill `--color-chart-neutral`, corner", "fill `--color-chart-plain`, corner");
  assert.notEqual(design, DESIGN, "the bar row sentence this test edits was not found");
  assertFails(check({ design }), /--color-chart-plain is named in DESIGN\.md but defined in no token table/);
});

test("an em dash in either document fails", () => {
  const dash = String.fromCharCode(0x2014);
  assertFails(check({ product: `${PRODUCT}\nPlain ${dash} exact.\n` }), /PRODUCT\.md line \d+ contains an em dash/);
  assertFails(check({ design: `${DESIGN}\nRuled ${dash} quiet.\n` }), /DESIGN\.md line \d+ contains an em dash/);
});

test("--dir reads from the given directory and reports a missing DESIGN.md", () => {
  const empty = mkdtempSync(join(tmpdir(), "check-tokens-empty-"));
  try {
    const result = spawnSync(process.execPath, [CHECKER, "--dir", empty], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /DESIGN\.md not found/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("--hex prints the painted color of a token from the given directory", () => {
  const design = setToken(DESIGN, "--color-chart-1", { dark: "oklch(0.660 0.160 262)" });
  const result = check({ design, args: ["--hex", "dark", "--color-chart-1"] });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output.trim(), /^#[0-9a-f]{6}$/);
});

test("every color of the export palette is the light value of its token", () => {
  const palette = JSON.parse(readFileSync(join(ROOT, "crates", "export", "palette.json"), "utf8"));
  const names = Object.keys(palette);
  assert.ok(names.length > 0, "crates/export/palette.json is empty");
  const result = check({ args: ["--hex", "light", ...names] });
  assert.equal(result.status, 0, result.output);
  const printed = result.output.trim().split(",");
  assert.equal(printed.length, names.length, result.output);
  names.forEach((name, at) => {
    assert.equal(palette[name], printed[at], `${name} in crates/export/palette.json`);
  });
});
