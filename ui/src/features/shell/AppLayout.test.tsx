import { act, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { destinations } from "../../app/destinations";
import { destinationPages } from "../../app/router";
import { Button } from "../../components";
import { durationToken } from "../../design/token-values";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp, topBar } from "../../test/app";
import { opened, openStart, startState } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { fileDrag, windowApi } from "../../test/window";
import { connectImportStart } from "../import/start";
import { useShell } from "./context";
import { Page } from "./Page";

const names = en.destinations.name;
const soon = en.destinations.soon;
const switcher = `${en.workspaces.switcher} Unit 573 piping`;

async function sidebar() {
  return screen.findByRole("navigation", { name: en.destinations.label });
}

describe("the sidebar", () => {
  it("lists the nine destinations in order, in two groups", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    const lists = within(await sidebar()).getAllByRole("list");
    expect(lists).toHaveLength(2);
    const [data, setup] = lists;
    if (!data || !setup) throw new Error("The sidebar has no two lists.");
    expect(
      within(data)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      names.overview,
      `${names.breakdown} ${soon}`,
      `${names.lines} ${soon}`,
      `${names.blockers} ${soon}`,
      `${names.history} ${soon}`,
      `${names.people} ${soon}`,
      `${names["follow-up"]} ${soon}`,
    ]);
    expect(
      within(setup)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([`${names.rules} ${soon}`, names.settings]);
  });

  it("puts the Soon tag in the accessible name of the seven that are not built, and of no other", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    const nav = await sidebar();
    for (const id of [
      "breakdown",
      "lines",
      "blockers",
      "history",
      "people",
      "follow-up",
      "rules",
    ] as const) {
      expect(within(nav).getByRole("link", { name: `${names[id]} ${soon}` })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("link", { name: names.overview })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: names.settings })).toBeInTheDocument();
    expect(within(nav).getAllByText(soon)).toHaveLength(7);
  });

  it("marks the current destination, and only it", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    const nav = await sidebar();
    const overview = within(nav).getByRole("link", { name: names.overview });
    const lines = within(nav).getByRole("link", { name: `${names.lines} ${soon}` });
    expect(overview).toHaveAttribute("aria-current", "page");
    expect(
      within(nav)
        .getAllByRole("link")
        .filter((link) => link.hasAttribute("aria-current")),
    ).toHaveLength(1);

    await user.click(lines);
    expect(lines).toHaveAttribute("aria-current", "page");
    expect(overview).not.toHaveAttribute("aria-current");
  });

  it("never disables a destination and names the shortcut of each for assistive technology", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    const links = within(await sidebar()).getAllByRole("link");
    expect(links).toHaveLength(9);
    for (const link of links) {
      expect(link).not.toHaveAttribute("aria-disabled");
      expect(link).toHaveAttribute("href");
    }
    expect(links.map((link) => link.getAttribute("aria-keyshortcuts"))).toEqual([
      "Control+1",
      "Control+2",
      "Control+3",
      "Control+4",
      "Control+5",
      "Control+6",
      "Control+7",
      null,
      "Control+,",
    ]);
  });

  it("shows the shortcut of a destination in its tooltip", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    // From the top of the document: the switcher, the selector, Import, Overview, Breakdown.
    (document.activeElement as HTMLElement | null)?.blur();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("link", { name: `${names.breakdown} ${soon}` })).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(names.breakdown);
    expect(tooltip).toHaveTextContent("Ctrl+2");
  });

  it("tells the toast region where the content area starts while it shows, and stops when it goes", async () => {
    const root = document.documentElement;
    const { unmount } = renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    expect(root).toHaveAttribute("data-sidebar");
    unmount();
    expect(root).not.toHaveAttribute("data-sidebar");

    renderApp({ start: startState(), path: "/welcome" });
    await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    expect(root).not.toHaveAttribute("data-sidebar");
  });
});

