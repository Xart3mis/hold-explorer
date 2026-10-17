import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
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
});
