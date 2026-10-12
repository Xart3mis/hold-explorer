// Scans the built interface for anything that names another host, and for the development gallery.
//
//   node tools/check-dist.mjs [--dir <path>]      (default: dist; run after `pnpm build`)
//
// The app makes no network request, and the content security policy would refuse one. This check
// keeps the built files free of the references themselves, so a font, a stylesheet, or a script
// that points at another host is seen at build time and not as a blank glyph on a user's machine.
//
// A font written into a stylesheet as a `data:` address is reported as well: the policy lets
// fonts load from the app's own files only, so such a font would never show.
//
// Every `http://` and `https://` reference in every file is reported, except three kinds:
//   1. XML namespaces (`http://www.w3.org/...`): names, never fetched.
//   2. License text: a preserved license comment, and `*.LICENSE.txt` files. A comment counts
//      only when it starts a line and opens with `/*!` or with `@license`, the two forms a
//      bundler keeps. So a `/*` inside a string of minified code never opens one.
//   3. Links inside the message text of a bundled library, listed one by one in MESSAGE_LINKS with
//      the library and the reason. A link that is not in the list fails the check.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const XML_NAMESPACE = "http://www.w3.org/";

/** Links that appear only as text in a message a library prints. None is ever requested. */
const MESSAGE_LINKS = [
  {
    prefix: "https://react.dev/errors/",
    library: "react, react-dom",
    reason:
      "The text of a production error: 'Minified React error #n; visit https://react.dev/errors/n'. " +
      "It is put into the message of a thrown Error and nothing follows it.",
  },
];

/** Names that only the development gallery has. */
const GALLERY_FILE = /gallery/i;
const GALLERY_MARKER = "hx-dev-gallery";

const URL_PATTERN = /https?:\/\/[^\s"'`<>\\)]*/g;
const INLINE_FONT = /url\(\s*["']?data:(font\/|application\/(x-)?font)/i;
const LICENSE_COMMENT = /(^|\n)[ \t]*\/\*(?:!|[\s*]*@license\b)[\s\S]*?\*\//g;

function filesUnder(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found.sort();
}

/** The text of a file with its license comments blanked, so their links are not reported. */
function withoutLicenseText(text) {
  return text.replace(LICENSE_COMMENT, "$1");
}

function isAllowed(url) {
  return url.startsWith(XML_NAMESPACE) || MESSAGE_LINKS.some((link) => url.startsWith(link.prefix));
}

/** Every problem in the directory, as `{ file, problem }`. An empty list means the build is clean. */
export function scan(dir) {
  const problems = [];
  for (const path of filesUnder(dir)) {
    const file = relative(dir, path).split("\\").join("/");
    if (GALLERY_FILE.test(file)) {
      problems.push({ file, problem: "the development gallery is part of the build" });
      continue;
    }
    // Latin-1 keeps every byte, so a reference inside a binary file is found as well.
    const text = readFileSync(path, "latin1");
    if (text.includes(GALLERY_MARKER)) {
      problems.push({ file, problem: "the development gallery is part of the build" });
    }
    if (INLINE_FONT.test(text)) {
      problems.push({
        file,
        problem: "holds a font as a data: address, which the content security policy refuses",
      });
    }
    if (/\.LICENSE\.txt$/i.test(file)) continue;
    const seen = new Set();
    for (const url of withoutLicenseText(text).match(URL_PATTERN) ?? []) {
      if (isAllowed(url) || seen.has(url)) continue;
      seen.add(url);
      problems.push({ file, problem: `refers to another host: ${url}` });
    }
  }
  return problems;
}

function main(argv) {
  const at = argv.indexOf("--dir");
  const dir = resolve(at >= 0 && argv[at + 1] ? argv[at + 1] : "dist");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`check-dist: ${dir} does not exist. Run pnpm build first, then run this check.`);
    return 2;
  }
  const files = filesUnder(dir);
  if (files.length === 0) {
    console.error(`check-dist: ${dir} is empty. Run pnpm build first, then run this check.`);
    return 2;
  }
  const problems = scan(dir);
  for (const { file, problem } of problems) console.error(`${file}: ${problem}`);
  if (problems.length > 0) {
    console.error(
      `check-dist: FAILED, ${problems.length} problem(s) in ${files.length} files. ` +
        "Bundle the resource with the app, or remove the reference.",
    );
    return 1;
  }
  console.log(
    `check-dist: PASSED, ${files.length} files, no reference to another host and no development gallery.`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  process.exit(main(process.argv.slice(2)));
}
