import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSelectedRows } from "./selectedRows";

describe("useSelectedRows", () => {
  it("starts with no rows, holds what it is given, and clears", () => {
    const { result } = renderHook(() => useSelectedRows("a"));
    expect([...result.current.keys]).toEqual([]);
    act(() => {
      result.current.set(new Set(["x", "y"]));
    });
    expect([...result.current.keys]).toEqual(["x", "y"]);
    act(() => {
      result.current.clear();
    });
    expect(result.current.keys.size).toBe(0);
  });

  it("keeps its rows while the result is the same, and drops them when it changes", () => {
    const { result, rerender } = renderHook(({ key }) => useSelectedRows(key), {
      initialProps: { key: "a" },
    });
    act(() => {
      result.current.set(new Set(["x"]));
    });
    rerender({ key: "a" });
    expect([...result.current.keys]).toEqual(["x"]);
    rerender({ key: "b" });
    expect(result.current.keys.size).toBe(0);
    // Back to the first result: what was dropped does not come back.
    rerender({ key: "a" });
    expect(result.current.keys.size).toBe(0);
  });

  it("gives the same empty set at every render, so a table is not handed a new one", () => {
    const { result, rerender } = renderHook(() => useSelectedRows("a"));
    const first = result.current.keys;
    rerender();
    expect(result.current.keys).toBe(first);
  });
});
