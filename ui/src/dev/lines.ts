// What the development page answers for the `lines`, `holds`, `breakdown`, and `group_detail` commands: holds made up by a
// seeded generator, the same at every start, filtered, grouped into lines, sorted, and cut into
// pages as the commands do it, closely enough to see the Lines destination work. For development
// only; see ui/src/dev/app.tsx.
import type { Dim } from "../bindings/Dim";
import type { FilterSpec } from "../bindings/FilterSpec";
import type { Group } from "../bindings/Group";
import type { GroupDetail } from "../bindings/GroupDetail";
import type { HoldQuery } from "../bindings/HoldQuery";
import type { HoldRef } from "../bindings/HoldRef";
import type { ChainLink } from "../bindings/ChainLink";
import type { HoldsView } from "../bindings/HoldsView";
import type { LineDetail } from "../bindings/LineDetail";
import type { LinePage } from "../bindings/LinePage";
import type { LineQuery } from "../bindings/LineQuery";
import type { LineRow } from "../bindings/LineRow";
import type { SnapshotInfo } from "../bindings/SnapshotInfo";
import { DISCIPLINES, HOLD_TYPES } from "./overview";

/** How many rows a command answers at most. */
const PAGE = 200;

/** A small generator of numbers from a seed: the same seed gives the same holds. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** One of the values, those with more holds on the Overview more often. */
function weightedPick(random: () => number, rows: readonly (readonly [string, number, number])[]) {
  const total = rows.reduce((sum, [, weight]) => sum + weight, 0);
  let left = random() * total;
  for (const [label, weight] of rows) {
    left -= weight;
    if (left < 0) return label;
  }
  return rows[0]?.[0] ?? "";
}

function pick<T>(random: () => number, items: readonly T[], otherwise: T): T {
  return items[Math.floor(random() * items.length)] ?? otherwise;
}

const NAMES = ["A. Haddad", "M. Okafor", "S. Lindqvist", "R. Tanaka", "J. Moreau", "—"];
const ROLES = ["Lead engineer", "Designer", "Checker", "Package engineer", "—"];
const STRESS = ["Required", "Not required", "Done", ""];
const SIZES = [0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24];
const SERVICES = ["FW", "CW", "PR", "PL", "ST", "NG", "IA"];
const AREAS = ["North rack", "South rack", "Pump house", "Tank farm", ""];

/** What a remark can say, with the blocker the rules would derive from it. */
const REMARKS: readonly ((unit: number, item: number) => [string, string, string])[] = [
  (unit, item) => [
    `HOLD FOR VENDOR DATA OF PACKAGE UNIT ${String(unit)}-PK-${String(item)}`,
    "PK",
    `${String(unit)}-PK-${String(item)}`,
  ],
  (unit, item) => [
    `HOLD PENDING ${String(unit)}-PR-${String(item)}`,
    "PR",
    `${String(unit)}-PR-${String(item)}`,
  ],
  (unit, item) => [
    `TIE-IN ${String(unit)}-TIE-${String(item % 90)} TO BE CONFIRMED`,
    "TIE-IN",
    `${String(unit)}-TIE-${String(item % 90)}`,
  ],
  () => ["AWAITING STRESS CALCULATION", "Stress", "Stress"],
  () => ["CLIENT TO DECIDE ON ROUTING", "Client", "Client"],
  () => ["Remark to be clarified", "Other", "Other"],
];

const REMARKS_FIRST = (): [string, string, string] => ["Remark to be clarified", "Other", "Other"];

/** Days since 1 January 1970 of a wall-clock date, and back. */
const DAY = 86_400_000;
function daysOf(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY);
}
function dateOf(days: number): string {
  return `${new Date(days * DAY).toISOString().slice(0, 10)}T00:00:00`;
}

/**
 * The holds of a snapshot: as many as it says it has, open as many as it says are open, on lines
 * of one to a dozen holds. A limited snapshot has no hold ID and nothing released. `matchingSizes`
 * gives every line the same model and LDT size, so the preset of differing sizes finds nothing.
 */
