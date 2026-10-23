import { act, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { keys } from "../../api/keys";
import type { FolderChange } from "../../app/actions/folder";
import { queryClient } from "../../app/query";
import type { AppStart } from "../../bindings/AppStart";
import type { FolderCheck } from "../../bindings/FolderCheck";
import type { FolderMoved } from "../../bindings/FolderMoved";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { openStart, opened } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";
import { formatDate } from "../../text/format";

const OLD = "/home/ada/.local/share/hold-explorer/workspaces";
const NEW = "/mnt/projects/5359/hold-explorer";
const TAKEN =
  "a1b2c3d4e5f60718.holdx-ws was left in /home/ada/.local/share/hold-explorer/workspaces, because a file of that name is already in /mnt/projects/5359/hold-explorer. Rename or remove one of the two, then move the file there by hand.";

const checked: FolderCheck = {
  path: NEW,
  movable: ["a1b2c3d4e5f60718.holdx-ws", "b2c3d4e5f6071829.holdx-ws", "c3d4e5f607182930.holdx-ws"],
  count: 3,
};

/**
 * The region of the row that holds this element: the progress or a notice. It is a group named
 * by the label of the progress or the title of the notice, and that label or title takes the
 * focus, so the ring sits on a heading.
 */
function regionOf(element: HTMLElement): HTMLElement | null {
  return element.closest('[role="group"]');
}

/** The answer of a change to `NEW`: the start the Rust side has then, and what moved. */
function movedTo(start: AppStart, moveFiles: boolean): FolderMoved {
  return {
    start: {
      ...start,
      settings: { ...start.settings, workspace_dir: NEW },
      list: { ...start.list, folder: NEW },
      open: opened(),
    },
    moved: moveFiles ? ["b2c3d4e5f6071829.holdx-ws", "c3d4e5f607182930.holdx-ws"] : [],
    left: moveFiles
      ? [
          {
            file_name: "a1b2c3d4e5f60718.holdx-ws",
            path: `${OLD}/a1b2c3d4e5f60718.holdx-ws`,
            kind: "NameTaken",
            message: TAKEN,
          },
        ]
      : [],
  };
}

async function page() {
  await screen.findByRole("heading", { level: 1, name: en.destinations.name.settings });
  return screen.getByRole("main");
}

const moveTitle = "Move 3 workspaces to the new folder?";

/** A promise the test settles, and the function that settles it. */
function later<T>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe("The workspaces folder in Settings", () => {
  it("leaves the focus ring of the app on what takes the focus", () => {
    // The label of the progress and the title of the result take the focus, and the global
    // :focus-visible ring of app.css shows on them: the stylesheet of the row takes no ring away.
    const css = readFileSync(join(import.meta.dirname, "SettingsPage.module.css"), "utf8");
    expect(css).not.toMatch(/outline:\s*none/);
  });

  it("shows the folder with Change folder and Show in folder, and the default only when another is in use", async () => {
    const { unmount } = renderApp({ start: openStart(), path: "/settings" });
    const main = await page();
    expect(within(main).getByText(OLD)).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: en.settings.folderChange })).toBeEnabled();
    expect(within(main).getByRole("button", { name: en.common.showInFolder })).toBeEnabled();
    expect(
      within(main).queryByRole("button", { name: en.settings.folderDefault }),
    ).not.toBeInTheDocument();
    unmount();

    const start = openStart();
    renderApp({
      start: {
        ...start,
        settings: { ...start.settings, workspace_dir: NEW },
        list: { ...start.list, folder: NEW },
      },
      path: "/settings",
    });
    const other = await page();
    expect(within(other).getByText(NEW)).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: en.settings.folderDefault })).toBeEnabled();
  });

  it(
    "checks the chosen folder, offers the move, and reports what moved and what was left, by keyboard",
    SLOW,
    async () => {
      windowApi.chooseFolder.mockResolvedValue(NEW);
      const check = vi.fn(() => checked);
      const answer = later<FolderMoved>();
      const setFolder = vi.fn(() => answer.promise);
      const start = openStart();
      const { user } = renderApp({
        start,
        path: "/settings",
        handlers: { check_workspace_folder: check, set_workspace_folder: setFolder },
      });
      const main = await page();
      within(main).getByRole("button", { name: en.settings.folderChange }).focus();
      await user.keyboard("{Enter}");

      expect(await screen.findByText(moveTitle)).toBeInTheDocument();
      expect(check).toHaveBeenCalledWith({ path: NEW });
      // The keyboard is taken into the notice, to its first choice.
      const moveThem = screen.getByRole("button", { name: en.settings.folderMoveThem });
      expect(moveThem).toHaveFocus();
      expect(screen.getByRole("button", { name: en.settings.folderLeaveThem })).toBeInTheDocument();
      await expectAccessible(document.body, { page: true });

      await user.keyboard("{Enter}");
      expect(setFolder).toHaveBeenCalledWith({ path: NEW, moveFiles: true });
      // While the files move, the row shows it and the rest of the settings wait.
      const progress = await screen.findByRole("progressbar", {
        name: `Moving the workspaces to ${NEW}`,
      });
      // The keyboard follows the change: to the label of the progress, which takes the place of
      // the choice.
      const label = screen.getByText(`Moving the workspaces to ${NEW}`);
      await waitFor(() => {
        expect(label).toHaveFocus();
      });
      expect(regionOf(progress)).toHaveAccessibleName(`Moving the workspaces to ${NEW}`);
      expect(progress).toHaveAccessibleName(`Moving the workspaces to ${NEW}`);
      expect(screen.getByText(en.settings.folderWaiting)).toBeInTheDocument();
      const theme = screen.getByRole("button", { name: new RegExp(en.settings.theme) });
      expect(theme.closest("[inert]")).not.toBeNull();
      expect(screen.getByRole("button", { name: en.settings.folderChange })).toHaveAttribute(
        "aria-busy",
        "true",
      );

      answer.settle(movedTo(start, true));
      const title = await screen.findByText(`Moved 2 workspace files to ${NEW}`);
      // Then to the title of the result.
      await waitFor(() => {
        expect(title).toHaveFocus();
      });
      const region = regionOf(title);
      expect(region).toHaveAccessibleName(`Moved 2 workspace files to ${NEW}`);
      // The title is written once: the region is named by it, and the notice inside names nothing.
      expect(
        within(region ?? document.body).getAllByText(`Moved 2 workspace files to ${NEW}`),
      ).toHaveLength(1);
      expect(within(region ?? document.body).getByRole("status")).not.toHaveAccessibleName();
      const moved = screen.getByRole("list", { name: en.settings.folderMovedList });
      expect(
        within(moved)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["b2c3d4e5f6071829.holdx-ws", "c3d4e5f607182930.holdx-ws"]);
      const left = screen.getByRole("list", { name: en.settings.folderLeftList });
      expect(within(left).getByText("a1b2c3d4e5f60718.holdx-ws")).toBeInTheDocument();
      expect(within(left).getByText(TAKEN)).toBeInTheDocument();
      // The page shows the folder the answer names, and the rest of the settings are back.
      expect(within(main).getAllByText(NEW).length).toBeGreaterThan(0);
      expect(theme.closest("[inert]")).toBeNull();
      await expectAccessible(document.body, { page: true });

      await user.tab();
      expect(screen.getByRole("button", { name: en.common.dismiss })).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(screen.queryByText(`Moved 2 workspace files to ${NEW}`)).not.toBeInTheDocument();
      // The notice is gone, and the keyboard is back on the button that started it all.
      expect(screen.getByRole("button", { name: en.settings.folderChange })).toHaveFocus();
    },
  );

  it("says that the open workspace stays open from the folder before when its file stayed there", async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const start = openStart();
    const left = movedTo(start, false);
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: {
        check_workspace_folder: () => checked,
        set_workspace_folder: () => ({
          ...left,
          start: { ...left.start, list: { ...left.start.list, workspaces: [] } },
        }),
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderLeaveThem }));
    const title = await screen.findByText(`The workspaces are now kept in ${NEW}`);
    const region = must(regionOf(title), "the result");
    expect(
      within(region).getByText(
        en.settings.folderStaysOpen
          .replace("{{name}}", "Unit 573 piping")
          .replace("{{from}}", OLD)
          .replace("{{to}}", NEW),
      ),
    ).toBeInTheDocument();
  });

  it("leaves out the line about the open workspace when the folder before is not known", async () => {
    const start = openStart();
    const left = movedTo(start, false);
    const answer: FolderMoved = {
      ...left,
      start: { ...left.start, list: { ...left.start.list, workspaces: [] } },
    };
    renderApp({ start, path: "/settings" });
    await page();
    const done: FolderChange = {
      step: "done",
      choice: { path: NEW, moveFiles: false },
      moved: answer,
      from: null,
    };
    act(() => {
      queryClient.setQueryData(keys.folderChange, done);
    });
    await screen.findByText(`The workspaces are now kept in ${NEW}`);
    expect(screen.queryByText(/stays open from/)).not.toBeInTheDocument();
  });

  it("says nothing of the open workspace when it is in the new folder's list", async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const start = openStart();
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: {
        check_workspace_folder: () => checked,
        set_workspace_folder: () => movedTo(start, true),
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderMoveThem }));
    await screen.findByText(`Moved 2 workspace files to ${NEW}`);
    expect(screen.queryByText(/stays open from/)).not.toBeInTheDocument();
  });

  it("puts the result away when the next action on the workspace starts", async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const start = openStart();
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: {
        check_workspace_folder: () => checked,
        set_workspace_folder: () => movedTo(start, true),
        snapshot_select: ({ id }) => opened({ selected: id }),
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderMoveThem }));
    const title = `Moved 2 workspace files to ${NEW}`;
    expect(await screen.findByText(title)).toBeInTheDocument();
    // Another snapshot is selected: the record of the change is put away with it.
    await user.click(
      screen.getByRole("button", {
        name: en.snapshots.trigger.replace("{{date}}", formatDate("2026-10-07T08:00:00")),
      }),
    );
    const menu = await screen.findByRole("menu", { name: en.snapshots.menu });
    await user.click(within(menu).getAllByRole("menuitemradio")[1] ?? menu);
    await waitFor(() => {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    });
  });

  it("makes the version and the settings file wait with the other rows while the files move", async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const start = openStart();
    const answer = later<FolderMoved>();
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: {
        check_workspace_folder: () => checked,
        set_workspace_folder: () => answer.promise,
      },
    });
    const main = await page();
    const showFile = within(main).getByRole("button", { name: en.settings.settingsFileShow });
    const version = within(main).getByText("0.1.0");
    expect(showFile.closest("[inert]")).toBeNull();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderMoveThem }));
    await screen.findByRole("progressbar");
    expect(showFile.closest("[inert]")).not.toBeNull();
    expect(version.closest("[inert]")).not.toBeNull();
    answer.settle(movedTo(start, true));
    await screen.findByText(`Moved 2 workspace files to ${NEW}`);
    expect(showFile.closest("[inert]")).toBeNull();
  });

  it("leaves the files where they are when asked to", async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const setFolder = vi.fn(() => movedTo(start, false));
    const start = openStart();
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: { check_workspace_folder: () => checked, set_workspace_folder: setFolder },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderLeaveThem }));
    expect(setFolder).toHaveBeenCalledWith({ path: NEW, moveFiles: false });
    const title = await screen.findByText(`The workspaces are now kept in ${NEW}`);
    await waitFor(() => {
      expect(title).toHaveFocus();
    });
  });

  it("offers Use this folder when nothing would move, and the keyboard follows the change", async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const start = openStart();
    const setFolder = vi.fn(() => movedTo(start, false));
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: {
        check_workspace_folder: () => ({ path: NEW, movable: [], count: 0 }),
        set_workspace_folder: setFolder,
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    const use = await screen.findByRole("button", { name: en.settings.folderUse });
    expect(use).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(setFolder).toHaveBeenCalledWith({ path: NEW, moveFiles: false });
    const title = await screen.findByText(`The workspaces are now kept in ${NEW}`);
    await waitFor(() => {
      expect(title).toHaveFocus();
    });
  });

  it("says that no file moved when every file was left", async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const start = openStart();
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: {
        check_workspace_folder: () => checked,
        set_workspace_folder: () => ({ ...movedTo(start, true), moved: [] }),
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderMoveThem }));
    expect(await screen.findByText(en.settings.folderNoneMoved)).toBeInTheDocument();
    expect(screen.getByText(TAKEN)).toBeInTheDocument();
  });

  it("changes nothing on Cancel, and nothing when the dialog is cancelled", async () => {
    const check = vi.fn(() => checked);
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { check_workspace_folder: check },
    });
    await page();
    // The dialog was cancelled.
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await waitFor(() => {
      expect(windowApi.chooseFolder).toHaveBeenCalledTimes(1);
    });
    expect(check).not.toHaveBeenCalled();

    windowApi.chooseFolder.mockResolvedValue(NEW);
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.common.cancel }));
    expect(screen.queryByText(moveTitle)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.settings.folderChange })).toHaveFocus();
    expect(screen.getByRole("button", { name: en.settings.folderChange })).not.toHaveAttribute(
      "aria-busy",
    );
  });

  it("says why a folder was refused", async () => {
    windowApi.chooseFolder.mockResolvedValue(OLD);
    const refused =
      "The workspaces are already kept in /home/ada/.local/share/hold-explorer/workspaces. Choose another folder to keep them in.";
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        check_workspace_folder: () => {
          throw commandFailure("SameFolder", refused);
        },
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.settings.folderNotChanged);
    expect(alert).toHaveTextContent(refused);
  });

  it("checks the default folder, offers the move with its count, and sends no folder for it", async () => {
    const start = openStart();
    const custom: AppStart = {
      ...start,
      settings: { ...start.settings, workspace_dir: NEW },
      list: { ...start.list, folder: NEW },
    };
    const setFolder = vi.fn(() => ({
      start,
      moved: ["a1b2c3d4e5f60718.holdx-ws"],
      left: [],
    }));
    const checked = later<FolderCheck>();
    const check = vi.fn(() => checked.promise);
    const { user } = renderApp({
      start: custom,
      path: "/settings",
      handlers: { check_workspace_folder: check, set_workspace_folder: setFolder },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderDefault }));
    // The spinner is on the button that started the check, and on that one alone.
    const spinnerIn = (name: string) =>
      screen.getByRole("button", { name }).querySelector('[data-part="spinner"]');
    await waitFor(() => {
      expect(spinnerIn(en.settings.folderDefault)).not.toBeNull();
    });
    expect(spinnerIn(en.settings.folderChange)).toBeNull();
    // The count comes from the check, not from the list it names.
    checked.settle({ path: OLD, movable: ["a1b2c3d4e5f60718.holdx-ws"], count: 1 });
    expect(await screen.findByText("Move 1 workspace to the default folder?")).toBeInTheDocument();
    expect(check).toHaveBeenCalledWith({ path: null });
    expect(screen.getByRole("button", { name: en.settings.folderMoveThem })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: en.settings.folderMoveThem }));
    expect(setFolder).toHaveBeenCalledWith({ path: null, moveFiles: true });
    expect(await screen.findByText(`Moved 1 workspace file to ${OLD}`)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: en.settings.folderDefault }),
    ).not.toBeInTheDocument();
  });

  it("keeps showing the move when the page is pressed again in the sidebar", SLOW, async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const answer = later<FolderMoved>();
    const start = openStart();
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: {
        check_workspace_folder: () => checked,
        set_workspace_folder: () => answer.promise,
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderMoveThem }));
    await screen.findByRole("progressbar");
    // Pressing the current item remounts the page.
    await user.click(screen.getByRole("link", { name: en.destinations.name.settings }));
    await page();
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    answer.settle(movedTo(start, true));
    expect(await screen.findByText(`Moved 2 workspace files to ${NEW}`)).toBeInTheDocument();
  });
});
