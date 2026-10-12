import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith(".module.css") ? [path] : [];
  });
}

const files = stylesheets(here).map((path) => ({
  name: path.slice(here.length),
  css: readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
}));

/** The declarations of every rule that is not inside a reduced-motion block. */
function outsideReducedMotion(css: string): string {
  let out = "";
  let rest = css;
  for (;;) {
    const at = rest.indexOf("@media (prefers-reduced-motion: reduce)");
    if (at < 0) return out + rest;
    out += rest.slice(0, at);
    let depth = 0;
    let end = rest.indexOf("{", at);
    do {
      if (rest[end] === "{") depth += 1;
      if (rest[end] === "}") depth -= 1;
      end += 1;
    } while (depth > 0 && end < rest.length);
    rest = rest.slice(end);
  }
}

describe("component stylesheets", () => {
  it("exist for the components", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files)("$name removes its movement under reduced motion", ({ css }) => {
    const moves =
      /animation(-name)?\s*:/.test(outsideReducedMotion(css)) ||
      /transition[^;]*\b(transform|translate|scale|rotate)\b/.test(outsideReducedMotion(css));
    if (!moves) return;
    // The reduced-motion block restates the motion: no animation, or one that only fades.
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/animation\s*:|transition(-property)?\s*:/);
    expect(reduced).not.toMatch(/transition[^;]*\b(transform|translate|scale|rotate)\b/);
  });

  it.each(files)("$name animates only the properties DESIGN.md allows", ({ css }) => {
    const allowed = [
      "opacity",
      "transform",
      "color",
      "background-color",
      "border-color",
      "outline-color",
    ];
    for (const transition of css.match(/transition\s*:[^;]+;/g) ?? []) {
      const value = transition.slice(transition.indexOf(":") + 1, -1).trim();
      if (value === "none") continue;
      for (const part of value.split(/,(?![^(]*\))/)) {
        expect(allowed, transition).toContain(part.trim().split(/\s+/)[0]);
      }
    }
    expect(css).not.toMatch(/transition-property\s*:/);
  });

  it.each(files)("$name never removes the focus ring", ({ css }) => {
    expect(css).not.toMatch(/outline(-style|-width)?\s*:\s*(none|0)\b/);
  });

  it.each(files)("$name uses none of the banned looks", ({ css }) => {
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/background-clip\s*:\s*text/);
    expect(css).not.toMatch(
      /border-(left|right|inline-start|inline-end)(-width)?\s*:[^;]*(border-width-thick|focus-ring-width)/,
    );
  });
});

describe("Skeleton.module.css", () => {
  it("does not shimmer or pulse", () => {
    const skeleton = files.find((file) => file.name.includes("Skeleton.module.css"));
    expect(skeleton?.css).toBeDefined();
    expect(skeleton?.css).not.toMatch(/animation|transition|@keyframes/);
  });
});

describe("ToastRegion.module.css", () => {
  it("takes its place from a property the layout sets, and from the page gutter otherwise", () => {
    const toast = files.find((file) => file.name.includes("ToastRegion.module.css"));
    expect(toast?.css).toContain(
      "inset-inline-start: var(--toast-inset-inline-start, var(--layout-page-padding-x));",
    );
    expect(toast?.css).not.toContain("--layout-sidebar-width");
  });
});
