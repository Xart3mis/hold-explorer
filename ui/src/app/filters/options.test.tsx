import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { renderApp } from "../../test/app";
import { filterOptions } from "../../test/filters";
import { openStart, workspace } from "../../test/fixtures";
import { useFilterOptions } from "./options";

function Reader({ name, enabled }: { name: string; enabled?: boolean }) {
  const options = useFilterOptions(enabled === undefined ? {} : { enabled });
  return <p>{`${name} ${options.data === undefined ? "waits" : "read"}`}</p>;
}

describe("useFilterOptions", () => {
  it("reads the options of the filters in view once for every screen that shows them", async () => {
    const options = vi.fn(() => filterOptions());
    renderApp({
      start: openStart(),
      path: "/overview",
      pages: {
        overview: (
          <>
            <Reader name="bar" />
            <Reader name="panel" />
          </>
        ),
        breakdown: <p />,
        blockers: <p />,
        lines: <p />,
        settings: <p />,
      },
      handlers: { filter_options: options },
    });
    expect(await screen.findByText("bar read")).toBeInTheDocument();
    expect(screen.getByText("panel read")).toBeInTheDocument();
    expect(options).toHaveBeenCalledTimes(1);
    expect(options).toHaveBeenCalledWith({
      spec: openHoldsFilter(),
      view: { workspace_id: workspace().id, snapshot_id: 2 },
    });
  });

  it("reads nothing while a screen says it may not", async () => {
    const options = vi.fn(() => filterOptions());
    renderApp({
      start: openStart(),
      path: "/overview",
      pages: {
        overview: <Reader name="lines" enabled={false} />,
        breakdown: <p />,
        blockers: <p />,
        lines: <p />,
        settings: <p />,
      },
      handlers: { filter_options: options },
    });
    expect(await screen.findByText("lines waits")).toBeInTheDocument();
    await waitFor(() => {
      expect(options).not.toHaveBeenCalled();
    });
  });
});
