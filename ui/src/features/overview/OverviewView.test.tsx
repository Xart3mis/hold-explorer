// The Overview and the view on screen: what the page shows always belongs to the workspace and the
// snapshot the top bar names, or is dimmed and marked as being updated. Each test replays a
// sequence in which the Rust side has another view than the interface for a while: the command
// that changes it has arrived there, and its answer has not come back yet.
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { formatDate } from "../../app/format";
import type { ImportDone } from "../../bindings/ImportDone";
import type { OverviewView } from "../../bindings/OverviewView";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import en from "../../locales/en.json";
import { must, renderApp } from "../../test/app";
import { opened, openStart, snapshot, workspace } from "../../test/fixtures";
import { done } from "../../test/import";
import { commandFailure, type Handlers } from "../../test/ipc";
import { overviewView } from "../../test/overview";
import { importButton, ready, reviewing } from "../../test/review";
import { SLOW } from "../../test/slow";

const text = en.overview;
const OLDER = "2026-09-30T14:05:00";
const NEWEST = "2026-10-07T08:00:00";
const IMPORTED = "2026-10-14T08:00:00";

const trigger = (taken: string) => en.snapshots.trigger.replace("{{date}}", formatDate(taken));
const switcher = (name: string) => en.workspaces.switcherName.replace("{{name}}", name);

/** An overview that is told from every other by its first figure. */
function overviewWith(holds: number, of: OverviewView["snapshot"]): OverviewView {
  const base = overviewView();
  return { ...base, snapshot: of, summary: { ...base.summary, holds } };
}

/** The content of the Overview while the page shows it; absent on any other page. */
function content(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-part='overview']");
}

/**
 * The first figure of the Overview, as the page writes it; absent while a block stands for it.
 * It is read from the elements themselves: the page is looked at after every change.
 */
function openHolds(): string | null {
  const tile = content()?.querySelector("[role='group']")?.firstElementChild;
  const written = tile?.textContent ?? "";
  if (!written.startsWith(text.openHolds)) return null;
  return /([\d,]+)\s*$/.exec(written)?.[1] ?? null;
}

/**
 * Watches the page for as long as a test runs. Whenever the top bar names a view and the Overview
 * shows the first figure of another one, the figures must be dimmed and marked as busy. `figureOf`
 * gives the figure that belongs to what the top bar names. Every moment at which the rule was
 * broken is kept, with what was on screen.
 */
function watchTheView(named: () => string | null, figureOf: Record<string, string>) {
  const broken: string[] = [];
  const look = () => {
    const header = named();
    const figure = openHolds();
    const shown = content();
    if (header === null || figure === null || shown === null) return;
    const own = figureOf[header];
    if (own === undefined || figure === own) return;
    const dimmed = shown.hasAttribute("data-stale") && shown.getAttribute("aria-busy") === "true";
    if (!dimmed) broken.push(`under "${header}" the page showed ${figure} open holds, undimmed`);
  };
  const observer = new MutationObserver(look);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  return {
    broken,
    stop: () => {
      observer.disconnect();
    },
  };
}

/**
 * What the top bar names: the name of its button that starts as given, which is the workspace
 * switcher ("Workspace ...") or the snapshot selector ("Snapshot ...").
 */
function named(start: string): string | null {
  for (const button of document.querySelector("header")?.querySelectorAll("button") ?? []) {
    const name = button.getAttribute("aria-label") ?? button.textContent;
    if (name.startsWith(start)) return name;
  }
  return null;
}

let watch: ReturnType<typeof watchTheView> | null = null;
afterEach(() => {
  watch?.stop();
  watch = null;
});

async function openOverview(user: ReturnType<typeof renderApp>["user"]) {
  const nav = screen.getByRole("navigation", { name: en.destinations.label });
  await user.click(within(nav).getByRole("link", { name: en.destinations.name.overview }));
  await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
}

/** A command whose answers the test gives one by one, in the order the calls arrived. */
function held<Result>() {
  const waiting: ((value: Result) => void)[] = [];
  const answer = () =>
    new Promise<Result>((resolve) => {
      waiting.push(resolve);
    });
  const finish = async (value: Result) => {
    const next = must(waiting.shift(), "a command that waits for its answer");
    await act(async () => {
      next(value);
      await Promise.resolve();
    });
  };
  return { answer, finish, waiting };
}

