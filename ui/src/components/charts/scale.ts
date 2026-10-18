// The scales of the charts: which step of a ramp a value takes, and where an axis has its ticks.
// Both only place what a command returned; neither counts anything.

/** How many steps the sequential ramp of DESIGN.md has. */
export const RAMP_STEPS = 7;

/**
 * Which step of a ramp of `steps` steps a value takes, in a domain from 0 to `max`. The domain
 * is cut into equal parts, each with its upper bound: with seven steps and a `max` of 70, a value
 * of 10 takes step 1 and one of 11 step 2. A value of 0 or less takes no step (0): an empty cell
 * is not the lightest step. A value above `max`, or any value of a domain of 0, takes the last.
 */
export function step(value: number, max: number, steps: number): number {
  if (!(value > 0)) return 0;
  if (!(max > 0)) return steps;
  // Multiplied before it is divided, so whole numbers on a boundary stay whole.
  return Math.min(steps, Math.max(1, Math.ceil((value * steps) / max)));
}

/** The smallest clean step (1, 2, or 5 times a power of ten) that cuts `span` into at most `most` parts. */
function cleanStep(span: number, most: number): number {
  const rough = span / Math.max(1, most);
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const factor of [1, 2, 5, 10]) {
    const candidate = factor * power;
    if (Math.floor(span / candidate + 1e-9) <= most) return candidate;
  }
  return 10 * power;
}

/**
 * The values from `from` to `to` at which an axis has a tick: multiples of one clean step, at
 * most `most` of them past the first. A range with no length has its one value.
 */
export function ticks(from: number, to: number, most: number): number[] {
  const span = to - from;
  if (!(span > 0)) return [from];
  const size = cleanStep(span, most);
  const values: number[] = [];
  // Counted by index from the first multiple, so no error builds up from one tick to the next.
  const first = Math.ceil(from / size - 1e-9);
  for (let index = first; index * size <= to + size * 1e-9; index += 1) {
    // Adding 0 turns a -0 (the first multiple of a range from 0) into 0.
    values.push(Math.round(index * size * 1e9) / 1e9 + 0);
  }
  return values;
}
