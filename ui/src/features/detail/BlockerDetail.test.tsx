import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { keys } from "../../api/keys";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import type { BlockerDetail } from "../../bindings/BlockerDetail";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { ViewRef } from "../../bindings/ViewRef";
import en from "../../locales/en.json";
import { held } from "../../test/actions";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { blockerDetail } from "../../test/blockers";
import { opened, openStart, otherWorkspace, workspace } from "../../test/fixtures";
import { selectOlderSnapshot } from "../../test/flow";
import { commandFailure, type Handlers } from "../../test/ipc";
import { lineId } from "../../test/lines";
import { SLOW } from "../../test/slow";
import { formatDate, formatDays } from "../../text/format";

const text = en.detail;
const fact = text.fact;
const VIEW = { workspace_id: workspace().id, snapshot_id: 2 };
const BLOCKER = "Piping|577-PK-400";
const LABEL = "Piping / 577-PK-400";
const AT_BLOCKER = `/blockers?blocker=${encodeURIComponent(BLOCKER)}`;

/** The text of the catalog with its placeholders filled. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)(, number)?\}\}/g, (_, name: string) => String(values[name]));
}

interface Options {
  path?: string;
  handlers?: Handlers;
  filters?: Filters;
}

/** The app at `path`, with the test's own answers, and the filters the bar would have left. */
function renderBlocker({ path = AT_BLOCKER, handlers = {}, filters }: Options = {}) {
  const app = renderApp({ start: openStart(), path, handlers });
  if (filters !== undefined) {
    queryClient.setQueryData(keys.workspaceFilters(workspace().id), filters);
  }
  return app;
}

/** The detail panel, once it is there. */
async function panel(name = LABEL): Promise<HTMLElement> {
  return screen.findByRole("complementary", { name });
}

function factValue(list: HTMLElement, label: string): string {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.firstElementChild?.textContent === label);
  return must(row, `the fact ${label}`).textContent.slice(label.length);
}

/** The filters of the open workspace, as the bar holds them. */
function filtersNow(): Filters | undefined {
  return queryClient.getQueryData<Filters>(keys.workspaceFilters(workspace().id));
}