describe("where toasts sit", () => {
  const source = join(import.meta.dirname, "../..");
  const inset = () =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--toast-inset-inline-start")
      .trim();

  it("is the edge of the content area while the sidebar shows, and the default otherwise", async () => {
    // The app's own stylesheet says what the mark on the root element means.
    const sheet = document.createElement("style");
    sheet.textContent = readFileSync(join(source, "app.css"), "utf8");
    document.head.append(sheet);
    try {
      expect(inset()).toBe("");
      const open = renderApp({ start: openStart(), path: "/overview" });
      await sidebar();
      expect(inset()).toBe("calc(var(--layout-sidebar-width) + var(--space-6))");
      open.unmount();
      expect(inset()).toBe("");

      renderApp({ start: startState(), path: "/welcome" });
      await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
      expect(inset()).toBe("");
    } finally {
      sheet.remove();
    }
  });

  it("is read by the toast region, which falls back to the page gutter", () => {
    const toasts = readFileSync(
      join(source, "components/ToastRegion/ToastRegion.module.css"),
      "utf8",
    );
    expect(toasts).toContain(
      "inset-inline-start: var(--toast-inset-inline-start, var(--layout-page-padding-x));",
    );
  });
});

describe("the top bar", () => {
  it("holds the workspace switcher, the snapshot selector, and Import, in that order", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    const bar = topBar();
    expect(within(bar).getByText(en.app.name)).toBeInTheDocument();
    const buttons = within(bar).getAllByRole("button");
    expect(
      buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent),
    ).toEqual([switcher, "Snapshot 7 Oct 2026", en.shell.import]);
    // The page title is not repeated in the top bar: the page header carries it.
    expect(within(bar).queryByText(names.overview)).not.toBeInTheDocument();
  });

  it("without a workspace offers Workspaces, Settings, and Import, and no sidebar", async () => {
    renderApp({ start: startState(), path: "/welcome" });
    const nav = await screen.findByRole("navigation", { name: en.shell.navigation });
    const bar = topBar();
    expect(bar).toContainElement(nav);
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([en.workspaces.title, names.settings]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
    expect(within(bar).getByRole("button", { name: en.shell.import })).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: en.destinations.label }),
    ).not.toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /Snapshot/ })).not.toBeInTheDocument();
  });

  it("has no snapshot selector for a workspace without snapshots", async () => {
    renderApp({
      start: openStart({ open: opened({ snapshots: [], selected: null }) }),
      path: "/overview",
    });
    await screen.findByRole("button", { name: switcher });
    expect(within(topBar()).queryByRole("button", { name: /Snapshot/ })).not.toBeInTheDocument();
  });

  it("shows, without blocking, that the workspace could not be remembered", async () => {
    const message =
      "The workspace is open, but Hold Explorer could not remember it for the next start. The settings file could not be written (permission denied). Check that the folder can be written to.";
    const { user } = renderApp({
      start: openStart({ open: opened({ warning: { kind: "Settings", message } }) }),
      path: "/overview",
    });
    const notice = must(
      (await screen.findByText(message)).closest<HTMLElement>('[role="status"]'),
      "the notice around the message",
    );
    expect(notice).toHaveAttribute("data-tone", "warning");
    // The page is there and works.
    expect(screen.getByRole("heading", { level: 1, name: names.overview })).toBeInTheDocument();
    await user.click(within(notice).getByRole("button", { name: en.common.dismiss }));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });
});