function generate(snapshot: SnapshotInfo, matchingSizes: boolean): readonly HoldRef[] {
  const random = seeded(snapshot.id * 7919 + snapshot.row_count);
  const taken = daysOf(snapshot.taken_at);
  const released = snapshot.limited ? 0 : snapshot.row_count - snapshot.open_count;
  const holds: HoldRef[] = [];
  let line = 0;
  while (holds.length < snapshot.row_count) {
    // Most lines have a hold or two; a few have many.
    const count =
      random() < 0.55
        ? 1
        : random() < 0.7
          ? 2 + Math.floor(random() * 3)
          : 5 + Math.floor(random() * 8);
    const unit = 500 + (line % 97);
    const service = pick(random, SERVICES, "FW");
    const lineId = `78B${String((line % 12) + 1).padStart(2, "0")}-${String(unit)}-${String(line + 1).padStart(5, "0")}-${service}-${String((line % 9) + 1).padStart(3, "0")}`;
    const model = pick(random, SIZES, 6);
    const ldt = matchingSizes || random() > 0.06 ? model : pick(random, SIZES, 6);
    const stress = pick(random, STRESS, "");
    const firstDiscipline = weightedPick(random, DISCIPLINES);
    for (let index = 0; index < count && holds.length < snapshot.row_count; index += 1) {
      const position = holds.length;
      const discipline =
        index === 0 || random() < 0.6 ? firstDiscipline : weightedPick(random, DISCIPLINES);
      const [remark, kind, item] = pick(
        random,
        REMARKS,
        REMARKS_FIRST,
      )(unit, 1000 + Math.floor(random() * 900));
      const created = random() < 0.03 ? null : taken - 1 - Math.floor(random() * 320);
      // The released holds are spread through the file, as an export has them.
      const isReleased = released > 0 && (position * 7919) % snapshot.row_count < released;
      const releasedOn =
        isReleased && created !== null
          ? Math.min(taken - 1, created + 1 + Math.floor(random() * 90))
          : null;
      holds.push({
        position,
        row: {
          hold: {
            source_id: snapshot.limited ? null : 100_000 + position,
            line_id: lineId,
            name: pick(random, NAMES, "—"),
            role: pick(random, ROLES, "—"),
            remark,
            hold_type: weightedPick(random, HOLD_TYPES),
            discipline,
            created: created === null ? null : dateOf(created),
            released: isReleased,
            release_remark: isReleased ? "Data received" : "",
            release_date: releasedOn === null ? null : dateOf(releasedOn),
            model_size: model,
            ldt_size: ldt,
            stress_calc: stress,
            // Two columns the mapping did not know: one most holds fill, one few do. The filter
            // bar of the states of Lines and of the panel offers both (see commands.ts).
            extra: {
              Area: pick(random, AREAS, ""),
              "Work pack": random() < 0.2 ? `WP-${String(unit)}-${String(1 + (line % 40))}` : "",
            },
          },
          blocker: { kind, item },
          remark_key: remark.toLowerCase(),
          age_days: !isReleased && created !== null ? taken - created : null,
          duration_days: releasedOn !== null && created !== null ? releasedOn - created : null,
        },
      });
    }
    line += 1;
  }
  return holds;
}

const generated = new Map<string, readonly HoldRef[]>();

function holdsOf(snapshot: SnapshotInfo, matchingSizes: boolean): readonly HoldRef[] {
  const key = `${String(snapshot.id)}:${String(snapshot.row_count)}:${String(matchingSizes)}`;
  let held = generated.get(key);
  if (held === undefined) {
    held = generate(snapshot, matchingSizes);
    generated.set(key, held);
  }
  return held;
}

