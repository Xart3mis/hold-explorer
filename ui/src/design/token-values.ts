// Reads a token of DESIGN.md from the stylesheet, for the few places where script needs a value
// that a stylesheet cannot give it: a timer, a delay, the gap an overlay keeps from its control.
// The value stays in DESIGN.md; nothing here repeats it.
//
// A token is read once and remembered. Tokens are set on the root element and some differ by
// theme or by density, so what is remembered belongs to the theme and the density it was read
// under, and a change of either reads the token again.

const remembered = new Map<string, string>();

function read(name: string): string {
  const root = document.documentElement;
  const theme = root.getAttribute("data-theme") ?? "";
  const density = root.getAttribute("data-density") ?? "";
  const key = `${theme}/${density}/${name}`;
  const known = remembered.get(key);
  if (known !== undefined) return known;
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  // A token that is not there yet is not remembered: the stylesheet may still arrive.
  if (value !== "") remembered.set(key, value);
  return value;
}

/**
 * What to do with a token that cannot be used. In development that is a mistake to see at once:
 * without the token a component would quietly fall back to a value that is not in DESIGN.md. A
 * build that users run carries on instead, and the caller does without the value.
 */
function unusable(name: string, value: string, kind: string): null {
  if (!import.meta.env.DEV) return null;
  const found = value === "" ? "is not defined" : `is "${value}", which is not ${kind}`;
  throw new Error(
    `The token ${name} ${found}. ` +
      "Import ui/src/design/tokens.css before anything renders, and check the name against DESIGN.md.",
  );
}

/** A duration token in milliseconds. `null` only in a production build that cannot read it. */
export function durationToken(name: `--${string}`): number | null {
  const value = read(name);
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value);
  if (!match) return unusable(name, value, "a duration in ms or s");
  return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
}

/** A length token in pixels. `null` only in a production build that cannot read it. */
export function lengthToken(name: `--${string}`): number | null {
  const value = read(name);
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) return unusable(name, value, "a length in pixels");
  return Number(match[1]);
}

/** The two densities of DESIGN.md. */
export type Density = "comfortable" | "compact";

/** The density of the app: the `data-density` attribute of the root element, comfortable without it. */
export function rootDensity(): Density {
  return document.documentElement.getAttribute("data-density") === "compact"
    ? "compact"
    : "comfortable";
}

/**
 * A density token in pixels at one density, whatever the density of the app. A table may carry
 * a density of its own, and its layout is worked out in script, which needs the heights of that
 * density. The value is read from an element that carries the density for a moment, so it is
 * the value the stylesheet gives everything under `data-density`. `null` only in a production
 * build that cannot read it.
 */
export function densityToken(name: `--density-${string}`, density: Density): number | null {
  const key = `at ${density}/${name}`;
  let value = remembered.get(key);
  if (value === undefined) {
    const probe = document.createElement("div");
    probe.setAttribute("data-density", density);
    probe.hidden = true;
    document.documentElement.append(probe);
    value = getComputedStyle(probe).getPropertyValue(name).trim();
    probe.remove();
    if (value !== "") remembered.set(key, value);
  }
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) return unusable(name, value, "a length in pixels");
  return Number(match[1]);
}
