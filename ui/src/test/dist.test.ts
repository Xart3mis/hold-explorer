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

  it("takes only a preserved licence comment as licence text", () => {
    expect(check({ "assets/a.js": "/*! Example 1.0 https://example.com/about */" }).status).toBe(0);
    expect(check({ "assets/a.js": "/* @license see https://example.com/terms */" }).status).toBe(0);
    expect(
      check({ "assets/a.js": "/**\n * @license\n * https://example.com/terms\n */" }).status,
    ).toBe(0);

    const plain = check({ "assets/a.js": "/* the license is at https://example.com/terms */" });
    expect(plain.status).toBe(1);
    expect(plain.output).toContain("https://example.com/terms");
  });

  it("still catches an address that follows a comment opener inside a string", () => {
    const run = check({
      "assets/index.js":
        'const glob="src/*";const open="/*";fetch("https://example.com/api");/* license */' +
        'const more="/*!";fetch("https://example.org/data");/*! Example, MIT License */',
    });
    expect(run.status).toBe(1);
    expect(run.output).toContain("https://example.com/api");
    expect(run.output).toContain("https://example.org/data");
  });

  it("allows the two links in the messages of the router, and no other address on those hosts", () => {
    const messages = check({
      "assets/index.js":
        "throw new Error(e + ` must be used within a data router.  See https://reactrouter.com/en/main/routers/picking-a-router.`);" +
        "console.warn(`load a polyfill such as https://github.com/ungap/url-search-params.`);",
    });
    expect(messages.status).toBe(0);

    const other = check({ "assets/index.js": 'fetch("https://reactrouter.com/api/routes");' });
    expect(other.status).toBe(1);
    expect(other.output).toContain("https://reactrouter.com/api/routes");

    const repository = check({ "assets/index.js": 'fetch("https://github.com/ungap/other");' });
    expect(repository.status).toBe(1);
    expect(repository.output).toContain("https://github.com/ungap/other");
  });

  it("allows the bases the libraries parse addresses against, and no address on that host", () => {
    const bases = [
      "var base = new URL(`http://localhost`);",
      'const base = new URL("http://localhost");',
      "function f(e,t,n=!1){let r=`http://localhost`;e&&(r=e.location.href)}",
      'let base = "http://localhost";',
    ];
    for (const code of bases) {
      const base = check({ "assets/index.js": code });
      expect(base.output, code).toContain("PASSED");
      expect(base.status, code).toBe(0);
    }

    for (const address of ["http://localhost:3000/api", "http://localhost/data.json"]) {
      const request = check({ "assets/index.js": `fetch("${address}");` });
      expect(request.status).toBe(1);
      expect(request.output).toContain(address);
    }
  });

  it("fails every other reference to localhost, the listed address used another way included", () => {
    const others = [
      'fetch("http://localhost");',
      'new URL("http://localhost:1420");',
      'new URL("http://localhost/path");',
      'const host = "localhost";',
      'const socket = "ws://localhost";',
      'const dev = "localhost:1420";',
      'let base = "http://localhost" + path;',
      'const url = "HTTP://LOCALHOST";',
    ];
    for (const code of others) {
      const run = check({ "assets/index.js": code });
      expect(run.status, code).toBe(1);
      expect(run.output.toLowerCase(), code).toContain("localhost");
    }
  });

  it("fails a page that holds a style element", () => {
    // Tauri gives every style element of a page a nonce, and a style policy with a nonce no
    // longer allows the styles a library adds at run time.
    for (const element of ["<style>html { background: #0b1011; }</style>", '<STYLE media="all">']) {
      const run = check({ "index.html": `<head>${element}</head>` });
      expect(run.status).toBe(1);
      expect(run.output).toContain("index.html");
      expect(run.output).toContain("style element");
    }

    // A stylesheet that is linked, an attribute, and the word in a script are no style element.
    const run = check({
      "index.html": '<link rel="stylesheet" href="/assets/index.css"><div style="color: red">',
      "assets/index.js": 'const tag = "<style>";',
    });
    expect(run.status).toBe(0);
  });

  it("fails a build that contains the development gallery", () => {
    const page = check({ "gallery.html": "<div></div>", "index.html": "<div></div>" });
    expect(page.status).toBe(1);
    expect(page.output).toContain("gallery.html");

    const chunk = check({ "assets/index.js": 'root.dataset.page = "hx-dev-gallery";' });
    expect(chunk.status).toBe(1);
    expect(chunk.output).toContain("development gallery");
  });

  it("fails a build that contains the development commands", () => {
    const page = check({ "dev.html": "<div></div>", "index.html": "<div></div>" });
    expect(page.status).toBe(1);
    expect(page.output).toContain("dev.html");
    expect(page.output).toContain("development commands");

    const chunk = check({ "assets/index.js": 'window.name = "hx-dev-commands";' });
    expect(chunk.status).toBe(1);
    expect(chunk.output).toContain("development commands");

    // A file that only has "dev" in its name is not the development page.
    const other = check({ "assets/devices-B1x.js": "export const a = 1;" });
    expect(other.status).toBe(0);
  });

  it("asks for a build when there is nothing to scan", () => {
    const run = check({});
    expect(run.status).toBe(2);
    expect(run.output).toContain("pnpm build");
  });
});