/** The value of a hold for a dimension, as the filter compares it. */
function valueOf({ row }: HoldRef, dim: Dim): string {
  if (typeof dim !== "string") return row.hold.extra[dim.Custom] ?? "";
  switch (dim) {
    case "Discipline":
      return row.hold.discipline === "Unspecified" ? "" : row.hold.discipline;
    case "HoldType":
      return row.hold.hold_type;
    case "Role":
      return row.hold.role;
    case "Name":
      return row.hold.name;
    case "BlockerType":
      return row.blocker.kind;
    case "Blocker":
      return row.blocker.item;
    case "Remark":
      return row.hold.remark;
    case "LineId":
      return row.hold.line_id;
    case "ModelSize":
      return row.hold.model_size === null ? "" : `${String(row.hold.model_size)}"`;
    case "StressCalc":
      return row.hold.stress_calc;
  }
}

function inRange(date: string | null, range: { from: string | null; to: string | null }) {
  if (range.from === null && range.to === null) return true;
  if (date === null) return false;
  const day = date.slice(0, 10);
  return (
    (range.from === null || day >= range.from.slice(0, 10)) &&
    (range.to === null || day <= range.to.slice(0, 10))
  );
}

/** Whether a filter keeps a hold, part by part, as the core decides it. */
function keeps(spec: FilterSpec, held: HoldRef): boolean {
  const { hold } = held.row;
  if (spec.status === "Open" && hold.released) return false;
  if (spec.status === "Released" && !hold.released) return false;
  for (const field of spec.fields) {
    if (field.values.length === 0) continue;
    const has = field.values.includes(valueOf(held, field.dim));
    if (has === field.negate) return false;
  }
  if (spec.text !== "") {
    const needle = spec.text.toLowerCase();
    const haystack = [
      hold.line_id,
      hold.remark,
      hold.name,
      hold.hold_type,
      hold.discipline,
      held.row.blocker.item,
    ];
    if (!haystack.some((value) => value.toLowerCase().includes(needle))) return false;
  }
  if (spec.age_bands.length > 0) {
    const days = hold.released ? held.row.duration_days : held.row.age_days;
    if (days === null) return false;
    const inBand = spec.age_bands.some(
      (band) =>
        (band.min_days === null || days >= band.min_days) &&
        (band.max_days === null || days <= band.max_days),
    );
    if (!inBand) return false;
  }
  if (!inRange(hold.created, spec.created)) return false;
  if (!inRange(hold.release_date, spec.released)) return false;
  if (spec.size_mismatch !== null) {
    const differ =
      hold.model_size !== null && hold.ldt_size !== null && hold.model_size !== hold.ldt_size;
    if (differ !== spec.size_mismatch) return false;
  }
  return true;
}

/**
 * Sorts by a key, ties in the order they had. Rows without the key come last in both directions;
 * `reverse` turns the others round, as the core does it.
 */
function orderBy<Row, Key extends number | string>(
  rows: Row[],
  key: (row: Row) => Key | null,
  compare: (a: Key, b: Key) => number,
  reverse: boolean,
  tie: (a: Row, b: Row) => number,
): Row[] {
  const keyed = rows.map((row) => ({ row, key: key(row) }));
  keyed.sort((a, b) => {
    if (a.key === null || b.key === null) {
      return a.key === null ? (b.key === null ? tie(a.row, b.row) : 1) : -1;
    }
    const order = compare(a.key, b.key);
    return order !== 0 ? (reverse ? -order : order) : tie(a.row, b.row);
  });
  return keyed.map(({ row }) => row);
}

const ascending = <Key extends number | string>(a: Key, b: Key) => (a < b ? -1 : a > b ? 1 : 0);
const descending = <Key extends number | string>(a: Key, b: Key) => ascending(b, a);

/** The last few results, so that the next page of a result is cut from what was worked out. */
const results = new Map<string, unknown>();

function remembered<Result>(key: string, work: () => Result): Result {
  const held = results.get(key) as Result | undefined;
  if (held !== undefined) return held;
  const result = work();
  results.set(key, result);
  if (results.size > 8) {
    const [oldest] = results.keys();
    if (oldest !== undefined) results.delete(oldest);
  }
  return result;
}

