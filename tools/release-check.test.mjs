// `node --test tools/release-check.test.mjs`. Starts tools/release-check.mjs as the release
// workflow does, against manifests written to a temporary folder, and against the repository.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";

const script = resolve(import.meta.dirname, "release-check.mjs");
const repository = resolve(import.meta.dirname, "..");
const folders = [];

after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

/**
 * A folder laid out as the repository: the workspace and crate manifests, package.json, and
 * tauri.conf.json. `tauri` is the content of tauri.conf.json.
 */
function project({
  workspace = "0.1.0",
  crate = "version.workspace = true",
  pkg = "0.1.0",
  tauri = {},
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "hx-release-check-"));
  folders.push(root);
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(
    join(root, "Cargo.toml"),
    `[workspace]\nmembers = ["src-tauri"]\n\n[workspace.package]\nversion = "${workspace}"\nedition = "2021"\n\n[profile.release]\nstrip = true\n`,
  );
  writeFileSync(
    join(root, "src-tauri", "Cargo.toml"),
    `[package]\nname = "hx-desktop"\n${crate}\nedition.workspace = true\n\n[dependencies]\nserde = { version = "1" }\n`,
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "hold-explorer", version: pkg }),
  );
  writeFileSync(
    join(root, "src-tauri", "tauri.conf.json"),
    JSON.stringify({ productName: "Hold Explorer", ...tauri }),
  );
  return root;
}

function run(root, ...args) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [script, ...args, "--root", root],
    {
      encoding: "utf8",
    },
  );
  return { status, stdout, stderr };
}

describe("release-check with a tag", () => {
  it("passes a tag that names the version, and prints the version alone", () => {
    const result = run(project(), "v0.1.0");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "0.1.0\n");
    assert.match(result.stderr, /PASSED, the tag v0\.1\.0 names version 0\.1\.0/);
  });

  it("refuses a tag that names another version", () => {
    const result = run(project(), "v0.2.0");
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /The tag v0\.2\.0 names version 0\.2\.0, but the app is version 0\.1\.0/,
    );
  });

  it("refuses a tag without the v, even when the rest is the version", () => {
    const result = run(project(), "0.1.0");
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /The tag 0\.1\.0 does not start with v\. Tag the release as v0\.1\.0/,
    );
  });

  it("refuses a matching tag when the files disagree", () => {
    const result = run(project({ pkg: "0.1.1" }), "v0.1.0");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /The versions differ: .*package\.json has 0\.1\.1/);
  });

  it("refuses more than one tag", () => {
    const result = run(project(), "v0.1.0", "v0.1.1");
    assert.equal(result.status, 2);
  });
});

describe("release-check without a tag (the dry run)", () => {
  it("passes when the files agree, and compares no tag", () => {
    const result = run(project());
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "0.1.0\n");
    assert.match(result.stderr, /no tag given, so no tag was compared/);
  });

  it("refuses files that disagree", () => {
    const result = run(project({ workspace: "0.2.0" }));
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /Cargo\.toml \(\[workspace\.package\], used by src-tauri\) has 0\.2\.0; package\.json has 0\.1\.0/,
    );
  });
});

describe("the form of the version", () => {
  // The workflow writes the printed version into GITHUB_OUTPUT, where a line break would add
  // an output of its own.
  it("refuses a version with a line break, and prints nothing", () => {
    const result = run(project({ pkg: "0.1.0\nversion=9.9.9" }));
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /is not a version of the form 1\.2\.3/);
  });

  it("refuses a version that is not of the form 1.2.3, even when every file names it", () => {
    const result = run(project({ workspace: "latest", pkg: "latest" }));
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /"latest" is not a version of the form 1\.2\.3/);
  });

  it("passes a pre-release version and its tag", () => {
    const result = run(project({ workspace: "0.2.0-rc.1", pkg: "0.2.0-rc.1" }), "v0.2.0-rc.1");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "0.2.0-rc.1\n");
  });
});

describe("where the version is read", () => {
  it("reads a version the crate writes itself instead of the workspace's", () => {
    const result = run(project({ workspace: "9.9.9", crate: 'version = "0.1.0"' }), "v0.1.0");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /src-tauri\/Cargo\.toml: 0\.1\.0/);
  });

  it("reads `version = { workspace = true }` as the workspace's version", () => {
    const result = run(
      project({ workspace: "0.3.0", crate: "version = { workspace = true }", pkg: "0.3.0" }),
      "v0.3.0",
    );
    assert.equal(result.status, 0, result.stderr);
  });

  it("takes the crate's version for a tauri.conf.json without one", () => {
    const result = run(project(), "v0.1.0");
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stderr,
      /tauri\.conf\.json \(no version: Tauri uses the crate's\): 0\.1\.0/,
    );
  });

  it("compares a version tauri.conf.json writes", () => {
    const result = run(project({ tauri: { version: "0.0.9" } }), "v0.1.0");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /src-tauri\/tauri\.conf\.json has 0\.0\.9/);
  });

  it("reads the version of the JSON file tauri.conf.json names", () => {
    const root = project({ tauri: { version: "../package.json" } });
    const result = run(root, "v0.1.0");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /from \.\.\/package\.json\): 0\.1\.0/);
  });

  it("says which file it cannot read", () => {
    const root = project();
    rmSync(join(root, "package.json"));
    const result = run(root, "v0.1.0");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /package\.json does not exist/);
  });
});

describe("the repository", () => {
  it("names one version in every file, and the tag of that version passes", () => {
    const { version } = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
    const result = run(repository, `v${version}`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${version}\n`);
  });
});