describe("what a page reports to the shell", () => {
  const failed = {
    title: "The import of Holds_2026-10-14.xlsx did not complete",
    error: {
      kind: "Io",
      message:
        "The workspace file could not be written (the disk is full). Free some space, then import again.",
    },
  };

  /** A page that has something to report that outlives it. */
  function Reporting() {
    const { report } = useShell();
    return (
      <Page title={names.overview}>
        <Button
          onPress={() => {
            report(failed);
          }}
        >
          Report
        </Button>
      </Page>
    );
  }

  it("is shown under the top bar with its title and the reason, stays on every page, and can be dismissed", async () => {
    const { user } = renderApp({
      start: openStart(),
      path: "/overview",
      pages: { ...destinationPages, overview: <Reporting /> },
    });
    await user.click(await screen.findByRole("button", { name: "Report" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-tone", "danger");
    expect(alert).toHaveTextContent(failed.title);
    expect(alert).toHaveTextContent(failed.error.message);
    // It belongs to the shell, not to the page that reported it.
    expect(screen.getByRole("main")).toContainElement(alert);
    expect(must(document.querySelector("[data-part='page']"), "the page")).not.toContainElement(
      alert,
    );
    await user.click(within(await sidebar()).getByRole("link", { name: names.settings }));
    await screen.findByRole("heading", { level: 1, name: names.settings });
    expect(screen.getByRole("alert")).toHaveTextContent(failed.title);

    await user.click(
      within(screen.getByRole("alert")).getByRole("button", { name: en.common.dismiss }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("shortcuts", () => {
  it("Ctrl+1 to Ctrl+7 open the first seven destinations, built or not", SLOW, async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/settings" });
    await sidebar();
    const first = destinations.slice(0, 7);
    for (const [index, destination] of first.entries()) {
      await user.keyboard(`{Control>}${String(index + 1)}{/Control}`);
      expect(router.state.location.pathname).toBe(destination.path);
      expect(
        await screen.findByRole("heading", { level: 1, name: names[destination.id] }),
      ).toBeInTheDocument();
    }
  });

  it("Ctrl+, opens Settings", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    await user.keyboard("{Control>},{/Control}");
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("Ctrl+I starts an import: the file dialog, then the import page with the chosen file", async () => {
    windowApi.chooseImportFile.mockResolvedValue("/exports/Holds_2026-10-07.xlsx");
    const { user, router } = renderApp({
      start: openStart(),
      path: "/lines",
      handlers: { import_open: () => new Promise(() => undefined) },
    });
    await sidebar();
    await user.keyboard("{Control>}i{/Control}");
    expect(windowApi.chooseImportFile).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import");
    });
    expect(router.state.location.state).toMatchObject({
      path: "/exports/Holds_2026-10-07.xlsx",
      from: "/lines",
    });
  });

  it("a cancelled file dialog changes nothing", async () => {
    windowApi.chooseImportFile.mockResolvedValue(null);
    const { user, router } = renderApp({ start: openStart(), path: "/lines" });
    await sidebar();
    await user.click(screen.getByRole("button", { name: en.shell.import }));
    expect(windowApi.chooseImportFile).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(router.state.location.pathname).toBe("/lines");
  });

  it("works by the physical key of a digit on a layout that types another character there", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    // The key of 3 on a French keyboard types a quotation mark without Shift.
    await user.keyboard("{Control>}[Digit3]{/Control}");
    expect(router.state.location.pathname).toBe("/lines");
  });

  it("does nothing for a destination while no workspace is open, and still opens Settings", async () => {
    const { user, router } = renderApp({ start: startState(), path: "/welcome" });
    const heading = await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    const visits: string[] = [];
    router.subscribe((state) => visits.push(state.location.pathname));
    for (const digit of ["1", "2", "3", "4", "5", "6", "7"]) {
      await user.keyboard(`{Control>}${digit}{/Control}`);
    }
    // Not even a visit that is sent back: nothing was navigated.
    expect(visits).toEqual([]);
    expect(router.state.location.pathname).toBe("/welcome");
    expect(heading).toBeInTheDocument();

    await user.keyboard("{Control>},{/Control}");
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("does not fire while a menu is open", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    await user.click(await screen.findByRole("button", { name: switcher }));
    await screen.findByRole("menu", { name: en.workspaces.switcher });
    await user.keyboard("{Control>}3{/Control}");
    await user.keyboard("{Control>},{/Control}");
    expect(router.state.location.pathname).toBe("/overview");
    expect(screen.getByRole("menu", { name: en.workspaces.switcher })).toBeInTheDocument();

    // Once the menu is closed the shortcuts are back.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    await user.keyboard("{Control>}3{/Control}");
    expect(router.state.location.pathname).toBe("/lines");
  });

  it("does not fire while the list of a select is open", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/settings" });
    await user.click(await screen.findByRole("button", { name: new RegExp(en.settings.theme) }));
    await screen.findByRole("listbox");
    await user.keyboard("{Control>}1{/Control}");
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("plain keys typed in a field are text, and a shortcut with Ctrl still fires there", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/welcome?new=1" });
    const field = await screen.findByRole("textbox", { name: en.workspaces.nameLabel });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    await user.keyboard("1,i7");
    expect(field).toHaveValue("1,i7");
    expect(router.state.location.pathname).toBe("/welcome");

    await user.keyboard("{Control>}3{/Control}");
    expect(router.state.location.pathname).toBe("/lines");
  });
});

describe("navigation", () => {
  it("moves focus to the heading of the page and names the page in the document title", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    const nav = await sidebar();
    expect(document.title).toBe(`${names.overview} · ${en.app.name}`);
    await user.click(within(nav).getByRole("link", { name: `${names.history} ${soon}` }));
    const heading = await screen.findByRole("heading", { level: 1, name: names.history });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(document.title).toBe(`${names.history} · ${en.app.name}`);

    await user.click(within(nav).getByRole("link", { name: names.settings }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: names.settings })).toHaveFocus();
    });
    expect(document.title).toBe(`${names.settings} · ${en.app.name}`);
  });

  it("takes the focus back to the heading when it falls to the body right after a navigation", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    const nav = await sidebar();
    // A menu that closes while the page opens gives the focus back to an element that may be
    // gone, and the focus then lands on the document body: here, the moment the heading has it.
    const steal = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLHeadingElement)) return;
      document.removeEventListener("focusin", steal);
      event.target.blur();
    };
    document.addEventListener("focusin", steal);
    await user.click(within(nav).getByRole("link", { name: names.settings }));
    const heading = await screen.findByRole("heading", { level: 1, name: names.settings });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    document.removeEventListener("focusin", steal);
  });

  it("takes it back as well when the focus falls to the body only as the menu finishes closing", async () => {
    const { router } = renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    // The page looks again on the next frame, and once more when a menu has had the time to
    // close. The test decides when each of the two comes, so that no load on the machine can
    // put its own step after the second look.
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    try {
      await act(async () => {
        await router.navigate("/settings");
      });
      const heading = screen.getByRole("heading", { level: 1, name: names.settings });
      expect(heading).toHaveFocus();
      const exit = must(durationToken("--duration-base"), "the time a menu takes to close");

      // Later than the next frame, sooner than the exit of a menu takes.
      act(() => {
        vi.advanceTimersByTime(60);
      });
      heading.blur();
      expect(document.body).toHaveFocus();
      // Nothing takes the focus back before the menu has had its time.
      act(() => {
        vi.advanceTimersByTime(exit - 60 - 1);
      });
      expect(document.body).toHaveFocus();
      // Then the page looks once more, on the frame after.
      act(() => {
        vi.advanceTimersByTime(1);
        vi.advanceTimersToNextFrame();
      });
      expect(heading).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never takes the focus from a control that was focused after the navigation", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    const nav = await sidebar();
    await user.click(within(nav).getByRole("link", { name: names.settings }));
    const heading = await screen.findByRole("heading", { level: 1, name: names.settings });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    const theme = screen.getByRole("button", { name: new RegExp(` ${en.settings.theme}$`) });
    theme.focus();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(theme).toHaveFocus();
  });

  it("leaves a focus that is lost later where it is: it watches only while the page opens", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    const nav = await sidebar();
    await user.click(within(nav).getByRole("link", { name: names.settings }));
    const heading = await screen.findByRole("heading", { level: 1, name: names.settings });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    heading.blur();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.body).toHaveFocus();
  });

  it("leaves the focus at the start of the window on the page the app opens on", async () => {
    const { user } = renderApp({ start: openStart(), path: "/" });
    const heading = await screen.findByRole("heading", { level: 1, name: names.overview });
    // Opening the app is not a navigation: nothing has taken the focus.
    expect(document.body).toHaveFocus();
    expect(heading).not.toHaveFocus();
    // The first Tab therefore reaches the first control of the top bar.
    await user.tab();
    expect(screen.getByRole("button", { name: switcher })).toHaveFocus();

    // Coming back to that page later is a navigation like any other.
    await user.keyboard("{Control>}3{/Control}");
    await user.keyboard("{Control>}1{/Control}");
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: names.overview })).toHaveFocus();
    });
  });

  it("opens Overview at start when a workspace is open, and the welcome page when none is", async () => {
    const withWorkspace = renderApp({ start: openStart(), path: "/" });
    await screen.findByRole("heading", { level: 1, name: names.overview });
    expect(withWorkspace.router.state.location.pathname).toBe("/overview");
    withWorkspace.unmount();

    const without = renderApp({ start: startState(), path: "/" });
    await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    expect(without.router.state.location.pathname).toBe("/welcome");
  });

  it.each([
    "/overview",
    "/breakdown",
    "/lines",
    "/blockers",
    "/history",
    "/people",
    "/follow-up",
    "/rules",
  ])("sends %s to the welcome page while no workspace is open", async (path) => {
    const { router } = renderApp({ start: startState(), path });
    await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    expect(router.state.location.pathname).toBe("/welcome");
  });

  it("keeps Settings and the welcome page reachable in both states", async () => {
    const none = renderApp({ start: startState(), path: "/settings" });
    await screen.findByRole("heading", { level: 1, name: names.settings });
    expect(none.router.state.location.pathname).toBe("/settings");
    none.unmount();

    const open = renderApp({ start: openStart(), path: "/welcome" });
    await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    expect(open.router.state.location.pathname).toBe("/welcome");
    // The sidebar is there, and no destination is marked as current.
    const nav = await sidebar();
    expect(
      within(nav)
        .getAllByRole("link")
        .filter((link) => link.hasAttribute("aria-current")),
    ).toHaveLength(0);
  });

  it("leaves the welcome page through the top bar when no workspace is open", async () => {
    const { user, router } = renderApp({ start: startState(), path: "/welcome" });
    const nav = await screen.findByRole("navigation", { name: en.shell.navigation });
    await user.click(within(nav).getByRole("link", { name: names.settings }));
    expect(router.state.location.pathname).toBe("/settings");
    expect(within(nav).getByRole("link", { name: names.settings })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await user.click(within(nav).getByRole("link", { name: en.workspaces.title }));
    expect(router.state.location.pathname).toBe("/welcome");
  });
});

