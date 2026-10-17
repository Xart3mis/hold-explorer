// The presets of the Lines destination: the questions asked of the lines most often, each as the
// query that answers it.
import type { Field } from "../../bindings/Field";
import type { LineQuery } from "../../bindings/LineQuery";
import type { MessageKey } from "../../text/i18n";

export type PresetId = "all" | "single" | "easiest" | "oldest" | "mismatch";

export interface Preset {
  id: PresetId;
  /** Its name in the text catalog. */
  label: MessageKey;
  query: LineQuery;
}

const ALL: LineQuery = {
  sort: "HoldsDesc",
  single_hold_only: false,
  size_mismatch_only: false,
  reverse: false,
};

/** The five presets, in the order of the row. */
export const PRESETS: readonly Preset[] = [
  { id: "all", label: "lines.presets.all", query: ALL },
  { id: "single", label: "lines.presets.single", query: { ...ALL, single_hold_only: true } },
  { id: "easiest", label: "lines.presets.easiest", query: { ...ALL, sort: "Easiest" } },
  { id: "oldest", label: "lines.presets.oldest", query: { ...ALL, sort: "OldestFirst" } },
  { id: "mismatch", label: "lines.presets.mismatch", query: { ...ALL, size_mismatch_only: true } },
];

/** The fields a line needs to be told to have sizes that differ. */
const SIZES: readonly Field[] = ["ModelSize", "LdtSize"];

/** The query of a preset. */
export function presetQuery(id: PresetId): LineQuery {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  return { ...(preset?.query ?? ALL) };
}

function isSame(one: LineQuery, other: LineQuery): boolean {
  return (
    one.sort === other.sort &&
    one.reverse === other.reverse &&
    one.single_hold_only === other.single_hold_only &&
    one.size_mismatch_only === other.size_mismatch_only
  );
}

/** The preset a query is; `null` for any other query, such as one sorted by a header. */
export function presetOf(query: LineQuery): PresetId | null {
  return PRESETS.find((preset) => isSame(preset.query, query))?.id ?? null;
}

/** The presets the snapshot can answer: Size mismatch needs both sizes. */
export function presetsFor(absent: readonly Field[]): readonly Preset[] {
  const lacksSizes = SIZES.some((field) => absent.includes(field));
  return lacksSizes ? PRESETS.filter((preset) => preset.id !== "mismatch") : PRESETS;
}

/**
 * The preset whose condition keeps lines out of a query, whatever it is sorted by: Single hold or
 * Size mismatch. `null` when the query keeps every line the filters keep.
 */
export function narrowingPreset(query: LineQuery): PresetId | null {
  if (query.single_hold_only) return "single";
  if (query.size_mismatch_only) return "mismatch";
  return null;
}
