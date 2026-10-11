// Reads a token of DESIGN.md from the stylesheet, for the few places where script needs a value
// that a stylesheet cannot give it: a timer, a delay, the gap an overlay keeps from its control.
// The value stays in DESIGN.md; nothing here repeats it.

function read(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A duration token in milliseconds, or `null` while the token stylesheet is not loaded. */
export function durationToken(name: `--${string}`): number | null {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(read(name));
  if (!match) return null;
  return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
}

/** A length token in pixels, or `null` while the token stylesheet is not loaded. */
export function lengthToken(name: `--${string}`): number | null {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(read(name));
  return match ? Number(match[1]) : null;
}