describe("a page that does not exist", () => {
  it("says so, names the address, and leads to Overview", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/nowhere" });
    expect(
      await screen.findByRole("heading", { level: 1, name: en.notFound.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: en.notFound.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(en.notFound.text.replace("{{path}}", "/nowhere"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.notFound.toOverview }));
    expect(router.state.location.pathname).toBe("/overview");
  });

  it("leads to the workspaces while no workspace is open", async () => {
    const { user, router } = renderApp({ start: startState(), path: "/nowhere" });
    await screen.findByRole("heading", { level: 1, name: en.notFound.title });
    expect(screen.queryByRole("button", { name: en.notFound.toOverview })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.notFound.toWorkspaces }));
    expect(router.state.location.pathname).toBe("/welcome");
  });
});

describe("loading the application start", () => {
  it("shows skeletons on a first load, then the app", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    // The command answers on a later turn, so right after the render nothing is known yet.
    expect(screen.getByText(en.shell.loading)).toHaveAttribute("role", "status");
    expect(topBar()).toHaveTextContent(en.app.name);
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll('main [data-part="skeleton"]').length).toBeGreaterThan(3);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    await sidebar();
    expect(screen.queryByText(en.shell.loading)).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveAttribute("aria-busy");
  });

  it("shows the error of a failed load with its fix, and loads again on Try again", async () => {
    const message =
      "The settings file could not be read (permission denied). Check that you may read the folder, then start Hold Explorer again.";
    const appStart = vi
      .fn<() => ReturnType<typeof openStart>>()
      .mockImplementationOnce(() => {
        throw commandFailure("Settings", message);
      })
      .mockImplementation(() => openStart());
    const { user } = renderApp({ path: "/overview", handlers: { app_start: appStart } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.shell.startError);
    expect(alert).toHaveTextContent(message);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    await expectAccessible(document.body, { page: true });

    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    await sidebar();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(appStart).toHaveBeenCalledTimes(2);
  });

  it("has no accessibility violation while loading", async () => {
    renderApp({ handlers: { app_start: () => new Promise(() => undefined) } });
    expect(screen.getByText(en.shell.loading)).toHaveAttribute("role", "status");
    await expectAccessible(document.body, { page: true });
  });
});