function kept(snapshot: SnapshotInfo, spec: FilterSpec, matchingSizes: boolean): HoldRef[] {
  return remembered(
    `kept:${String(snapshot.id)}:${String(matchingSizes)}:${JSON.stringify(spec)}`,
    () => holdsOf(snapshot, matchingSizes).filter((held) => keeps(spec, held)),
  );
}

/**
 * How many holds of a snapshot a filter keeps on the development page, counted from the same
 * holds the lines and the holds are read from.
 */
export function devHoldCount(snapshot: SnapshotInfo, spec: FilterSpec, matchingSizes = false) {
  return kept(snapshot, spec, matchingSizes).length;
}

const widest = (ids: readonly string[]) => ids.reduce((most, id) => Math.max(most, id.length), 0);

/** What `holds` answers on the development page. */
export function devHolds(
  snapshot: SnapshotInfo,
  spec: FilterSpec,
  query: HoldQuery,
  matchingSizes = false,
): HoldsView {
  const sorted = remembered(
    `holds:${String(snapshot.id)}:${String(matchingSizes)}:${JSON.stringify(spec)}:${query.sort}:${String(query.reverse)}`,
    () => {
      const rows = [...kept(snapshot, spec, matchingSizes)];
      const text = (value: string, blank: string) => (value === blank ? null : value.toLowerCase());
      const file = (a: HoldRef, b: HoldRef) => a.position - b.position;
      const { reverse } = query;
      switch (query.sort) {
        case "FileOrder":
          return reverse ? rows.reverse() : rows;
        case "OldestFirst":
          return orderBy(
            rows,
            ({ row }) => (row.hold.released ? row.duration_days : row.age_days),
            descending,
            reverse,
            file,
          );
        case "LineId":
          return orderBy(rows, ({ row }) => row.hold.line_id, ascending, reverse, file);
        case "Discipline":
          return orderBy(
            rows,
            ({ row }) => text(row.hold.discipline, "Unspecified"),
            ascending,
            reverse,
            file,
          );
        case "HoldType":
          return orderBy(
            rows,
            ({ row }) => text(row.hold.hold_type, "—"),
            ascending,
            reverse,
            file,
          );
        case "Blocker":
          return orderBy(
            rows,
            ({ row }) =>
              `${row.hold.discipline.toLowerCase()}\u0000${row.blocker.item.toLowerCase()}`,
            ascending,
            reverse,
            file,
          );
        case "Name":
          return orderBy(rows, ({ row }) => text(row.hold.name, "—"), ascending, reverse, file);
      }
    },
  );
  const limit = query.limit ?? sorted.length;
  return {
    total: sorted.length,
    widest_line_id: widest(sorted.map(({ row }) => row.hold.line_id)),
    rows: sorted.slice(query.offset, query.offset + Math.min(limit, PAGE)),
  };
}

/** The lines of the holds a filter keeps, in order of first appearance, as the core groups them. */
function linesOf(holds: readonly HoldRef[]): LineRow[] {
  const byLine = new Map<string, { line: LineRow; blockers: Set<string> }>();
  for (const { row } of holds) {
    const { hold } = row;
    let entry = byLine.get(hold.line_id);
    if (entry === undefined) {
      entry = {
        line: {
          line_id: hold.line_id,
          holds: 0,
          disciplines: [],
          hold_types: [],
          blockers: 0,
          oldest_age_days: null,
          model_size: hold.model_size,
          ldt_size: hold.ldt_size,
          stress_calc: hold.stress_calc,
          size_mismatch:
            hold.model_size !== null && hold.ldt_size !== null && hold.model_size !== hold.ldt_size,
        },
        blockers: new Set(),
      };
      byLine.set(hold.line_id, entry);
    }
    const { line, blockers } = entry;
    line.holds += 1;
    if (!line.disciplines.includes(hold.discipline)) line.disciplines.push(hold.discipline);
    if (!line.hold_types.includes(hold.hold_type)) line.hold_types.push(hold.hold_type);
    blockers.add(`${hold.discipline}\u0000${row.blocker.item}`);
    line.blockers = blockers.size;
    if (row.age_days !== null) {
      line.oldest_age_days = Math.max(line.oldest_age_days ?? 0, row.age_days);
    }
  }
  return [...byLine.values()].map(({ line }) => line);
}

