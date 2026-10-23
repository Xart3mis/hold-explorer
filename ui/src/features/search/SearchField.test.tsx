import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import { keys } from "../../api/keys";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { SearchResults } from "../../bindings/SearchResults";
import type { ViewRef } from "../../bindings/ViewRef";
import en from "../../locales/en.json";
import { must, renderApp, topBar } from "../../test/app";
import { expectAccessible } from "../../test/axe";
import { openStart, opened, workspace } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { group, valuePage } from "../../test/filters";
import { holdsView } from "../../test/lines";
import { searchGroups, searchHit, searchResults } from "../../test/search";
import { SLOW } from "../../test/slow";
import { focusSearchField } from "./SearchField";

const words = en.search;

/** The search field of the top bar, once the app has loaded. */
const field = () => screen.findByRole("combobox", { name: words.label });

/** The list of results, once it is open. */
const results = () => screen.findByRole("listbox", { name: words.results });

/** The filters of the workspace the tests open, as the filter bar holds them. */
const filtersNow = () => queryClient.getQueryData<Filters>(keys.workspaceFilters(workspace().id));

/** A promise the test settles when it decides, for the answer of a command. */
function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** The app on a page, with the search answered as the test says and every query it was sent recorded. */
function renderSearch(
  path = "/overview",
  answer: (query: string) => SearchResults | Promise<SearchResults> = searchResults,
) {
  const sent: string[] = [];
  const app = renderApp({
    start: openStart(),
    path,
    handlers: {
      search: ({ query }: { view: ViewRef; query: string }) => {
        sent.push(query);
        return answer(query);
      },
    },
  });
  return { ...app, sent };
}

/** Types into the field and waits for the list with the answer for what was typed. */
async function typeAndOpen(user: ReturnType<typeof renderSearch>["user"], text: string) {
  const input = await field();
  await user.click(input);
  await user.keyboard(text);
  const list = await results();
  await within(list).findByText(/^Lines · /);
  return { input, list };
}

describe("where the search field is", () => {
  it("sits in the top bar between the workspace switcher and the snapshot selector", async () => {
    renderSearch();
    const input = await field();
    expect(topBar()).toContainElement(input);
    const switcher = within(topBar()).getByRole("button", { name: /Unit 573 piping/ });
    const selector = within(topBar()).getByRole("button", { name: /Snapshot/ });
    expect(switcher.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input).toHaveAttribute("placeholder", words.placeholder);
    expect(input).toHaveAttribute("aria-keyshortcuts", "/");
    expect(within(topBar()).getByText("/")).toBeInTheDocument();
  });

  it("is absent in a workspace without a snapshot, and without a workspace", async () => {
    const { unmount } = renderApp({
      start: openStart({
        open: opened({
          workspace: workspace({ snapshot_count: 0, latest_taken_at: null }),
          snapshots: [],
          selected: null,
        }),
      }),
      path: "/overview",
    });
    await screen.findByRole("button", { name: /Unit 573 piping/ });
    expect(screen.queryByRole("combobox", { name: words.label })).toBeNull();
    expect(focusSearchField()).toBe(false);
    unmount();
    renderApp({ path: "/settings" });
    await screen.findByRole("heading", { name: en.destinations.name.settings });
    expect(screen.queryByRole("combobox", { name: words.label })).toBeNull();
  });

  it("takes the focus from the page by its focus function", async () => {
    renderSearch();
    const input = await field();
    act(() => {
      expect(focusSearchField()).toBe(true);
    });
    expect(input).toHaveFocus();
  });
});

