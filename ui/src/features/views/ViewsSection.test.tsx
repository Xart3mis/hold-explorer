import { act, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { useWorkspaceActions } from "../../app/actions/workspaces";
import { useFilters } from "../../app/filters/state";
import { destinationPages } from "../../app/router";
import { Page } from "../../app/shell/Page";
import type { SavedView } from "../../bindings/SavedView";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import en from "../../locales/en.json";
import { held } from "../../test/actions";
import { must, renderApp } from "../../test/app";
import { expectAccessible } from "../../test/axe";
import { opened, openStart, otherWorkspace } from "../../test/fixtures";
import type { Handlers } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { disciplineFilter, savedView } from "../../test/views";
import { SIDEBAR_STORAGE_KEY } from "../shell/window";
import { FilterBar } from "../filters/FilterBar";

const text = en.views;
const names = en.destinations.name;

type Probe = ReturnType<typeof useFilters> & { open: (id: string) => void };

/** What the page of the test reads: the filters, and the action that opens a workspace. */
const probe: { page?: Probe } = {};

function now(): Probe {
  return must(probe.page, "the page of the test");
}

/**
 * A data screen with its header, the filter bar, a mark that is gone when the page is drawn
 * anew, and the filters as text.
 */
function Screen({ name }: { name: string }) {
  const filters = useFilters();
  const { openWorkspace } = useWorkspaceActions();
  const [marked, setMarked] = useState(false);
  useEffect(() => {
    probe.page = {
      ...filters,
      open: (id) => {
        openWorkspace.mutate(id);
      },
    };
  });
  return (
    <Page title={name} bar={<FilterBar />}>
      <button
        type="button"
        onClick={() => {
          setMarked(true);
        }}
      >
        mark
      </button>
      <p data-testid="marked">{marked ? "marked" : ""}</p>
      <div style={{ blockSize: "4000px" }} />
    </Page>
  );
}

const pages = {
  ...destinationPages,
  overview: <Screen name="Overview" />,
  breakdown: <Screen name="Breakdown" />,
  lines: <Screen name="Lines" />,
  blockers: <Screen name="Blockers" />,
};

const civil = savedView({
  id: 1,
  name: "Civil holds",
  address: "/lines?rows=holds",
  filters: disciplineFilter("Civil"),
});
const blockers = savedView({ id: 2, name: "All blockers", address: "/blockers" });
const piping = savedView({ id: 3, name: "Piping lines", address: "/lines" });

function renderWith(
  views: SavedView[],
  options: { path?: string; handlers?: Handlers; open?: WorkspaceOpen } = {},
) {
  delete probe.page;
  return renderApp({
    start: openStart({ open: options.open ?? opened({ views }) }),
    path: options.path ?? "/overview",
    pages,
    ...(options.handlers === undefined ? {} : { handlers: options.handlers }),
  });
}

async function sidebar() {
  return screen.findByRole("navigation", { name: en.destinations.label });
}

async function viewList() {
  return within(await sidebar()).findByRole("list", { name: text.title });
}

function viewLink(name: string) {
  return within(screen.getByRole("list", { name: text.title })).getByRole("link", { name });
}

function scrollArea(): HTMLElement {
  return must(
    screen.getByRole("main").querySelector<HTMLElement>("[class*='scroll']"),
    "the area the page scrolls in",
  );
}

async function openMenu(user: ReturnType<typeof renderApp>["user"], name: string) {
  await user.click(screen.getByRole("button", { name: text.actions.replace("{{name}}", name) }));
  return screen.findByRole("menu", { name: text.actions.replace("{{name}}", name) });
}

describe("the saved views of the sidebar", () => {
  it("lists every view by name between the data destinations and the setup", async () => {
    renderWith([civil, blockers, piping]);
    const nav = await sidebar();
    const list = await viewList();
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Civil holds", "All blockers", "Piping lines"]);
    // In the order of the sidebar: the data destinations, the views, then Rules and Settings.
    const links = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.indexOf("Civil holds")).toBeGreaterThan(
      links.indexOf(names["follow-up"] + " Soon"),
    );
    expect(links.indexOf("Piping lines")).toBeLessThan(links.indexOf(`${names.rules} Soon`));
  });

  it("says how to save one when there is none", async () => {
    renderWith([]);
    const nav = await sidebar();
    expect(within(nav).getByText(text.title)).toBeInTheDocument();
    expect(within(nav).getByText(text.empty)).toBeInTheDocument();
    expect(within(nav).queryByRole("list", { name: text.title })).not.toBeInTheDocument();
  });

  it("is one button in the rail, whose menu lists the views and applies one", SLOW, async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "rail");
    try {
      const { user, router } = renderWith([civil, blockers]);
      const nav = await sidebar();
      expect(within(nav).queryByRole("list", { name: text.title })).not.toBeInTheDocument();
      await user.click(within(nav).getByRole("button", { name: text.title }));
      const menu = await screen.findByRole("menu", { name: text.title });
      expect(
        within(menu)
          .getAllByRole("menuitemradio")
          .map((item) => item.textContent),
      ).toEqual(["Civil holds", "All blockers"]);
      await user.click(within(menu).getByRole("menuitemradio", { name: "Civil holds" }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      expect(router.state.location.search).toBe("?rows=holds");
      expect(now().spec.fields).toEqual(civil.filters.fields);
      // The view shown is the checked one.
      await user.click(within(nav).getByRole("button", { name: text.title }));
      const again = await screen.findByRole("menu", { name: text.title });
      expect(within(again).getByRole("menuitemradio", { name: "Civil holds" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    } finally {
      window.localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    }
  });

  it("is one button in the rail whose menu says how to save one when there is none", async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "rail");
    try {
      const { user } = renderWith([]);
      const nav = await sidebar();
      await user.click(within(nav).getByRole("button", { name: text.title }));
      const menu = await screen.findByRole("menu", { name: text.title });
      expect(within(menu).getByRole("menuitem", { name: text.empty })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    } finally {
      window.localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    }
  });
});

describe("applying a saved view", () => {
  it("sets the filters of the workspace, then opens the view's address", async () => {
    const { user, router } = renderWith([civil, blockers]);
    await viewList();
    await user.click(viewLink("Civil holds"));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    expect(router.state.location.search).toBe("?rows=holds");
    await waitFor(() => {
      expect(now().spec).toEqual(civil.filters);
    });
    // The chip of the filter reads the value by its key: there is no other label for it.
    expect(screen.getByRole("button", { name: /Discipline Civil/ })).toBeInTheDocument();
  });

  it("marks the view current while the address and the filters are its own", SLOW, async () => {
    const { user, router } = renderWith([civil, blockers]);
    await viewList();
    expect(viewLink("Civil holds")).not.toHaveAttribute("aria-current");
    await user.click(viewLink("Civil holds"));
    await waitFor(() => {
      expect(viewLink("Civil holds")).toHaveAttribute("aria-current", "true");
    });
    expect(viewLink("All blockers")).not.toHaveAttribute("aria-current");
    // A row selected is no change of the view.
    await act(() => router.navigate("/lines?rows=holds&hold=3"));
    expect(viewLink("Civil holds")).toHaveAttribute("aria-current", "true");

    // The filters change: the mark goes.
    act(() => {
      now().update((current) => ({ ...current, text: "valve" }));
    });
    await waitFor(() => {
      expect(viewLink("Civil holds")).not.toHaveAttribute("aria-current");
    });
    act(() => {
      now().update((current) => ({ ...current, text: "" }));
    });
    await waitFor(() => {
      expect(viewLink("Civil holds")).toHaveAttribute("aria-current", "true");
    });

    // The address changes: the mark goes.
    await act(() => router.navigate("/lines"));
    expect(viewLink("Civil holds")).not.toHaveAttribute("aria-current");
  });

  it("applies the current view again: the selection and the scroll are reset", SLOW, async () => {
    const { user, router } = renderWith([piping], { path: "/lines?line=L-1" });
    await viewList();
    expect(viewLink("Piping lines")).toHaveAttribute("aria-current", "true");
    await user.click(await screen.findByRole("button", { name: "mark" }));
    expect(screen.getByTestId("marked")).toHaveTextContent("marked");
    scrollArea().scrollTop = 240;

    await user.click(viewLink("Piping lines"));
    expect(router.state.location.pathname).toBe("/lines");
    expect(router.state.location.search).toBe("");
    await waitFor(() => {
      expect(screen.getByTestId("marked")).toBeEmptyDOMElement();
    });
    expect(scrollArea().scrollTop).toBe(0);
  });

  it("applies a view whose filter is on a field the snapshot may lack", async () => {
    const area = savedView({
      id: 4,
      name: "North area",
      address: "/lines",
      filters: {
        ...disciplineFilter(),
        fields: [{ dim: { Custom: "Area" }, values: ["North", ""], negate: true }],
      },
    });
    const { user } = renderWith([area]);
    await viewList();
    await user.click(viewLink("North area"));
    await waitFor(() => {
      expect(now().filters.fields).toEqual([
        {
          dim: { Custom: "Area" },
          values: [
            { key: "North", label: "North" },
            { key: "", label: en.common.blank },
          ],
          negate: true,
        },
      ]);
    });
  });

  it("is inert while an action on the workspace runs", async () => {
    const open = held<WorkspaceOpen>();
    const { user, router } = renderWith([civil], { handlers: { workspace_open: open.handler } });
    await viewList();
    await screen.findByRole("heading", { name: "Overview" });
    act(() => {
      now().open(otherWorkspace.id);
    });
    await waitFor(() => {
      expect(viewLink("Civil holds")).toHaveAttribute("aria-disabled", "true");
    });
    expect(viewLink("Civil holds")).toHaveAttribute("aria-busy", "true");
    await user.click(viewLink("Civil holds"));
    expect(router.state.location.pathname).toBe("/overview");
    // The items of its menu are disabled.
    const menu = await openMenu(user, "Civil holds");
    for (const item of within(menu).getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("aria-disabled", "true");
    }
    await user.keyboard("{Escape}");
    await act(async () => {
      must(open.waiting[0], "the opening").resolve(opened({ workspace: otherWorkspace }));
      await Promise.resolve();
    });
  });
});

describe("the menu of a saved view", () => {
  it("renames in place: Enter saves, Escape cancels, a refusal is said inline", SLOW, async () => {
    const { user } = renderWith([civil, blockers]);
    await viewList();

    await user.click(
      within(await openMenu(user, "Civil holds")).getByRole("menuitem", { name: text.rename }),
    );
    const field = await screen.findByRole("textbox", { name: text.nameLabel });
    expect(field).toHaveFocus();
    expect(field).toHaveValue("Civil holds");
    expect((field as HTMLInputElement).selectionStart).toBe(0);
    expect((field as HTMLInputElement).selectionEnd).toBe("Civil holds".length);

    // Escape leaves the name as it was.
    await user.keyboard("Something{Escape}");
    expect(viewLink("Civil holds")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: text.actions.replace("{{name}}", "Civil holds") }),
    ).toHaveFocus();

    // A name another view has is refused, and said under the field.
    await user.click(
      within(await openMenu(user, "Civil holds")).getByRole("menuitem", { name: text.rename }),
    );
    await user.keyboard("all BLOCKERS{Enter}");
    const refused = await screen.findByText(/already exists/);
    const again = screen.getByRole("textbox", { name: text.nameLabel });
    expect(again).toHaveAttribute("aria-invalid", "true");
    expect(again).toHaveAccessibleDescription(refused.textContent);

    // Enter saves.
    await user.clear(again);
    await user.keyboard("Civil, open{Enter}");
    await waitFor(() => {
      expect(viewLink("Civil, open")).toBeInTheDocument();
    });
    expect(screen.queryByRole("textbox", { name: text.nameLabel })).not.toBeInTheDocument();
  });

  it("moves a view up and down, and cannot move the first up nor the last down", SLOW, async () => {
    const { user } = renderWith([civil, blockers, piping]);
    const list = await viewList();
    const order = () =>
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent);

    const first = await openMenu(user, "Civil holds");
    expect(within(first).getByRole("menuitem", { name: text.moveUp })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(within(first).getByRole("menuitem", { name: text.moveDown }));
    await waitFor(() => {
      expect(order()).toEqual(["All blockers", "Civil holds", "Piping lines"]);
    });

    const last = await openMenu(user, "Piping lines");
    expect(within(last).getByRole("menuitem", { name: text.moveDown })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(within(last).getByRole("menuitem", { name: text.moveUp }));
    await waitFor(() => {
      expect(order()).toEqual(["All blockers", "Piping lines", "Civil holds"]);
    });
  });

  it("deletes at once and puts the view back where it was on Undo", SLOW, async () => {
    const { user } = renderWith([civil, blockers, piping]);
    const list = await viewList();
    const order = () =>
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent);

    await user.click(
      within(await openMenu(user, "All blockers")).getByRole("menuitem", { name: text.delete }),
    );
    await waitFor(() => {
      expect(order()).toEqual(["Civil holds", "Piping lines"]);
    });
    // The focus goes to the next view.
    expect(viewLink("Piping lines")).toHaveFocus();
    const toast = await screen.findByRole("group", { name: "Deleted view All blockers" });
    await user.click(within(toast).getByRole("button", { name: en.common.undo }));
    await waitFor(() => {
      expect(order()).toEqual(["Civil holds", "All blockers", "Piping lines"]);
    });
  });

  it(
    "says in a toast that the Undo failed when another view took the name meanwhile",
    SLOW,
    async () => {
      const { user } = renderWith([civil, blockers]);
      await viewList();

      await user.click(
        within(await openMenu(user, "All blockers")).getByRole("menuitem", { name: text.delete }),
      );
      const toast = await screen.findByRole("group", { name: "Deleted view All blockers" });

      await user.click(
        within(await openMenu(user, "Civil holds")).getByRole("menuitem", { name: text.rename }),
      );
      await user.keyboard("All blockers{Enter}");
      await waitFor(() => {
        expect(viewLink("All blockers")).toBeInTheDocument();
      });

      await user.click(within(toast).getByRole("button", { name: en.common.undo }));
      expect(
        await screen.findByRole("group", {
          name: 'A saved view named "All blockers" already exists.',
        }),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("list", { name: text.title })).getAllByRole("link"),
      ).toHaveLength(1);
    },
  );

  it("puts the focus on the section when the last view is deleted", async () => {
    const { user } = renderWith([civil]);
    await viewList();
    await user.click(
      within(await openMenu(user, "Civil holds")).getByRole("menuitem", { name: text.delete }),
    );
    await waitFor(() => {
      expect(screen.getByText(text.empty)).toBeInTheDocument();
    });
    expect(screen.getByText(text.title).parentElement).toHaveFocus();
  });
});

describe("the saved views by keyboard alone", () => {
  it("applies a view, and reaches its menu, by Tab and Enter", SLOW, async () => {
    const { user, router } = renderWith([civil, blockers]);
    await viewList();
    viewLink("Civil holds").focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    // The menu button follows its item in the Tab order.
    viewLink("All blockers").focus();
    await user.tab();
    const button = screen.getByRole("button", {
      name: text.actions.replace("{{name}}", "All blockers"),
    });
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", {
      name: text.actions.replace("{{name}}", "All blockers"),
    });
    await waitFor(() => {
      expect(within(menu).getByRole("menuitem", { name: text.rename })).toHaveFocus();
    });
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: text.title }))
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["All blockers", "Civil holds"]);
    });
  });

  it("has no accessibility violation, with a menu open", SLOW, async () => {
    const { user } = renderWith([civil, blockers]);
    await viewList();
    await user.click(viewLink("Civil holds"));
    await waitFor(() => {
      expect(viewLink("Civil holds")).toHaveAttribute("aria-current", "true");
    });
    await expectAccessible(document.body, { page: true });
    await openMenu(user, "All blockers");
    await expectAccessible();
  });
});