describe("a file dragged over the window", () => {
  const file = "/home/ada/exports/Holds_2026-10-07.xlsx";

  it("covers the window with the drop target, which names the file, until the file leaves", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    expect(screen.queryByText(en.shell.dropTitle)).not.toBeInTheDocument();

    fileDrag.enter([file]);
    const frame = (await screen.findByText(en.shell.dropTitle)).closest("[data-part='drop-frame']");
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveTextContent("Holds_2026-10-07.xlsx");

    fileDrag.leave();
    await waitFor(() => {
      expect(screen.queryByText(en.shell.dropTitle)).not.toBeInTheDocument();
    });
  });

  it("starts an import of the dropped file from any page", async () => {
    const { router } = renderApp({
      start: openStart(),
      path: "/lines",
      handlers: { import_open: () => new Promise(() => undefined) },
    });
    await sidebar();
    fileDrag.enter([file]);
    fileDrag.drop([file]);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import");
    });
    expect(router.state.location.state).toMatchObject({ path: file, from: "/lines", others: 0 });
    expect(screen.queryByText(en.shell.dropTitle)).not.toBeInTheDocument();
  });

  it("takes the first of several dropped files and keeps how many were left", async () => {
    const { router } = renderApp({
      start: startState(),
      path: "/welcome",
      handlers: { import_open: () => new Promise(() => undefined) },
    });
    await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    fileDrag.drop([file, "/home/ada/exports/b.xlsx", "/home/ada/exports/c.xlsx"]);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import");
    });
    expect(router.state.location.state).toMatchObject({ path: file, from: "/welcome", others: 2 });
  });

  it("says so in the app when the window gives no drag events, with the reason and the way that still works", async () => {
    windowApi.inApp.mockReturnValue(true);
    windowApi.onFileDrag.mockRejectedValue(new Error("The webview refused the listener."));
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    const notice = must(
      (await screen.findByText(en.shell.dropUnavailable)).closest<HTMLElement>('[role="status"]'),
      "the notice around the title",
    );
    expect(notice).toHaveAttribute("data-tone", "warning");
    expect(notice).toHaveTextContent("The webview refused the listener.");
    expect(notice).toHaveTextContent(en.shell.dropUnavailableHelp);
    expect(screen.getByRole("main")).toContainElement(notice);
    // The page works, and so does the Import button the notice points to.
    windowApi.chooseImportFile.mockResolvedValue(null);
    await user.click(screen.getByRole("button", { name: en.shell.import }));
    expect(windowApi.chooseImportFile).toHaveBeenCalledTimes(1);
    await user.click(within(notice).getByRole("button", { name: en.common.dismiss }));
    expect(screen.queryByText(en.shell.dropUnavailable)).not.toBeInTheDocument();
  });

  it("stays quiet about it in a plain browser, where no window gives drag events", async () => {
    windowApi.inApp.mockReturnValue(false);
    windowApi.onFileDrag.mockRejectedValue(new Error("There is no webview."));
    renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByText(en.shell.dropUnavailable)).not.toBeInTheDocument();
    expect(screen.queryByText("There is no webview.")).not.toBeInTheDocument();
  });

  it("shows why a dropped file could not start an import, and rejects nothing unhandled", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { router } = renderApp({ start: openStart(), path: "/lines" });
      await sidebar();
      // The connection between the import and the shell is taken away, as it is while the shell
      // is being replaced.
      connectImportStart(() => undefined)();
      fileDrag.drop(["/exports/Holds.xlsx"]);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(en.import.startError);
      expect(router.state.location.pathname).toBe("/lines");
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("stops listening when the app goes", async () => {
    const { unmount } = renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    await waitFor(() => {
      expect(fileDrag.listeners()).toBe(1);
    });
    unmount();
    await waitFor(() => {
      expect(fileDrag.listeners()).toBe(0);
    });
  });
});