describe("the results", () => {
  it("are grouped under their headings with the totals, the matches marked", SLOW, async () => {
    const { user } = renderSearch();
    const { list } = await typeAndOpen(user, "573");
    const headings = ["Lines · 12", "Blockers · 1", "People · 2", "Remarks · 3", "Holds · 1"];
    for (const heading of headings) {
      const group = must(
        within(list)
          .getAllByRole("group")
          .find(
            (section) =>
              section.getAttribute("aria-labelledby") !== null &&
              within(section).queryByText(heading),
          ),
        heading,
      );
      expect(group).toHaveAccessibleName(heading);
    }
    const line = within(list).getByRole("option", { name: "78B04-573-00004-PR-004" });
    const marked = [...line.querySelectorAll("[data-matched]")].map((part) => part.textContent);
    expect(marked).toEqual(["573"]);
    expect(line).toHaveAccessibleDescription("6 holds");
    const released = within(list).getByRole("option", { name: "78B02-573-00195-PR-006" });
    expect(within(released).getByText(words.released)).toBeInTheDocument();
    expect(released).toHaveAccessibleDescription(`${words.released}, 2 holds`);
    const person = within(list).getByRole("option", { name: "R. Tanaka" });
    expect(within(person).getByText("Checker")).toBeInTheDocument();
    expect(person).toHaveAccessibleDescription("Checker, 31 holds");
    // A hold value names its field, so that two values that read alike are told apart.
    const value = within(list).getByRole("option", { name: "Process data" });
    expect(within(value).getByText(en.import.field.HoldType)).toBeInTheDocument();
  });

  it("end a group that has more with the number of the others and where they are", async () => {
    const { user } = renderSearch();
    const { list } = await typeAndOpen(user, "573");
    expect(within(list).getByRole("option", { name: "10 more in Lines" })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: "2 more in Lines" })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: /more in Blockers/ })).toBeNull();
  });

  it("say that nothing matches, and how to filter by the text", async () => {
    const { user } = renderSearch("/overview", (query) => ({ query, groups: [] }));
    const input = await field();
    await user.click(input);
    await user.keyboard("zz");
    const list = await results();
    expect(
      await within(list).findByText("Nothing matches “zz”. Press Enter to filter by this text."),
    ).toBeInTheDocument();
  });

  it("are not asked for below two characters", async () => {
    const { user, sent } = renderSearch();
    const input = await field();
    await user.click(input);
    await user.keyboard(" 5 ");
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(sent).toEqual([]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("what is typed is sent", () => {
  it("once typing has stopped, as typed", async () => {
    const { user, sent } = renderSearch();
    const input = await field();
    await user.click(input);
    await user.keyboard("57");
    // Nothing yet: typing may go on.
    expect(sent).toEqual([]);
    await user.keyboard("3 ");
    await waitFor(() => {
      expect(sent).toEqual(["573 "]);
    });
  });

  it("never shows the answer for an older text as the answer for the new one", SLOW, async () => {
    const answers = new Map<string, ReturnType<typeof deferred<SearchResults>>>();
    const answerOf = (query: string) => {
      const held = answers.get(query) ?? deferred<SearchResults>();
      answers.set(query, held);
      return held;
    };
    const { user, sent } = renderSearch("/overview", (query) => answerOf(query).promise);
    const input = await field();
    await user.click(input);
    await user.keyboard("57");
    await waitFor(() => {
      expect(sent).toEqual(["57"]);
    });
    await user.keyboard("3");
    await waitFor(() => {
      expect(sent).toEqual(["57", "573"]);
    });
    const list = await results();
    // The first wait: one skeleton line, the list busy.
    expect(list.closest("[aria-busy='true']")).not.toBeNull();
    const old = {
      query: "57",
      groups: [
        { kind: "Lines" as const, total: 1, hits: [searchHit("Line", "OLD-LINE", "|57|-OLD")] },
      ],
    };
    const fresh = {
      query: "573",
      groups: [
        { kind: "Lines" as const, total: 1, hits: [searchHit("Line", "NEW-LINE", "|573|-NEW")] },
      ],
    };
    await act(async () => {
      answerOf("573").resolve(fresh);
      answerOf("57").resolve(old);
      await Promise.resolve();
    });
    expect(
      await within(await results()).findByRole("option", { name: "573-NEW" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("57-OLD")).toBeNull();
    expect(input).toHaveValue("573");
  });

  it(
    "keeps the results of before, dimmed and busy, until the new answer is there",
    SLOW,
    async () => {
      const later = deferred<SearchResults>();
      const { user } = renderSearch("/overview", (query) =>
        query === "573" ? searchResults(query) : later.promise,
      );
      const { list } = await typeAndOpen(user, "573");
      await user.keyboard("4");
      const busy = await waitFor(() =>
        must(list.closest<HTMLElement>("[aria-busy='true']"), "a busy list"),
      );
      expect(busy).toHaveAttribute("data-stale");
      expect(
        within(list).getByRole("option", { name: "78B04-573-00004-PR-004" }),
      ).toBeInTheDocument();
      await act(async () => {
        later.resolve({ query: "5734", groups: [] });
        await Promise.resolve();
      });
      const nothing = "Nothing matches “5734”. Press Enter to filter by this text.";
      expect(await within(await results()).findByText(nothing)).toBeInTheDocument();
      // The status says it as well, once the answer for what is typed is there.
      expect(screen.getAllByRole("status").some((status) => status.textContent === nothing)).toBe(
        true,
      );
      expect(document.querySelector("[aria-busy='true'][data-stale]")).toBeNull();
    },
  );

  it("says what failed, and tries again from the list", SLOW, async () => {
    let fails = true;
    const { user, sent } = renderSearch("/overview", (query) => {
      if (fails)
        throw commandFailure("Internal", "The snapshot could not be read. Restart Hold Explorer.");
      return searchResults(query);
    });
    const input = await field();
    await user.click(input);
    await user.keyboard("573");
    const failure =
      "The search could not be read: The snapshot could not be read. Restart Hold Explorer.";
    expect(await screen.findByText(failure, { selector: "p span" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((status) => status.textContent === failure)).toBe(
      true,
    );
    fails = false;
    await user.keyboard("{ArrowDown}");
    expect(within(await results()).getByRole("option", { name: en.common.retry })).toHaveAttribute(
      "data-focused",
    );
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(sent).toEqual(["573", "573"]);
    });
    expect(
      await within(await results()).findByRole("option", { name: "78B04-573-00004-PR-004" }),
    ).toBeInTheDocument();
  });
});

describe("choosing a result", () => {
  it(
    "of a line opens Lines with the line in the panel, the focus on its heading",
    SLOW,
    async () => {
      const { user, router } = renderSearch("/overview");
      const { input, list } = await typeAndOpen(user, "573");
      await user.click(within(list).getByRole("option", { name: "78B04-573-00004-PR-004" }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      expect(new URLSearchParams(router.state.location.search).get("line")).toBe(
        "78B04-573-00004-PR-004",
      );
      expect(input).toHaveValue("");
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "78B04-573-00004-PR-004" })).toHaveFocus();
      });
    },
  );

  it("of a blocker opens Blockers with the blocker in the panel", SLOW, async () => {
    const { user, router } = renderSearch("/lines");
    const { list } = await typeAndOpen(user, "573");
    await user.click(within(list).getByRole("option", { name: "Piping / 573-PR-1450" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/blockers");
    });
    expect(new URLSearchParams(router.state.location.search).get("blocker")).toBe(
      "Piping|573-PR-1450",
    );
    expect(filtersNow()?.fields ?? []).toEqual([]);
  });

  it.each([
    ["R. Tanaka", "Name", "R. Tanaka"],
    ["Checker", "Role", "Checker"],
    ["HOLD PENDING 573-PR-1450", "Remark", "HOLD PENDING 573-PR-1450"],
    ["Process data", "HoldType", "Process data"],
  ] as const)(
    "of %s filters by it in place of the field's values and opens the holds",
    SLOW,
    async (name, dim, key) => {
      const { user, router } = renderSearch("/overview");
      // A value set before on the same field is replaced, and another field stays.
      act(() => {
        queryClient.setQueryData<Filters>(keys.workspaceFilters(workspace().id), (held) => ({
          ...(held ?? defaultFilters),
          fields: [
            { dim, values: [{ key: "Before", label: "Before" }], negate: true },
            { dim: "Discipline", values: [{ key: "Piping", label: "Piping" }], negate: false },
          ],
        }));
      });
      const { input, list } = await typeAndOpen(user, "573");
      await user.click(within(list).getByRole("option", { name }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      expect(new URLSearchParams(router.state.location.search).get("rows")).toBe("holds");
      expect(filtersNow()?.fields).toEqual([
        { dim, values: [{ key, label: name }], negate: false },
        { dim: "Discipline", values: [{ key: "Piping", label: "Piping" }], negate: false },
      ]);
      expect(input).toHaveValue("");
      await waitFor(() => {
        expect(document.activeElement?.closest("main [role='grid']")).not.toBeNull();
      });
    },
  );

  it("“N more in Lines” sets the text filter and opens Lines", SLOW, async () => {
    const { user, router } = renderSearch("/settings");
    const { list } = await typeAndOpen(user, "573");
    await user.click(within(list).getByRole("option", { name: "10 more in Lines" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    expect(filtersNow()?.text).toBe("573");
  });

  it("“N more in Blockers” sets the text filter and opens Blockers", SLOW, async () => {
    const { user, router } = renderSearch("/overview", (query) => ({
      query,
      groups: searchGroups().map((group) =>
        group.kind === "Blockers" ? { ...group, total: 5 } : group,
      ),
    }));
    const { list } = await typeAndOpen(user, "573");
    await user.click(within(list).getByRole("option", { name: "4 more in Blockers" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/blockers");
    });
    expect(filtersNow()?.text).toBe("573");
  });
});

describe("Enter with no result highlighted", () => {
  it("sets the text filter of the data screen shown, which stays", SLOW, async () => {
    const { user, router } = renderSearch("/blockers");
    const { input } = await typeAndOpen(user, "573");
    await user.keyboard("{Enter}");
    expect(filtersNow()?.text).toBe("573");
    expect(router.state.location.pathname).toBe("/blockers");
    expect(input).toHaveValue("");
    await waitFor(() => {
      expect(document.activeElement?.closest("main [role='grid']")).not.toBeNull();
    });
  });

  it("sets the text filter of Lines from Settings, and opens Lines", SLOW, async () => {
    const { user, router } = renderSearch("/settings");
    const input = await field();
    await user.click(input);
    await user.keyboard(" flange {Enter}");
    expect(filtersNow()?.text).toBe("flange");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    await waitFor(() => {
      expect(document.activeElement?.closest("main [role='grid']")).not.toBeNull();
    });
  });
});

describe("by keyboard only", () => {
  it(
    "moves through the results, chooses one with Enter, and Escape closes then clears",
    SLOW,
    async () => {
      const { user, router } = renderSearch("/overview");
      await field();
      act(() => {
        focusSearchField();
      });
      await user.keyboard("573");
      const list = await results();
      await within(list).findByText(/^Lines · /);
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).toBeNull();
      });
      const input = await field();
      expect(input).toHaveValue("573");
      expect(input).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(input).toHaveValue("");
      expect(input).toHaveFocus();
      await user.keyboard("573");
      await within(await results()).findByText(/^Lines · /);
      await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
      await waitFor(() => {
        expect(new URLSearchParams(router.state.location.search).get("line")).toBe(
          "78B02-573-00195-PR-006",
        );
      });
    },
  );
});

describe("accessibility", () => {
  it("passes the checker on the page, and with the results open", SLOW, async () => {
    const { user } = renderSearch();
    await field();
    await expectAccessible(document.body, { page: true });
    // The results lie over the page, outside its landmarks, as every overlay does.
    await typeAndOpen(user, "573");
    await expectAccessible();
  });
});

/** The groups of every test, with a discipline and a stress calc among the hold values. */
function everyKind(released: boolean): SearchResults["groups"] {
  return searchGroups().map((group) => {
    const hits =
      group.kind === "Holds"
        ? [
            ...group.hits,
            searchHit("Discipline", "Process", "|Process|", { holds: 913 }),
            searchHit("StressCalc", "SC-573", "SC-|573|", { holds: 4 }),
          ]
        : group.hits;
    return {
      ...group,
      total: Math.max(group.total, hits.length),
      hits: hits.map((hit) => ({ ...hit, released })),
    };
  });
}

const KINDS = [
  ["Line", "78B04-573-00004-PR-004"],
  ["Blocker", "Piping / 573-PR-1450"],
  ["Person", "R. Tanaka"],
  ["Role", "Checker"],
  ["Remark", "HOLD PENDING 573-PR-1450"],
  ["HoldType", "Process data"],
  ["Discipline", "Process"],
  ["StressCalc", "SC-573"],
] as const;

describe("a result whose holds are all released", () => {
  it.each(KINDS)("of the kind %s widens the status to All holds", SLOW, async (_kind, name) => {
    const { user } = renderSearch("/overview", (query) => ({ query, groups: everyKind(true) }));
    const { list } = await typeAndOpen(user, "573");
    expect(filtersNow()?.status ?? defaultFilters.status).toBe("Open");
    await user.click(within(list).getByRole("option", { name }));
    await waitFor(() => {
      expect(filtersNow()?.status).toBe("All");
    });
    // The status control of the filter bar shows it.
    expect(
      await screen.findByRole("button", {
        name: en.filters.status.name.replace("{{status}}", en.filters.status.All),
      }),
    ).toBeInTheDocument();
  });

  it.each(KINDS)("of the kind %s, with open holds, keeps the status", SLOW, async (_kind, name) => {
    const { user } = renderSearch("/overview", (query) => ({ query, groups: everyKind(false) }));
    const { list } = await typeAndOpen(user, "573");
    await user.click(within(list).getByRole("option", { name }));
    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: words.results })).toBeNull();
    });
    expect(filtersNow()?.status ?? defaultFilters.status).toBe("Open");
  });

  it("keeps Released holds as the user chose it", SLOW, async () => {
    const { user } = renderSearch("/overview", (query) => ({ query, groups: everyKind(true) }));
    act(() => {
      queryClient.setQueryData<Filters>(keys.workspaceFilters(workspace().id), {
        ...defaultFilters,
        status: "Released",
      });
    });
    const { list } = await typeAndOpen(user, "573");
    await user.click(within(list).getByRole("option", { name: "R. Tanaka" }));
    await waitFor(() => {
      expect(filtersNow()?.fields).toHaveLength(1);
    });
    expect(filtersNow()?.status).toBe("Released");
  });
});

describe("a line chosen while Lines is shown", () => {
  it("keeps the sort and the rest of the address of the lines", SLOW, async () => {
    const { user, router } = renderSearch("/lines?sort=LineId&reverse=1");
    const { list } = await typeAndOpen(user, "573");
    await user.click(within(list).getByRole("option", { name: "78B04-573-00004-PR-004" }));
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get("line")).toBe(
        "78B04-573-00004-PR-004",
      );
    });
    const parts = new URLSearchParams(router.state.location.search);
    expect(parts.get("sort")).toBe("LineId");
    expect(parts.get("reverse")).toBe("1");
  });

  it("turns the hold rows to the lines, where the line has a row", SLOW, async () => {
    const { user, router } = renderSearch("/lines?rows=holds&sort=Blocker&hold=3");
    const { list } = await typeAndOpen(user, "573");
    await user.click(within(list).getByRole("option", { name: "78B04-573-00004-PR-004" }));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?line=78B04-573-00004-PR-004");
    });
  });
});