/** What `lines` answers on the development page. */
export function devLines(
  snapshot: SnapshotInfo,
  spec: FilterSpec,
  query: LineQuery,
  offset: number,
  matchingSizes = false,
): LinePage {
  const sorted = remembered(
    `lines:${String(snapshot.id)}:${String(matchingSizes)}:${JSON.stringify(spec)}:${JSON.stringify(query)}`,
    () => {
      const rows = linesOf(kept(snapshot, spec, matchingSizes)).filter(
        (line) =>
          (!query.single_hold_only || line.holds === 1) &&
          (!query.size_mismatch_only || line.size_mismatch),
      );
      const byId = (a: LineRow, b: LineRow) => ascending(a.line_id, b.line_id);
      const { reverse } = query;
      switch (query.sort) {
        case "HoldsDesc":
          return orderBy(rows, (line) => line.holds, descending, reverse, byId);
        case "Easiest":
          return orderBy(
            rows,
            (line) =>
              `${String(line.disciplines.length).padStart(3, "0")}:${String(line.holds).padStart(5, "0")}:${line.disciplines[0] ?? ""}`,
            ascending,
            reverse,
            byId,
          );
        case "OldestFirst":
          return orderBy(rows, (line) => line.oldest_age_days, descending, reverse, byId);
        case "LineId":
          return orderBy(rows, (line) => line.line_id, ascending, reverse, byId);
        case "Blockers":
          return orderBy(rows, (line) => line.blockers, descending, reverse, byId);
        case "Disciplines":
          return orderBy(rows, (line) => line.disciplines.length, descending, reverse, byId);
        case "ModelSize":
          return orderBy(rows, (line) => line.model_size, descending, reverse, byId);
        case "LdtSize":
          return orderBy(rows, (line) => line.ldt_size, descending, reverse, byId);
        case "StressCalc":
          return orderBy(
            rows,
            (line) => (line.stress_calc === "" ? null : line.stress_calc.toLowerCase()),
            ascending,
            reverse,
            byId,
          );
      }
    },
  );
  return {
    total: sorted.length,
    widest_line_id: widest(sorted.map((line) => line.line_id)),
    rows: sorted.slice(offset, offset + PAGE),
  };
}

/** How many blockers of a snapshot the made-up solve plan gives a step. */
const PLAN_STEPS = 40;

/**
 * The blockers of the open holds of a snapshot, with the lines each is on and its step: the
 * blockers on the most lines get the first steps, as a plan that frees the most lines first
 * would give them, and the rest have none.
 */
function blockersOf(snapshot: SnapshotInfo, matchingSizes: boolean) {
  return remembered(`blockers:${String(snapshot.id)}:${String(matchingSizes)}`, () => {
    const lines = new Map<string, Set<string>>();
    for (const { row } of holdsOf(snapshot, matchingSizes)) {
      if (row.hold.released) continue;
      const key = `${row.hold.discipline}|${row.blocker.item}`;
      const on = lines.get(key) ?? new Set<string>();
      on.add(row.hold.line_id);
      lines.set(key, on);
    }
    const ranked = [...lines.entries()]
      .filter(([key]) => !key.endsWith("|Other"))
      .sort(([a, one], [b, other]) => other.size - one.size || ascending(a, b))
      .slice(0, PLAN_STEPS);
    const steps = new Map(ranked.map(([key], index) => [key, index + 1]));
    return { lines, steps };
  });
}

