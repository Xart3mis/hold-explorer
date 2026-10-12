import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8").replaceAll("\r\n", "\n");
}

describe("tokens.css", () => {
  it("is exactly what the tables in DESIGN.md generate", () => {
    const fresh = spawnSync(process.execPath, ["tools/design/check-tokens.mjs", "--css"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(fresh.status).toBe(0);
    // A difference means DESIGN.md changed, or the stylesheet was edited by hand. Run `pnpm tokens`.
    expect(read("ui/src/design/tokens.css")).toBe(fresh.stdout.replaceAll("\r\n", "\n"));
  });

  it("defines every token that a table of DESIGN.md names", () => {
    const css = read("ui/src/design/tokens.css");
    const defined = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]));
    const named = [...read("DESIGN.md").matchAll(/^\| `(--[a-z0-9-]+)` \|/gm)].map(
      (match) => match[1],
    );
    expect(named.length).toBeGreaterThan(150);
    expect(named.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("holds both themes and both densities under the selectors DESIGN.md gives", () => {
    const css = read("ui/src/design/tokens.css");
    for (const selector of [
      ':root[data-theme="dark"]',
      ':root[data-theme="light"]',
      '[data-density="comfortable"]',
      '[data-density="compact"]',
    ]) {
      expect(css).toContain(selector);
    }
    const themed = (theme: string) =>
      css.slice(css.indexOf(`[data-theme="${theme}"] {`)).split("}")[0] ?? "";
    expect(themed("dark")).toContain("--color-surface-app: oklch(0.170 0.008 var(--hue-neutral));");
    expect(themed("light")).toContain(
      "--color-surface-app: oklch(0.985 0.003 var(--hue-neutral));",
    );
  });

  it("gives the window the dark surface color for the first paint", () => {
    const hex = spawnSync(
      process.execPath,
      ["tools/design/check-tokens.mjs", "--hex", "dark", "--color-surface-app"],
      { cwd: root, encoding: "utf8" },
    );
    expect(hex.status).toBe(0);
    // The window paints its first frame itself: a style element in the page would get a nonce
    // from Tauri, and with it the style policy would refuse what the component library adds.
    const config: unknown = JSON.parse(read("src-tauri/tauri.conf.json"));
    expect(config).toMatchObject({
      app: { windows: [{ label: "main", backgroundColor: hex.stdout.trim() }] },
    });
    expect(read("ui/index.html")).not.toMatch(/<style/i);
  });
});
