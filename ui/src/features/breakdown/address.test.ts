import { describe, expect, it } from "vitest";
import {
  breakdownAddress,
  DEFAULT_BREAKDOWN_STATE,
  parseBreakdownAddress,
  type BreakdownState,
} from "./address";

const LIST = DEFAULT_BREAKDOWN_STATE;
const MATRIX: BreakdownState = { ...DEFAULT_BREAKDOWN_STATE, mode: "matrix" };

describe("the address of Breakdown", () => {
  it("is the list by discipline with no group open when it says nothing", () => {
    expect(parseBreakdownAddress("")).toEqual(DEFAULT_BREAKDOWN_STATE);
    expect(DEFAULT_BREAKDOWN_STATE).toEqual({
      mode: "list",
      by: "Discipline",
      open: [],
      rows: "Discipline",
      cols: "HoldType",
    });
  });

  it("writes the mode and the dimension, and the open groups when there are any", () => {
    expect(breakdownAddress(DEFAULT_BREAKDOWN_STATE)).toBe("/breakdown?mode=list&by=Discipline");
    expect(breakdownAddress({ ...LIST, by: "HoldType", open: ["Vendor data", "Client"] })).toBe(
      "/breakdown?mode=list&by=HoldType&open=Vendor%2520data%2CClient",
    );
  });

  it("reads back every state it writes, with keys that hold commas, spaces, and nothing", () => {
    const states: BreakdownState[] = [
      DEFAULT_BREAKDOWN_STATE,
      { ...LIST, by: { Custom: "Work pack" }, open: ["WP-501-3"] },
      { ...LIST, by: "Remark", open: ["hold for data, see a, b", "", "50% done"] },
      { ...LIST, by: "Blocker", open: [""] },
    ];
    for (const state of states) {
      expect(parseBreakdownAddress(breakdownAddress(state))).toEqual(state);
    }
  });

  it("keeps every other part of the address, the line in the panel among them", () => {
    const address = breakdownAddress(
      { ...LIST, by: "Role", open: [] },
      "?by=Discipline&open=Piping&line=78B01-573-04400-FW",
    );
    expect(address).toBe("/breakdown?mode=list&by=Role&line=78B01-573-04400-FW");
  });

  it("takes a part it cannot read for the default", () => {
    expect(parseBreakdownAddress("?mode=pie&by=LineId")).toEqual(DEFAULT_BREAKDOWN_STATE);
    expect(parseBreakdownAddress("?by=Custom%3A")).toEqual(DEFAULT_BREAKDOWN_STATE);
  });

  it("writes the matrix by its rows and columns", () => {
    expect(breakdownAddress(MATRIX)).toBe("/breakdown?mode=matrix&rows=Discipline&cols=HoldType");
    expect(breakdownAddress({ ...MATRIX, rows: "Role", cols: { Custom: "Area" } })).toBe(
      "/breakdown?mode=matrix&rows=Role&cols=Custom%3AArea",
    );
  });

  it("keeps the list's state while the matrix shows, and the matrix's while the list shows", () => {
    const both: BreakdownState = {
      mode: "matrix",
      by: "Blocker",
      open: ["Client"],
      rows: "Role",
      cols: "Discipline",
    };
    expect(breakdownAddress(both)).toBe(
      "/breakdown?mode=matrix&rows=Role&cols=Discipline&by=Blocker&open=Client",
    );
    expect(breakdownAddress({ ...both, mode: "list" })).toBe(
      "/breakdown?mode=list&by=Blocker&open=Client&rows=Role&cols=Discipline",
    );
    for (const state of [both, { ...both, mode: "list" as const }, MATRIX]) {
      expect(parseBreakdownAddress(breakdownAddress(state))).toEqual(state);
    }
  });

  it("never reads the same dimension for the rows and the columns", () => {
    expect(parseBreakdownAddress("?mode=matrix&rows=HoldType&cols=HoldType")).toEqual({
      ...MATRIX,
      rows: "HoldType",
      cols: "Discipline",
    });
    expect(parseBreakdownAddress("?mode=matrix&rows=Discipline&cols=Discipline")).toEqual(MATRIX);
    expect(parseBreakdownAddress("?mode=matrix&rows=LineId&cols=Role")).toEqual({
      ...MATRIX,
      cols: "Role",
    });
  });
});
