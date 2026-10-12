import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatDate, formatDateTime } from "../../app/format";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { opened, openStart } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";

const OLDER = "2026-09-30T14:05:00";
const NEWEST = "2026-10-07T08:00:00";
const trigger = (taken: string) => en.snapshots.trigger.replace("{{date}}", formatDate(taken));
const olderNotice = en.snapshots.older.replace("{{date}}", formatDateTime(OLDER));

async function openMenu(user: ReturnType<typeof renderApp>["user"], taken = NEWEST) {
  await user.click(await screen.findByRole("button", { name: trigger(taken) }));
  return screen.findByRole("menu", { name: en.snapshots.menu });
}

describe("SnapshotSelector", () => {
  it("names the snapshot in view", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    expect(await screen.findByRole("button", { name: trigger(NEWEST) })).toBeInTheDocument();
  });

  it("lists the snapshots newest first, each with its date, time, and number of holds", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    const menu = await openMenu(user);
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAccessibleName(formatDateTime(NEWEST));
    expect(items[0]).toHaveAccessibleDescription("9,300 holds");
    expect(items[1]).toHaveAccessibleName(formatDateTime(OLDER));
    expect(items[1]).toHaveAccessibleDescription("9,120 holds");
  });

  it("marks the selected snapshot, and only it", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    const items = within(await openMenu(user)).getAllByRole("menuitemradio");
    expect(items[0]).toHaveAttribute("aria-checked", "true");
    expect(items[1]).toHaveAttribute("aria-checked", "false");
  });

  it("shows no notice while the newest snapshot is in view", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    await screen.findByRole("button", { name: trigger(NEWEST) });
    expect(screen.queryByText(olderNotice)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.snapshots.toNewest })).not.toBeInTheDocument();
  });

  it(
    "selects an older snapshot, names it in a notice under the top bar, and returns to the newest",
    SLOW,
    async () => {
      const select = vi.fn(({ id }: { id: number }) => opened({ selected: id }));
      const { user } = renderApp({
        start: openStart(),
        path: "/lines",
        handlers: { snapshot_select: select },
      });
      const menu = await openMenu(user);
      await user.click(must(within(menu).getAllByRole("menuitemradio")[1], "the older snapshot"));
      expect(select).toHaveBeenCalledWith({ id: 1 });

      const notice = must(
        (await screen.findByText(olderNotice)).closest<HTMLElement>('[role="status"]'),
        "the notice around the text",
      );
      expect(notice).toHaveAttribute("data-tone", "info");
      expect(screen.getByRole("main")).toContainElement(notice);
      expect(await screen.findByRole("button", { name: trigger(OLDER) })).toBeInTheDocument();
      // The notice belongs to the shell: it stays on every destination.
      await user.keyboard("{Control>}5{/Control}");
      expect(screen.getByText(olderNotice)).toBeInTheDocument();

      await user.click(within(notice).getByRole("button", { name: en.snapshots.toNewest }));
      expect(select).toHaveBeenLastCalledWith({ id: 2 });
      await waitFor(() => {
        expect(screen.queryByText(olderNotice)).not.toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: trigger(NEWEST) })).toBeInTheDocument();
    },
  );

  it("keeps the page, dimmed, while another snapshot is opened", async () => {
    let finish: (value: ReturnType<typeof opened>) => void = () => undefined;
    const { user } = renderApp({
      start: openStart(),
      path: "/lines",
      handlers: {
        snapshot_select: () =>
          new Promise<ReturnType<typeof opened>>((resolve) => {
            finish = resolve;
          }),
      },
    });
    const title = await screen.findByRole("heading", {
      level: 1,
      name: en.destinations.name.lines,
    });
    const page = must(title.closest("[data-part='page']"), "the page around its title");
    const area = must(page.parentElement, "the area the page scrolls in");
    expect(area).not.toHaveAttribute("data-stale");
    const menu = await openMenu(user);

    await user.click(must(within(menu).getAllByRole("menuitemradio")[1], "the older snapshot"));
    // The page of before is still there, marked as stale, and the selector is busy.
    await waitFor(() => {
      expect(area).toHaveAttribute("data-stale");
    });
    expect(title).toBeInTheDocument();
    expect(screen.getByRole("button", { name: trigger(NEWEST) })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    finish(opened({ selected: 1 }));
    await waitFor(() => {
      expect(area).not.toHaveAttribute("data-stale");
    });
    expect(screen.getByRole("button", { name: trigger(OLDER) })).not.toHaveAttribute("aria-busy");
  });

  it("shows the notice at once for a workspace that starts on an older snapshot", async () => {
    const { user } = renderApp({
      start: openStart({ open: opened({ selected: 1 }) }),
      path: "/overview",
    });
    expect(await screen.findByText(olderNotice)).toBeInTheDocument();
    const items = within(await openMenu(user, OLDER)).getAllByRole("menuitemradio");
    expect(items[0]).toHaveAttribute("aria-checked", "false");
    expect(items[1]).toHaveAttribute("aria-checked", "true");
  });

  it("selects by the keyboard", SLOW, async () => {
    const select = vi.fn(({ id }: { id: number }) => opened({ selected: id }));
    const { user } = renderApp({
      start: openStart(),
      path: "/overview",
      handlers: { snapshot_select: select },
    });
    const button = await screen.findByRole("button", { name: trigger(NEWEST) });
    button.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu", { name: en.snapshots.menu });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(select).toHaveBeenCalledWith({ id: 1 });
    expect(await screen.findByText(olderNotice)).toBeInTheDocument();
  });

  it("shows why a snapshot could not be selected, and keeps the one in view", async () => {
    const message =
      "Snapshot 1 is not in this workspace. It may have been deleted; choose another snapshot.";
    const { user } = renderApp({
      start: openStart(),
      path: "/overview",
      handlers: {
        snapshot_select: () => {
          throw commandFailure("SnapshotNotFound", message);
        },
      },
    });
    const menu = await openMenu(user);
    await user.click(must(within(menu).getAllByRole("menuitemradio")[1], "the older snapshot"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.snapshots.selectError);
    expect(alert).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: trigger(NEWEST) })).toBeInTheDocument();
    expect(screen.queryByText(olderNotice)).not.toBeInTheDocument();
  });

  it(
    "has no accessibility violation with the notice shown and with the list open",
    SLOW,
    async () => {
      const { user } = renderApp({
        start: openStart({ open: opened({ selected: 1 }) }),
        path: "/overview",
      });
      await screen.findByText(olderNotice);
      await expectAccessible(document.body, { page: true });
      await openMenu(user, OLDER);
      await expectAccessible();
    },
  );
});
