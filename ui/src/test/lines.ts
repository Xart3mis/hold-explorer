// Fixtures of the Lines destination: what the `lines` and `holds` commands answer for a snapshot.
import type { Hold } from "../bindings/Hold";
import type { HoldRef } from "../bindings/HoldRef";
import type { HoldsView } from "../bindings/HoldsView";
import type { LineDetail } from "../bindings/LineDetail";
import type { LinePage } from "../bindings/LinePage";
import type { LineRow } from "../bindings/LineRow";

/** One line of the snapshot: one open hold of Piping, unless the test says otherwise. */
export function lineRow(lineId: string, overrides: Partial<LineRow> = {}): LineRow {
  return {
    line_id: lineId,
    holds: 1,
    disciplines: ["Piping"],
    hold_types: ["Vendor data"],
    blockers: 1,
    oldest_age_days: 41,
    model_size: 6,
    ldt_size: 6,
    stress_calc: "Required",
    size_mismatch: false,
    ...overrides,
  };
}

/** The lines as the command numbers them in a page: `78B01-573-<n>`. */
export function lineId(index: number): string {
  return `78B01-573-${String(4400 + index).padStart(5, "0")}-FW`;
}

/**
 * A page of lines: `count` lines from `offset` (at most 200), of `total`. By default the three
 * lines of a small snapshot, the second with two holds and sizes that differ.
 */
export function linePage(
  options: { total?: number; offset?: number; count?: number } = {},
): LinePage {
  const total = options.total ?? 3;
  const offset = options.offset ?? 0;
  const count = options.count ?? Math.max(0, Math.min(200, total - offset));
  const rows = Array.from({ length: count }, (_, at) => {
    const index = offset + at;
    return index === 1
      ? lineRow(lineId(index), {
          holds: 2,
          disciplines: ["Piping", "Civil"],
          hold_types: ["Vendor data", "Client decision"],
          blockers: 2,
          oldest_age_days: 118,
          model_size: 8,
          ldt_size: 10,
          size_mismatch: true,
        })
      : lineRow(lineId(index));
  });
  return { total, widest_line_id: lineId(0).length, rows };
}

/** One hold as the export gives it, open, on a line of `linePage`. */
export function hold(overrides: Partial<Hold> = {}): Hold {
  return {
    source_id: 1001,
    line_id: lineId(0),
    name: "A. Haddad",
    role: "Lead engineer",
    remark: "HOLD FOR VENDOR DATA OF PACKAGE UNIT 577-PK-400",
    hold_type: "Vendor data",
    discipline: "Piping",
    created: "2026-08-27T00:00:00",
    released: false,
    release_remark: "",
    release_date: null,
    model_size: 6,
    ldt_size: 6,
    stress_calc: "Required",
    extra: {},
    ...overrides,
  };
}

/** A hold at its position in the snapshot, with what is derived from it. */
export function holdRef(position: number, overrides: Partial<Hold> = {}): HoldRef {
  const held = hold(overrides);
  return {
    position,
    row: {
      hold: held,
      blocker: { kind: "PK", item: "577-PK-400" },
      remark_key: held.remark.toLowerCase(),
      age_days: held.released ? null : 41,
      duration_days: held.released ? 23 : null,
    },
  };
}

/**
 * A page of holds: `count` holds from `offset` (at most 200), of `total`, at the positions of
 * their order. By default the three holds of a small snapshot, the last one released.
 */
export function holdsView(
  options: { total?: number; offset?: number; count?: number } = {},
): HoldsView {
  const total = options.total ?? 3;
  const offset = options.offset ?? 0;
  const count = options.count ?? Math.max(0, Math.min(200, total - offset));
  const rows = Array.from({ length: count }, (_, at) => {
    const position = offset + at;
    return holdRef(position, {
      line_id: lineId(position % 3),
      source_id: 1001 + position,
      ...(position === 2
        ? { released: true, release_date: "2026-09-19T00:00:00", release_remark: "Data received" }
        : {}),
    });
  });
  return { total, widest_line_id: lineId(0).length, rows };
}

/**
 * What `line_detail` answers for a line of `linePage`: two open holds on two blockers, the first
 * at step 3 of the solve order and the second in none, one released hold, and sizes that differ.
 */
export function lineDetail(
  id: string = lineId(0),
  overrides: Partial<LineDetail> = {},
): LineDetail {
  return {
    line_id: id,
    model_size: 8,
    ldt_size: 10,
    stress_calc: "Required",
    size_mismatch: true,
    open: [
      holdRef(0, { line_id: id }),
      holdRef(3, {
        line_id: id,
        discipline: "Civil",
        hold_type: "Client decision",
        name: "M. Okafor",
        role: "Designer",
        remark: "HOLD UNTIL CLIENT CONFIRMS THE ROUTING NEAR THE PIPE RACK",
        created: "2026-06-11T00:00:00",
      }),
    ],
    released: [
      holdRef(5, {
        line_id: id,
        released: true,
        release_date: "2026-09-19T00:00:00",
        release_remark: "Data received",
        remark: "HOLD FOR STRESS CALCULATION",
      }),
    ],
    chain: [
      { key: "Piping|577-PK-400", label: "Piping / 577-PK-400", kind: "PK", step: 3, lines: 12 },
      {
        key: "Civil|Client decision",
        label: "Civil / Client decision",
        kind: "Other",
        step: null,
        lines: 1,
      },
    ],
    ...overrides,
  };
}