/** What `line_detail` answers on the development page: `null` for a line without holds. */
export function devLineDetail(
  snapshot: SnapshotInfo,
  lineId: string,
  matchingSizes = false,
): LineDetail | null {
  const holds = holdsOf(snapshot, matchingSizes).filter(({ row }) => row.hold.line_id === lineId);
  const open = holds.filter(({ row }) => !row.hold.released);
  const first = open[0] ?? holds[0];
  if (first === undefined) return null;
  const { lines, steps } = blockersOf(snapshot, matchingSizes);
  const chain: ChainLink[] = [];
  for (const { row } of open) {
    const key = `${row.hold.discipline}|${row.blocker.item}`;
    if (chain.some((link) => link.key === key)) continue;
    chain.push({
      key,
      label: `${row.hold.discipline} / ${row.blocker.item}`,
      kind: row.blocker.kind,
      step: steps.get(key) ?? null,
      lines: lines.get(key)?.size ?? 1,
    });
  }
  // Those with a step first, by step; the others after, in order of first appearance.
  const stepped = chain
    .filter((link) => link.step !== null)
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  const { hold } = first.row;
  return {
    line_id: lineId,
    model_size: hold.model_size,
    ldt_size: hold.ldt_size,
    stress_calc: hold.stress_calc,
    size_mismatch:
      hold.model_size !== null && hold.ldt_size !== null && hold.model_size !== hold.ldt_size,
    open,
    released: holds.filter(({ row }) => row.hold.released),
    chain: [...stepped, ...chain.filter((link) => link.step === null)],
  };
}

/** What `hold_detail` answers on the development page: `null` past the end of the snapshot. */
export function devHoldDetail(
  snapshot: SnapshotInfo,
  position: number,
  matchingSizes = false,
): HoldRef | null {
  return holdsOf(snapshot, matchingSizes)[position] ?? null;
}

/** The groups of a dimension among the holds a filter keeps, most holds first, as the core counts them. */
function groupsOf(
  snapshot: SnapshotInfo,
  spec: FilterSpec,
  dim: Dim,
  matchingSizes: boolean,
): { group: Group; holds: HoldRef[] }[] {
  return remembered(
    `groups:${String(snapshot.id)}:${String(matchingSizes)}:${JSON.stringify(spec)}:${JSON.stringify(dim)}`,
    () => {
      const byKey = new Map<string, { group: Group; holds: HoldRef[]; lines: Set<string> }>();
      for (const held of kept(snapshot, spec, matchingSizes)) {
        const key = valueOf(held, dim);
        let entry = byKey.get(key);
        if (entry === undefined) {
          const label = key === "" ? "(blank)" : dim === "Remark" ? held.row.hold.remark : key;
          entry = { group: { key, label, holds: 0, lines: 0 }, holds: [], lines: new Set() };
          byKey.set(key, entry);
        }
        entry.holds.push(held);
        entry.lines.add(held.row.hold.line_id);
        entry.group.holds += 1;
        entry.group.lines = entry.lines.size;
      }
      return [...byKey.values()]
        .sort((a, b) => b.group.holds - a.group.holds || ascending(a.group.label, b.group.label))
        .map(({ group, holds }) => ({ group, holds }));
    },
  );
}

/** What `breakdown` answers on the development page, at most `limit` groups of it. */
export function devBreakdown(
  snapshot: SnapshotInfo,
  spec: FilterSpec,
  dim: Dim,
  matchingSizes = false,
  limit = Number.POSITIVE_INFINITY,
): Group[] {
  return groupsOf(snapshot, spec, dim, matchingSizes)
    .slice(0, limit)
    .map(({ group }) => group);
}

/**
 * What `group_detail` answers on the development page: the group and its first lines, most holds
 * first, with how many there are; `null` for a group the filter does not keep.
 */
export function devGroupDetail(
  snapshot: SnapshotInfo,
  spec: FilterSpec,
  dim: Dim,
  key: string,
  matchingSizes = false,
): GroupDetail | null {
  const found = groupsOf(snapshot, spec, dim, matchingSizes).find(({ group }) => group.key === key);
  if (found === undefined) return null;
  const lines = orderBy(
    linesOf(found.holds),
    (line) => line.holds,
    descending,
    false,
    (a, b) => ascending(a.line_id, b.line_id),
  );
  return {
    group: found.group,
    lines: {
      total: lines.length,
      widest_line_id: widest(lines.map((line) => line.line_id)),
      rows: lines.slice(0, PAGE),
    },
  };
}
