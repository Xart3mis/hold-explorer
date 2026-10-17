import { describe, expect, it } from "vitest";
import type { HoldSort } from "../../bindings/HoldSort";
import type { LineSort } from "../../bindings/LineSort";
import {
  DEFAULT_LINES_STATE,
  linesAddress,
  parseLinesAddress,
  selectionOf,
  withSelection,
  type LinesState,
} from "./address";

const LINE_SORTS: LineSort[] = [
  "HoldsDesc",
  "Easiest",
  "OldestFirst",
  "LineId",
  "Blockers",
  "Disciplines",
  "ModelSize",
  "LdtSize",
  "StressCalc",
];
const HOLD_SORTS: HoldSort[] = [
  "FileOrder",
  "OldestFirst",
  "LineId",
  "Discipline",
  "HoldType",
  "Blocker",
  "Name",
];

/** Every state the page can be in. */
function everyState(): LinesState[] {
  const states: LinesState[] = [];
  for (const sort of LINE_SORTS) {
    for (const reverse of [false, true]) {
      for (const single of [false, true]) {
        for (const mismatch of [false, true]) {
          states.push({
            rows: "lines",
            query: { sort, reverse, single_hold_only: single, size_mismatch_only: mismatch },
          });
        }
      }
    }
  }
  for (const sort of HOLD_SORTS) {
    for (const reverse of [false, true]) states.push({ rows: "holds", sort, reverse });
  }
  return states;
}

/** The search part of an address. */
const searchOf = (address: string) => new URL(address, "http://hold.explorer").search;

describe("the address of Lines", () => {
  it("is the destination alone for the default: lines, with the All preset", () => {
    expect(DEFAULT_LINES_STATE).toEqual({
      rows: "lines",
      query: {
        sort: "HoldsDesc",
        reverse: false,
        single_hold_only: false,
        size_mismatch_only: false,
      },
    });
    expect(linesAddress(DEFAULT_LINES_STATE)).toBe("/lines");
    expect(parseLinesAddress("")).toEqual(DEFAULT_LINES_STATE);
    expect(parseLinesAddress("?")).toEqual(DEFAULT_LINES_STATE);
  });

  it("writes each part it holds", () => {
    expect(
      linesAddress({
        rows: "lines",
        query: {
          sort: "OldestFirst",
          reverse: true,
          single_hold_only: true,
          size_mismatch_only: true,
        },
      }),
    ).toBe("/lines?sort=OldestFirst&reverse=1&single=1&mismatch=1");
    expect(linesAddress({ rows: "holds", sort: "Name", reverse: true })).toBe(
      "/lines?rows=holds&sort=Name&reverse=1",
    );
    expect(linesAddress({ rows: "holds", sort: "FileOrder", reverse: false })).toBe(
      "/lines?rows=holds",
    );
  });

  it("reads back every state it writes, and writes back every address it reads", () => {
    for (const state of everyState()) {
      const address = linesAddress(state);
      expect(parseLinesAddress(searchOf(address))).toEqual(state);
      expect(linesAddress(parseLinesAddress(searchOf(address)))).toBe(address);
    }
  });

  it("keeps the other parts of the address it writes into, and writes over its own", () => {
    const state: LinesState = { rows: "holds", sort: "Blocker", reverse: false };
    expect(linesAddress(state, "?hold=17&sort=LineId&single=1&view=3")).toBe(
      "/lines?rows=holds&sort=Blocker&hold=17&view=3",
    );
    expect(linesAddress(DEFAULT_LINES_STATE, "?line=78B01-573&rows=holds&reverse=1")).toBe(
      "/lines?line=78B01-573",
    );
  });

  it("falls back to the default of each part it cannot read, without an error", () => {
    expect(parseLinesAddress("?rows=pipes")).toEqual(DEFAULT_LINES_STATE);
    expect(parseLinesAddress("?sort=Largest&reverse=yes&single=true&mismatch=0")).toEqual(
      DEFAULT_LINES_STATE,
    );
    expect(parseLinesAddress("?rows=holds&sort=HoldsDesc&reverse=2")).toEqual({
      rows: "holds",
      sort: "FileOrder",
      reverse: false,
    });
    // A sort of the other mode is not this mode's.
    expect(parseLinesAddress("?sort=FileOrder")).toEqual(DEFAULT_LINES_STATE);
    expect(parseLinesAddress("?rows=holds&sort=Easiest")).toMatchObject({ sort: "FileOrder" });
    // Parts of the lines mean nothing to the holds.
    expect(parseLinesAddress("?rows=holds&single=1&mismatch=1")).toEqual({
      rows: "holds",
      sort: "FileOrder",
      reverse: false,
    });
    expect(parseLinesAddress("?%E0%A4%A=&&=&sort")).toEqual(DEFAULT_LINES_STATE);
    // Keys are written in lower case; another spelling is another key.
    expect(parseLinesAddress("?ROWS=holds")).toEqual(DEFAULT_LINES_STATE);
  });

  it("selects a line or a hold, by the mode, and keeps the rest of the address", () => {
    expect(selectionOf("?line=78B01-573-4434", "lines")).toBe("78B01-573-4434");
    expect(selectionOf("?line=78B01-573-4434", "holds")).toBeNull();
    expect(selectionOf("?rows=holds&hold=17", "holds")).toBe("17");
    expect(selectionOf("?rows=holds&hold=17", "lines")).toBeNull();
    expect(selectionOf("?rows=holds&hold=seventeen", "holds")).toBeNull();
    expect(selectionOf("?rows=holds&hold=-1", "holds")).toBeNull();
    expect(selectionOf("?line=", "lines")).toBeNull();

    expect(withSelection("?sort=LineId&reverse=1", "lines", "78B01 573/A")).toBe(
      "?sort=LineId&reverse=1&line=78B01+573%2FA",
    );
    expect(withSelection("?rows=holds&line=78B01&hold=3", "holds", "17")).toBe(
      "?rows=holds&hold=17",
    );
    expect(withSelection("?rows=holds&hold=17", "lines", "78B01")).toBe("?rows=holds&line=78B01");
    expect(selectionOf(withSelection("", "lines", "78B01 573/A"), "lines")).toBe("78B01 573/A");
  });
});