describe("a remark chosen", () => {
  it(
    "filters by the key the values of its field have, and the holds are read with it",
    SLOW,
    async () => {
      // The command folds a remark's key (crates/core/src/search.rs); the picker's values have the
      // same key under the remark as written.
      const key = "HOLD PENDING 573-PR-1450";
      const specs: FilterSpec[] = [];
      const { user } = renderApp({
        start: openStart(),
        path: "/overview",
        handlers: {
          search: ({ query }) => ({
            query,
            groups: [
              {
                kind: "Lines",
                total: 1,
                hits: [searchHit("Line", "78B04-573-00004-PR-004", "78B04-|573|-00004-PR-004")],
              },
              {
                kind: "Remarks",
                total: 1,
                hits: [searchHit("Remark", key, "Hold pending |573|-PR-1450", { holds: 4 })],
              },
            ],
          }),
          filter_values: () => valuePage({ values: [group("Hold pending 573-PR-1450", 4, key)] }),
          holds: ({ spec }) => {
            specs.push(spec);
            return holdsView();
          },
        },
      });
      const { list } = await typeAndOpen(user, "573");
      await user.click(within(list).getByRole("option", { name: "Hold pending 573-PR-1450" }));
      await waitFor(() => {
        expect(specs.at(-1)?.fields).toEqual([{ dim: "Remark", values: [key], negate: false }]);
      });
      // The key is the one the values of the field are listed under.
      const listed = valuePage({ values: [group("Hold pending 573-PR-1450", 4, key)] });
      expect(listed.values.map((value) => value.key)).toContain(specs.at(-1)?.fields[0]?.values[0]);
      expect(filtersNow()?.fields).toEqual([
        { dim: "Remark", values: [{ key, label: key }], negate: false },
      ]);
    },
  );
});

describe("what is typed is sent, by the clock", () => {
  it("150 ms after typing stops, and not a millisecond before", SLOW, async () => {
    const { sent } = renderSearch();
    const input = await field();
    // Only the clock of the debounce is faked; everything else runs as it does.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      act(() => {
        input.focus();
      });
      fireEvent.change(input, { target: { value: "573" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(149);
      });
      expect(sent).toEqual([]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      // The reading goes out once React has drawn the new text; nothing else waits on the clock.
      for (let turns = 0; turns < 20 && sent.length === 0; turns += 1) {
        await act(async () => {
          await Promise.resolve();
        });
      }
      expect(sent).toEqual(["573"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