describe("the keyboard", () => {
  it("walks the shell in reading order: top bar, sidebar, page", SLOW, async () => {
    const { user } = renderApp({ start: openStart(), path: "/lines" });
    const nav = await sidebar();
    // Start from the top of the document, as after a click on the window's background.
    (document.activeElement as HTMLElement | null)?.blur();

    const expected = [
      screen.getByRole("button", { name: switcher }),
      screen.getByRole("button", { name: "Snapshot 7 Oct 2026" }),
      screen.getByRole("button", { name: en.shell.import }),
      ...within(nav).getAllByRole("link"),
      screen.getByRole("button", { name: en.comingSoon.action }),
    ];
    expect(expected).toHaveLength(13);
    for (const element of expected) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });

  it("opens a destination from the sidebar and comes back, without a pointer", SLOW, async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    const nav = await sidebar();
    (document.activeElement as HTMLElement | null)?.blur();
    const people = within(nav).getByRole("link", { name: `${names.people} ${soon}` });
    for (let presses = 0; presses < 20 && document.activeElement !== people; presses += 1) {
      await user.tab();
    }
    expect(people).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(router.state.location.pathname).toBe("/people");
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: names.people })).toHaveFocus();
    });
    // The next stop after the heading is the page's one action.
    await user.tab();
    expect(screen.getByRole("button", { name: en.comingSoon.action })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(router.state.location.pathname).toBe("/overview");
  });
});

