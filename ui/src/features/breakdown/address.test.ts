import { describe, expect, it } from "vitest";
import {
  breakdownAddress,
  DEFAULT_BREAKDOWN_STATE,
  parseBreakdownAddress,
  type BreakdownState,
} from "./address";

describe("the address of Breakdown", () => {
  it("is the list by discipline with no group open when it says nothing", () => {
    expect(parseBreakdownAddress("")).toEqual(DEFAULT_BREAKDOWN_STATE);
    expect(DEFAULT_BREAKDOWN_STATE).toEqual({ mode: "list", by: "Discipline", open: [] });
  });

  it("writes the mode and the dimension, and the open groups when there are any", () => {
    expect(breakdownAddress(DEFAULT_BREAKDOWN_STATE)).toBe("/breakdown?mode=list&by=Discipline");
    expect(
      breakdownAddress({ mode: "list", by: "HoldType", open: ["Vendor data", "Client"] }),
    ).toBe("/breakdown?mode=list&by=HoldType&open=Vendor%2520data%2CClient");
  });

  it("reads back every state it writes, with keys that hold commas, spaces, and nothing", () => {
    const states: BreakdownState[] = [
      DEFAULT_BREAKDOWN_STATE,
      { mode: "list", by: { Custom: "Work pack" }, open: ["WP-501-3"] },
      { mode: "list", by: "Remark", open: ["hold for data, see a, b", "", "50% done"] },
      { mode: "list", by: "Blocker", open: [""] },
    ];
    for (const state of states) {
      expect(parseBreakdownAddress(breakdownAddress(state))).toEqual(state);
    }
  });

  it("keeps every other part of the address, the line in the panel among them", () => {
    const address = breakdownAddress(
      { mode: "list", by: "Role", open: [] },
      "?by=Discipline&open=Piping&line=78B01-573-04400-FW",
    );
    expect(address).toBe("/breakdown?mode=list&by=Role&line=78B01-573-04400-FW");
  });

  it("takes a part it cannot read for the default", () => {
    expect(parseBreakdownAddress("?mode=pie&by=LineId")).toEqual(DEFAULT_BREAKDOWN_STATE);
    expect(parseBreakdownAddress("?by=Custom%3A")).toEqual(DEFAULT_BREAKDOWN_STATE);
  });
});
