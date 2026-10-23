// Checks that a release tag names the version the app is built with (decision 8 of the M1d plan).
//
//   node tools/release-check.mjs [<tag>] [--root <path>]      (default root: the repository)
//
// The version is written in three places: Cargo.toml (the workspace version, which the desktop
// crate src-tauri/Cargo.toml takes with `version.workspace = true`, or a version of its own),
// package.json, and src-tauri/tauri.conf.json. tauri.conf.json may leave `version` out, and then
// Tauri uses the version of the desktop crate, so it agrees by construction; it may also name a
// JSON file whose `version` is used. All of them must be equal.
//
// With a tag, the tag must be `v` followed by that version: `v0.1.0` for 0.1.0. Without a tag (the
// dry run of the release workflow, which has no tag) only the three files are compared.
//
// On success the version alone is written to stdout, so the workflow can read it; every message
// goes to stderr. The exit code is 0 when everything agrees, 1 when something differs, and 2 when
// a file cannot be read.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

class ReadError extends Error {}

function readText(path) {
  if (!existsSync(path)) throw new ReadError(`${path} does not exist.`);
  return readFileSync(path, "utf8");
}

function readJson(path) {
  try {
    return JSON.parse(readText(path));
  } catch (error) {
    if (error instanceof ReadError) throw error;
    throw new ReadError(`${path} is not valid JSON: ${error.message}`);
  }
}

/**
 * The `version` key of one table of a Cargo manifest: the string, `"workspace"` for
 * `version.workspace = true` or `version = { workspace = true }`, or `undefined`. Only the lines
 * of the table are read; a manifest writes its version on one line, as both of ours do.
 */
function cargoVersion(text, table) {
  let current = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = header[1].trim();
      continue;
    }
    if (current !== table) continue;
    const plain = /^version\s*=\s*"([^"]*)"$/.exec(line);
    if (plain) return plain[1];
    if (/^version\.workspace\s*=\s*true$/.test(line)) return "workspace";
    if (/^version\s*=\s*\{\s*workspace\s*=\s*true\s*\}$/.test(line)) return "workspace";
  }
  return undefined;
}

/** The version of the desktop crate, and where it was read. */
function crateVersion(root) {
  const cratePath = join(root, "src-tauri", "Cargo.toml");
  const own = cargoVersion(readText(cratePath), "package");
  if (own === undefined) throw new ReadError(`${cratePath} has no version in [package].`);
  if (own !== "workspace") return { version: own, source: "src-tauri/Cargo.toml" };
  const workspacePath = join(root, "Cargo.toml");
  const shared = cargoVersion(readText(workspacePath), "workspace.package");
  if (shared === undefined || shared === "workspace") {
    throw new ReadError(
      `${cratePath} takes its version from the workspace, but ${workspacePath} has no version in [workspace.package].`,
    );
  }
  return { version: shared, source: "Cargo.toml ([workspace.package], used by src-tauri)" };
}

/** Every place the version is written, as `{ source, version }`. */
function versions(root) {
  const crate = crateVersion(root);
  const found = [crate];

  const packagePath = join(root, "package.json");
  const pkg = readJson(packagePath);
  if (typeof pkg.version !== "string") throw new ReadError(`${packagePath} has no version.`);
  found.push({ source: "package.json", version: pkg.version });

  const confPath = join(root, "src-tauri", "tauri.conf.json");
  const conf = readJson(confPath);
  if (conf.version === undefined) {
    // Tauri then uses the version of the desktop crate.
    found.push({
      source: "src-tauri/tauri.conf.json (no version: Tauri uses the crate's)",
      version: crate.version,
    });
  } else if (typeof conf.version !== "string") {
    throw new ReadError(`${confPath} has a version that is not a string.`);
  } else if (conf.version.endsWith(".json")) {
    // Tauri reads the version of a JSON file named relative to tauri.conf.json.
    const linked = readJson(resolve(dirname(confPath), conf.version));
    if (typeof linked.version !== "string") {
      throw new ReadError(`${conf.version}, named by ${confPath}, has no version.`);
    }
    found.push({
      source: `src-tauri/tauri.conf.json (from ${conf.version})`,
      version: linked.version,
    });
  } else {
    found.push({ source: "src-tauri/tauri.conf.json", version: conf.version });
  }
  return found;
}

/** The problems, as sentences; an empty list means the tag and the files agree. */
function problems(found, tag) {
  const result = [];
  const first = found[0].version;
  if (found.some(({ version }) => version !== first)) {
    result.push(
      "The versions differ: " +
        found.map(({ source, version }) => `${source} has ${version}`).join("; ") +
        ". Write the same version in each, then tag that version.",
    );
  }
  if (tag !== undefined) {
    if (!tag.startsWith("v")) {
      result.push(`The tag ${tag} does not start with v. Tag the release as v${first}.`);
    } else if (tag.slice(1) !== first) {
      result.push(
        `The tag ${tag} names version ${tag.slice(1)}, but the app is version ${first}. ` +
          `Tag the release as v${first}, or change the version in every file first.`,
      );
    }
  }
  return result;
}

function main(argv) {
  const at = argv.indexOf("--root");
  const root = resolve(at >= 0 && argv[at + 1] ? argv[at + 1] : join(import.meta.dirname, ".."));
  const rest = at >= 0 ? argv.filter((_, i) => i !== at && i !== at + 1) : argv;
  if (rest.length > 1) {
    console.error(
      "release-check: give at most one tag, as in: node tools/release-check.mjs v0.1.0",
    );
    return 2;
  }
  const tag = rest[0];

  let found;
  try {
    found = versions(root);
  } catch (error) {
    if (!(error instanceof ReadError)) throw error;
    console.error(`release-check: ${error.message}`);
    return 2;
  }
  for (const { source, version } of found) console.error(`${source}: ${version}`);

  const list = problems(found, tag);
  for (const problem of list) console.error(problem);
  if (list.length > 0) {
    console.error("release-check: FAILED.");
    return 1;
  }
  const version = found[0].version;
  console.error(
    tag === undefined
      ? `release-check: PASSED, every file names version ${version} (no tag given, so no tag was compared).`
      : `release-check: PASSED, the tag ${tag} names version ${version}, as every file does.`,
  );
  console.log(version);
  return 0;
}

// Nothing imports this file, so it always runs (see the same note in check-dist.mjs). The tests
// start it as a script, with --root pointing at manifests they write.
process.exit(main(process.argv.slice(2)));
