import { act, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { keys } from "../../api/keys";
import { renderApp } from "../../test/app";
import { opened, openStart, otherWorkspace, twoSnapshots, workspace } from "../../test/fixtures";
import { useSnapshotActions } from "../actions/snapshots";
import { useWorkspaceActions } from "../actions/workspaces";
import { queryClient } from "../query";
import { useShell } from "../shell/context";
import { defaultFilters, useFilters, type Filters } from "./state";

type Held = ReturnType<typeof useFilters> & {
  open: (id: string) => void;
  select: (id: number) => void;
};

/** What the page of the test reads: the filters, and the two actions that change the view. */
const probe: { page?: Held } = {};

function Probe() {
  const filters = useFilters();
  const { openWorkspace } = useWorkspaceActions();
  const { selectSnapshot } = useSnapshotActions();
  const { start } = useShell();
  useEffect(() => {
    probe.page = {
      ...filters,
      open: (id) => {
        openWorkspace.mutate(id);
      },
      select: (id) => {
        selectSnapshot.mutate(id);
      },
    };
  });
  return (
    <>
      <p>{filters.spec.text === "" ? "no text" : filters.spec.text}</p>
      <p>{`snapshot ${String(start.open?.selected)}`}</p>
    </>
  );
}

function now(): Held {
  if (probe.page === undefined) {
    throw new Error("The test expected the page that reads the filters.");
  }
  return probe.page;
}

const CIVIL: Filters = {
  ...defaultFilters,
  status: "All",
  fields: [{ dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false }],
  text: "valve",
};

/** The app on a page that reads the filters, with the default workspace open and one other to open. */
async function renderProbe() {
  delete probe.page;
  const app = renderApp({
    start: openStart(),
    path: "/overview",
    pages: { overview: <Probe />, settings: <Probe /> },
    handlers: {
      workspace_open: ({ id }) =>
        id === otherWorkspace.id
          ? opened({ workspace: otherWorkspace, snapshots: twoSnapshots, selected: 2 })
          : opened(),
      snapshot_select: ({ id }) => opened({ selected: id }),
    },
  });
  await screen.findByText("no text");
  return app;
}

describe("useFilters", () => {
  it("starts at the default: the open holds, and nothing else", async () => {
    await renderProbe();
    expect(now().filters).toBe(defaultFilters);
    expect(now().spec).toEqual(openHoldsFilter());
    expect(now().isDefault).toBe(true);
  });

  it("keeps what is set, and gives its spec as the same object for as long as nothing is set again", async () => {
    await renderProbe();
    act(() => {
      now().set(CIVIL);
    });
    await screen.findByText("valve");
    expect(now().filters).toEqual(CIVIL);
    expect(now().isDefault).toBe(false);
    const spec = now().spec;
    expect(spec).toEqual({
      ...openHoldsFilter(),
      status: "All",
      fields: [{ dim: "Discipline", values: ["Civil"], negate: false }],
      text: "valve",
    });

    act(() => {
      now().update((current) => current);
    });
    expect(now().spec).toBe(spec);
  });

  it("changes the filters from what they are", async () => {
    await renderProbe();
    act(() => {
      now().update((current) => ({ ...current, text: "pump" }));
    });
    act(() => {
      now().update((current) => ({ ...current, sizeMismatch: true }));
    });
    await screen.findByText("pump");
    expect(now().filters).toEqual({ ...defaultFilters, text: "pump", sizeMismatch: true });
  });

  it("is not the default with another status alone, and is with an entry that has no value", async () => {
    await renderProbe();
    act(() => {
      now().set({ ...defaultFilters, status: "Released" });
    });
    await waitFor(() => {
      expect(now().isDefault).toBe(false);
    });
    act(() => {
      now().set({ ...defaultFilters, fields: [{ dim: "Role", values: [], negate: true }] });
    });
    await waitFor(() => {
      expect(now().isDefault).toBe(true);
    });
  });

  it("gives the default again when the filters are cleared", async () => {
    await renderProbe();
    act(() => {
      now().set(CIVIL);
    });
    await screen.findByText("valve");
    act(() => {
      now().clear();
    });
    await screen.findByText("no text");
    expect(now().filters).toEqual(defaultFilters);
    expect(now().spec).toEqual(openHoldsFilter());
    expect(now().isDefault).toBe(true);
  });

  it("keeps the same filters, and so the same spec, when what is set says what is there already", async () => {
    await renderProbe();
    act(() => {
      now().set(CIVIL);
    });
    await screen.findByText("valve");
    const { filters, spec } = now();
    act(() => {
      now().set({ ...CIVIL, fields: CIVIL.fields.map((entry) => ({ ...entry })) });
    });
    act(() => {
      now().update((current) => ({ ...current, text: "valve" }));
    });
    expect(now().filters).toBe(filters);
    expect(now().spec).toBe(spec);
  });

  it("keeps the filters of a workspace through a visit to another workspace and back", async () => {
    await renderProbe();
    act(() => {
      now().set(CIVIL);
    });
    await screen.findByText("valve");

    act(() => {
      now().open(otherWorkspace.id);
    });
    // The other workspace has the filters of this session, and it has none yet.
    await screen.findByText("no text");
    expect(now().filters).toBe(defaultFilters);
    act(() => {
      now().update((current) => ({ ...current, text: "tank" }));
    });
    await screen.findByText("tank");

    act(() => {
      now().open(workspace().id);
    });
    await screen.findByText("valve");
    expect(now().filters).toEqual(CIVIL);

    act(() => {
      now().open(otherWorkspace.id);
    });
    await screen.findByText("tank");
  });

  it("keeps the filters when another snapshot is selected", async () => {
    const { router } = await renderProbe();
    act(() => {
      now().set(CIVIL);
    });
    await screen.findByText("valve");

    screen.getByText("snapshot 2");
    act(() => {
      now().select(1);
    });
    await screen.findByText("snapshot 1");
    screen.getByText("valve");
    expect(now().filters).toEqual(CIVIL);
    // Another page of the same workspace reads the same filters.
    await act(() => router.navigate("/settings"));
    await screen.findByText("valve");
    expect(now().filters).toEqual(CIVIL);
  });

  it("still has the filters of a workspace after more than five minutes in another one", async () => {
    // The query client drops what nobody has read for five minutes, unless it is told to keep
    // it. Time is advanced by hand here, and goes on by itself so that the page can be waited for.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderProbe();
      act(() => {
        now().set(CIVIL);
      });
      await screen.findByText("valve");

      act(() => {
        now().open(otherWorkspace.id);
      });
      await screen.findByText("no text");
      await act(() => vi.advanceTimersByTimeAsync(6 * 60 * 1000));

      act(() => {
        now().open(workspace().id);
      });
      await screen.findByText("valve");
      expect(now().filters).toEqual(CIVIL);

      // And of the workspace in view, which nothing else holds either.
      await act(() => vi.advanceTimersByTimeAsync(6 * 60 * 1000));
      expect(now().filters).toEqual(CIVIL);
      expect(screen.getByText("valve")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the filters in the memory of the session and nowhere else", async () => {
    const stored = () => window.localStorage.length + window.sessionStorage.length;
    const before = stored();
    // A command that was sent without a handler fails the test: setting filters sends none.
    await renderProbe();
    act(() => {
      now().set(CIVIL);
    });
    await screen.findByText("valve");
    expect(stored()).toBe(before);
    expect(queryClient.getQueryData(keys.workspaceFilters(workspace().id))).toEqual(CIVIL);

    // An app that starts has a query client that holds nothing: every workspace has the default.
    act(() => {
      queryClient.removeQueries({ queryKey: keys.filters });
    });
    await screen.findByText("no text");
    expect(now().filters).toBe(defaultFilters);
    expect(now().isDefault).toBe(true);
  });
});