const SOME_TEXT: Filters = { ...defaultFilters, text: "vendor" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("The panel of a blocker", () => {
  it("asks for the blocker with the filters and the view, and shows its facts", async () => {
    const detail = vi.fn(({ key }: { key: string }) => blockerDetail(key));
    renderBlocker({ handlers: { blocker_detail: detail }, filters: SOME_TEXT });
    const region = await panel();
    // The label is the title, in the face of the body: it is as often a word as a tag.
    const heading = within(region).getByRole("heading", { level: 2, name: LABEL });
    expect(heading).not.toHaveAttribute("data-identifier");
    const facts = await within(region).findByRole("list", { name: text.blockerFacts });
    const spec: FilterSpec = { ...openHoldsFilter(), text: "vendor" };
    expect(detail).toHaveBeenLastCalledWith({ spec, key: BLOCKER, view: VIEW });
    // Its type, as a tag under the title.
    const head = must(region.querySelector<HTMLElement>("[data-part='detail-head']"));
    expect(within(head).getByText("PK")).toBeInTheDocument();
    expect(factValue(facts, fact.discipline)).toBe("Piping");
    expect(factValue(facts, fact.holds)).toBe("14");
    expect(factValue(facts, fact.frees)).toBe(fill(text.lineCount_other, { count: 2 }));
    expect(factValue(facts, fact.shared)).toBe(fill(text.lineCount_one, { count: 1 }));
    expect(factValue(facts, fact.solveOrder)).toBe(fill(text.step, { step: 3 }));
  });

  it("says that no step ranks a blocker outside the solve order", async () => {
    renderBlocker({
      handlers: { blocker_detail: ({ key }) => blockerDetail(key, { step: null }) },
    });
    const region = await panel();
    const facts = await within(region).findByRole("list", { name: text.blockerFacts });
    expect(factValue(facts, fact.solveOrder)).toBe(text.noStep);
  });

  it("lists the lines it frees and those it shares, and opens a line that is pressed", async () => {
    const { user, router } = renderBlocker();
    const region = await panel();
    const frees = await within(region).findByRole("list", { name: text.frees });
    expect(
      within(frees)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([lineId(0), lineId(2)]);
    const shared = within(region).getByRole("list", { name: text.shared });
    expect(
      within(shared)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([lineId(1)]);
    await user.click(within(shared).getByRole("button", { name: lineId(1) }));
    await waitFor(() => {
      expect(router.state.location.search).toBe(`?line=${lineId(1)}`);
    });
    // The user stays on the destination on screen.
    expect(router.state.location.pathname).toBe("/blockers");
    const linePanel = await panel(lineId(1));
    // The button is gone, so the focus is on the heading of what it opened.
    await waitFor(() => {
      expect(within(linePanel).getByRole("heading", { level: 2 })).toHaveFocus();
    });
  });

  it("says so when a list has no line", async () => {
    renderBlocker({
      handlers: {
        blocker_detail: ({ key }) => blockerDetail(key, { frees: [], shared: [], linked: [] }),
      },
    });
    const region = await panel();
    expect(await within(region).findByText(text.noFrees)).toBeInTheDocument();
    expect(within(region).getByText(text.noShared)).toBeInTheDocument();
    expect(within(region).getByText(text.noLinked)).toBeInTheDocument();
    expect(within(region).queryByRole("list", { name: text.frees })).not.toBeInTheDocument();
  });

  it("lists the linked blockers, and opens one that is pressed", async () => {
    const detail = vi.fn(({ key }: { key: string }) => blockerDetail(key));
    const { user, router } = renderBlocker({ handlers: { blocker_detail: detail } });
    const region = await panel();
    const linked = await within(region).findByRole("list", { name: text.linked });
    const button = within(linked).getByRole("button");
    expect(button).toHaveTextContent("Civil / Client decision");
    expect(button).toHaveTextContent("Other");
    expect(button).toHaveTextContent(fill(text.sharesLines_one, { count: 1 }));
    await user.click(button);
    await waitFor(() => {
      expect(router.state.location.search).toBe("?blocker=Civil%7CClient+decision");
    });
    const other = await panel("Civil / Client decision");
    expect(detail).toHaveBeenLastCalledWith({
      spec: openHoldsFilter(),
      key: "Civil|Client decision",
      view: VIEW,
    });
    await waitFor(() => {
      expect(within(other).getByRole("heading", { level: 2 })).toHaveFocus();
    });
  });

  it("opens its oldest hold, and says when none has a date", async () => {
    const { user, router, unmount } = renderBlocker();
    const region = await panel();
    const list = await within(region).findByRole("list", { name: text.oldest });
    const oldest = within(list).getByRole("button", { name: new RegExp(`^${lineId(2)}`) });
    expect(oldest).toHaveTextContent("HOLD FOR VENDOR DATA OF PACKAGE UNIT 577-PK-400, REV B");
    expect(oldest).toHaveTextContent(fill(text.age, { days: formatDays(41) }));
    expect(oldest).toHaveTextContent(
      fill(text.raisedByOn, { who: "A. Haddad, Lead engineer", date: formatDate("2026-05-02") }),
    );
    await user.click(oldest);
    await waitFor(() => {
      expect(router.state.location.search).toBe("?hold=7");
    });
    await panel(text.holdTitle);
    unmount();

    renderBlocker({
      handlers: { blocker_detail: ({ key }) => blockerDetail(key, { oldest: null }) },
    });
    expect(await within(await panel()).findByText(text.noOldest)).toBeInTheDocument();
  });

  it("lists the first 50 lines of a long list, and shows all of them on Lines", SLOW, async () => {
    const many = (from: number, count: number) =>
      Array.from({ length: count }, (_, at) => lineId(from + at));
    const { user, router } = renderBlocker({
      path: `/blockers?view=3&blocker=${encodeURIComponent(BLOCKER)}`,
      handlers: {
        blocker_detail: ({ key }) =>
          blockerDetail(key, { frees: many(0, 312), shared: many(400, 60) }),
      },
      filters: SOME_TEXT,
    });
    const region = await panel();
    const frees = await within(region).findByRole("list", { name: text.frees });
    expect(within(frees).getAllByRole("button")).toHaveLength(50);
    expect(within(region).getByText(fill(text.shownOf, { shown: 50, count: 312 }))).toBeVisible();
    const shared = within(region).getByRole("list", { name: text.shared });
    expect(within(shared).getAllByRole("button")).toHaveLength(50);
    expect(within(region).getByText(fill(text.shownOf, { shown: 50, count: 60 }))).toBeVisible();
    // The two buttons are told apart by the list each stands under.
    expect(
      within(region).getByRole("button", { name: fill(text.showAllOf, { list: text.frees }) }),
    ).toHaveTextContent(text.showAll);
    const showAll = within(region).getByRole("button", {
      name: fill(text.showAllOf, { list: text.shared }),
    });
    expect(showAll).toHaveTextContent(text.showAll);
    await user.click(showAll);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    // Lines keeps the filters of the bar, with the blocker added. The panel closes: under that
    // filter it would say that every line kept is freed by the blocker alone.
    expect(filtersNow()).toEqual({
      ...SOME_TEXT,
      fields: [{ dim: "Blocker", values: [{ key: BLOCKER, label: LABEL }], negate: false }],
    });
    expect(router.state.location.search).toBe("");
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.lines });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it(
    "leaves no entry to go back to that shows the panel under the filter of its blocker",
    SLOW,
    async () => {
      const many = (from: number, count: number) =>
        Array.from({ length: count }, (_, at) => lineId(from + at));
      const { user, router } = renderBlocker({
        path: `/blockers?view=3&blocker=${encodeURIComponent(BLOCKER)}`,
        handlers: {
          blocker_detail: ({ key }) => blockerDetail(key, { frees: many(0, 312) }),
        },
      });
      const region = await panel();
      await user.click(
        await within(region).findByRole("button", {
          name: fill(text.showAllOf, { list: text.frees }),
        }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      // Back: the page the panel was opened on, without the panel.
      await act(async () => {
        await router.navigate(-1);
      });
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/blockers");
      });
      expect(router.state.location.search).toBe("?view=3");
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    },
  );

  it(
    "makes each list one stop in the Tab order, moved in with the arrow keys, so the linked blockers are a few Tabs away",
    SLOW,
    async () => {
      const many = (from: number, count: number) =>
        Array.from({ length: count }, (_, at) => lineId(from + at));
      const linked = Array.from({ length: 30 }, (_, at) => ({
        key: `Civil|Item ${String(at + 1)}`,
        label: `Civil / Item ${String(at + 1)}`,
        kind: "Other",
        shared_lines: 30 - at,
      }));
      const { user, router } = renderBlocker({
        handlers: {
          blocker_detail: ({ key }) =>
            blockerDetail(key, { frees: many(0, 312), shared: many(400, 60), linked }),
        },
      });
      const region = await panel();
      const frees = await within(region).findByRole("list", { name: text.frees });
      act(() => {
        within(region).getByRole("button", { name: text.closePanel }).focus();
      });
      // The lines it frees, their way to Lines, the lines it shares, theirs, the linked blockers.
      let tabs = 0;
      const list = within(region).getByRole("list", { name: text.linked });
      while (!list.contains(document.activeElement) && tabs < 20) {
        await user.tab();
        tabs += 1;
      }
      expect(tabs).toBe(5);
      const rows = within(list).getAllByRole("button");
      expect(rows[0]).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(rows[1]).toHaveFocus();
      await user.keyboard("{End}");
      expect(rows.at(-1)).toHaveFocus();
      await user.keyboard("{Home}");
      expect(rows[0]).toHaveFocus();
      await user.keyboard("{ArrowUp}");
      expect(rows[0]).toHaveFocus();
      // Back into a list, the Tab stop is the row the keyboard was last on.
      const lines = within(frees).getAllByRole("button");
      act(() => {
        must(lines[0]).focus();
      });
      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(lines[2]).toHaveFocus();
      await user.tab();
      await user.tab({ shift: true });
      expect(lines[2]).toHaveFocus();
      // Enter opens the row.
      await user.keyboard("{Enter}");
      await waitFor(() => {
        expect(router.state.location.search).toBe(`?line=${lineId(2)}`);
      });
    },
  );

  it("says when the filters leave it out, and clears them", async () => {
    const detail = vi.fn(({ key, spec }: { key: string; spec: FilterSpec }) =>
      spec.text === "" ? blockerDetail(key) : null,
    );
    const { user } = renderBlocker({ handlers: { blocker_detail: detail }, filters: SOME_TEXT });
    const region = await panel(text.blockerTitle);
    expect(
      await within(region).findByRole("heading", { name: text.blockerFilteredTitle }),
    ).toBeInTheDocument();
    expect(within(region).getByText(text.blockerFilteredText)).toBeInTheDocument();
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: text.clearFilters }));
    expect(filtersNow()).toEqual(defaultFilters);
    // The panel stays, and shows the blocker the filters keep again.
    expect(
      await within(region).findByRole("list", { name: text.blockerFacts }),
    ).toBeInTheDocument();
    expect(within(region).getByRole("heading", { level: 2, name: LABEL })).toBeInTheDocument();
  });

  it("waits with skeletons, not with the other empty state, while other filters are read", async () => {
    const later = held<BlockerDetail | null>();
    const detail = vi.fn(({ spec }: { spec: FilterSpec }) =>
      spec.text === "" ? later.handler() : null,
    );
    const { user } = renderBlocker({ handlers: { blocker_detail: detail }, filters: SOME_TEXT });
    const region = await panel(text.blockerTitle);
    await user.click(await within(region).findByRole("button", { name: text.clearFilters }));
    await waitFor(() => {
      expect(later.handler).toHaveBeenCalled();
    });
    // The answer for the filters of before says nothing of the filters now: neither its empty
    // state nor the one of a blocker missing from the snapshot stands in.
    expect(within(region).queryByText(text.blockerFilteredTitle)).not.toBeInTheDocument();
    expect(within(region).queryByText(text.blockerMissingTitle)).not.toBeInTheDocument();
    expect(within(region).getByRole("list", { name: text.blockerFacts })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await act(async () => {
      must(later.waiting[0], "the reading under the default filters").resolve(
        blockerDetail(BLOCKER),
      );
      await Promise.resolve();
    });
    expect(
      await within(region).findByRole("heading", { level: 2, name: LABEL }),
    ).toBeInTheDocument();
  });

  it("keeps the empty state, dimmed, while the same filters are read again", async () => {
    const again = held<BlockerDetail | null>();
    let reads = 0;
    const detail = vi.fn(() => {
      reads += 1;
      return reads === 1 ? null : again.handler();
    });
    renderBlocker({ handlers: { blocker_detail: detail }, filters: SOME_TEXT });
    const region = await panel(text.blockerTitle);
    await within(region).findByRole("heading", { name: text.blockerFilteredTitle });
    // Read again, as after an action, for the same view and the same filters.
    // The answer is held, so the invalidation is not waited for.
    act(() => {
      void queryClient.invalidateQueries({ queryKey: keys.snapshots });
    });
    await waitFor(() => {
      expect(again.handler).toHaveBeenCalled();
    });
    const body = must(region.querySelector("[data-part='detail-body']"));
    expect(body).toHaveAttribute("data-stale");
    expect(within(region).getByRole("heading", { name: text.blockerFilteredTitle })).toBeVisible();
  });

  it("says that a blocker is not in the snapshot under the default filters, and closes", async () => {
    const { user, router } = renderBlocker({ handlers: { blocker_detail: () => null } });
    const region = await panel(text.blockerTitle);
    expect(
      await within(region).findByRole("heading", { name: text.blockerMissingTitle }),
    ).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: text.clearFilters })).toBeNull();
    const closes = within(region).getAllByRole("button", { name: text.closePanel });
    expect(closes).toHaveLength(2);
    await user.click(must(closes.at(-1), "the action of the empty state"));
    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("shows the error with a retry, and the blocker once it is read", async () => {
    let calls = 0;
    const { user } = renderBlocker({
      handlers: {
        blocker_detail: ({ key }) => {
          calls += 1;
          if (calls === 1) {
            throw commandFailure("Io", "The workspace file could not be read (it is locked).");
          }
          return blockerDetail(key);
        },
      },
    });
    const region = await panel(text.blockerTitle);
    const alert = await within(region).findByRole("alert");
    expect(alert).toHaveTextContent(text.errorBlocker);
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    expect(
      await within(region).findByRole("list", { name: text.blockerFacts }),
    ).toBeInTheDocument();
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows skeletons on a first load, under its own title", async () => {
    renderBlocker({
      handlers: { blocker_detail: () => new Promise<BlockerDetail | null>(() => undefined) },
    });
    const region = await panel(text.blockerTitle);
    const facts = within(region).getByRole("list", { name: text.blockerFacts });
    expect(facts).toHaveAttribute("aria-busy", "true");
    for (const title of [text.frees, text.shared, text.linked, text.oldest]) {
      expect(within(region).getByRole("heading", { level: 3, name: title })).toBeVisible();
    }
  });
});

