import { describe, expect, it } from "vitest";
import { asCommandError } from "./error";

describe("asCommandError", () => {
  it("keeps a command error object", () => {
    expect(asCommandError({ kind: "NoWorkspace", message: "No workspace is open." })).toEqual({
      kind: "NoWorkspace",
      message: "No workspace is open.",
    });
  });

  it("makes a string an Internal error with that text", () => {
    expect(asCommandError("it broke")).toEqual({ kind: "Internal", message: "it broke" });
  });

  it("makes an Error an Internal error with its message", () => {
    expect(asCommandError(new Error("it broke"))).toEqual({
      kind: "Internal",
      message: "it broke",
    });
  });

  it("makes anything else an Internal error", () => {
    for (const value of [undefined, null, 7, { kind: 3 }, { kind: "X" }]) {
      const error = asCommandError(value);
      expect(error.kind).toBe("Internal");
      expect(error.message.length).toBeGreaterThan(0);
    }
  });
});
