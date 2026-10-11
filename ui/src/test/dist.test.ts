import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const made: string[] = [];

/** Runs the check on a temporary directory that holds the given files. */
function check(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "hx-dist-"));
  made.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  const run = spawnSync(process.execPath, ["tools/check-dist.mjs", "--dir", dir], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: run.status, output: run.stdout + run.stderr };
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("check-dist", () => {
  it("passes a build that refers to its own files only", () => {
    const run = check({
      "index.html": '<script type="module" src="/assets/index.js"></script>',
      "assets/index.css": "@font-face { src: url(/assets/public-sans.woff2) format('woff2'); }",
      "assets/index.js": 'const path = "/assets/chunk.js";',
    });
    expect(run.output).toContain("PASSED");
    expect(run.status).toBe(0);
  });

  it("fails a stylesheet that loads a font from another host", () => {
    const run = check({
      "assets/index.css": "@font-face { src: url(https://fonts.example.com/public-sans.woff2); }",
    });
    expect(run.status).toBe(1);
    expect(run.output).toContain("assets/index.css");
    expect(run.output).toContain("https://fonts.example.com/public-sans.woff2");
  });

  it("fails a script that names another host over plain http", () => {
    const run = check({ "assets/index.js": 'fetch("http://example.com/data.json");' });
    expect(run.status).toBe(1);
    expect(run.output).toContain("http://example.com/data.json");
  });

  it("allows XML namespaces", () => {
    const run = check({
      "assets/index.js": 'document.createElementNS("http://www.w3.org/2000/svg", "svg");',
      "icon.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    expect(run.status).toBe(0);
  });

  it("allows a link inside license text, and nowhere else in the same file", () => {
    const license = "/*! @license Example 1.0, MIT License, https://example.com/license */";
    expect(check({ "assets/index.js": `${license}\nconst a = 1;` }).status).toBe(0);
    expect(check({ "assets/vendor.LICENSE.txt": "See https://example.com/license" }).status).toBe(
      0,
    );

    const run = check({ "assets/index.js": `${license}\nfetch("https://example.com/api");` });
    expect(run.status).toBe(1);
    expect(run.output).toContain("https://example.com/api");
  });

  it("allows the link inside a library's error text, and no other address of that host", () => {
    const message =
      "return `Minified React error #` + e + `; visit https://react.dev/errors/` + e;";
    expect(check({ "assets/index.js": message }).status).toBe(0);

    const run = check({ "assets/index.js": 'fetch("https://react.dev/learn");' });
    expect(run.status).toBe(1);
    expect(run.output).toContain("https://react.dev/learn");
  });

  it("fails a stylesheet that holds a font as a data: address", () => {
    const run = check({
      "assets/index.css":
        "@font-face { src: url(data:font/woff2;base64,d09GMgABAAAAA) format('woff2'); }",
    });
    expect(run.status).toBe(1);
    expect(run.output).toContain("content security policy");
  });

  it("fails a build that contains the development gallery", () => {
    const page = check({ "gallery.html": "<div></div>", "index.html": "<div></div>" });
    expect(page.status).toBe(1);
    expect(page.output).toContain("gallery.html");

    const chunk = check({ "assets/index.js": 'root.dataset.page = "hx-dev-gallery";' });
    expect(chunk.status).toBe(1);
    expect(chunk.output).toContain("development gallery");
  });

  it("asks for a build when there is nothing to scan", () => {
    const run = check({});
    expect(run.status).toBe(2);
    expect(run.output).toContain("pnpm build");
  });
});