describe("accessibility of the pages in the shell", () => {
  it("Overview has no violation", SLOW, async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    await expectAccessible(document.body, { page: true });
  });

  it("the page that does not exist has no violation", SLOW, async () => {
    renderApp({ start: openStart(), path: "/nowhere" });
    await screen.findByRole("heading", { level: 1, name: en.notFound.title });
    await expectAccessible(document.body, { page: true });
  });

  it("the window-wide drop target has no violation", SLOW, async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await sidebar();
    fileDrag.enter(["/exports/Holds.xlsx"]);
    await screen.findByText(en.shell.dropTitle);
    await expectAccessible(document.body, { page: true });
  });
});

describe("the area the page scrolls in", () => {
  /** The declarations of one rule of the shell's stylesheet. */
  function rule(selector: string): string {
    const css = readFileSync(join(import.meta.dirname, "Shell.module.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const start = css.indexOf(`\n${selector} {`);
    if (start < 0) throw new Error(`The shell's stylesheet has no rule ${selector}.`);
    return css.slice(start, css.indexOf("}", start));
  }

  it("keeps the room of its scrollbar, so a page that starts to scroll does not shift sideways", () => {
    expect(rule(".scroll")).toMatch(/overflow:\s*auto;/);
    expect(rule(".scroll")).toMatch(/scrollbar-gutter:\s*stable;/);
  });

  it("gives the notices above it the same room, so a notice ends where the page ends", () => {
    expect(rule(".notices")).toMatch(/scrollbar-gutter:\s*stable;/);
    // The room is only kept by a box that could scroll; this one never does.
    expect(rule(".notices")).toMatch(/overflow:\s*hidden;/);
  });
});
