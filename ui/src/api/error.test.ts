import { describe, expect, it } from "vitest";
import { asCommandError } from "./error";

describe("asCommandError", () => {
  it("keeps a command error object", () => {
    expect(asCommandError({ kind: "NoWorkspace", message: "No workspace is open." })).toEqual({
      kind: "NoWorkspace",
      message: "No workspace is open.",
    });
  });

  it("keeps a failure of the interface's own kinds", () => {
    expect(asCommandError({ kind: "ViewUnsettled", message: "Try again." })).toEqual({
      kind: "ViewUnsettled",
      message: "Try again.",
    });
  });

  it("keeps the message of an object with an unknown kind, as an Internal error", () => {
    expect(asCommandError({ kind: "NoWorkspce", message: "No workspace is open." })).toEqual({
      kind: "Internal",
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
      expect(error.message).toMatch(/\. .+\./);
    }
  });
});
