import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { searchForAnotherSnapshot, searchForAnotherWorkspace } from "../../app/selection";
import { must } from "../../test/app";
import { useSelection } from "./selection";

/** The hook on a router at `path`, with the address it leaves, as the shell renders it. */
function renderSelection(path: string) {
  const seen: { search?: string } = {};
  const hook = renderHook(
    () => {
      seen.search = useLocation().search;
      return useSelection();
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => {
        const router = createMemoryRouter([{ path: "*", element: children }], {
          initialEntries: [path],
        });
        return <RouterProvider router={router} />;
      },
    },
  );
  return { hook, search: () => must(seen.search, "the address") };
}

describe("useSelection", () => {
  it("reads a line from ?line= and a hold from ?hold=", () => {
    expect(renderSelection("/lines?line=78B01-573-04400-FW").hook.result.current.selection).toEqual(
      { kind: "line", lineId: "78B01-573-04400-FW" },
    );
    expect(renderSelection("/lines?rows=holds&hold=17").hook.result.current.selection).toEqual({
      kind: "hold",
      position: 17,
    });
    expect(renderSelection("/lines?rows=holds").hook.result.current.selection).toBeNull();
  });

  it("takes a hold position that is not a whole number for no selection", () => {
    for (const position of ["abc", "-1", "1.5", "", "2e3"]) {
      expect(renderSelection(`/lines?hold=${position}`).hook.result.current.selection).toBeNull();
    }
  });

  it("selects a line or a hold and keeps the other parts of the address", () => {
    const { hook, search } = renderSelection("/lines?sort=LineId&view=3&hold=4");
    act(() => {
      hook.result.current.select({ kind: "line", lineId: "78B01-573-04401-FW" });
    });
    expect(search()).toBe("?sort=LineId&view=3&line=78B01-573-04401-FW");
    expect(hook.result.current.selection).toEqual({ kind: "line", lineId: "78B01-573-04401-FW" });
    act(() => {
      hook.result.current.select({ kind: "hold", position: 12 });
    });
    expect(search()).toBe("?sort=LineId&view=3&hold=12");
  });

  it("closes by taking both out of the address, and keeps the rest", () => {
    const { hook, search } = renderSelection("/lines?rows=holds&line=A&hold=4&single=1");
    act(() => {
      hook.result.current.close();
    });
    expect(search()).toBe("?rows=holds&single=1");
    expect(hook.result.current.selection).toBeNull();
  });

  it("reads a blocker from ?blocker=, its key as the address writes it", () => {
    expect(
      renderSelection("/blockers?blocker=Process%7C577-PR-400").hook.result.current.selection,
    ).toEqual({ kind: "blocker", key: "Process|577-PR-400" });
    expect(renderSelection("/blockers?blocker=").hook.result.current.selection).toBeNull();
  });

  it("selects a blocker in place of a line or a hold, and closes it, keeping the rest", () => {
    const { hook, search } = renderSelection("/blockers?view=3&line=A&hold=4");
    act(() => {
      hook.result.current.select({ kind: "blocker", key: "Civil|Vendor data & more" });
    });
    expect(search()).toBe("?view=3&blocker=Civil%7CVendor+data+%26+more");
    expect(hook.result.current.selection).toEqual({
      kind: "blocker",
      key: "Civil|Vendor data & more",
    });
    act(() => {
      hook.result.current.select({ kind: "line", lineId: "A" });
    });
    expect(search()).toBe("?view=3&line=A");
    act(() => {
      hook.result.current.select({ kind: "blocker", key: "Civil|Stress" });
    });
    act(() => {
      hook.result.current.close();
    });
    expect(search()).toBe("?view=3");
  });
});

describe("the selection and another view", () => {
  it("keeps a blocker for another snapshot, since its key is its text", () => {
    expect(searchForAnotherSnapshot("?blocker=Civil%7CStress")).toBeNull();
    expect(searchForAnotherSnapshot("?view=3&hold=4")).toBe("?view=3");
  });

  it("drops a blocker, as a line and a hold, for another workspace", () => {
    expect(searchForAnotherWorkspace("?view=3&blocker=Civil%7CStress")).toBe("?view=3");
    expect(searchForAnotherWorkspace("?view=3")).toBeNull();
  });

  it("drops the groups a page has expanded for another workspace, whose values they are not", () => {
    expect(searchForAnotherWorkspace("?mode=list&by=Discipline&open=Piping%2CCivil")).toBe(
      "?mode=list&by=Discipline",
    );
    expect(
      searchForAnotherWorkspace("?mode=list&by=Discipline&open=Piping&line=78B01-573-4434-FW-001"),
    ).toBe("?mode=list&by=Discipline");
  });
});
