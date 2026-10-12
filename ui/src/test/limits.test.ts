import { getConfig } from "@testing-library/react";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { testLimits } from "./limits";
import { SLOW } from "./slow";

describe("the time a test is given", () => {
  it("is five seconds on a development machine, twenty with the slow allowance", () => {
    expect(testLimits({})).toEqual({ wait: 3000, test: 5000, slow: 20_000 });
    // A variable that is there and empty is not set.
    expect(testLimits({ CI: "" })).toEqual(testLimits({}));
  });

  it("is three times that on CI, and so is the wait of the queries: a runner is slower in everything", () => {
    expect(testLimits({ CI: "true" })).toEqual({ wait: 9000, test: 15_000, slow: 60_000 });
    expect(testLimits({ CI: "1" })).toEqual(testLimits({ CI: "true" }));
    // The three times keep their proportions, so what holds for them locally holds on CI.
    const local = testLimits({});
    const ci = testLimits({ CI: "true" });
    expect(ci.wait / local.wait).toBe(ci.test / local.test);
    expect(ci.test / local.test).toBe(ci.slow / local.slow);
  });

  it("keeps the wait of the queries below the limit of a test, so a wait in vain says what it waited for", () => {
    for (const limits of [testLimits({}), testLimits({ CI: "true" })]) {
      expect(limits.wait).toBeLessThan(limits.test);
      expect(limits.test).toBeLessThan(limits.slow);
    }
  });

  it("is what this run is configured with", ({ task }) => {
    const limits = testLimits(process.env);
    expect(task.timeout).toBe(limits.test);
    expect(getConfig().asyncUtilTimeout).toBe(limits.wait);
    expect(SLOW.timeout).toBe(limits.slow);
  });

  it("is what a test with the slow allowance is given", SLOW, ({ task }) => {
    expect(task.timeout).toBe(testLimits(process.env).slow);
  });
});