describe("the Overview and the view on screen", () => {
  it(
    "never shows another snapshot's numbers undimmed under the snapshot the top bar names, when Overview is opened while a snapshot is being selected",
    SLOW,
    async () => {
      const older = overviewWith(5127, snapshot(1, OLDER, { row_count: 9120, open_count: 5127 }));
      const newest = overviewWith(5042, snapshot(2, NEWEST));
      // The Rust side: the snapshot it has selected, which changes when the command arrives, not
      // when its answer is back. The overview is answered for whatever is selected then.
      let selected = 2;
      const select = held<WorkspaceOpen>();
      let holdOverview = false;
      const late = held<OverviewView>();
      const overview = vi.fn<NonNullable<Handlers["overview"]>>(() => {
        const answer = selected === 1 ? older : newest;
        return holdOverview ? late.answer().then(() => answer) : answer;
      });
      const { user } = renderApp({
        start: openStart(),
        path: "/lines",
        handlers: {
          overview,
          snapshot_select: ({ id }) => {
            selected = id;
            return select.answer();
          },
        },
      });
      watch = watchTheView(() => named("Snapshot "), {
        [trigger(NEWEST)]: "5,042",
        [trigger(OLDER)]: "5,127",
      });

      // On a page that is not built yet, the oldest snapshot is picked, and Overview is opened
      // before the switch has returned.
      await user.click(await screen.findByRole("button", { name: trigger(NEWEST) }));
      const menu = await screen.findByRole("menu", { name: en.snapshots.menu });
      await user.click(must(within(menu).getAllByRole("menuitemradio")[1], "the older snapshot"));
      await waitFor(() => {
        expect(select.waiting).toHaveLength(1);
      });
      await openOverview(user);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(watch.broken).toEqual([]);
      // Nothing is read while the snapshot is being selected: the answer could belong to either.
      expect(overview).not.toHaveBeenCalled();

      await select.finish(opened({ selected: 1 }));
      await screen.findByRole("button", { name: trigger(OLDER) });
      await waitFor(() => {
        expect(openHolds()).toBe("5,127");
      });
      expect(overview).toHaveBeenCalledTimes(1);
      expect(overview).toHaveBeenLastCalledWith({
        spec: openHoldsFilter(),
        view: { workspace_id: workspace().id, snapshot_id: 1 },
      });
      expect(watch.broken).toEqual([]);

      // Back to the newest. Its numbers take a while; what is on screen meanwhile is the older
      // snapshot's, and it is dimmed and marked as being updated.
      holdOverview = true;
      await user.click(screen.getByRole("button", { name: en.snapshots.toNewest }));
      await waitFor(() => {
        expect(select.waiting).toHaveLength(1);
      });
      await select.finish(opened({ selected: 2 }));
      await screen.findByRole("button", { name: trigger(NEWEST) });
      await waitFor(() => {
        expect(overview).toHaveBeenCalledTimes(2);
      });
      expect(overview).toHaveBeenLastCalledWith({
        spec: openHoldsFilter(),
        view: { workspace_id: workspace().id, snapshot_id: 2 },
      });
      const shown = must(content(), "the content of the Overview");
      expect(openHolds()).toBe("5,127");
      expect(shown).toHaveAttribute("data-stale");
      expect(shown).toHaveAttribute("aria-busy", "true");
      expect(watch.broken).toEqual([]);

      await late.finish(newest);
      await waitFor(() => {
        expect(openHolds()).toBe("5,042");
      });
      expect(shown).not.toHaveAttribute("data-stale");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(watch.broken).toEqual([]);
    },
  );

  it(
    "never shows the demo workspace's numbers under the workspace that is still open, when Overview is opened while the demo is built",
    SLOW,
    async () => {
      const demoWorkspace = workspace({
        id: "d0d0d0d0d0d0d0d0",
        name: "Demo workspace",
        snapshot_count: 1,
        latest_taken_at: NEWEST,
      });
      const demoSnapshot = snapshot(1, NEWEST, { row_count: 800, open_count: 431 });
      const demoOpen = opened({ workspace: demoWorkspace, snapshots: [demoSnapshot], selected: 1 });
      // The Rust side opens the demo workspace when the command arrives.
      let open = workspace().id;
      const demo = held<WorkspaceOpen>();
      const overview = vi.fn<NonNullable<Handlers["overview"]>>(() =>
        open === demoWorkspace.id ? overviewWith(431, demoSnapshot) : overviewView(),
      );
      const start = openStart();
      const { user } = renderApp({
        start,
        path: "/welcome",
        handlers: {
          overview,
          demo_create: () => {
            open = demoWorkspace.id;
            return demo.answer();
          },
          workspace_list: () => ({
            ...start.list,
            workspaces: [...start.list.workspaces, demoWorkspace],
          }),
        },
      });
      watch = watchTheView(() => named("Workspace "), {
        [switcher(workspace().name)]: "5,042",
        [switcher(demoWorkspace.name)]: "431",
      });

      await user.click(await screen.findByRole("button", { name: en.welcome.demoOpen }));
      await waitFor(() => {
        expect(demo.waiting).toHaveLength(1);
      });
      await openOverview(user);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(watch.broken).toEqual([]);
      expect(overview).not.toHaveBeenCalled();

      await demo.finish(demoOpen);
      await screen.findByRole("button", { name: switcher(demoWorkspace.name) });
      await waitFor(() => {
        expect(openHolds()).toBe("431");
      });
      expect(overview).toHaveBeenCalledTimes(1);
      expect(overview).toHaveBeenLastCalledWith({
        spec: openHoldsFilter(),
        view: { workspace_id: demoWorkspace.id, snapshot_id: 1 },
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(watch.broken).toEqual([]);
    },
  );

  it(
    "never shows the imported snapshot's numbers under the snapshot of before, when Overview is opened while an import commits",
    SLOW,
    async () => {
      const result = done();
      const imported = overviewWith(5010, result.snapshot);
      // The Rust side selects the new snapshot when the commit arrives.
      let selected = 2;
      const commit = held<ImportDone>();
      const overview = vi.fn<NonNullable<Handlers["overview"]>>(() =>
        selected === result.snapshot.id ? imported : overviewView(),
      );
      const { user } = reviewing(undefined, {
        overview,
        import_commit: () => {
          selected = result.snapshot.id;
          return commit.answer();
        },
        import_cancel: () => null,
      });
      watch = watchTheView(() => named("Snapshot "), {
        [trigger(NEWEST)]: "5,042",
        [trigger(IMPORTED)]: "5,010",
      });

      await user.click(importButton(await ready()));
      await waitFor(() => {
        expect(commit.waiting).toHaveLength(1);
      });
      await openOverview(user);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(watch.broken).toEqual([]);
      expect(overview).not.toHaveBeenCalled();

      await commit.finish(result);
      await screen.findByRole("button", { name: trigger(IMPORTED) });
      await waitFor(() => {
        expect(openHolds()).toBe("5,010");
      });
      expect(overview).toHaveBeenCalledTimes(1);
      expect(overview).toHaveBeenLastCalledWith({
        spec: openHoldsFilter(),
        view: { workspace_id: workspace().id, snapshot_id: result.snapshot.id },
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(watch.broken).toEqual([]);
    },
  );
});

describe("the Overview and a view that changed on the way", () => {
  /** The answer of the Rust side to a request for another view than the one it holds. */
  const viewChanged = () =>
    commandFailure(
      "ViewChanged",
      "The workspace or the snapshot in view changed while the request was on its way, so its answer would belong to a view that is no longer shown. Nothing is wrong and nothing was changed; the page reads it again for the view it shows now.",
    );

  it("reads again and shows no error when the command answers that the view changed", async () => {
    const overview = vi
      .fn<NonNullable<Handlers["overview"]>>()
      .mockImplementationOnce(() => {
        throw viewChanged();
      })
      .mockImplementation(() => overviewView());
    renderApp({ start: openStart(), path: "/overview", handlers: { overview } });
    watch = watchTheView(() => named("Snapshot "), { [trigger(NEWEST)]: "5,042" });
    const alerts: string[] = [];
    const alertWatch = new MutationObserver(() => {
      for (const alert of screen.queryAllByRole("alert")) alerts.push(alert.textContent);
    });
    alertWatch.observe(document.body, { subtree: true, childList: true });

    await waitFor(() => {
      expect(openHolds()).toBe("5,042");
    });
    alertWatch.disconnect();
    expect(overview).toHaveBeenCalledTimes(2);
    expect(alerts).toEqual([]);
    expect(screen.queryByText(/changed while the request was on its way/)).not.toBeInTheDocument();
    expect(must(content(), "the content of the Overview")).not.toHaveAttribute("aria-busy");
  });
});