describe("The blocker and the line panel", () => {
  it("opens the blocker of an entry of the chain, on the destination on screen", async () => {
    const { user, router } = renderApp({
      start: openStart(),
      path: `/lines?line=${lineId(0)}`,
    });
    const region = await panel(lineId(0));
    const chain = await within(region).findByRole("list", { name: text.blockers });
    const entry = within(chain).getByRole("button", { name: new RegExp(`^${LABEL}`) });
    await user.click(entry);
    await waitFor(() => {
      expect(router.state.location.search).toBe(`?blocker=Piping%7C577-PK-400`);
    });
    expect(router.state.location.pathname).toBe("/lines");
    const blocker = await panel();
    await waitFor(() => {
      expect(within(blocker).getByRole("heading", { level: 2, name: LABEL })).toHaveFocus();
    });
  });
});

describe("The blocker and the view", () => {
  it(
    "reads the blocker again for another snapshot, and closes for another workspace",
    SLOW,
    async () => {
      const detail = vi.fn(({ key }: { key: string; view: ViewRef }) => blockerDetail(key));
      const { user, router } = renderBlocker({
        handlers: {
          blocker_detail: detail,
          snapshot_select: ({ id }) => opened({ selected: id }),
          workspace_open: () => opened({ workspace: otherWorkspace }),
        },
      });
      const region = await panel();
      await within(region).findByRole("list", { name: text.blockerFacts });
      await selectOlderSnapshot(user);
      await waitFor(() => {
        expect(detail).toHaveBeenCalledWith({
          spec: openHoldsFilter(),
          key: BLOCKER,
          view: { ...VIEW, snapshot_id: 1 },
        });
      });
      expect(router.state.location.search).toBe("?blocker=Piping%7C577-PK-400");
      expect(screen.getByRole("complementary", { name: LABEL })).toBeInTheDocument();
      await user.click(
        await screen.findByRole("button", {
          name: `${en.workspaces.switcher} ${workspace().name}`,
        }),
      );
      const menu = await screen.findByRole("menu", { name: en.workspaces.switcher });
      await user.click(within(menu).getByRole("menuitem", { name: otherWorkspace.name }));
      await waitFor(() => {
        expect(router.state.location.search).toBe("");
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      });
    },
  );

  it("passes the accessibility check beside the steps of Blockers", SLOW, async () => {
    renderBlocker();
    const region = await panel();
    await within(region).findByRole("list", { name: text.blockerFacts });
    await screen.findByRole("grid", { name: en.blockers.table });
    await act(async () => {
      await Promise.resolve();
    });
    await expectAccessible(document.body, { page: true });
  });
});
